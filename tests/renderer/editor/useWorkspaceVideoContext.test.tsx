import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import type { ProjectDocument } from '../../../src/shared/types/project';
import { useWorkspace } from '../../../src/renderer/src/hooks/useWorkspace';
import type { JobRunner } from '../../../src/renderer/src/state/useJobRunner';
import { useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { createI18n } from '../../../src/renderer/src/i18n';
import { caption, makeProject, SETTINGS } from './fixtures';
import { createFakeApi } from '../state/fakeApi';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={createI18n('en')}>{children}</I18nextProvider>;
}

/** Runs the start function like the real runner, so the workflow call is observable. */
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

/** Mounts the workspace on a saved project that carries the given video context. */
function setup(overrides: Partial<ProjectDocument>) {
  const fake = createFakeApi();
  fake.loadLast.mockResolvedValue({
    project: makeProject({ trim: { startMs: 0, endMs: 3000 }, ...overrides }),
    sourceStatus: 'ok'
  });
  const transcribe = vi.fn((_request: Record<string, unknown>) =>
    Promise.resolve({ language: 'id', captions: [], timingSource: 'word' })
  );
  const translate = vi.fn((_request: Record<string, unknown>) => Promise.resolve({ translations: [] }));
  vi.stubGlobal('tajtlisha', { ...fake.api, workflow: { transcribe, translate, summarize: vi.fn() } } as unknown as TajtlishaApi);

  const hook = renderHook(
    () => {
      const store = useProjectStore({ targetLanguage: 'en', api: fake.api });
      const workspace = useWorkspace({ store, settings: SETTINGS, providers: [], job: directJobRunner() });
      return { store, workspace };
    },
    { wrapper }
  );
  return { hook, transcribe, translate };
}

describe('useWorkspace video context in requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the trimmed video context with transcription', async () => {
    const { hook, transcribe } = setup({ videoContext: '  Parking attendants in Jakarta  ', captions: [] });
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(transcribe.mock.calls[0][0]).toMatchObject({ videoContext: 'Parking attendants in Jakarta' });
  });

  it('omits the video context from transcription when it is blank or absent', async () => {
    const { hook, transcribe } = setup({ videoContext: '   ', captions: [] });
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(transcribe.mock.calls[0][0]).not.toHaveProperty('videoContext');
  });

  it('sends the trimmed video context with translation', async () => {
    const { hook, translate } = setup({
      videoContext: 'Parking attendants in Jakarta\n',
      captions: [caption('a', 0, 1000, 'Zdravo', '')]
    });
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.translate();
    });

    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(translate.mock.calls[0][0]).toMatchObject({ videoContext: 'Parking attendants in Jakarta' });
  });

  it('omits the video context from translation when it is blank or absent', async () => {
    const { hook, translate } = setup({ captions: [caption('a', 0, 1000, 'Zdravo', '')] });
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.translate();
    });

    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(translate.mock.calls[0][0]).not.toHaveProperty('videoContext');
  });
});
