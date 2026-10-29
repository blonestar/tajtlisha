import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import type { AppSettings } from '../../../src/shared/types/settings';
import { useWorkspace } from '../../../src/renderer/src/hooks/useWorkspace';
import type { JobRunner } from '../../../src/renderer/src/state/useJobRunner';
import { useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { caption, makeProject, OPENAI_STATUS, SETTINGS } from './fixtures';
import { createFakeApi } from '../state/fakeApi';
import { createI18n } from '../../../src/renderer/src/i18n';

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

type ConnectorOverrides = Partial<AppSettings['aiConnector']>;

function settingsWith(overrides: ConnectorOverrides): AppSettings {
  return { ...SETTINGS, aiConnector: { ...SETTINGS.aiConnector, ...overrides } };
}

type TranscribeReply = { language: string; captions: unknown[]; timingSource: 'word'; correction?: 'applied' | 'failed' };

/**
 * Mounts the workspace on a project. With no captions, transcription starts without
 * a confirmation; translation needs captions that have original text and no translation.
 */
function setup(
  settings: AppSettings,
  transcribeReply: TranscribeReply = { language: 'sr-Latn', captions: [], timingSource: 'word' },
  captions: ReturnType<typeof caption>[] = []
) {
  const fake = createFakeApi();
  fake.loadLast.mockResolvedValue({
    project: makeProject({ captions, trim: { startMs: 0, endMs: 3000 } }),
    sourceStatus: 'ok'
  });
  const transcribe = vi.fn((_request: Record<string, unknown>) => Promise.resolve(transcribeReply));
  const translate = vi.fn((_request: Record<string, unknown>) => Promise.resolve({ translations: [] }));
  vi.stubGlobal('tajtlisha', { ...fake.api, workflow: { transcribe, translate, summarize: vi.fn() } } as unknown as TajtlishaApi);

  const hook = renderHook(
    () => {
      const store = useProjectStore({ targetLanguage: 'en', api: fake.api });
      const workspace = useWorkspace({ store, settings, providers: [OPENAI_STATUS], job: directJobRunner() });
      return { store, workspace };
    },
    { wrapper }
  );
  return { hook, transcribe, translate };
}

describe('useWorkspace.transcribe correction request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends no correction field while AI correction is off', async () => {
    const { hook, transcribe } = setup(settingsWith({ correctTranscript: false, transcriptCorrectionInstructions: 'Ignored' }));
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(transcribe.mock.calls[0][0]).not.toHaveProperty('correction');
  });

  it('sends the text model and the instructions when AI correction is on', async () => {
    const { hook, transcribe } = setup(
      settingsWith({
        correctTranscript: true,
        textModelByProvider: { openai: 'gpt-4.1-mini' },
        transcriptCorrectionInstructions: 'Write AI, never A.I.'
      })
    );
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(transcribe.mock.calls[0][0]).toMatchObject({
      correction: { modelId: 'gpt-4.1-mini', instructions: 'Write AI, never A.I.' }
    });
  });

  it('sends no model id for the correction when the text model is Default', async () => {
    const { hook, transcribe } = setup(settingsWith({ correctTranscript: true, textModelByProvider: { openai: '' } }));
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(transcribe.mock.calls[0][0]).toMatchObject({ correction: { modelId: undefined, instructions: '' } });
  });

  it('says the captions were created but the correction failed when the raw transcript was kept', async () => {
    const { hook } = setup(settingsWith({ correctTranscript: true }), {
      language: 'sr-Latn',
      captions: [caption('t1', 0, 2000, 'Novi titl')],
      timingSource: 'word',
      correction: 'failed'
    });
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(hook.result.current.workspace.jobResult).not.toBeNull());
    expect(hook.result.current.workspace.jobResult).toEqual({
      kind: 'transcribe',
      status: 'done',
      message: 'Created 1 captions. The AI correction failed, so the original transcript was kept.'
    });
  });

  it('keeps the plain success message when the correction applied', async () => {
    const { hook } = setup(settingsWith({ correctTranscript: true }), {
      language: 'sr-Latn',
      captions: [caption('t1', 0, 2000, 'Novi titl')],
      timingSource: 'word',
      correction: 'applied'
    });
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(hook.result.current.workspace.jobResult).not.toBeNull());
    expect(hook.result.current.workspace.jobResult?.message).toBe('Created 1 captions.');
  });
});

describe('useWorkspace.translate instructions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the translation instructions with the translate request', async () => {
    const { hook, translate } = setup(settingsWith({ translationInstructions: "Use informal 'ti'." }), undefined, [
      caption('a', 0, 1000, 'Zdravo', '')
    ]);
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    await act(async () => {
      hook.result.current.workspace.translate();
    });

    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(translate.mock.calls[0][0]).toMatchObject({ instructions: "Use informal 'ti'." });
  });
});
