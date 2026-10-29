import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderStatus } from '../../../src/shared/types/ai';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import type { AppSettings } from '../../../src/shared/types/settings';
import type { CaptionRow } from '../../../src/shared/types/project';
import { useWorkspace } from '../../../src/renderer/src/hooks/useWorkspace';
import type { JobRunner } from '../../../src/renderer/src/state/useJobRunner';
import { useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { caption, makeProject, OPENAI_STATUS, SETTINGS } from './fixtures';
import { createFakeApi } from '../state/fakeApi';
import { createI18n } from '../../../src/renderer/src/i18n';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={createI18n('en')}>{children}</I18nextProvider>;
}

/** Local CLI provider: text only, connected when its CLI is found. */
const CODEX_STATUS: ProviderStatus = {
  id: 'codex_cli',
  displayName: 'Codex CLI (local)',
  authModes: ['local_cli'],
  experimental: true,
  enabled: true,
  connected: true,
  cliVersion: 'codex-cli 0.165.0',
  cliPath: '/usr/local/bin/codex',
  capabilities: {
    detectLanguage: false,
    transcription: false,
    segmentTimestamps: false,
    wordTimestamps: false,
    translation: true,
    subtitlePolish: true,
    textToSpeech: false,
    summary: true
  }
};

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

type SetupOptions = {
  connector?: Partial<AppSettings['aiConnector']>;
  summary?: Partial<AppSettings['summary']>;
  providers?: ProviderStatus[];
  captions?: CaptionRow[];
};

function setup({ connector = {}, summary = {}, providers = [OPENAI_STATUS, CODEX_STATUS], captions }: SetupOptions = {}) {
  const fake = createFakeApi();
  fake.loadLast.mockResolvedValue({
    project: makeProject({
      captions: captions ?? [caption('a', 0, 1000, 'Hello', ''), caption('b', 1000, 2000, 'World', '')]
    }),
    sourceStatus: 'ok'
  });
  const transcribe = vi.fn(async (_request: Record<string, unknown>) => ({ language: 'en', captions: [], timingSource: 'word' }));
  const translate = vi.fn(async (_request: Record<string, unknown>) => ({ translations: [] }));
  const summarize = vi.fn(async (_request: Record<string, unknown>) => ({ text: 'Summary.' }));
  vi.stubGlobal('tajtlisha', { ...fake.api, workflow: { transcribe, translate, summarize } } as unknown as TajtlishaApi);

  const settings: AppSettings = {
    ...SETTINGS,
    aiConnector: { ...SETTINGS.aiConnector, ...connector },
    summary: { ...SETTINGS.summary, enabled: true, ...summary }
  };

  const hook = renderHook(
    () => {
      const store = useProjectStore({ targetLanguage: 'en', api: fake.api });
      const workspace = useWorkspace({ store, settings, providers, job: directJobRunner() });
      return { store, workspace };
    },
    { wrapper }
  );

  return { hook, transcribe, translate, summarize };
}

async function ready(hook: ReturnType<typeof setup>['hook']): Promise<void> {
  await waitFor(() => expect(hook.result.current.store.ready).toBe(true));
}

