import type { EventEmitter } from 'node:events';
import type { UpdateState, UpdateStatus } from '../../shared/types/updates';

/**
 * Subset of electron-updater's `AppUpdater` used by the service. Kept loose so
 * tests can pass an EventEmitter fake; the real `autoUpdater` satisfies it.
 */
export type UpdaterLike = Pick<EventEmitter, 'on'> & {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
};

/** electron-updater's `ReleaseNoteInfo` entry (array form of release notes). */
export type ReleaseNoteEntry = { version: string; note?: string | null };

export type UpdateInfoLike = {
  version: string;
  releaseNotes?: string | ReleaseNoteEntry[] | null;
};

export type UpdateLogger = Pick<Console, 'info' | 'warn'>;

export type UpdateServiceOptions = {
  autoUpdater: UpdaterLike;
  appVersion: string;
  /** False in development, unpackaged builds and .deb installs; then nothing touches the updater. */
  isSupported: boolean;
  broadcast: (state: UpdateState) => void;
  logger?: UpdateLogger;
};

export type UpdateService = {
  getState(): UpdateState;
  check(): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): void;
};

export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  const { autoUpdater, appVersion, isSupported, broadcast, logger = console } = options;
  let state: UpdateState = {
    status: isSupported ? 'idle' : 'unsupported',
    currentVersion: appVersion
  };

  // Read through a function so TypeScript does not narrow `state` across awaits.
  function current(): UpdateState {
    return state;
  }

  function setState(status: UpdateStatus, fields: Partial<UpdateState> = {}): void {
    const next: UpdateState = { currentVersion: appVersion, status, ...fields };
    if (sameState(state, next)) {
      return;
    }
    state = next;
    broadcast(state);
  }

  function fail(error: unknown): void {
    const message = errorMessage(error);
    logger.warn(`Update error: ${message}`);
    // A failed download keeps the offered version so the user can retry it directly.
    const keepVersion = state.status === 'downloading' || state.status === 'error';
    setState('error', {
      message,
      ...(keepVersion && state.availableVersion ? { availableVersion: state.availableVersion } : {})
    });
  }

  if (isSupported) {
    autoUpdater.autoDownload = false;
    // Installing always needs an explicit user action (Settings > Install and restart).
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => setState('checking'));

    autoUpdater.on('update-available', (info: UpdateInfoLike) =>
      setState('available', {
        availableVersion: info.version,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes)
      })
    );

    autoUpdater.on('update-not-available', () => setState('not_available'));

    autoUpdater.on('download-progress', (progress: { percent: number }) =>
      setState('downloading', {
        availableVersion: state.availableVersion,
        releaseNotes: state.releaseNotes,
        downloadProgress: clamp01(progress.percent / 100)
      })
    );

    autoUpdater.on('update-downloaded', (info: UpdateInfoLike) =>
      setState('downloaded', {
        availableVersion: info.version,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        downloadProgress: 1
      })
    );

    autoUpdater.on('error', (error: unknown) => fail(error));
  }

  return {
    getState: current,

    async check() {
      if (!isSupported || state.status === 'checking' || state.status === 'downloading' || state.status === 'downloaded') {
        return state;
      }
      setState('checking');
      try {
        await autoUpdater.checkForUpdates();
        // electron-updater emits no event when it skips the check (e.g. no update config).
        if (current().status === 'checking') {
          setState('idle');
        }
      } catch (error) {
        fail(error);
      }
      return state;
    },

    async download() {
      if (!isSupported || !canDownload(state)) {
        return state;
      }
      setState('downloading', {
        availableVersion: state.availableVersion,
        releaseNotes: state.releaseNotes,
        downloadProgress: 0
      });
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        fail(error);
      }
      return state;
    },

    install() {
      if (!isSupported || state.status !== 'downloaded') {
        return;
      }
      logger.info(`Installing update ${state.availableVersion ?? ''}`.trim());
      autoUpdater.quitAndInstall();
    }
  };
}

