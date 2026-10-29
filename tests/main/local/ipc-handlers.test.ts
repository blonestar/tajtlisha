/* @vitest-environment node */
import { basename } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/shared/errors';
import { IPC_CHANNELS } from '../../../src/shared/types/ipc';
import type { JobOwner } from '../../../src/main/jobs/job-registry';
import { JobRegistry } from '../../../src/main/jobs/job-registry';
import { registerExportIpc } from '../../../src/main/ipc/export.ipc';
import { registerJobsIpc } from '../../../src/main/ipc/jobs.ipc';
import { getFfmpegStatus } from '../../../src/main/ipc/media.ipc';
import { registerProjectIpc } from '../../../src/main/ipc/project.ipc';
import { registerWorkflowIpc } from '../../../src/main/ipc/workflow.ipc';
import { registerAiIpc } from '../../../src/main/ipc/ai.ipc';
import type { DesktopDialogs, DesktopShell, IpcEvent } from '../../../src/main/ipc/types';
import { mainStringsFor } from '../../../src/main/i18n';
import { FfmpegService } from '../../../src/main/ffmpeg';
import { KnownSources } from '../../../src/main/project/known-sources';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';

type Handler = (event: IpcEvent, ...args: any[]) => unknown;

/** Map-backed stand-in for ipcMain. invoke() mirrors ipcRenderer.invoke: sync throws become rejections. */
function fakeIpc() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    handle(channel: string, listener: Handler) {
      handlers.set(channel, listener);
    },
    invoke: async (channel: string, owner: JobOwner, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler({ sender: owner }, ...args);
    }
  };
}

type FakeOwner = JobOwner & { sent: Array<{ channel: string; payload: unknown }> };

function fakeOwner(id: number): FakeOwner {
  const sent: FakeOwner['sent'] = [];
  return {
    id,
    sent,
    send(channel, payload) {
      sent.push({ channel, payload });
    }
  };
}

const ENGLISH = mainStringsFor('en');

function fakeDialogs(overrides: Partial<DesktopDialogs> = {}): DesktopDialogs {
  return {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showMessageBox: vi.fn(async () => ({ response: 2 })),
    ...overrides
  };
}

/** Stand-in for the protocol URL: the real one is minted by MediaTokenMap. */
const fakeVideoUrl = (path: string) => `tajtlisha-media://video/fake-${basename(path)}`;

/** Sources the renderer may reference, as if picked or loaded earlier in the session. */
function sourcesWith(...paths: string[]): KnownSources {
  const sources = new KnownSources();
  for (const path of paths) sources.remember(path);
  return sources;
}

const exportPayload = {
  jobId: 'export-1',
  inputPath: '/videos/clip.mp4',
  outputFolder: '/videos/out',
  baseName: 'clip',
  videoWidth: 1280,
  videoHeight: 720,
  trim: { startMs: 0, endMs: 4000 },
  captions: [],
  sourceLanguage: 'en',
  targetLanguage: 'sr-Latn',
  style: {},
  outputs: { originalSrt: true, translationSrt: false, video: 'none' },
  overwritePolicy: 'ask'
};

function setupExport(options: { responses: number; exportProject?: ReturnType<typeof vi.fn> }) {
  const ipc = fakeIpc();
  const dialogs = fakeDialogs({ showMessageBox: vi.fn(async () => ({ response: options.responses })) });
  const exportProject =
    options.exportProject ??
    vi.fn(async (request: { overwritePolicy: string }) => {
      if (request.overwritePolicy === 'ask') {
        throw new AppError('OUTPUT_EXISTS', '/videos/out/clip.original.srt\n/videos/out/clip.srt');
      }
      return { files: [{ kind: 'original_srt', path: '/videos/out/clip.original.srt' }] };
    });
  const shell: DesktopShell = { showItemInFolder: vi.fn() };
  registerExportIpc({
    ipc,
    jobs: new JobRegistry(),
    exporter: { exportProject: exportProject as never },
    dialogs,
    shell,
    strings: async () => ENGLISH,
    sources: sourcesWith('/videos/clip.mp4'),
    pathExists: async (path) => path === '/videos/out'
  });
  return { ipc, dialogs, exportProject, shell };
}

describe('export:project output conflicts', () => {
  it('Replace retries the same job with overwrite', async () => {
    const { ipc, dialogs, exportProject } = setupExport({ responses: 0 });
    const owner = fakeOwner(1);

    const result = await ipc.invoke(IPC_CHANNELS.exportProject, owner, exportPayload);

    expect(result).toEqual({ files: [{ kind: 'original_srt', path: '/videos/out/clip.original.srt' }] });
    expect(exportProject).toHaveBeenCalledTimes(2);
    expect(exportProject.mock.calls[1]?.[0]).toMatchObject({ overwritePolicy: 'overwrite' });
    expect(dialogs.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it('Create copies retries with create_copy', async () => {
    const { ipc, exportProject } = setupExport({ responses: 1 });

    await ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload);

    expect(exportProject.mock.calls[1]?.[0]).toMatchObject({ overwritePolicy: 'create_copy' });
  });

  it('Cancel rejects with EXPORT_CANCELED and does not retry', async () => {
    const { ipc, exportProject } = setupExport({ responses: 2 });

    await expect(ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload)).rejects.toThrow('[EXPORT_CANCELED]');
    expect(exportProject).toHaveBeenCalledTimes(1);
  });

  it('shows the conflicting paths and the translated buttons in the dialog', async () => {
    const { ipc, dialogs } = setupExport({ responses: 2 });

    await expect(ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload)).rejects.toThrow('[EXPORT_CANCELED]');
    expect(dialogs.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        detail: '/videos/out/clip.original.srt\n/videos/out/clip.srt',
        buttons: [ENGLISH.exportConflictReplace, ENGLISH.exportConflictCreateCopies, ENGLISH.exportConflictCancel]
      })
    );
  });

  it('does not show the dialog when the caller chose a policy other than ask', async () => {
    const exportProject = vi.fn(async () => {
      throw new AppError('OUTPUT_EXISTS', '/videos/out/clip.srt');
    });
    const { ipc, dialogs } = setupExport({ responses: 0, exportProject });

    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, overwritePolicy: 'overwrite' })
    ).rejects.toThrow('[OUTPUT_EXISTS]');
    expect(dialogs.showMessageBox).not.toHaveBeenCalled();
  });

  it('rejects an invalid overwrite policy at the boundary', async () => {
    const { ipc, exportProject } = setupExport({ responses: 0 });

    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, overwritePolicy: 'always' })
    ).rejects.toThrow('[UNKNOWN] overwritePolicy must be one of ask, overwrite, create_copy.');
    expect(exportProject).not.toHaveBeenCalled();
  });
});