describe('useWorkspace per-task providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the provider of each task, resolved from the settings', async () => {
    const { hook } = setup({ connector: { textProviderId: 'codex_cli' } });
    await ready(hook);

    expect(hook.result.current.workspace.transcriptionProvider).toMatchObject({ id: 'openai', connected: true, canTranscribe: true });
    expect(hook.result.current.workspace.textProvider).toMatchObject({
      id: 'codex_cli',
      displayName: 'Codex CLI (local)',
      canTranslate: true,
      canTranscribe: false
    });
    expect(hook.result.current.workspace.summaryProvider).toMatchObject({ id: 'codex_cli', canSummarize: true });
  });

  it('translates with the text provider, its model, and the thinking effort', async () => {
    const { hook, translate } = setup({
      connector: {
        textProviderId: 'codex_cli',
        textModelByProvider: { openai: 'gpt-4.1-mini', codex_cli: 'gpt-5-codex' },
        textReasoningEffort: 'high'
      }
    });
    await ready(hook);

    await act(async () => {
      await hook.result.current.workspace.translate();
    });

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).toMatchObject({ providerId: 'codex_cli', modelId: 'gpt-5-codex', reasoningEffort: 'high' });
  });

  it('sends no reasoning parameter for translation when the effort is Default', async () => {
    const { hook, translate } = setup({ connector: { textProviderId: 'codex_cli', textReasoningEffort: 'default' } });
    await ready(hook);

    await act(async () => {
      await hook.result.current.workspace.translate();
    });

    expect(translate.mock.calls[0][0]).not.toHaveProperty('reasoningEffort');
  });

  it('translate again sends only the pending rows when some rows still need a translation', async () => {
    const { hook, translate } = setup({
      captions: [caption('a', 0, 1000, 'Hello', 'Zdravo'), caption('b', 1000, 2000, 'World', '')]
    });
    await ready(hook);

    await act(async () => {
      hook.result.current.workspace.requestTranslate();
    });

    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(hook.result.current.workspace.confirm).toBeNull();
    expect(translate.mock.calls[0][0].captions).toEqual([{ id: 'b', text: 'World' }]);
  });

  it('translate again asks first, then sends every row, when all rows are translated', async () => {
    const { hook, translate } = setup({
      captions: [caption('a', 0, 1000, 'Hello', 'Zdravo'), caption('b', 1000, 2000, 'World', 'Svete')]
    });
    await ready(hook);

    act(() => {
      hook.result.current.workspace.requestTranslate();
    });

    expect(translate).not.toHaveBeenCalled();
    const pending = hook.result.current.workspace.confirm;
    expect(pending).toMatchObject({ title: 'Translate again?', confirmLabel: 'Translate' });
    expect(pending?.description).toContain('2');

    await act(async () => {
      pending?.onConfirm();
    });

    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(translate.mock.calls[0][0].captions).toEqual([
      { id: 'a', text: 'Hello' },
      { id: 'b', text: 'World' }
    ]);
  });

  it('translates with the transcription provider when the stored text provider is not registered', async () => {
    const { hook, translate } = setup({
      connector: { textProviderId: 'openrouter', textModelByProvider: { openai: 'gpt-4.1-mini' } },
      providers: [OPENAI_STATUS]
    });
    await ready(hook);

    await act(async () => {
      await hook.result.current.workspace.translate();
    });

    expect(translate.mock.calls[0][0]).toMatchObject({ providerId: 'openai', modelId: 'gpt-4.1-mini' });
    expect(hook.result.current.workspace.textProvider?.id).toBe('openai');
  });

  it('transcribes with the transcription provider, and corrects with the text provider, model and effort', async () => {
    const { hook, transcribe } = setup({
      connector: {
        activeProviderId: 'openai',
        transcriptionModelByProvider: { openai: 'whisper-1' },
        correctTranscript: true,
        transcriptCorrectionInstructions: 'Write AI.',
        textProviderId: 'codex_cli',
        textModelByProvider: { codex_cli: 'gpt-5-codex' },
        textReasoningEffort: 'medium'
      },
      captions: []
    });
    await ready(hook);

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(transcribe.mock.calls[0][0]).toMatchObject({
      providerId: 'openai',
      modelId: 'whisper-1',
      correction: {
        providerId: 'codex_cli',
        modelId: 'gpt-5-codex',
        reasoningEffort: 'medium',
        instructions: 'Write AI.'
      }
    });
  });

  it('sends the correction without a reasoning parameter when the text effort is Default', async () => {
    const { hook, transcribe } = setup({
      connector: { correctTranscript: true, textProviderId: 'codex_cli', textReasoningEffort: 'default' },
      captions: []
    });
    await ready(hook);

    await act(async () => {
      hook.result.current.workspace.requestTranscribe();
    });

    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    expect(transcribe.mock.calls[0][0].correction).toMatchObject({ providerId: 'codex_cli' });
    expect(transcribe.mock.calls[0][0].correction).not.toHaveProperty('reasoningEffort');
  });

  it('summarizes with the summary provider and its text model when no summary model is set', async () => {
    const { hook, summarize } = setup({
      connector: { textModelByProvider: { codex_cli: 'gpt-5-codex' } },
      summary: { providerId: 'codex_cli', reasoningEffort: 'low' }
    });
    await ready(hook);

    await act(async () => {
      await hook.result.current.workspace.summarize();
    });

    expect(summarize.mock.calls[0][0]).toMatchObject({ providerId: 'codex_cli', modelId: 'gpt-5-codex', reasoningEffort: 'low' });
  });

  it('prefers the summary model of the summary provider over its text model', async () => {
    const { hook, summarize } = setup({
      connector: { textModelByProvider: { codex_cli: 'gpt-5-codex' } },
      summary: { providerId: 'codex_cli', modelByProvider: { codex_cli: 'gpt-5' } }
    });
    await ready(hook);

    await act(async () => {
      await hook.result.current.workspace.summarize();
    });

    expect(summarize.mock.calls[0][0]).toMatchObject({ providerId: 'codex_cli', modelId: 'gpt-5' });
  });

  it('summarizes with the text provider when the summary has "Same as translation" (empty provider)', async () => {
    const { hook, summarize } = setup({
      connector: { textProviderId: 'codex_cli' },
      // The Summary tab stores "Same as translation" as '' (see SummarySettings).
      summary: { providerId: '' as unknown as ProviderStatus['id'] }
    });
    await ready(hook);

    await act(async () => {
      await hook.result.current.workspace.summarize();
    });

    expect(summarize.mock.calls[0][0]).toMatchObject({ providerId: 'codex_cli' });
  });

  it('summarizes with the text provider when the summary provider is not registered', async () => {
    const { hook, summarize } = setup({
      connector: { textProviderId: 'codex_cli' },
      summary: { providerId: 'openrouter' }
    });
    await ready(hook);

    await act(async () => {
      await hook.result.current.workspace.summarize();
    });

    expect(summarize.mock.calls[0][0]).toMatchObject({ providerId: 'codex_cli' });
    expect(hook.result.current.workspace.summaryProvider?.id).toBe('codex_cli');
  });
});
