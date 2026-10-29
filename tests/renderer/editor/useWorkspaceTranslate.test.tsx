import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import { useWorkspace } from '../../../src/renderer/src/hooks/useWorkspace';
import type { JobRunner } from '../../../src/renderer/src/state/useJobRunner';
import { useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { caption, makeProject, OPENAI_STATUS, SETTINGS } from './fixtures';
import { createFakeApi } from '../state/fakeApi';
import { createI18n } from '../../../src/renderer/src/i18n';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={createI18n('en')}>{children}</I18nextProvider>;
}

type Translations = { translations: Array<{ id: string; text: string }> };

/** Runs the start function like the real runner, so the translate call is observable. */
function directJobRunner(): JobRunner {
  return {
    job: null,
    run: async (_kind: string, start: (jobId: string) => Promise<unknown>) => ({
      status: 'done',
      value: await start('job-1')
    }),
    cancel: vi.fn(async () => undefined)
  } as unknown as JobRunner;
}

function settingsWith(textModel: string | undefined) {
  return {
    ...SETTINGS,
    aiConnector: {
      ...SETTINGS.aiConnector,
      textModelByProvider: textModel === undefined ? {} : { openai: textModel }
    }
  };
}

function setup(textModel?: string) {
  const fake = createFakeApi();
  fake.loadLast.mockResolvedValue({
    project: makeProject({
      captions: [caption('a', 0, 1000, 'Hello', ''), caption('b', 1000, 2000, 'World', ''), caption('c', 2000, 3000, 'Again', '')]
    }),
    sourceStatus: 'ok'
  });
  let finish: (value: Translations) => void = () => undefined;
  const translate = vi.fn((_request: { modelId?: string }) => new Promise<Translations>((resolve) => (finish = resolve)));
  const workflow = { translate, transcribe: vi.fn() };
  vi.stubGlobal('tajtlisha', { ...fake.api, workflow } as unknown as TajtlishaApi);

  const settings = settingsWith(textModel);
  const hook = renderHook(
    () => {
      const store = useProjectStore({ targetLanguage: 'en', api: fake.api });
      const workspace = useWorkspace({ store, settings, providers: [OPENAI_STATUS], job: directJobRunner() });
      return { store, workspace };
    },
    { wrapper }
  );
  return { hook, translate, finish: (value: Translations) => finish(value) };
}

describe('useWorkspace.translate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a manual translation fix made while the AI job runs, and applies the rest', async () => {
    const { hook, translate, finish } = setup('gpt-4.1-mini');
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    act(() => {
      void hook.result.current.workspace.translate();
    });
    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));

    // The user fixes row b's translation while the job is still running.
    act(() => hook.result.current.store.dispatch({ type: 'caption/update', id: 'b', patch: { translation: 'Moj prevod' } }));

    await act(async () => {
      finish({
        translations: [
          { id: 'a', text: 'AI a' },
          { id: 'b', text: 'AI b' },
          { id: 'c', text: 'AI c' }
        ]
      });
    });

    const rows = new Map(hook.result.current.store.state.project.captions.map((row) => [row.id, row.translation]));
    expect(rows.get('b')).toBe('Moj prevod');
    expect(rows.get('a')).toBe('AI a');
    expect(rows.get('c')).toBe('AI c');
  });

  it('skips a row whose original text changed during the job, as before', async () => {
    const { hook, translate, finish } = setup('gpt-4.1-mini');
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    act(() => {
      void hook.result.current.workspace.translate();
    });
    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    act(() => hook.result.current.store.dispatch({ type: 'caption/update', id: 'a', patch: { original: 'Hi' } }));

    await act(async () => {
      finish({ translations: [{ id: 'a', text: 'AI a' }] });
    });
    const row = hook.result.current.store.state.project.captions.find((item) => item.id === 'a');
    expect(row?.translation).toBe('');
  });

  it('sends no model id when the text model is Default (empty string in settings)', async () => {
    const { hook, translate, finish } = setup('');
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    act(() => {
      void hook.result.current.workspace.translate();
    });
    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(translate.mock.calls[0][0]).toMatchObject({ modelId: undefined });

    await act(async () => {
      finish({ translations: [] });
    });
  });
});