describe('export:showInFolder and output folder', () => {
  it('reveals only existing absolute paths', async () => {
    const { ipc, shell } = setupExport({ responses: 0 });

    await expect(ipc.invoke(IPC_CHANNELS.exportShowInFolder, fakeOwner(1), 'relative/out')).rejects.toThrow('[UNKNOWN]');
    await expect(ipc.invoke(IPC_CHANNELS.exportShowInFolder, fakeOwner(1), '/videos/missing')).rejects.toThrow('[UNKNOWN]');
    await ipc.invoke(IPC_CHANNELS.exportShowInFolder, fakeOwner(1), '/videos/out');

    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1);
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/videos/out');
  });

  it('returns null when the folder dialog is canceled', async () => {
    const { ipc } = setupExport({ responses: 0 });

    expect(await ipc.invoke(IPC_CHANNELS.exportSelectOutputFolder, fakeOwner(1))).toBeNull();
  });
});

describe('jobs:cancel scoping', () => {
  function setupWorkflow() {
    const ipc = fakeIpc();
    const jobs = new JobRegistry();
    const transcribe = vi.fn(
      (_request: unknown, context: { signal: AbortSignal; onProgress(event: { stage: string }): void }) =>
        new Promise<never>((_resolve, reject) => {
          context.onProgress({ stage: 'transcribing' });
          context.signal.addEventListener('abort', () => reject(new Error('child exited with SIGTERM')));
        })
    );
    registerWorkflowIpc({ ipc, jobs, workflow: { transcribe, translate: vi.fn() } as never, sources: sourcesWith('/videos/clip.mp4') });
    registerJobsIpc({ ipc, jobs });
    return { ipc, transcribe };
  }

  it('only the window that started a job can cancel it', async () => {
    const { ipc } = setupWorkflow();
    const starter = fakeOwner(1);
    const other = fakeOwner(2);
    let settled = false;
    const running = ipc
      .invoke(IPC_CHANNELS.workflowTranscribe, starter, transcribeRequest('job-1'))
      .finally(() => {
        settled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await ipc.invoke(IPC_CHANNELS.jobsCancel, other, 'job-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    await ipc.invoke(IPC_CHANNELS.jobsCancel, starter, 'job-1');
    await expect(running).rejects.toThrow('[JOB_CANCELED]');
  });

  it('rejects a missing jobId at the boundary', async () => {
    const { ipc } = setupWorkflow();

    await expect(ipc.invoke(IPC_CHANNELS.jobsCancel, fakeOwner(1), '')).rejects.toThrow('[UNKNOWN] jobId must be a non-empty string.');
  });
});

describe('workflow handlers', () => {
  it('pass a signal and forward stage progress to the owner window', async () => {
    const ipc = fakeIpc();
    const jobs = new JobRegistry();
    let receivedSignal: AbortSignal | undefined;
    const transcribe = vi.fn(async (_request: unknown, context: { signal: AbortSignal; onProgress(event: { stage: string; progress?: number }): void }) => {
      receivedSignal = context.signal;
      context.onProgress({ stage: 'extracting_audio' });
      context.onProgress({ stage: 'transcribing', progress: 0.5 });
      return { language: 'en', captions: [], timingSource: 'word' };
    });
    registerWorkflowIpc({ ipc, jobs, workflow: { transcribe, translate: vi.fn() } as never, sources: sourcesWith('/videos/clip.mp4') });
    const owner = fakeOwner(7);

    const result = await ipc.invoke(IPC_CHANNELS.workflowTranscribe, owner, transcribeRequest('job-7'));

    expect(result).toEqual({ language: 'en', captions: [], timingSource: 'word' });
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ jobId: 'job-7', providerId: 'openai', trim: { startMs: 0, endMs: 4000 } });
    expect(owner.sent.map((message) => message.channel)).toEqual([IPC_CHANNELS.jobsProgress, IPC_CHANNELS.jobsProgress]);
    expect(owner.sent.map((message) => message.payload)).toEqual([
      { jobId: 'job-7', stage: 'extracting_audio', progress: undefined },
      { jobId: 'job-7', stage: 'transcribing', progress: 0.5 }
    ]);
  });

  it('rejects an invalid time range before starting work', async () => {
    const ipc = fakeIpc();
    const transcribe = vi.fn();
    registerWorkflowIpc({ ipc, jobs: new JobRegistry(), workflow: { transcribe, translate: vi.fn() } as never, sources: sourcesWith('/videos/clip.mp4') });

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), trim: { startMs: 5000, endMs: 1000 } })
    ).rejects.toThrow('[UNKNOWN] trim must be a range with 0 <= startMs < endMs.');
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe('workflow:summarize', () => {
  function setup() {
    const ipc = fakeIpc();
    const summarize = vi.fn(async (_request: unknown) => ({ text: 'Summary.' }));
    registerWorkflowIpc({
      ipc,
      jobs: new JobRegistry(),
      workflow: { transcribe: vi.fn(), translate: vi.fn(), summarize } as never,
      sources: new KnownSources()
    });
    return { ipc, summarize };
  }

  it('is registered and passes a valid text-only request through to the workflow', async () => {
    const { ipc, summarize } = setup();

    await expect(ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), summarizeRequest('sum-1'))).resolves.toEqual({
      text: 'Summary.'
    });
    expect(summarize.mock.calls[0]?.[0]).toEqual({
      jobId: 'sum-1',
      providerId: 'openai',
      modelId: undefined,
      reasoningEffort: undefined,
      systemPrompt: 'Make a tweet.',
      language: 'en',
      segments: [{ startMs: 0, endMs: 1000, text: 'Hello.' }]
    });
  });

  it('passes a model and every reasoning effort through', async () => {
    const { ipc, summarize } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
      ...summarizeRequest(),
      modelId: 'gpt-4.1',
      reasoningEffort: 'xhigh'
    });

    expect(summarize.mock.calls[0]?.[0]).toMatchObject({ modelId: 'gpt-4.1', reasoningEffort: 'xhigh' });
    for (const reasoningEffort of ['none', 'minimal', 'low', 'medium', 'high', 'max']) {
      await expect(
        ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), { ...summarizeRequest(), reasoningEffort })
      ).resolves.toBeDefined();
    }
  });

  it('treats an empty model id as the provider default', async () => {
    const { ipc, summarize } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), { ...summarizeRequest(), modelId: '' });

    expect(summarize.mock.calls[0]?.[0]).toMatchObject({ modelId: undefined });
  });

  it('accepts blank segment text, which the workflow drops', async () => {
    const { ipc } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
        ...summarizeRequest(),
        segments: [{ startMs: 0, endMs: 1000, text: '' }]
      })
    ).resolves.toBeDefined();
  });

  it('rejects a reasoning effort outside the allowed list without echoing the value', async () => {
    const { ipc, summarize } = setup();

    const rejection = ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
      ...summarizeRequest(),
      reasoningEffort: 'ultra-extreme-value'
    });

    await expect(rejection).rejects.toThrow('[UNKNOWN] reasoningEffort must be one of none, minimal, low, medium, high, xhigh, max.');
    await expect(rejection).rejects.not.toThrow('ultra-extreme-value');
    expect(summarize).not.toHaveBeenCalled();
  });

  it('rejects the renderer-only "default" effort, which must be mapped to no effort first', async () => {
    const { ipc } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), { ...summarizeRequest(), reasoningEffort: 'default' })
    ).rejects.toThrow('reasoningEffort must be one of');
  });

  it('rejects an empty system prompt and one over the length limit', async () => {
    const { ipc, summarize } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), { ...summarizeRequest(), systemPrompt: '   ' })
    ).rejects.toThrow('[UNKNOWN] systemPrompt must be a non-empty string.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), { ...summarizeRequest(), systemPrompt: 'a'.repeat(8001) })
    ).rejects.toThrow('[UNKNOWN] systemPrompt must be at most 8000 characters.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), { ...summarizeRequest(), systemPrompt: 'a'.repeat(8000) })
    ).resolves.toBeDefined();
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it('rejects negative and inverted segment times', async () => {
    const { ipc, summarize } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
        ...summarizeRequest(),
        segments: [{ startMs: -1, endMs: 1000, text: 'Hello.' }]
      })
    ).rejects.toThrow('[UNKNOWN] segments[0].startMs must be a number >= 0.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
        ...summarizeRequest(),
        segments: [{ startMs: 2000, endMs: 1000, text: 'Hello.' }]
      })
    ).rejects.toThrow('[UNKNOWN] segments[0].endMs must be a number >= startMs.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
        ...summarizeRequest(),
        segments: [{ startMs: 0, endMs: Number.NaN, text: 'Hello.' }]
      })
    ).rejects.toThrow('[UNKNOWN] segments[0].endMs must be a finite number.');
    expect(summarize).not.toHaveBeenCalled();
  });

  it('rejects a transcript over the text limit and too many segments', async () => {
    const { ipc, summarize } = setup();
    const long = 'x'.repeat(60_000);

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
        ...summarizeRequest(),
        segments: [
          { startMs: 0, endMs: 1000, text: long },
          { startMs: 1000, endMs: 2000, text: long }
        ]
      })
    ).rejects.toThrow('[UNKNOWN] segments must be a transcript of at most 100000 characters.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowSummarize, fakeOwner(1), {
        ...summarizeRequest(),
        segments: Array.from({ length: 5001 }, (_, index) => ({ startMs: index, endMs: index + 1, text: '' }))
      })
    ).rejects.toThrow('[UNKNOWN] segments must be at most 5000 items.');
    expect(summarize).not.toHaveBeenCalled();
  });
});