/**
 * AppImage updates itself (APPIMAGE points at the running image). The .deb has no
 * updater, so it stays 'unsupported' like unpackaged development runs.
 */
export function isUpdateSupported(input: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}): boolean {
  if (!input.isPackaged) {
    return false;
  }
  return input.platform === 'win32' || (input.platform === 'linux' && Boolean(input.env.APPIMAGE));
}

/** Converts electron-updater's release notes (string, per-version array or null) into plain text. */
export function normalizeReleaseNotes(notes: string | ReleaseNoteEntry[] | null | undefined): string | undefined {
  if (typeof notes === 'string') {
    return htmlToText(notes) || undefined;
  }
  if (!Array.isArray(notes)) {
    return undefined;
  }
  const sections = notes
    .map((entry) => {
      const body = htmlToText(entry.note ?? '');
      return body ? `${entry.version}\n${body}` : '';
    })
    .filter(Boolean);
  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

/** Marks a heading start so only headings get a blank line above them. */
const HEADING_GAP = '\u0001';

/**
 * GitHub delivers release notes as rendered HTML. The About section shows plain
 * text, so keep the structure (headings, list items, paragraphs) and drop tags.
 * Source whitespace is not layout: GitHub turns every wrapped CHANGELOG line into
 * `<br>`, so `<br>` and newlines become spaces and breaks come only from block tags.
 * The "Downloads" table (scripts/release-notes.mjs) is for the GitHub page and is cut.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>\s*Downloads\s*<\/h[1-6]>[\s\S]*$/i, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/<h[1-6][^>]*>/gi, `\n${HEADING_GAP}`)
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/?(p|div|tr|table|pre|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, code: string) => codePoint(Number(code), match))
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) => codePoint(parseInt(code, 16), match))
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .replace(new RegExp(`\\n?${HEADING_GAP}`, 'g'), '\n\n')
    .trim();
}

function codePoint(code: number, fallback: string): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

export const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Only these states may be replaced by a new check; anything else (e.g. 'downloaded') must stay put. */
const AUTO_CHECK_STATUSES: ReadonlySet<UpdateStatus> = new Set<UpdateStatus>(['idle', 'not_available', 'error']);

export type AutoCheckOptions = {
  service: Pick<UpdateService, 'check' | 'getState'>;
  /** Read on every tick so toggling the setting needs no restart. */
  isEnabled: () => Promise<boolean>;
  startupDelayMs?: number;
  intervalMs?: number;
  logger?: UpdateLogger;
};

/**
 * Checks for a new version shortly after startup (so the window is visible before
 * the network call), then every hour. Returns a function that stops the timers.
 */
export function scheduleAutoChecks(options: AutoCheckOptions): () => void {
  const { service, isEnabled, startupDelayMs = 8000, intervalMs = AUTO_CHECK_INTERVAL_MS, logger = console } = options;
  let stopped = false;

  async function tick(): Promise<void> {
    let enabled: boolean;
    try {
      enabled = await isEnabled();
    } catch (error) {
      logger.warn(`Automatic update check skipped: ${errorMessage(error)}`);
      return;
    }
    if (stopped || !enabled) {
      return;
    }
    // A re-check would reset 'available' or 'downloaded' back to 'checking' and lose them.
    if (!AUTO_CHECK_STATUSES.has(service.getState().status)) {
      return;
    }
    void service.check();
  }

  let interval: ReturnType<typeof setInterval> | undefined;
  const startup = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), intervalMs);
  }, startupDelayMs);

  return () => {
    stopped = true;
    clearTimeout(startup);
    if (interval !== undefined) {
      clearInterval(interval);
    }
  };
}

/** An offered update, or one whose download failed (electron-updater keeps the last check's info). */
function canDownload(state: UpdateState): boolean {
  return state.status === 'available' || (state.status === 'error' && Boolean(state.availableVersion));
}

function sameState(a: UpdateState, b: UpdateState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof UpdateState>;
  return [...keys].every((key) => a[key] === b[key]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
