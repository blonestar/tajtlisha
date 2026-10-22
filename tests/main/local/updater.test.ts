/* @vitest-environment node */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateState } from '../../../src/shared/types/updates';
import {
  createUpdateService,
  isUpdateSupported,
  htmlToText,
  normalizeReleaseNotes,
  scheduleStartupCheck,
  type UpdaterLike
} from '../../../src/main/updater/update-service';

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn(async (): Promise<unknown> => null);
  downloadUpdate = vi.fn(async (): Promise<unknown> => []);
  quitAndInstall = vi.fn();
}

function setup(options: { isSupported?: boolean } = {}) {
  const autoUpdater = new FakeUpdater();
  const states: UpdateState[] = [];
  const service = createUpdateService({
    autoUpdater,
    appVersion: '0.1.0',
    isSupported: options.isSupported ?? true,
    broadcast: (state) => states.push(state),
    logger: { info: vi.fn(), warn: vi.fn() }
  });
  return { autoUpdater, service, states };
}

describe('update service', () => {
  describe('unsupported mode', () => {
    it('reports unsupported and never touches the updater', async () => {
      const { autoUpdater, service, states } = setup({ isSupported: false });

      expect(service.getState()).toEqual({ status: 'unsupported', currentVersion: '0.1.0' });
      expect(await service.check()).toEqual({ status: 'unsupported', currentVersion: '0.1.0' });
      expect(await service.download()).toEqual({ status: 'unsupported', currentVersion: '0.1.0' });
      service.install();

      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
      expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
      expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
      expect(autoUpdater.listenerCount('update-available')).toBe(0);
      expect(autoUpdater.autoDownload).toBe(true);
      expect(states).toEqual([]);
    });
  });

  describe('supported mode', () => {
    it('configures electron-updater for manual download and install on quit', () => {
      const { autoUpdater, service } = setup();

      expect(autoUpdater.autoDownload).toBe(false);
      expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
      expect(service.getState()).toEqual({ status: 'idle', currentVersion: '0.1.0' });
    });

    it('maps check to available with release notes and broadcasts each change', async () => {
      const { autoUpdater, service, states } = setup();
      autoUpdater.checkForUpdates.mockImplementation(async () => {
        autoUpdater.emit('checking-for-update');
        autoUpdater.emit('update-available', { version: '0.2.0', releaseNotes: 'Faster export.' });
        return null;
      });

      const result = await service.check();

      expect(result).toEqual({
        status: 'available',
        currentVersion: '0.1.0',
        availableVersion: '0.2.0',
        releaseNotes: 'Faster export.'
      });
      expect(states.map((state) => state.status)).toEqual(['checking', 'available']);
      expect(service.getState()).toEqual(result);
    });

    it('reports not_available when the server has no newer version', async () => {
      const { autoUpdater, service } = setup();
      autoUpdater.checkForUpdates.mockImplementation(async () => {
        autoUpdater.emit('update-not-available');
        return null;
      });

      expect(await service.check()).toEqual({ status: 'not_available', currentVersion: '0.1.0' });
    });

    it('returns to idle when the updater skips the check without events', async () => {
      const { service } = setup();

      expect((await service.check()).status).toBe('idle');
    });

    it('turns a rejected check into an error state instead of throwing', async () => {
      const { autoUpdater, service, states } = setup();
      autoUpdater.checkForUpdates.mockRejectedValue(new Error('getaddrinfo ENOTFOUND github.com'));

      const result = await service.check();

      expect(result).toEqual({
        status: 'error',
        currentVersion: '0.1.0',
        message: 'getaddrinfo ENOTFOUND github.com'
      });
      expect(states.at(-1)).toEqual(result);
    });

    it('turns updater error events into an error state', () => {
      const { autoUpdater, service } = setup();

      autoUpdater.emit('error', new Error('Cannot parse latest-linux.yml'));

      expect(service.getState()).toEqual({
        status: 'error',
        currentVersion: '0.1.0',
        message: 'Cannot parse latest-linux.yml'
      });
    });

    it('does not start a second check while one is running', async () => {
      const { autoUpdater, service } = setup();
      autoUpdater.checkForUpdates.mockImplementation(async () => {
        autoUpdater.emit('checking-for-update');
        return null;
      });

      await Promise.all([service.check(), service.check()]);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('downloads an available update with progress and then reports downloaded', async () => {
      const { autoUpdater, service, states } = setup();
      autoUpdater.checkForUpdates.mockImplementation(async () => {
        autoUpdater.emit('update-available', { version: '0.2.0', releaseNotes: null });
        return null;
      });
      autoUpdater.downloadUpdate.mockImplementation(async () => {
        autoUpdater.emit('download-progress', { percent: 40 });
        autoUpdater.emit('download-progress', { percent: 250 });
        autoUpdater.emit('update-downloaded', { version: '0.2.0', releaseNotes: undefined });
        return [];
      });

      await service.check();
      const result = await service.download();

      expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: 'downloaded',
        currentVersion: '0.1.0',
        availableVersion: '0.2.0',
        downloadProgress: 1
      });
      expect(states.map((state) => [state.status, state.downloadProgress])).toEqual([
        ['checking', undefined],
        ['available', undefined],
        ['downloading', 0],
        ['downloading', 0.4],
        ['downloading', 1],
        ['downloaded', 1]
      ]);
    });

    it('turns a failed download into an error state', async () => {
      const { autoUpdater, service } = setup();
      autoUpdater.checkForUpdates.mockImplementation(async () => {
        autoUpdater.emit('update-available', { version: '0.2.0', releaseNotes: null });
        return null;
      });
      autoUpdater.downloadUpdate.mockRejectedValue(new Error('socket hang up'));

      await service.check();
      const result = await service.download();

      expect(result).toEqual({ status: 'error', currentVersion: '0.1.0', message: 'socket hang up' });
    });

    it('ignores download when no update is available', async () => {
      const { autoUpdater, service } = setup();

      expect((await service.download()).status).toBe('idle');
      expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    });

    it('installs only a downloaded update', async () => {
      const { autoUpdater, service } = setup();

      service.install();
      expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();

      autoUpdater.emit('update-downloaded', { version: '0.2.0' });
      service.install();
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    });
  });
});