describe('ai:listModels capability validation', () => {
  it('accepts the summary capability and rejects unknown ones', async () => {
    const ipc = fakeIpc();
    const listModels = vi.fn(async () => []);
    registerAiIpc({ ipc, registry: { listModels } as never });

    await expect(ipc.invoke(IPC_CHANNELS.aiListModels, fakeOwner(1), 'openai', 'summary')).resolves.toEqual([]);
    expect(listModels).toHaveBeenCalledWith('openai', 'summary');
    await expect(ipc.invoke(IPC_CHANNELS.aiListModels, fakeOwner(1), 'openai', 'vision')).rejects.toThrow('capability must be one of');
  });
});

describe('project:selectVideo', () => {
  function setupProject(probe: Record<string, unknown>, selected: string | null = '/videos/clip.mp4') {
    const ipc = fakeIpc();
    const dialogs = fakeDialogs({
      showOpenDialog: vi.fn(async () =>
        selected === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [selected] }
      )
    });
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs,
      mediaService: { probe: vi.fn(async () => probe), createPreviewProxy: vi.fn() } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get: vi.fn() } as never,
      exporter: { renderPreviewFrame: vi.fn() } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources: new KnownSources(),
      statFile: async () => ({ size: 1234, mtimeMs: 99, isFile: true })
    });
    return { ipc, dialogs };
  }

  it('returns a ProjectSource with fresh fileUrl and file stats', async () => {
    const { ipc } = setupProject({ hasVideo: true, hasAudio: true, durationMs: 4000, width: 1280, height: 720 });

    expect(await ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).toEqual({
      inputPath: '/videos/clip.mp4',
      fileUrl: 'tajtlisha-media://video/fake-clip.mp4',
      durationMs: 4000,
      width: 1280,
      height: 720,
      hasAudio: true,
      fileSizeBytes: 1234,
      mtimeMs: 99
    });
  });

  it('opens the dialog with the video filters and returns null on cancel', async () => {
    const { ipc, dialogs } = setupProject({ hasVideo: true, durationMs: 1000, width: 2, height: 2 }, null);

    expect(await ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).toBeNull();
    expect(dialogs.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: ENGLISH.videoFilterName, extensions: ['mp4', 'm4v', 'mov', 'mkv', 'webm'] }]
      })
    );
  });

  it('rejects a file without a video stream', async () => {
    const { ipc } = setupProject({ hasVideo: false, hasAudio: true, durationMs: 4000 });

    await expect(ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).rejects.toThrow(
      '[UNKNOWN] The selected file has no video stream.'
    );
  });

  it('rejects a file whose duration is unknown', async () => {
    const { ipc } = setupProject({ hasVideo: true, width: 2, height: 2 });

    await expect(ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).rejects.toThrow('[UNKNOWN]');
  });
});

