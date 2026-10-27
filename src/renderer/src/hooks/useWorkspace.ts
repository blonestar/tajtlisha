import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SUMMARY_PROMPT } from '../../../shared/summary';
import type { TajtlishaApi } from '../../../shared/types/ipc';
import type { ProjectDocument, ProjectSource } from '../../../shared/types/project';
import type { ProviderStatus } from '../../../shared/types/ai';
import type { AppSettings } from '../../../shared/types/settings';
import type { GenerateProviderInfo } from '../components/workflow/GeneratePanel';
import type { SummaryResult } from '../components/workflow/SummaryDialog';
import { isSupportedVideoPath, SUPPORTED_FORMATS } from '../../../shared/video-formats';
import { rowsNeedingTranslation } from '../state/selectors';
import type { ProjectStore } from '../state/useProjectStore';
import { captureJobContext, isContextCurrent, type JobRunner } from '../state/useJobRunner';
import { describeAppError, appErrorKey } from '../utils/error-message';
import { jobOutcomeView, type JobView } from './jobOutcome';
import {
  captionLineLimit,
  optionalModelId,
  polishFor,
  sourceLanguageCode,
  spokenLanguageOf,
  summaryTranscript,
  videoContextFor
} from './workspaceModel';

/** Adds the video context to a transcribe or translate request. Blank context is left out. */
function withVideoContext(project: ProjectDocument): { videoContext?: string } {
  const videoContext = videoContextFor(project);
  return videoContext === undefined ? {} : { videoContext };
}

export type Notice = { tone: 'error' | 'info'; text: string; detail?: string };

/** A question the user must answer before a change is applied. */
export type PendingConfirm = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export type WorkspaceOptions = {
  store: ProjectStore;
  settings: AppSettings;
  providers: ProviderStatus[];
  job: JobRunner;
};

export type Workspace = {
  /** The active AI provider as the generate panel shows it. Null when none is selected. */
  provider: GenerateProviderInfo | null;
  jobResult: JobView | null;
  dismissJobResult: () => void;
  cancelJob: () => void;
  notice: Notice | null;
  dismissNotice: () => void;
  confirm: PendingConfirm | null;
  answerConfirm: (accept: boolean) => void;
  /** Asks for confirmation first when captions exist, because transcription replaces them. */
  requestTranscribe: () => void;
  translate: () => void;
  /** Summary of the current project. Null after a project change or before the first run. */
  summary: SummaryResult | null;
  summaryOpen: boolean;
  setSummaryOpen: (open: boolean) => void;
  /** Runs the summary and opens the dialog with the result. */
  summarize: () => void;
  /** Opens the dialog for the summary that already exists. */
  openSummary: () => void;
  /** Opens a video. Asks first when a video is loaded or captions exist, because both are replaced. */
  openVideo: () => void;
  /** Opens a video dropped on the window, with the same confirmation as openVideo. Other files get an error notice. */
  openDroppedVideo: (file: File) => void;
  /** Picks the replacement for a missing or changed video. Captions stay. */
  relinkVideo: () => void;
  /** Called by the preview on a media error. Code 4 starts a preview proxy job. */
  reportPlaybackError: (code: number | string) => void;
};

function getApi(): TajtlishaApi | undefined {
  return typeof window === 'undefined' ? undefined : (window.tajtlisha as TajtlishaApi | undefined);
}

/**
 * Editor actions that call the backend: opening and relinking video, AI
 * transcription and translation, and the preview proxy. Each result is applied
 * only when the project it was started for is still the one on screen.
 */
