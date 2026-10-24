import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import type { SummarizeTranscriptRequest } from '../../../src/shared/types/jobs';
import type { AppSettings } from '../../../src/shared/types/settings';
import { DEFAULT_SUMMARY_PROMPT } from '../../../src/shared/summary';
import { useWorkspace } from '../../../src/renderer/src/hooks/useWorkspace';
import { useJobRunner } from '../../../src/renderer/src/state/useJobRunner';
import { useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { caption, makeProject, OPENAI_STATUS, SETTINGS } from './fixtures';
import { createFakeApi } from '../state/fakeApi';
import { createI18n } from '../../../src/renderer/src/i18n';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={createI18n('en')}>{children}</I18nextProvider>;
}

type Summary = { text: string };

type SetupOptions = {
  summary?: Partial<AppSettings['summary']>;
  textModel?: string;
  captions?: ReturnType<typeof caption>[];
  trim?: { startMs: number; endMs: number };
};

function setup(options: SetupOptions = {}) {
  const fake = createFakeApi();
  const captions = options.captions ?? [caption('a', 0, 1000, 'Hello', ''), caption('b', 1000, 2000, 'World', '')];
  fake.loadLast.mockResolvedValue({
    project: makeProject({ captions, trim: options.trim ?? { startMs: 0, endMs: 12000 } }),
    sourceStatus: 'ok'
  });

  let finish: (value: Summary) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const summarize = vi.fn(
    (_request: SummarizeTranscriptRequest) =>
      new Promise<Summary>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      })
  );
  const api = { ...fake.api, workflow: { transcribe: vi.fn(), translate: vi.fn(), summarize } } as unknown as TajtlishaApi;
  vi.stubGlobal('tajtlisha', api);

  const settings: AppSettings = {
    ...SETTINGS,
    aiConnector: {
      ...SETTINGS.aiConnector,
      textModelByProvider: options.textModel === undefined ? {} : { openai: options.textModel }
    },
    summary: { ...SETTINGS.summary, enabled: true, ...options.summary }
  };

  const hook = renderHook(
    () => {
      const store = useProjectStore({ targetLanguage: 'en', api: fake.api });
      const job = useJobRunner(api);
      const workspace = useWorkspace({ store, settings, providers: [OPENAI_STATUS], job });
      return { store, workspace };
    },
    { wrapper }
  );

  return {
    hook,
    summarize,
    finish: (value: Summary) => finish(value),
    fail: (error: Error) => fail(error),
    /** Starts the summary and waits until the request has reached the API. */
    async start() {
      await waitFor(() => expect(hook.result.current.store.ready).toBe(true));
      act(() => {
        void hook.result.current.workspace.summarize();
      });
      await waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
    }
  };
}

function lastRequest(summarize: ReturnType<typeof setup>['summarize']): SummarizeTranscriptRequest {
  return summarize.mock.calls[0][0];
}