describe('project:openDroppedVideo', () => {
  function setupDrop(options: { probe?: Record<string, unknown>; isFile?: boolean } = {}) {
    const ipc = fakeIpc();
    const sources = new KnownSources();
    const probe = vi.fn(
      async () => options.probe ?? { hasVideo: true, hasAudio: false, durationMs: 4000, width: 1280, height: 720 }
    );
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs: fakeDialogs(),
      mediaService: { probe, createPreviewProxy: vi.fn() } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get: vi.fn() } as never,
      exporter: { renderPreviewFrame: vi.fn() } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources,
      statFile: async () => ({ size: 1234, mtimeMs: 99, isFile: options.isFile ?? true })
    });
    return { ipc, sources, probe };
  }

  it('returns a ProjectSource for the dropped path and lets later media calls use it', async () => {
    const { ipc, sources } = setupDrop();

    expect(await ipc.invoke(IPC_CHANNELS.projectOpenDroppedVideo, fakeOwner(1), '/videos/Clip.MP4')).toEqual({
      inputPath: '/videos/Clip.MP4',
      fileUrl: 'tajtlisha-media://video/fake-Clip.MP4',
      durationMs: 4000,
      width: 1280,
      height: 720,
      hasAudio: false,
      fileSizeBytes: 1234,
      mtimeMs: 99
    });
    expect(sources.has('/videos/Clip.MP4')).toBe(true);
  });

  it('rejects a relative path before probing', async () => {
    const { ipc, sources, probe } = setupDrop();

    await expect(ipc.invoke(IPC_CHANNELS.projectOpenDroppedVideo, fakeOwner(1), 'clip.mp4')).rejects.toThrow(
      '[UNKNOWN] The dropped file path must be absolute.'
    );
    expect(probe).not.toHaveBeenCalled();
    expect(sources.has('clip.mp4')).toBe(false);
  });

  it('rejects an unsupported extension before probing', async () => {
    const { ipc, probe } = setupDrop();

    await expect(ipc.invoke(IPC_CHANNELS.projectOpenDroppedVideo, fakeOwner(1), '/videos/notes.txt')).rejects.toThrow(
      '[UNKNOWN] The dropped file is not a supported video.'
    );
    expect(probe).not.toHaveBeenCalled();
  });

  it('rejects a directory even when its name looks like a video', async () => {
    const { ipc, sources, probe } = setupDrop({ isFile: false });

    await expect(ipc.invoke(IPC_CHANNELS.projectOpenDroppedVideo, fakeOwner(1), '/videos/folder.mp4')).rejects.toThrow(
      '[UNKNOWN] The dropped item is not a file.'
    );
    expect(probe).not.toHaveBeenCalled();
    expect(sources.has('/videos/folder.mp4')).toBe(false);
  });

  it('rejects a file without a video stream and does not remember it', async () => {
    const { ipc, sources } = setupDrop({ probe: { hasVideo: false, hasAudio: true, durationMs: 4000 } });

    await expect(ipc.invoke(IPC_CHANNELS.projectOpenDroppedVideo, fakeOwner(1), '/music/song.mp4')).rejects.toThrow(
      '[UNKNOWN] The selected file has no video stream.'
    );
    expect(sources.has('/music/song.mp4')).toBe(false);
  });
});