describe('normalizeReleaseNotes', () => {
  it('keeps plain string notes and trims them', () => {
    expect(normalizeReleaseNotes('  Fixed export.  ')).toBe('Fixed export.');
  });

  it('joins per-version array entries into one plain string', () => {
    expect(
      normalizeReleaseNotes([
        { version: '0.2.0', note: 'New editor.' },
        { version: '0.1.1', note: ' ' },
        { version: '0.1.0', note: null }
      ])
    ).toBe('0.2.0\nNew editor.');
  });

  it('returns undefined for empty or missing notes', () => {
    expect(normalizeReleaseNotes(undefined)).toBeUndefined();
    expect(normalizeReleaseNotes(null)).toBeUndefined();
    expect(normalizeReleaseNotes('   ')).toBeUndefined();
    expect(normalizeReleaseNotes([])).toBeUndefined();
  });
});

describe('isUpdateSupported', () => {
  it.each([
    ['packaged AppImage', { isPackaged: true, platform: 'linux', env: { APPIMAGE: '/opt/Tajtlisha.AppImage' } }, true],
    ['packaged Linux without AppImage (.deb)', { isPackaged: true, platform: 'linux', env: {} }, false],
    ['packaged Windows', { isPackaged: true, platform: 'win32', env: {} }, true],
    ['unpackaged development on Linux', { isPackaged: false, platform: 'linux', env: { APPIMAGE: '/x.AppImage' } }, false],
    ['unpackaged Windows', { isPackaged: false, platform: 'win32', env: {} }, false]
  ] as const)('%s -> %s', (_name, input, expected) => {
    expect(isUpdateSupported({ ...input, env: { ...input.env } })).toBe(expected);
  });
});

describe('scheduleStartupCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs one check after the default delay', () => {
    const service = { check: vi.fn(async () => ({}) as UpdateState) };

    scheduleStartupCheck(service);
    vi.advanceTimersByTime(7999);
    expect(service.check).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(service.check).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled through the returned timer', () => {
    const service = { check: vi.fn(async () => ({}) as UpdateState) };

    const timer = scheduleStartupCheck(service, 1000);
    clearTimeout(timer);
    vi.advanceTimersByTime(5000);

    expect(service.check).not.toHaveBeenCalled();
  });

  it('turns GitHub HTML release notes into plain text', () => {
    expect(
      normalizeReleaseNotes('<h3>Fixed</h3>\n<ul>\n<li>The ffmpeg check &amp; Settings</li>\n<li>Publish step</li>\n</ul>')
    ).toBe('Fixed\n- The ffmpeg check & Settings\n- Publish step');
  });

  it('joins wrapped lines, keeps sections apart and drops the GitHub download guide', () => {
    const html = [
      '<h3>Added</h3>',
      '<ul>',
      '<li>Zoom in Settings &gt; General.</li>',
      '<li>Drag the line between the video and<br>',
      'the style panel.</li>',
      '</ul>',
      '<h3>Fixed</h3>',
      '<ul>',
      '<li>Notes as text.</li>',
      '</ul>',
      '<h2>Downloads</h2>',
      '<table><tr><td>Tajtlisha.AppImage</td><td>Linux</td></tr></table>',
      '<p>ffmpeg is included.</p>'
    ].join('\n');

    expect(normalizeReleaseNotes(html)).toBe(
      'Added\n- Zoom in Settings > General.\n- Drag the line between the video and the style panel.\n\nFixed\n- Notes as text.'
    );
  });

  it('decodes entities once and leaves invalid numeric entities alone', () => {
    expect(htmlToText('<p>&amp;lt;tag&amp;gt; &#39;x&#x27; &#99999999;</p>')).toBe("&lt;tag&gt; 'x' &#99999999;");
  });
});
