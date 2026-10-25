import { contextBridge, ipcRenderer, webFrame, webUtils, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS as C, type QuitReadyResult, type TajtlishaApi } from '../shared/types/ipc';
import type { JobProgressEvent } from '../shared/types/jobs';
import type { UpdateState } from '../shared/types/updates';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

/** Page zoom is per window, so webFrame applies it here; main has no role in it. */
function applyZoomFactor(factor: number): void {
  if (!Number.isFinite(factor)) return;
  webFrame.setZoomFactor(Math.min(2, Math.max(0.5, factor)));
}

const api: TajtlishaApi = {
  settings: {
    get: () => ipcRenderer.invoke(C.settingsGet),
    update: (patch) => ipcRenderer.invoke(C.settingsUpdate, patch),
    reset: () => ipcRenderer.invoke(C.settingsReset)
  },
  ai: {
    listProviders: () => ipcRenderer.invoke(C.aiListProviders),
    getProviderStatus: (providerId) => ipcRenderer.invoke(C.aiGetProviderStatus, providerId),
    connectProvider: (input) => ipcRenderer.invoke(C.aiConnectProvider, input),
    disconnectProvider: (providerId) => ipcRenderer.invoke(C.aiDisconnectProvider, providerId),
    testConnection: (providerId) => ipcRenderer.invoke(C.aiTestConnection, providerId),
    listModels: (providerId, capability) => ipcRenderer.invoke(C.aiListModels, providerId, capability)
  },
  project: {
    selectVideo: () => ipcRenderer.invoke(C.projectSelectVideo),
    openDroppedVideo: (file) => {
      // Empty for a File created in script (not from the OS), so main never gets a made-up path.
      const path = webUtils.getPathForFile(file);
      if (!path) return Promise.reject(new Error('The dropped file has no path on disk.'));
      return ipcRenderer.invoke(C.projectOpenDroppedVideo, path);
    },
    loadLast: () => ipcRenderer.invoke(C.projectLoadLast),
    save: (project) => ipcRenderer.invoke(C.projectSave, project),
    createPreviewProxy: (request) => ipcRenderer.invoke(C.projectCreatePreviewProxy, request),
    renderPreviewFrame: (request) => ipcRenderer.invoke(C.projectRenderPreviewFrame, request)
  },
  workflow: {
    transcribe: (request) => ipcRenderer.invoke(C.workflowTranscribe, request),
    translate: (request) => ipcRenderer.invoke(C.workflowTranslate, request),
    summarize: (request) => ipcRenderer.invoke(C.workflowSummarize, request)
  },
  jobs: {
    cancel: (jobId) => ipcRenderer.invoke(C.jobsCancel, jobId),
    onProgress: (listener) => subscribe<JobProgressEvent>(C.jobsProgress, listener)
  },
  export: {
    selectOutputFolder: () => ipcRenderer.invoke(C.exportSelectOutputFolder),
    exportProject: (request) => ipcRenderer.invoke(C.exportProject, request),
    showInFolder: (path) => ipcRenderer.invoke(C.exportShowInFolder, path)
  },
  media: {
    getFfmpegStatus: () => ipcRenderer.invoke(C.mediaGetFfmpegStatus)
  },
  updates: {
    getState: () => ipcRenderer.invoke(C.updatesGetState),
    check: () => ipcRenderer.invoke(C.updatesCheck),
    download: () => ipcRenderer.invoke(C.updatesDownload),
    install: () => ipcRenderer.invoke(C.updatesInstall),
    onState: (listener) => subscribe<UpdateState>(C.updatesState, listener)
  },
  app: {
    getInfo: () => ipcRenderer.invoke(C.appGetInfo),
    setZoomFactor: (factor) => applyZoomFactor(factor),
    onPrepareQuit: (listener) => {
      quitListeners.add(listener);
      return () => {
        quitListeners.delete(listener);
      };
    }
  }
};

// Quit handshake: run every listener, then tell main whether everything was
// saved. A rejected listener means unsaved data; main asks the user what to do.
const quitListeners = new Set<() => Promise<void> | void>();
ipcRenderer.on(C.appPrepareQuit, (_event, requestId: string) => {
  void Promise.allSettled([...quitListeners].map((listener) => Promise.resolve().then(listener))).then((results) => {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    const result: QuitReadyResult = failure
      ? { saved: false, detail: failure.reason instanceof Error ? failure.reason.message : String(failure.reason) }
      : { saved: true };
    return ipcRenderer.invoke(C.appQuitReady, requestId, result);
  });
});

contextBridge.exposeInMainWorld('tajtlisha', api);