describe('project:createPreviewProxy', () => {
  it('reports rendering progress from ffmpeg time against the probed duration', async () => {
    const ipc = fakeIpc();
    let now = 1000;
    const jobs = new JobRegistry(() => now);
    const createPreviewProxy = vi.fn(
      async (_input: string, _output: string, options: { onProgress?: (outTimeMs: number) => void }) => {
        options.onProgress?.(0);
        now += 1000;
        options.onProgress?.(5000);
      }
    );
    registerProjectIpc({
      ipc,
      jobs,
      dialogs: fakeDialogs(),
      mediaService: { probe: vi.fn(async () => ({ hasVideo: true, durationMs: 10000 })), createPreviewProxy } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: {
        get: async (_input: string, _fingerprint: unknown, create: (output: string) => Promise<void>) => (await create('/tmp/preview.mp4'), '/tmp/preview.mp4')
      } as never,
      exporter: { renderPreviewFrame: vi.fn() } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources: sourcesWith('/videos/clip.mkv'),
      statFile: async () => ({ size: 10, mtimeMs: 20, isFile: true })
    });
    const owner = fakeOwner(3);

    const result = await ipc.invoke(IPC_CHANNELS.projectCreatePreviewProxy, owner, { jobId: 'preview-1', inputPath: '/videos/clip.mkv' });

    expect(result).toEqual({ fileUrl: 'tajtlisha-media://video/fake-preview.mp4' });
    expect(createPreviewProxy.mock.calls[0]?.[0]).toBe('/videos/clip.mkv');
    expect(owner.sent.map((message) => message.payload)).toEqual([
      { jobId: 'preview-1', stage: 'rendering_video', progress: 0 },
      { jobId: 'preview-1', stage: 'rendering_video', progress: 0.5 }
    ]);
  });
});

describe('media:getFfmpegStatus', () => {
  it('is unavailable with missing features when ffmpeg cannot run', async () => {
    const ffmpeg = new FfmpegService({ ffmpegPath: '/nonexistent/ffmpeg-for-test', ffprobePath: '/nonexistent/ffprobe-for-test' });

    const status = await getFfmpegStatus(ffmpeg);

    expect(status.available).toBe(false);
    expect(status.missing).toEqual(expect.arrayContaining(['ffmpeg', 'ffprobe', 'ass filter (libass)']));
    expect(status.capabilities).toEqual({ ffprobe: false, assFilter: false, libx264: false, aac: false, mp3: false });
  });
});

describe('project:save and project:loadLast', () => {
  function setupStore(loaded: unknown = null) {
    const ipc = fakeIpc();
    const sources = new KnownSources();
    const save = vi.fn(async (_doc: unknown) => ({ savedRevision: 1 }));
    const loadLast = vi.fn(async () => loaded);
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs: fakeDialogs(),
      mediaService: { probe: vi.fn(), createPreviewProxy: vi.fn() } as never,
      projectStore: { loadLast, save } as never,
      previewProxies: { get: vi.fn() } as never,
      exporter: { renderPreviewFrame: vi.fn() } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources
    });
    return { ipc, save, loadLast, sources };
  }

  const document = {
    schemaVersion: 1,
    id: 'p1',
    revision: 1,
    source: null,
    trim: { startMs: 0, endMs: 4000 },
    targetLanguage: 'sr-Latn',
    captions: [{ id: 'c1', startMs: 0, endMs: 1000, original: 'hi', translation: '' }],
    style: DEFAULT_SUBTITLE_STYLE,
    previewTrack: 'original',
    updatedAt: '2026-10-22T10:00:00.000Z'
  };

  it('rejects an invalid document before the store sees it', async () => {
    const { ipc, save } = setupStore();

    await expect(ipc.invoke(IPC_CHANNELS.projectSave, fakeOwner(1), { ...document, style: undefined })).rejects.toThrow(
      '[UNKNOWN] invalid project: project.style'
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('passes a valid document to the store with unknown fields removed', async () => {
    const { ipc, save } = setupStore();

    await ipc.invoke(IPC_CHANNELS.projectSave, fakeOwner(1), { ...document, extra: 'x' });

    const saved = save.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved).not.toHaveProperty('extra');
    expect(saved).toMatchObject({ id: 'p1', revision: 1, trim: { startMs: 0, endMs: 4000 } });
  });

  it('remembers a loaded source only when it came back playable', async () => {
    const playable = { project: { ...document, source: sourceRecord('/videos/clip.mp4', 'tajtlisha-media://video/x') }, sourceStatus: 'ok' };
    const { ipc, sources } = setupStore(playable);

    await ipc.invoke(IPC_CHANNELS.projectLoadLast, fakeOwner(1));

    expect(sources.has('/videos/clip.mp4')).toBe(true);
  });

  it('does not remember a source that is missing', async () => {
    const missing = { project: { ...document, source: sourceRecord('/videos/gone.mp4', '') }, sourceStatus: 'missing' };
    const { ipc, sources } = setupStore(missing);

    await ipc.invoke(IPC_CHANNELS.projectLoadLast, fakeOwner(1));

    expect(sources.has('/videos/gone.mp4')).toBe(false);
  });

  it('keeps preview and frame requests to sources this session knows about', async () => {
    const ipc = fakeIpc();
    const createPreviewProxy = vi.fn();
    const renderPreviewFrame = vi.fn();
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs: fakeDialogs(),
      mediaService: { probe: vi.fn(), createPreviewProxy } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get: vi.fn() } as never,
      exporter: { renderPreviewFrame } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources: new KnownSources()
    });
    const frame = { inputPath: '/etc/passwd', atMs: 0, videoWidth: 2, videoHeight: 2, text: 'x', style: DEFAULT_SUBTITLE_STYLE };

    await expect(ipc.invoke(IPC_CHANNELS.projectCreatePreviewProxy, fakeOwner(1), { jobId: 'p', inputPath: '/etc/passwd' })).rejects.toThrow(
      '[UNKNOWN] inputPath is not an open video.'
    );
    await expect(ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), frame)).rejects.toThrow('[UNKNOWN]');
    expect(createPreviewProxy).not.toHaveBeenCalled();
    expect(renderPreviewFrame).not.toHaveBeenCalled();
  });

  it('accepts activeWordIndex only as an integer of -1 or more, and leaves it absent when not sent', async () => {
    const ipc = fakeIpc();
    const renderPreviewFrame = vi.fn(async (_request: Record<string, unknown>) => ({ dataUrl: 'data:image/png;base64,' }));
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs: fakeDialogs(),
      mediaService: { probe: vi.fn(), createPreviewProxy: vi.fn() } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get: vi.fn() } as never,
      exporter: { renderPreviewFrame } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources: sourcesWith('/videos/clip.mkv')
    });
    const frame = { inputPath: '/videos/clip.mkv', atMs: 0, videoWidth: 2, videoHeight: 2, text: 'x', style: DEFAULT_SUBTITLE_STYLE };

    await ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), { ...frame, activeWordIndex: 2 });
    await ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), { ...frame, activeWordIndex: -1 });
    await ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), frame);

    expect(renderPreviewFrame.mock.calls[0]?.[0]).toMatchObject({ activeWordIndex: 2 });
    expect(renderPreviewFrame.mock.calls[1]?.[0]).toMatchObject({ activeWordIndex: -1 });
    expect(renderPreviewFrame.mock.calls[2]?.[0]).not.toHaveProperty('activeWordIndex');

    for (const bad of [1.5, -2, '1', null, Number.NaN]) {
      await expect(ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), { ...frame, activeWordIndex: bad })).rejects.toThrow(
        '[UNKNOWN] activeWordIndex must be an integer of -1 or more.'
      );
    }
    expect(renderPreviewFrame).toHaveBeenCalledTimes(3);
  });

  it('gives the preview cache the source size and mtime as its fingerprint', async () => {
    const ipc = fakeIpc();
    const get = vi.fn(async (_input: string, _fingerprint: unknown, _create: unknown) => '/tmp/preview.mp4');
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs: fakeDialogs(),
      mediaService: { probe: vi.fn(), createPreviewProxy: vi.fn() } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get } as never,
      exporter: { renderPreviewFrame: vi.fn() } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources: sourcesWith('/videos/clip.mkv'),
      statFile: async () => ({ size: 77, mtimeMs: 88, isFile: true })
    });

    await ipc.invoke(IPC_CHANNELS.projectCreatePreviewProxy, fakeOwner(1), { jobId: 'p', inputPath: '/videos/clip.mkv' });

    expect(get.mock.calls[0]?.[1]).toEqual({ size: 77, mtimeMs: 88 });
  });
});

