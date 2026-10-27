import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultAiProviderRegistry, SubtitleWorkflowService } from './ai';
import { SecureCredentialStore } from './credentials/secure-credential-store';
import { ProjectExportService } from './export';
import { FfmpegService } from './ffmpeg';
import { registerAiIpc } from './ipc/ai.ipc';
import { registerAppIpc } from './ipc/app.ipc';
import { registerExportIpc } from './ipc/export.ipc';
import { registerJobsIpc } from './ipc/jobs.ipc';
import { registerMediaIpc } from './ipc/media.ipc';
import { registerProjectIpc } from './ipc/project.ipc';
import { registerSettingsIpc } from './ipc/settings.ipc';
import { createBroadcast, registerUpdatesIpc } from './ipc/updates.ipc';
import type { DesktopDialogs, DesktopShell, MessageBoxRequest, OpenDialogRequest } from './ipc/types';
import { registerWorkflowIpc } from './ipc/workflow.ipc';
import { guardIpc, isRendererEntryUrl, rendererEntryFor, type SenderPolicy } from './ipc/trusted-sender';
import { mainStringsFor, resolveMainLanguage } from './i18n';
import { JobRegistry } from './jobs/job-registry';
import { MediaService } from './media';
import { createLocalMediaProtocol } from './media/local-media-protocol';
import { KnownSources } from './project/known-sources';
import { PreviewProxyCache } from './project/preview-proxy-cache';
import { ProjectStore } from './project/project-store';
import { QuitCoordinator, withTimeout, type UnsavedQuitAnswer } from './quit-coordinator';
import { bundledFontsDir } from './resources-path';
import { SettingsStore } from './settings';
import { createDefaultUpdateService, scheduleAutoChecks } from './updater';

// A separate profile folder (used by the E2E tests so they never touch the
// user's real projects, settings or API keys). Must run before anything reads
// the userData path.
if (process.env.TAJTLISHA_USER_DATA_DIR) {
  app.setPath('userData', process.env.TAJTLISHA_USER_DATA_DIR);
}

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const localMediaProtocol = createLocalMediaProtocol();

/** How long a window may hold its close while running jobs stop. */
const CLOSE_JOB_TIMEOUT_MS = 3000;


/** Only the app's own renderer may load or navigate in a window or call IPC. */
const rendererEntry = rendererEntryFor({
  devRendererUrl: isDev ? process.env.ELECTRON_RENDERER_URL : undefined,
  entryFile: join(__dirname, '../renderer/index.html')
});

const senderPolicy: SenderPolicy = {
  isOwnWebContents: (id) => BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.webContents.id === id),
  isRendererEntry: (url) => isRendererEntryUrl(rendererEntry, url)
};

function createWindow(jobs: JobRegistry): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    title: 'Tajtlisha',
    backgroundColor: '#121517',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Jobs belong to the window that started them. Closing the window stops them
  // and waits for them to stop before the window goes away.
  const windowId = mainWindow.webContents.id;
  let closeReady = false;
  mainWindow.on('close', (event) => {
    if (closeReady || quitCoordinator?.shuttingDown || !jobs.hasJobs(windowId)) return;
    event.preventDefault();
    void withTimeout(jobs.cancelAllAndWait(windowId), CLOSE_JOB_TIMEOUT_MS).finally(() => {
      closeReady = true;
      if (!mainWindow.isDestroyed()) mainWindow.close();
    });
  });
  mainWindow.webContents.on('destroyed', () => jobs.cancelAllFor(windowId));

  // No new windows and no navigation away from the renderer entry.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isRendererEntryUrl(rendererEntry, url)) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/** Created once the app is ready; before that a quit is not held back. */
let quitCoordinator: QuitCoordinator | undefined;

const UNSAVED_QUIT_ANSWERS: readonly UnsavedQuitAnswer[] = ['retry', 'quit', 'cancel'];

