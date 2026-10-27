import { EventEmitter } from 'node:events';
import type { UpdaterLike } from './update-service';

/**
 * Development-only stand-in for electron-updater, enabled with TAJTLISHA_UPDATE_DEMO=1
 * in unpackaged runs. It offers a fake newer version, simulates a short download and
 * only logs on install, so the update UI can be seen without a real release.
 */
export class DemoUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;

  constructor(private readonly demoVersion: string) {
    super();
  }

  async checkForUpdates(): Promise<unknown> {
    this.emit('checking-for-update');
    await delay(800);
    this.emit('update-available', {
      version: this.demoVersion,
      releaseNotes: '<h3>Added</h3><ul><li>Demo update (TAJTLISHA_UPDATE_DEMO).</li></ul>'
    });
    return null;
  }

  async downloadUpdate(): Promise<unknown> {
    for (let percent = 0; percent <= 100; percent += 10) {
      this.emit('download-progress', { percent });
      await delay(400);
    }
    this.emit('update-downloaded', { version: this.demoVersion, releaseNotes: null });
    return [];
  }

  quitAndInstall(): void {
    console.info(`[update demo] Would restart and install ${this.demoVersion}.`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
