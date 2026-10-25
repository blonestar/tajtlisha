import { vi } from 'vitest';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import type { JobProgressEvent } from '../../../src/shared/types/jobs';
import type { ProjectDocument, ProjectLoadResult, ProjectSource } from '../../../src/shared/types/project';
import type { AppSettings } from '../../../src/shared/types/settings';
import { OPENAI_STATUS, SETTINGS, SOURCE, makeProject } from './fixtures';

type Fn<A extends unknown[], R> = ReturnType<typeof vi.fn<(...args: A) => R>>;

export type FakeWindowApi = {
  api: TajtlishaApi;
  loadLast: Fn<[], Promise<ProjectLoadResult | null>>;
  save: Fn<[ProjectDocument], Promise<{ savedRevision: number }>>;
  selectVideo: Fn<[], Promise<ProjectSource | null>>;
  openDroppedVideo: Fn<[File], Promise<ProjectSource>>;
  transcribe: Fn<[unknown], Promise<unknown>>;
  translate: Fn<[unknown], Promise<unknown>>;
  exportProject: Fn<[unknown], Promise<unknown>>;
  createPreviewProxy: Fn<[unknown], Promise<{ fileUrl: string }>>;
  cancel: Fn<[string], Promise<void>>;
  showInFolder: Fn<[string], Promise<void>>;
  emitProgress: (event: JobProgressEvent) => void;
};

/**
 * Stand-in for window.tajtlisha. Defaults resolve with plausible data; tests
 * override single methods through `overrides` or mockImplementationOnce.
 */
export function createWindowApi(
  options: { project?: ProjectDocument | null; settings?: AppSettings; source?: ProjectSource | null } = {}
): FakeWindowApi {
  const listeners = new Set<(event: JobProgressEvent) => void>();
  const project = options.project === undefined ? makeProject() : options.project;
  const settings = options.settings ?? SETTINGS;

  const loadLast = vi.fn<() => Promise<ProjectLoadResult | null>>(() =>
    Promise.resolve(project ? { project, sourceStatus: 'ok' } : null)
  );
  const save = vi.fn<(saved: ProjectDocument) => Promise<{ savedRevision: number }>>((saved) =>
    Promise.resolve({ savedRevision: saved.revision })
  );
  const selectVideo = vi.fn<() => Promise<ProjectSource | null>>(() => Promise.resolve(options.source ?? null));
  // The dropped source is named after the file so tests can see which video was opened.
  const openDroppedVideo = vi.fn<(file: File) => Promise<ProjectSource>>((file) =>
    Promise.resolve({ ...SOURCE, inputPath: `/drops/${file.name}`, fileUrl: `tajtlisha-media://drop-${file.name}` })
  );
  const transcribe = vi.fn<(request: unknown) => Promise<unknown>>(() =>
    Promise.resolve({ language: 'sr-Latn', captions: [], timingSource: 'word' })
  );
  const translate = vi.fn<(request: unknown) => Promise<unknown>>(() => Promise.resolve({ translations: [] }));
  const exportProject = vi.fn<(request: unknown) => Promise<unknown>>(() =>
    Promise.resolve({
      files: [
        { kind: 'original_srt', path: '/exports/intro.sr-Latn.srt' },
        { kind: 'translation_srt', path: '/exports/intro.en.srt' }
      ]
    })
  );
  const createPreviewProxy = vi.fn<(request: unknown) => Promise<{ fileUrl: string }>>(() =>
    Promise.resolve({ fileUrl: 'tajtlisha-media://proxy' })
  );
  const cancel = vi.fn<(jobId: string) => Promise<void>>(() => Promise.resolve());
  const showInFolder = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve());

  const api = {
    settings: {
      get: vi.fn(() => Promise.resolve(settings)),
      update: vi.fn((patch: Partial<AppSettings>) => Promise.resolve({ ...settings, ...patch })),
      reset: vi.fn(() => Promise.resolve(settings))
    },
    ai: {
      listProviders: vi.fn(() => Promise.resolve([OPENAI_STATUS])),
      getProviderStatus: vi.fn(() => Promise.resolve(OPENAI_STATUS)),
      connectProvider: vi.fn(() => Promise.resolve(OPENAI_STATUS)),
      disconnectProvider: vi.fn(() => Promise.resolve(OPENAI_STATUS)),
      testConnection: vi.fn(() => Promise.resolve({ ok: true, providerId: 'openai', checkedAt: '', message: '' })),
      listModels: vi.fn(() => Promise.resolve([]))
    },
    project: {
      selectVideo,
      openDroppedVideo,
      loadLast,
      save,
      createPreviewProxy,
      renderPreviewFrame: vi.fn(() => Promise.resolve({ dataUrl: 'data:image/png;base64,AA==' }))
    },
    workflow: { transcribe, translate },
    jobs: {
      cancel,
      onProgress: (listener: (event: JobProgressEvent) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    },
    export: {
      selectOutputFolder: vi.fn(() => Promise.resolve({ outputFolder: '/picked' })),
      exportProject,
      showInFolder
    },
    media: {
      getFfmpegStatus: vi.fn(() => Promise.resolve({ available: true, version: 'ffmpeg 7.1' }))
    },
    updates: {
      getState: vi.fn(() => Promise.resolve({ status: 'idle' })),
      check: vi.fn(() => Promise.resolve({ status: 'idle' })),
      download: vi.fn(() => Promise.resolve({ status: 'idle' })),
      install: vi.fn(() => Promise.resolve()),
      onState: vi.fn(() => () => undefined)
    },
    app: {
      getInfo: vi.fn(() => Promise.resolve({ version: '0.2.0', platform: 'linux', isPackaged: false })),
      setZoomFactor: vi.fn(),
      onPrepareQuit: vi.fn(() => () => undefined)
    }
  } as unknown as TajtlishaApi;

  return {
    api,
    loadLast,
    save,
    selectVideo,
    openDroppedVideo,
    transcribe,
    translate,
    exportProject,
    createPreviewProxy,
    cancel,
    showInFolder,
    emitProgress: (event) => {
      for (const listener of [...listeners]) listener(event);
    }
  };
}