/** Native question shown when a window could not save. Buttons: retry, quit anyway, cancel the quit. */
async function confirmUnsavedQuit(settingsStore: SettingsStore, detail: string | undefined): Promise<UnsavedQuitAnswer> {
  const copy = mainStringsFor(resolveMainLanguage((await settingsStore.get()).uiLanguage, app.getLocale()));
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: copy.quitUnsavedTitle,
    message: copy.quitUnsavedMessage,
    detail: detail ? `${copy.quitUnsavedDetail}\n\n${detail}` : copy.quitUnsavedDetail,
    buttons: [copy.quitUnsavedRetry, copy.quitUnsavedQuit, copy.quitUnsavedCancel],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  return UNSAVED_QUIT_ANSWERS[response] ?? 'cancel';
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await localMediaProtocol.register();

  const settingsStore = new SettingsStore({ filePath: join(app.getPath('userData'), 'settings.json') });
  const credentialStore = new SecureCredentialStore({
    filePath: join(app.getPath('userData'), 'credentials.json'),
    crypto: safeStorage
  });
  const aiRegistry = createDefaultAiProviderRegistry(credentialStore);
  const ffmpeg = new FfmpegService();
  const mediaService = new MediaService(ffmpeg);
  const exporter = new ProjectExportService({ fontsDir: bundledFontsDir() });
  const workflow = new SubtitleWorkflowService(aiRegistry, mediaService, ffmpeg);
  const jobs = new JobRegistry();
  const projectStore = new ProjectStore({
    dir: join(app.getPath('userData'), 'projects'),
    createVideoUrl: localMediaProtocol.createVideoUrl,
    probeVideo: async (inputPath) => (await mediaService.probe({ inputPath })).hasVideo === true
  });
  const previewProxies = new PreviewProxyCache(tmpdir());
  const sources = new KnownSources();
  const quit = new QuitCoordinator({
    windows: () =>
      BrowserWindow.getAllWindows()
        .filter((window) => !window.isDestroyed() && !window.webContents.isDestroyed())
        .map((window) => ({
          id: window.webContents.id,
          send: (channel, payload) => window.webContents.send(channel, payload)
        })),
    drainJobs: () => jobs.cancelAllAndWait(),
    flushProjects: () => projectStore.flush(),
    cleanupPreviews: () => previewProxies.cleanup(),
    confirmUnsavedQuit: (detail) => confirmUnsavedQuit(settingsStore, detail),
    quit: () => app.quit()
  });
  quitCoordinator = quit;
  // Every channel registered below goes through the sender check.
  const ipc = guardIpc(ipcMain, senderPolicy);

  // Strings for native dialogs follow the UI language from settings.
  const strings = async () => mainStringsFor(resolveMainLanguage((await settingsStore.get()).uiLanguage, app.getLocale()));
  const dialogs: DesktopDialogs = {
    showOpenDialog: (request: OpenDialogRequest) => dialog.showOpenDialog(request),
    showMessageBox: (request: MessageBoxRequest) => dialog.showMessageBox(request)
  };
  const desktopShell: DesktopShell = {
    showItemInFolder: (fullPath: string) => shell.showItemInFolder(fullPath)
  };

  registerSettingsIpc({ ipc, settingsStore });
  registerAiIpc({ ipc, registry: aiRegistry });
  registerProjectIpc({
    ipc,
    jobs,
    dialogs,
    mediaService,
    projectStore,
    previewProxies,
    exporter,
    createVideoUrl: localMediaProtocol.createVideoUrl,
    strings,
    sources
  });
  registerWorkflowIpc({ ipc, jobs, workflow, sources });
  registerJobsIpc({ ipc, jobs });
  registerExportIpc({ ipc, jobs, exporter, dialogs, shell: desktopShell, strings, sources });
  registerMediaIpc({ ipc, ffmpeg });
  registerAppIpc({ ipc, quit, openExternal: (url) => shell.openExternal(url) });

  // Auto-update (packaged AppImage / NSIS only; 'unsupported' elsewhere). Never
  // downloads or installs without a user action.
  const updateService = createDefaultUpdateService(createBroadcast());
  registerUpdatesIpc(updateService, ipc);

  createWindow(jobs);
  // Checks at startup and hourly while the setting is on. Never downloads by itself.
  scheduleAutoChecks({
    service: updateService,
    isEnabled: async () => (await settingsStore.get()).autoCheckUpdates
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(jobs);
    }
  });
});

// Quit runs the shutdown sequence (renderer flush, jobs, project saves, temp
// files) before the process exits. The coordinator lets the second quit through.
app.on('before-quit', (event) => {
  quitCoordinator?.handleBeforeQuit(event);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