describe('media inputs must be known sources', () => {
  it('workflow:transcribe refuses a path the renderer never received', async () => {
    const ipc = fakeIpc();
    const transcribe = vi.fn();
    registerWorkflowIpc({ ipc, jobs: new JobRegistry(), workflow: { transcribe, translate: vi.fn() } as never, sources: new KnownSources() });

    await expect(ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), transcribeRequest('job-1'))).rejects.toThrow('[UNKNOWN]');
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('export:project refuses a path the renderer never received', async () => {
    const ipc = fakeIpc();
    const exportProject = vi.fn();
    registerExportIpc({
      ipc,
      jobs: new JobRegistry(),
      exporter: { exportProject: exportProject as never },
      dialogs: fakeDialogs(),
      shell: { showItemInFolder: vi.fn() },
      strings: async () => ENGLISH,
      sources: new KnownSources()
    });

    await expect(ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload)).rejects.toThrow('[UNKNOWN]');
    expect(exportProject).not.toHaveBeenCalled();
  });
});

function sourceRecord(inputPath: string, fileUrl: string) {
  return {
    inputPath,
    fileUrl,
    durationMs: 4000,
    width: 1280,
    height: 720,
    hasAudio: true,
    fileSizeBytes: 1,
    mtimeMs: 1
  };
}

function transcribeRequest(jobId: string) {
  return {
    jobId,
    inputPath: '/videos/clip.mp4',
    trim: { startMs: 0, endMs: 4000 },
    providerId: 'openai',
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2
  };
}

function summarizeRequest(jobId = 'sum-1') {
  return {
    jobId,
    providerId: 'openai',
    systemPrompt: 'Make a tweet.',
    language: 'en',
    segments: [{ startMs: 0, endMs: 1000, text: 'Hello.' }]
  };
}

