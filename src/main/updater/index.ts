import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../../shared/types/updates';
import { DemoUpdater } from './demo-updater';
import { createUpdateService, isUpdateSupported, type UpdateService } from './update-service';

export * from './update-service';

/**
 * Production wiring: the real electron-updater singleton. Imported only from the
 * main process entry, so unit tests of the service never load electron.
 */
export function createDefaultUpdateService(broadcast: (state: UpdateState) => void): UpdateService {
  // Dev-only preview of the update UI: TAJTLISHA_UPDATE_DEMO=1 pnpm dev
  if (!app.isPackaged && process.env.TAJTLISHA_UPDATE_DEMO) {
    return createUpdateService({
      autoUpdater: new DemoUpdater('99.0.0'),
      appVersion: app.getVersion(),
      isSupported: true,
      broadcast
    });
  }
  return createUpdateService({
    autoUpdater,
    appVersion: app.getVersion(),
    isSupported: isUpdateSupported({ isPackaged: app.isPackaged, platform: process.platform, env: process.env }),
    broadcast
  });
}
