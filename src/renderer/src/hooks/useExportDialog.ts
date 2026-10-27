import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TajtlishaApi } from '../../../shared/types/ipc';
import type { ExportOutputs, ProjectExportResult } from '../../../shared/types/jobs';
import type { AppSettings } from '../../../shared/types/settings';
import { blockingIssueCount } from '../state/selectors';
import type { ProjectStore } from '../state/useProjectStore';
import { captureJobContext, isContextCurrent, type JobRunner } from '../state/useJobRunner';
import { appErrorKey, describeAppError } from '../utils/error-message';
import { truncateDetail } from './jobOutcome';
import {
  captionIssuesFor,
  captionsForExport,
  defaultExportOutputs,
  fileNameOf,
  folderOf,
  outputsNeedTranslation,
  sanitizeBaseName,
  sourceLanguageCode
} from './workspaceModel';

export type ExportDialogModel = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the dialog. Form values are prepared from settings for a new video and kept for the same one. */
  openDialog: () => void;
  outputFolder: string | null;
  chooseFolder: () => void;
  baseName: string;
  setBaseName: (value: string) => void;
  outputs: ExportOutputs;
  setOutputs: (outputs: ExportOutputs) => void;
  /** Per-export logo choice. Starts from settings.watermark.enabled each time the dialog opens. */
  includeLogo: boolean;
  setIncludeLogo: (value: boolean) => void;
  sourceLanguage: string;
  targetLanguage: string;
  blockingIssueCount: number;
  missingTranslationCount: number;
  busy: boolean;
  progress?: number;
  result: ProjectExportResult | null;
  errorMessage: string | null;
  start: () => void;
  showInFolder: (path: string) => void;
};

function getApi(): TajtlishaApi | undefined {
  return typeof window === 'undefined' ? undefined : (window.tajtlisha as TajtlishaApi | undefined);
}

/** Export form state and the export job. Results apply to files only, so edits made during the job do not matter. */
export function useExportDialog({
  store,
  settings,
  job
}: {
  store: ProjectStore;
  settings: AppSettings;
  job: JobRunner;
}): ExportDialogModel {
  const { t } = useTranslation();
  const api = getApi();
  const project = store.state.project;

  const projectRef = useRef(project);
  const settingsRef = useRef(settings);
  useLayoutEffect(() => {
    projectRef.current = project;
    settingsRef.current = settings;
  });

  const [open, setOpen] = useState(false);
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const [baseName, setBaseName] = useState('');
  const [outputs, setOutputs] = useState<ExportOutputs>({ originalSrt: true, translationSrt: true, video: 'none' });
  const [includeLogo, setIncludeLogo] = useState(settings.watermark.enabled);
  const [preparedFor, setPreparedFor] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openDialog = useCallback(() => {
    const source = projectRef.current.source;
    if (!source) return;
    if (preparedFor !== source.inputPath) {
      setOutputFolder(settingsRef.current.defaultOutputFolder ?? folderOf(source.inputPath));
      setBaseName(sanitizeBaseName(fileNameOf(source.inputPath)));
      setOutputs(defaultExportOutputs(settingsRef.current));
      setPreparedFor(source.inputPath);
    }
    setIncludeLogo(settingsRef.current.watermark.enabled);
    setResult(null);
    setErrorMessage(null);
    setOpen(true);
  }, [preparedFor]);

  const chooseFolder = useCallback(() => {
    void api?.export.selectOutputFolder().then((selected) => {
      if (selected) setOutputFolder(selected.outputFolder);
    });
  }, [api]);

  const start = useCallback(async () => {
    const current = projectRef.current;
    const source = current.source;
    if (!api || !source || !outputFolder) return;

    const context = captureJobContext(current);
    setResult(null);
    setErrorMessage(null);
    const outcome = await job.run(
      'export',
      (jobId) =>
        api.export.exportProject({
          jobId,
          inputPath: source.inputPath,
          outputFolder,
          baseName: baseName.trim(),
          videoWidth: source.width,
          videoHeight: source.height,
          trim: current.trim,
          captions: current.captions,
          sourceLanguage: sourceLanguageCode(current),
          targetLanguage: current.targetLanguage,
          style: current.style,
          watermark: { ...settingsRef.current.watermark, enabled: includeLogo },
          outputs,
          overwritePolicy: settingsRef.current.exportDefaults.overwritePolicy
        }),
      { isStillValid: () => isContextCurrent(context, projectRef.current, { allowEditsSince: true }) }
    );

    if (outcome.status === 'done') {
      setResult(outcome.value);
    } else if (outcome.status === 'canceled') {
      setErrorMessage(t(appErrorKey('EXPORT_CANCELED')));
    } else if (outcome.status === 'stale') {
      setErrorMessage(t('shell.result.stale'));
    } else if (outcome.status === 'error') {
      const detail = truncateDetail(outcome.detail);
      setErrorMessage(detail ? `${t(appErrorKey(outcome.code))} (${detail})` : t(appErrorKey(outcome.code)));
    }
  }, [api, baseName, includeLogo, job, outputFolder, outputs, t]);

  const showInFolder = useCallback(
    (path: string) => {
      void api?.export.showInFolder(path).catch((error: unknown) => {
        setErrorMessage(t(appErrorKey(describeAppError(error).code)));
      });
    },
    [api, t]
  );

  // Captions outside the trim are not exported, so they must not block or count as missing.
  const requireTranslation = outputsNeedTranslation(outputs);
  const exported = { ...project, captions: captionsForExport(project) };
  const blocking = blockingIssueCount(captionIssuesFor(exported, settings, false));
  const missingTranslations = requireTranslation
    ? exported.captions.filter((caption) => caption.translation.trim() === '').length
    : 0;

  return {
    open,
    onOpenChange: setOpen,
    openDialog,
    outputFolder,
    chooseFolder,
    baseName,
    setBaseName,
    outputs,
    setOutputs,
    includeLogo,
    setIncludeLogo,
    sourceLanguage: sourceLanguageCode(project),
    targetLanguage: project.targetLanguage,
    blockingIssueCount: blocking,
    missingTranslationCount: missingTranslations,
    busy: job.job?.kind === 'export',
    progress: job.job?.kind === 'export' ? job.job.progress : undefined,
    result,
    errorMessage,
    start: () => void start(),
    showInFolder
  };
}