describe('watermark at the IPC boundary', () => {
  const logo = {
    enabled: true,
    content: 'mark_text',
    markText: 'MK',
    text: 'Moj kanal',
    background: 'all',
    backgroundColor: '#112233',
    markColor: '#F2A93B',
    textColor: '#F2F2F2',
    cornerRadiusPercent: 19,
    position: 'bottom_right',
    sizePercent: 40,
    marginPercent: 3,
    opacity: 0.5
  };

  it('clamps a valid export logo and passes it to the exporter', async () => {
    const exportProject = vi.fn(async (_request: Record<string, unknown>) => ({ files: [] }));
    const { ipc } = setupExport({ responses: 2, exportProject });

    await ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: logo });

    expect(exportProject.mock.calls[0]?.[0]).toMatchObject({ watermark: { ...logo, sizePercent: 15 } });
  });

  it('leaves the export logo absent when the request has none', async () => {
    const exportProject = vi.fn(async (_request: Record<string, unknown>) => ({ files: [] }));
    const { ipc } = setupExport({ responses: 2, exportProject });

    await ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload);

    expect(exportProject.mock.calls[0]?.[0]).not.toHaveProperty('watermark');
  });

  it('rejects an export logo with wrong types, naming the field and not the value', async () => {
    const exportProject = vi.fn(async (_request: Record<string, unknown>) => ({ files: [] }));
    const { ipc } = setupExport({ responses: 2, exportProject });

    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, enabled: 'yes' } })
    ).rejects.toThrow('[UNKNOWN] watermark.enabled must be a boolean.');
    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, content: 'big' } })
    ).rejects.toThrow('[UNKNOWN] watermark.content must be one of mark_text, mark, text.');
    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, position: 'center' } })
    ).rejects.toThrow('[UNKNOWN] watermark.position must be one of');
    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, text: 5 } })
    ).rejects.toThrow('[UNKNOWN] watermark.text must be a string.');
    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, backgroundColor: 'red' } })
    ).rejects.toThrow('[UNKNOWN] watermark.backgroundColor must be a #rrggbb colour.');
    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, background: 'some' } })
    ).rejects.toThrow('[UNKNOWN] watermark.background must be one of all, mark, none.');
    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, sizePercent: '7' } })
    ).rejects.toThrow('[UNKNOWN] watermark.sizePercent must be a finite number.');
    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: { ...logo, opacity: Number.NaN } })
    ).rejects.toThrow('[UNKNOWN] watermark.opacity must be a finite number.');
    await expect(ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, watermark: null })).rejects.toThrow(
      '[UNKNOWN] watermark must be an object.'
    );
    expect(exportProject).not.toHaveBeenCalled();
  });

  it('validates the preview frame logo the same way', async () => {
    const ipc = fakeIpc();
    const renderPreviewFrame = vi.fn(async (_request: Record<string, unknown>) => ({ dataUrl: 'data:image/png;base64,' }));
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs: fakeDialogs(),
      mediaService: { probe: vi.fn(), createPreviewProxy: vi.fn() } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get: vi.fn() } as never,
      exporter: { renderPreviewFrame } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      sources: sourcesWith('/videos/clip.mkv')
    });
    const frame = { inputPath: '/videos/clip.mkv', atMs: 0, videoWidth: 2, videoHeight: 2, text: 'x', style: DEFAULT_SUBTITLE_STYLE };

    await ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), { ...frame, watermark: logo });
    expect(renderPreviewFrame.mock.calls[0]?.[0]).toMatchObject({ watermark: { ...logo, sizePercent: 15 } });

    await ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), frame);
    expect(renderPreviewFrame.mock.calls[1]?.[0]).not.toHaveProperty('watermark');

    await expect(
      ipc.invoke(IPC_CHANNELS.projectRenderPreviewFrame, fakeOwner(1), { ...frame, watermark: { ...logo, enabled: 1 } })
    ).rejects.toThrow('[UNKNOWN] watermark.enabled must be a boolean.');
    expect(renderPreviewFrame).toHaveBeenCalledTimes(2);
  });
});

describe('workflow:transcribe correction validation', () => {
  function setup() {
    const ipc = fakeIpc();
    const transcribe = vi.fn(async (_request: unknown) => ({ language: 'en', captions: [], timingSource: 'word' }));
    registerWorkflowIpc({ ipc, jobs: new JobRegistry(), workflow: { transcribe, translate: vi.fn() } as never, sources: sourcesWith('/videos/clip.mp4') });
    return { ipc, transcribe };
  }

  it('passes no correction through when the field is absent', async () => {
    const { ipc, transcribe } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), transcribeRequest('job-1'));

    expect(transcribe.mock.calls[0]?.[0]).not.toHaveProperty('correction');
  });

  it('passes the correction text provider through and accepts a local CLI provider id', async () => {
    const { ipc, transcribe } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), {
      ...transcribeRequest('job-1'),
      correction: { providerId: 'codex_cli', instructions: '' }
    });

    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ correction: { providerId: 'codex_cli', instructions: '' } });
  });

  it('passes the correction reasoning effort through', async () => {
    const { ipc, transcribe } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), {
      ...transcribeRequest('job-1'),
      correction: { instructions: '', reasoningEffort: 'low' }
    });

    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ correction: { reasoningEffort: 'low' } });
  });

  it('rejects an unknown correction provider id', async () => {
    const { ipc } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), {
        ...transcribeRequest('job-1'),
        correction: { providerId: 'mystery', instructions: '' }
      })
    ).rejects.toThrow('[UNKNOWN] providerId must be one of openai, openrouter, codex_cli, claude_code_cli.');
  });

  it('accepts a correction with a model and instructions', async () => {
    const { ipc, transcribe } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), {
      ...transcribeRequest('job-1'),
      correction: { modelId: 'gpt-fix', instructions: 'Name: Bojan.' }
    });

    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ correction: { modelId: 'gpt-fix', instructions: 'Name: Bojan.' } });
  });

  it('maps an empty model id to undefined and a missing instructions field to empty text', async () => {
    const { ipc, transcribe } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), correction: { modelId: '' } });

    expect(transcribe.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ correction: { modelId: undefined, instructions: '' } }));
  });

  it('accepts instructions at exactly the length limit and rejects one character more', async () => {
    const { ipc, transcribe } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), {
        ...transcribeRequest('job-1'),
        correction: { instructions: 'a'.repeat(4000) }
      })
    ).resolves.toBeDefined();
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), {
        ...transcribeRequest('job-2'),
        correction: { instructions: 'a'.repeat(4001) }
      })
    ).rejects.toThrow('[UNKNOWN] correction.instructions must be at most 4000 characters.');
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it('rejects a correction that is not an object, and instructions that are not a string', async () => {
    const { ipc, transcribe } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), correction: 'yes' })
    ).rejects.toThrow('[UNKNOWN] correction must be an object.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), correction: null })
    ).rejects.toThrow('[UNKNOWN] correction must be an object.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), correction: { instructions: 42 } })
    ).rejects.toThrow('[UNKNOWN] correction.instructions must be a string.');
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), correction: { modelId: 7, instructions: '' } })
    ).rejects.toThrow('[UNKNOWN] modelId must be a non-empty string.');
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe('workflow:translate instructions validation', () => {
  function setup() {
    const ipc = fakeIpc();
    const translate = vi.fn(async (_request: unknown) => ({ translations: [] }));
    registerWorkflowIpc({ ipc, jobs: new JobRegistry(), workflow: { transcribe: vi.fn(), translate } as never, sources: new KnownSources() });
    return { ipc, translate };
  }

  function translateRequest(overrides: Record<string, unknown> = {}) {
    return {
      jobId: 'tr-1',
      providerId: 'openai',
      sourceLanguage: 'en',
      targetLanguage: 'sr-Latn',
      captions: [{ id: 'a', text: 'hello' }],
      polish: 'none',
      maxCharsPerLine: 42,
      maxLinesPerCaption: 2,
      ...overrides
    };
  }

  it('passes instructions through, and passes none when the field is absent', async () => {
    const { ipc, translate } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ instructions: 'Use formal address.' }));
    await ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest());

    expect(translate.mock.calls[0]?.[0]).toMatchObject({ instructions: 'Use formal address.' });
    expect(translate.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ instructions: undefined }));
  });

  it('passes a known reasoning effort through and rejects an unknown one', async () => {
    const { ipc, translate } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ reasoningEffort: 'high' }));
    await ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest());

    expect(translate.mock.calls[0]?.[0]).toMatchObject({ reasoningEffort: 'high' });
    expect(translate.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ reasoningEffort: undefined }));
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ reasoningEffort: 'ultra' }))
    ).rejects.toThrow('reasoningEffort');
  });

  it('accepts instructions at the limit and rejects a longer text or a non-string', async () => {
    const { ipc, translate } = setup();

    await expect(ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ instructions: 'a'.repeat(4000) }))).resolves.toBeDefined();
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ instructions: 'a'.repeat(4001) }))
    ).rejects.toThrow('[UNKNOWN] instructions must be at most 4000 characters.');
    await expect(ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ instructions: ['x'] }))).rejects.toThrow(
      '[UNKNOWN] instructions must be a string.'
    );
    expect(translate).toHaveBeenCalledTimes(1);
  });
});

