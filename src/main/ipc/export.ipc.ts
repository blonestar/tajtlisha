import { access } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { AppError } from '../../shared/errors';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { ExportOverwritePolicy } from '../../shared/types/export';
import type { ProjectExportRequest, ProjectExportResult } from '../../shared/types/jobs';
import type { ProjectExportService } from '../export';
import { type JobRegistry, runJob } from '../jobs/job-registry';
import type { MainStrings } from '../i18n';
import { requireKnownSource, type KnownSources } from '../project/known-sources';
import {
  requireArray,
  requireJobId,
  requireOneOf,
  requireRecord,
  requireString,
  requireWatermark
} from './validation';
import type { DesktopDialogs, DesktopShell, IpcRegistrar } from './types';

export type ExportIpcDeps = {
  ipc: IpcRegistrar;
  jobs: JobRegistry;
  exporter: Pick<ProjectExportService, 'exportProject'>;
  dialogs: DesktopDialogs;
  shell: DesktopShell;
  /** Strings follow the UI language in settings, resolved at call time. */
  strings: () => Promise<MainStrings>;
  sources: Pick<KnownSources, 'has'>;
  pathExists?: (path: string) => Promise<boolean>;
};

const OVERWRITE_POLICIES: readonly ExportOverwritePolicy[] = ['ask', 'overwrite', 'create_copy'];

export function registerExportIpc({
  ipc,
  jobs,
  exporter,
  dialogs,
  shell,
  strings,
  sources,
  pathExists = defaultPathExists
}: ExportIpcDeps): void {
  ipc.handle(IPC_CHANNELS.exportSelectOutputFolder, async () => {
    const s = await strings();
    const result = await dialogs.showOpenDialog({
      title: s.selectOutputFolderTitle,
      properties: ['openDirectory', 'createDirectory']
    });
    const outputFolder = result.canceled ? undefined : result.filePaths[0];
    return outputFolder ? { outputFolder } : null;
  });

  ipc.handle(IPC_CHANNELS.exportProject, (event, payload: unknown) => {
    const request = toExportRequest(payload);
    requireKnownSource(sources, request.inputPath);
    return runJob(jobs, event.sender, request.jobId, async (context) => {
      const exportWith = (overwritePolicy: ExportOverwritePolicy): Promise<ProjectExportResult> =>
        exporter.exportProject({ ...request, overwritePolicy }, context);

      try {
        return await exportWith(request.overwritePolicy);
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'OUTPUT_EXISTS' || request.overwritePolicy !== 'ask') {
          throw error;
        }
        const choice = await askOutputConflict(error.detail ?? '');
        if (choice === 'cancel') {
          throw new AppError('EXPORT_CANCELED');
        }
        return exportWith(choice);
      }
    });

    async function askOutputConflict(existingPaths: string): Promise<'overwrite' | 'create_copy' | 'cancel'> {
      const s = await strings();
      const response = await dialogs.showMessageBox({
        type: 'warning',
        title: s.exportConflictTitle,
        message: s.exportConflictMessage,
        detail: existingPaths,
        buttons: [s.exportConflictReplace, s.exportConflictCreateCopies, s.exportConflictCancel],
        defaultId: 2,
        cancelId: 2,
        noLink: true
      });
      if (response.response === 0) return 'overwrite';
      if (response.response === 1) return 'create_copy';
      return 'cancel';
    }
  });

  ipc.handle(IPC_CHANNELS.exportShowInFolder, async (_event, fullPath: unknown) => {
    const path = requireString(fullPath, 'path');
    if (!isAbsolute(path) || !(await pathExists(path))) {
      throw new AppError('UNKNOWN', 'path must be an existing absolute path.');
    }
    shell.showItemInFolder(path);
  });
}

function toExportRequest(payload: unknown): ProjectExportRequest {
  const input = requireRecord(payload, 'request');
  // Other fields are typed by the renderer contract; the export service validates timing and paths.
  return {
    ...(input as unknown as ProjectExportRequest),
    jobId: requireJobId(input.jobId),
    inputPath: requireString(input.inputPath, 'inputPath'),
    outputFolder: requireString(input.outputFolder, 'outputFolder'),
    baseName: requireString(input.baseName, 'baseName'),
    captions: requireArray(input.captions, 'captions') as ProjectExportRequest['captions'],
    overwritePolicy: requireOneOf(input.overwritePolicy, OVERWRITE_POLICIES, 'overwritePolicy'),
    ...(input.watermark === undefined ? {} : { watermark: requireWatermark(input.watermark, 'watermark') })
  };
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