export function useWorkspace({ store, settings, providers, job }: WorkspaceOptions): Workspace {
  const { t } = useTranslation();
  const { state, dispatch } = store;
  const api = getApi();

  // Refs hold the latest project and settings for async continuations.
  const projectRef = useRef(state.project);
  const settingsRef = useRef(settings);
  useLayoutEffect(() => {
    projectRef.current = state.project;
    settingsRef.current = settings;
  });

  const [jobResult, setJobResult] = useState<JobView | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [summaryState, setSummaryState] = useState<SummaryResult | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Input path for which a preview proxy was already attempted. Prevents a retry loop on a broken file.
  const proxyAttemptRef = useRef<string | null>(null);

  const projectId = state.project.id;
  const sourcePath = state.project.source?.inputPath ?? null;
  // A summary belongs to the project and video it was made for. Opening another video keeps the
  // project id, so the source path is checked too. The effect clears it once either changes.
  const summary =
    summaryState && summaryState.projectId === projectId && summaryState.inputPath === sourcePath ? summaryState : null;
  useEffect(() => {
    setSummaryState(null);
    setSummaryOpen(false);
  }, [projectId, sourcePath]);

  const activeId = settings.aiConnector.activeProviderId;
  const activeStatus = providers.find((provider) => provider.id === activeId) ?? null;
  const provider: GenerateProviderInfo | null = activeId
    ? {
        id: activeId,
        displayName: activeStatus?.displayName ?? activeId,
        connected: activeStatus?.connected ?? false,
        canTranscribe: activeStatus?.capabilities.transcription ?? false,
        canTranslate: activeStatus?.capabilities.translation ?? false,
        canSummarize: activeStatus?.capabilities.summary ?? false
      }
    : null;

  const noticeFromError = useCallback(
    (error: unknown): Notice => {
      const described = describeAppError(error);
      return { tone: 'error', text: t(appErrorKey(described.code)), detail: described.detail };
    },
    [t]
  );

  /** The one place a picked or dropped video reaches the project. Captions are kept only for relink. */
  const applySource = useCallback(
    async (mode: 'open' | 'relink', pick: () => Promise<ProjectSource | null>) => {
      try {
        const source = await pick();
        if (!source) return;
        dispatch(mode === 'open' ? { type: 'source/set', source } : { type: 'source/relink', source });
        setNotice(null);
      } catch (error) {
        setNotice(noticeFromError(error));
      }
    },
    [dispatch, noticeFromError]
  );

  const chooseSource = useCallback(
    (mode: 'open' | 'relink') => {
      if (!api) return;
      void applySource(mode, () => api.project.selectVideo());
    },
    [api, applySource]
  );

  /** Runs `replace` now, or after the user confirms when a video is loaded or captions exist. */
  const confirmReplacement = useCallback(
    (replace: () => void) => {
      const current = projectRef.current;
      if (current.source === null && current.captions.length === 0) {
        replace();
        return;
      }
      const count = current.captions.length;
      setConfirm({
        title: t('shell.confirm.openVideoTitle'),
        description:
          count > 0
            ? t('shell.confirm.openVideoBody', { count })
            : t('shell.confirm.openVideoBodyNoCaptions'),
        confirmLabel: t('shell.confirm.openVideoAction'),
        onConfirm: replace
      });
    },
    [t]
  );

  const openVideo = useCallback(() => confirmReplacement(() => chooseSource('open')), [chooseSource, confirmReplacement]);

  const openDroppedVideo = useCallback(
    (file: File) => {
      if (!api) return;
      if (!isSupportedVideoPath(file.name)) {
        setNotice({ tone: 'error', text: t('shell.drop.unsupported', { formats: SUPPORTED_FORMATS }) });
        return;
      }
      confirmReplacement(() => void applySource('open', () => api.project.openDroppedVideo(file)));
    },
    [api, applySource, confirmReplacement, t]
  );

  const relinkVideo = useCallback(() => void chooseSource('relink'), [chooseSource]);

  const transcribe = useCallback(async () => {
    const current = projectRef.current;
    const config = settingsRef.current;
    const source = current.source;
    const providerId = config.aiConnector.activeProviderId;
    if (!api || !source || !providerId) return;

    const context = captureJobContext(current);
    const modelId = optionalModelId(config.aiConnector.transcriptionModelByProvider[providerId]);
    // The correction pass runs only when the setting is on; then it uses the text model, like translation.
    const correction = config.aiConnector.correctTranscript
      ? {
          modelId: optionalModelId(config.aiConnector.textModelByProvider[providerId]),
          instructions: config.aiConnector.transcriptCorrectionInstructions
        }
      : undefined;
    const outcome = await job.run(
      'transcribe',
      (jobId) =>
        api.workflow.transcribe({
          jobId,
          inputPath: source.inputPath,
          trim: current.trim,
          providerId,
          modelId,
          language: spokenLanguageOf(current),
          maxCharsPerLine: captionLineLimit(current, config),
          maxLinesPerCaption: config.aiConnector.maxLinesPerCaption,
          ...(correction ? { correction } : {}),
          ...withVideoContext(current)
        }),
      { isStillValid: () => isContextCurrent(context, projectRef.current, { allowEditsSince: true }) }
    );

    if (outcome.status !== 'done') {
      setJobResult(jobOutcomeView('transcribe', outcome, t, () => ''));
      return;
    }

    const result = outcome.value;
    const apply = () => {
      dispatch({
        type: 'captions/replaceAll',
        captions: result.captions,
        sourceLanguage: result.language,
        transcription: { providerId, modelId, timingSource: result.timingSource }
      });
      // A failed correction still leaves usable captions, so the result stays 'done' and says what happened.
      setJobResult({
        kind: 'transcribe',
        status: 'done',
        message:
          result.correction === 'failed'
            ? t('shell.result.correctionFailed', { count: result.captions.length })
            : t('shell.result.transcribed', { count: result.captions.length })
      });
    };

    // Edits made while the job ran would be lost by the replacement, so ask first.
    if (projectRef.current.revision !== context.revision) {
      setConfirm({
        title: t('shell.confirm.replaceEditedTitle'),
        description: t('shell.confirm.replaceEditedBody'),
        confirmLabel: t('shell.confirm.replaceAction'),
        onConfirm: apply
      });
      return;
    }
    apply();
  }, [api, dispatch, job, t]);

  const requestTranscribe = useCallback(() => {
    const count = projectRef.current.captions.length;
    if (count === 0) {
      void transcribe();
      return;
    }
    setConfirm({
      title: t('shell.confirm.transcribeTitle'),
      description: t('shell.confirm.transcribeBody', { count }),
      confirmLabel: t('shell.confirm.transcribeAction'),
      onConfirm: () => void transcribe()
    });
  }, [t, transcribe]);

  const translate = useCallback(async () => {
    const current = projectRef.current;
    const config = settingsRef.current;
    const providerId = config.aiConnector.activeProviderId;
    if (!api || !providerId) return;

    const pendingIds = new Set(rowsNeedingTranslation(current));
    const rows = current.captions.filter((caption) => pendingIds.has(caption.id) && caption.original.trim() !== '');
    if (rows.length === 0) {
      setNotice({ tone: 'info', text: t('shell.translate.nothingToDo') });
      return;
    }

    // What each row held when it was sent. The result applies only while both fields still match.
    const sent = new Map(
      rows.map((caption): [string, { original: string; translation: string }] => [
        caption.id,
        { original: caption.original, translation: caption.translation }
      ])
    );
    const targetLanguage = current.targetLanguage;
    const context = captureJobContext(current);
    const outcome = await job.run(
      'translate',
      (jobId) =>
        api.workflow.translate({
          jobId,
          providerId,
          modelId: optionalModelId(config.aiConnector.textModelByProvider[providerId]),
          sourceLanguage: sourceLanguageCode(current),
          targetLanguage,
          captions: rows.map((caption) => ({ id: caption.id, text: caption.original })),
          polish: polishFor(config),
          instructions: config.aiConnector.translationInstructions,
          ...withVideoContext(current),
          maxCharsPerLine: captionLineLimit(current, config),
          maxLinesPerCaption: config.aiConnector.maxLinesPerCaption
        }),
      { isStillValid: () => isContextCurrent(context, projectRef.current, { allowEditsSince: true }) }
    );

    if (outcome.status !== 'done') {
      setJobResult(jobOutcomeView('translate', outcome, t, () => ''));
      return;
    }

    const latest = projectRef.current;
    if (latest.targetLanguage !== targetLanguage) {
      setJobResult({ kind: 'translate', status: 'error', message: t('shell.result.targetChanged') });
      return;
    }

    // A manual translation fix made during the job wins over the AI result, so the row must still match on both fields.
    const currentRows = new Map(latest.captions.map((caption) => [caption.id, caption]));
    const translations = outcome.value.translations.filter((item) => {
      const snapshot = sent.get(item.id);
      const row = currentRows.get(item.id);
      return (
        snapshot !== undefined &&
        row !== undefined &&
        row.original === snapshot.original &&
        row.translation === snapshot.translation
      );
    });
    dispatch({ type: 'captions/applyTranslations', translations, targetLanguage });

    const skipped = sent.size - translations.length;
    setJobResult({
      kind: 'translate',
      status: 'done',
      message:
        skipped > 0
          ? t('shell.result.translatedSkipped', { count: translations.length, skipped })
          : t('shell.result.translated', { count: translations.length })
    });
  }, [api, dispatch, job, t]);

  // The summary is informational, so caption edits during the run keep the result. Only a change of project discards it.
  const summarize = useCallback(async () => {
    const current = projectRef.current;
    const config = settingsRef.current;
    const providerId = config.aiConnector.activeProviderId;
    if (!api || !providerId) return;

    const segments = summaryTranscript(current);
    if (segments.length === 0) {
      setNotice({ tone: 'info', text: t('captions.summary.nothingToSummarize') });
      return;
    }

    const summarySettings = config.summary;
    const context = captureJobContext(current);
    const outcome = await job.run(
      'summarize',
      (jobId) =>
        api.workflow.summarize({
          jobId,
          providerId,
          modelId:
            optionalModelId(summarySettings.modelByProvider[providerId]) ??
            optionalModelId(config.aiConnector.textModelByProvider[providerId]),
          // 'default' sends no reasoning parameter, so non-reasoning models keep working.
          ...(summarySettings.reasoningEffort === 'default' ? {} : { reasoningEffort: summarySettings.reasoningEffort }),
          systemPrompt: summarySettings.systemPrompt.trim() || DEFAULT_SUMMARY_PROMPT,
          language: sourceLanguageCode(current),
          segments
        }),
      { isStillValid: () => isContextCurrent(context, projectRef.current, { allowEditsSince: true }) }
    );

    if (outcome.status !== 'done') {
      setJobResult(jobOutcomeView('summarize', outcome, t, () => ''));
      return;
    }

    // A failed earlier attempt must not reappear in the job bar once this one succeeded.
    setJobResult(null);
    setSummaryState({
      projectId: context.projectId,
      inputPath: context.inputPath,
      revision: context.revision,
      text: outcome.value.text
    });
    setSummaryOpen(true);
  }, [api, job, t]);

  const openSummary = useCallback(() => setSummaryOpen(true), []);

  const createPreviewProxy = useCallback(async () => {
    const current = projectRef.current;
    const source = current.source;
    if (!api || !source || proxyAttemptRef.current === source.inputPath) return;

    proxyAttemptRef.current = source.inputPath;
    const context = captureJobContext(current);
    const outcome = await job.run(
      'preview',
      (jobId) => api.project.createPreviewProxy({ jobId, inputPath: source.inputPath }),
      { isStillValid: () => isContextCurrent(context, projectRef.current, { allowEditsSince: true }) }
    );

    if (outcome.status === 'done') {
      dispatch({ type: 'source/updateUrl', fileUrl: outcome.value.fileUrl });
      return;
    }
    if (outcome.status === 'error' && outcome.detail === 'busy') {
      // Another job holds the runner. Let the next media error try again.
      proxyAttemptRef.current = null;
    }
    setJobResult(jobOutcomeView('preview', outcome, t, () => ''));
  }, [api, dispatch, job, t]);

  const reportPlaybackError = useCallback(
    (code: number | string) => {
      const source = projectRef.current.source;
      // Code 4 means the format is not decodable here. One proxy attempt per file.
      if (code === 4 && source && proxyAttemptRef.current !== source.inputPath) {
        void createPreviewProxy();
        return;
      }
      setNotice({ tone: 'error', text: t('shell.playback.failed', { code: String(code) }) });
    },
    [createPreviewProxy, t]
  );

  const answerConfirm = useCallback(
    (accept: boolean) => {
      const pending = confirm;
      setConfirm(null);
      if (accept) pending?.onConfirm();
    },
    [confirm]
  );

  const cancelJob = useCallback(() => {
    job.cancel().catch(() => setNotice({ tone: 'error', text: t('shell.cancelFailed') }));
  }, [job, t]);

  return {
    provider,
    jobResult,
    dismissJobResult: () => setJobResult(null),
    cancelJob,
    notice,
    dismissNotice: () => setNotice(null),
    confirm,
    answerConfirm,
    requestTranscribe,
    translate,
    summary,
    summaryOpen,
    setSummaryOpen,
    summarize,
    openSummary,
    openVideo,
    openDroppedVideo,
    relinkVideo,
    reportPlaybackError
  };
}