describe('workflow:transcribe video context validation', () => {
  function setup() {
    const ipc = fakeIpc();
    const transcribe = vi.fn(async (_request: unknown) => ({ language: 'en', captions: [], timingSource: 'word' }));
    registerWorkflowIpc({ ipc, jobs: new JobRegistry(), workflow: { transcribe, translate: vi.fn() } as never, sources: sourcesWith('/videos/clip.mp4') });
    return { ipc, transcribe };
  }

  it('passes the video context through, and leaves it undefined when the field is absent', async () => {
    const { ipc, transcribe } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), videoContext: 'Epizoda o Beogradu.' });
    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), transcribeRequest('job-2'));

    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ videoContext: 'Epizoda o Beogradu.' });
    expect((transcribe.mock.calls[1]?.[0] as { videoContext?: string }).videoContext).toBeUndefined();
  });

  it('accepts a video context at exactly the 2000 character limit and rejects one character more', async () => {
    const { ipc, transcribe } = setup();

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), videoContext: 'a'.repeat(2000) })
    ).resolves.toBeDefined();
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-2'), videoContext: 'a'.repeat(2001) })
    ).rejects.toThrow('[UNKNOWN] videoContext must be at most 2000 characters.');
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it('accepts an empty or blank video context, which the workflow ignores', async () => {
    const { ipc, transcribe } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), videoContext: '' });
    await ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-2'), videoContext: '   ' });

    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(transcribe.mock.calls[1]?.[0]).toMatchObject({ videoContext: '   ' });
  });

  it('rejects a video context that is not a string before starting work', async () => {
    const { ipc, transcribe } = setup();

    for (const videoContext of [42, null, ['Ana'], { text: 'Ana' }]) {
      await expect(
        ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), videoContext })
      ).rejects.toThrow('[UNKNOWN] videoContext must be a string.');
    }
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe('workflow:translate video context validation', () => {
  function setup() {
    const ipc = fakeIpc();
    const translate = vi.fn(async (_request: unknown) => ({ translations: [] }));
    registerWorkflowIpc({ ipc, jobs: new JobRegistry(), workflow: { transcribe: vi.fn(), translate } as never, sources: new KnownSources() });
    return { ipc, translate };
  }

  function translateRequest(overrides: Record<string, unknown> = {}) {
    return {
      jobId: 'tr-1',
      providerId: 'openai',
      sourceLanguage: 'en',
      targetLanguage: 'sr-Latn',
      captions: [{ id: 'a', text: 'hello' }],
      polish: 'none',
      maxCharsPerLine: 42,
      maxLinesPerCaption: 2,
      ...overrides
    };
  }

  it('passes the video context through, and leaves it undefined when the field is absent', async () => {
    const { ipc, translate } = setup();

    await ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ videoContext: 'Vlog o Crnoj Gori.' }));
    await ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest());

    expect(translate.mock.calls[0]?.[0]).toMatchObject({ videoContext: 'Vlog o Crnoj Gori.' });
    expect((translate.mock.calls[1]?.[0] as { videoContext?: string }).videoContext).toBeUndefined();
  });

  it('accepts a video context at the limit and rejects a longer one or a non-string', async () => {
    const { ipc, translate } = setup();

    await expect(ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ videoContext: 'a'.repeat(2000) }))).resolves.toBeDefined();
    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ videoContext: 'a'.repeat(2001) }))
    ).rejects.toThrow('[UNKNOWN] videoContext must be at most 2000 characters.');
    await expect(ipc.invoke(IPC_CHANNELS.workflowTranslate, fakeOwner(1), translateRequest({ videoContext: 7 }))).rejects.toThrow(
      '[UNKNOWN] videoContext must be a string.'
    );
    expect(translate).toHaveBeenCalledTimes(1);
  });
});