describe('useWorkspace.summarize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the trimmed captions with times relative to the trim start and clipped to the clip', async () => {
    const env = setup({
      trim: { startMs: 2000, endMs: 8000 },
      captions: [
        caption('before', 1000, 3000, 'Before start', ''),
        caption('middle', 3000, 4500, '  Middle line  ', ''),
        caption('blank', 5000, 5500, '   ', ''),
        caption('late', 7000, 9000, 'Ends late', ''),
        caption('outside', 9500, 10000, 'Outside the trim', '')
      ]
    });

    await env.start();

    expect(lastRequest(env.summarize).segments).toEqual([
      { startMs: 0, endMs: 1000, text: 'Before start' },
      { startMs: 1000, endMs: 2500, text: 'Middle line' },
      { startMs: 5000, endMs: 6000, text: 'Ends late' }
    ]);
  });

  it('sends the project language, the provider, and the trimmed custom prompt', async () => {
    const env = setup({ summary: { systemPrompt: '  Write a tweet.  ' } });

    await env.start();

    expect(lastRequest(env.summarize)).toMatchObject({
      providerId: 'openai',
      language: 'sr-Latn',
      systemPrompt: 'Write a tweet.'
    });
  });

  it('uses the default prompt when the stored prompt is blank', async () => {
    const env = setup({ summary: { systemPrompt: '   ' } });

    await env.start();

    expect(lastRequest(env.summarize).systemPrompt).toBe(DEFAULT_SUMMARY_PROMPT);
  });

  it('uses the summary model when set, otherwise the text model', async () => {
    const env = setup({ textModel: 'gpt-4.1-mini', summary: { modelByProvider: { openai: 'gpt-5-mini' } } });

    await env.start();

    expect(lastRequest(env.summarize).modelId).toBe('gpt-5-mini');
  });

  it('falls back to the text model when the summary model is blank', async () => {
    const env = setup({ textModel: 'gpt-4.1-mini', summary: { modelByProvider: { openai: '' } } });

    await env.start();

    expect(lastRequest(env.summarize).modelId).toBe('gpt-4.1-mini');
  });

  it('leaves the model unset when both settings are blank, so the provider default applies', async () => {
    const env = setup({ textModel: '', summary: { modelByProvider: { openai: '' } } });

    await env.start();

    expect(lastRequest(env.summarize).modelId).toBeUndefined();
  });

  it('omits the reasoning effort when it is Default', async () => {
    const env = setup({ summary: { reasoningEffort: 'default' } });

    await env.start();

    expect('reasoningEffort' in lastRequest(env.summarize)).toBe(false);
  });

  it('sends the chosen reasoning effort', async () => {
    const env = setup({ summary: { reasoningEffort: 'high' } });

    await env.start();

    expect(lastRequest(env.summarize).reasoningEffort).toBe('high');
  });

  it('stores the result for this project and opens the dialog', async () => {
    const env = setup();
    await env.start();

    await act(async () => {
      env.finish({ text: 'Tweet text' });
    });

    const { workspace, store } = env.hook.result.current;
    expect(workspace.summary).toEqual({
      projectId: store.state.project.id,
      inputPath: store.state.project.source?.inputPath ?? null,
      revision: store.state.project.revision,
      text: 'Tweet text'
    });
    expect(workspace.summaryOpen).toBe(true);
  });

  it('keeps the result when captions are edited while the summary runs', async () => {
    const env = setup();
    await env.start();

    act(() => env.hook.result.current.store.dispatch({ type: 'caption/update', id: 'a', patch: { original: 'Hi' } }));
    await act(async () => {
      env.finish({ text: 'Tweet text' });
    });

    const { workspace, store } = env.hook.result.current;
    expect(workspace.summary?.text).toBe('Tweet text');
    expect(workspace.summary?.revision).not.toBe(store.state.project.revision);
  });

  it('discards the result when the project changes while the summary runs', async () => {
    const env = setup();
    await env.start();

    act(() =>
      env.hook.result.current.store.dispatch({
        type: 'project/replace',
        project: makeProject({ id: 'project-2', captions: [caption('x', 0, 1000, 'Other', '')] })
      })
    );
    await act(async () => {
      env.finish({ text: 'Tweet text' });
    });

    const { workspace } = env.hook.result.current;
    expect(workspace.summary).toBeNull();
    expect(workspace.summaryOpen).toBe(false);
  });

  it('clears an existing result when the project changes', async () => {
    const env = setup();
    await env.start();
    await act(async () => {
      env.finish({ text: 'Tweet text' });
    });
    expect(env.hook.result.current.workspace.summary).not.toBeNull();

    act(() =>
      env.hook.result.current.store.dispatch({
        type: 'project/replace',
        project: makeProject({ id: 'project-2', captions: [caption('x', 0, 1000, 'Other', '')] })
      })
    );

    expect(env.hook.result.current.workspace.summary).toBeNull();
    expect(env.hook.result.current.workspace.summaryOpen).toBe(false);
  });

  it('clears an existing result when another video is opened in the same project', async () => {
    const env = setup();
    await env.start();
    await act(async () => {
      env.finish({ text: 'Tweet text' });
    });
    const { store } = env.hook.result.current;
    const source = store.state.project.source;
    expect(source).not.toBeNull();
    expect(env.hook.result.current.workspace.summary).not.toBeNull();

    act(() =>
      env.hook.result.current.store.dispatch({
        type: 'source/set',
        source: { ...source!, inputPath: '/videos/another-clip.mp4' }
      })
    );

    expect(env.hook.result.current.store.state.project.id).toBe(store.state.project.id);
    expect(env.hook.result.current.workspace.summary).toBeNull();
    expect(env.hook.result.current.workspace.summaryOpen).toBe(false);
  });

  it('clears the job bar error of a failed attempt when the next attempt succeeds', async () => {
    const env = setup();
    await env.start();
    await act(async () => {
      env.fail(new Error('[PROVIDER_REQUEST_FAILED] OpenAI request failed (HTTP 500).'));
    });
    expect(env.hook.result.current.workspace.jobResult?.status).toBe('error');

    act(() => {
      void env.hook.result.current.workspace.summarize();
    });
    await waitFor(() => expect(env.summarize).toHaveBeenCalledTimes(2));
    await act(async () => {
      env.finish({ text: 'Tweet text' });
    });

    expect(env.hook.result.current.workspace.summary?.text).toBe('Tweet text');
    expect(env.hook.result.current.workspace.jobResult).toBeNull();
  });

  it('explains instead of calling the provider when no caption in the trim has text', async () => {
    const env = setup({ captions: [caption('a', 0, 1000, '   ', '')] });
    await waitFor(() => expect(env.hook.result.current.store.ready).toBe(true));

    act(() => {
      void env.hook.result.current.workspace.summarize();
    });

    expect(env.summarize).not.toHaveBeenCalled();
    expect(env.hook.result.current.workspace.notice?.text).toBe(
      'There is no caption text inside the trim range to summarize.'
    );
  });
});
