import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.js';
import FileVideo from 'lucide-react/dist/esm/icons/file-video.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import type { TajtlishaApi } from '../../../../shared/types/ipc';
import type { ProjectDocument } from '../../../../shared/types/project';
import { SettingsPage } from '../../pages/SettingsPage';
import { EditorPage } from '../../pages/EditorPage';
import type { AppRuntime } from '../../hooks/useAppRuntime';
import { useExportDialog } from '../../hooks/useExportDialog';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useFfmpegStatus } from '../../hooks/useFfmpegStatus';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useWorkspace } from '../../hooks/useWorkspace';
import { outputsNeedTranslation } from '../../hooks/workspaceModel';
import { workflowStep } from '../../state/selectors';
import { useJobRunner } from '../../state/useJobRunner';
import { useProjectStore } from '../../state/useProjectStore';
import { ExportDialog } from '../workflow/ExportDialog';
import { JobBar } from '../workflow/JobBar';
import { SummaryDialog } from '../workflow/SummaryDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { SettingsSheet } from './SettingsSheet';
import { SourceBanner } from './SourceBanner';
import { StepIndicator, type StepKey, type StepStatus } from './StepIndicator';
import { TopBar, type SaveState } from './TopBar';

export type WorkspaceShellProps = {
  runtime: AppRuntime;
};

const DEFAULT_TARGET_LANGUAGE = 'sr-Latn';

/** Where each workflow step lives on screen. Clicking a step focuses that area. */
const STEP_TARGETS: Record<StepKey, string> = {
  import: 'import',
  trim: 'trim',
  transcribe: 'generate',
  translate: 'generate',
  review: 'captions',
  export: 'export'
};

/** Done, current or upcoming for each step, derived from the workflow step of the project. */
function stepStatuses(project: ProjectDocument, exported: boolean): Record<StepKey, StepStatus> {
  const step = workflowStep(project);
  const beforeTranscribe = step === 'import';
  const beforeTranslate = step === 'import' || step === 'trim';

  return {
    import: step === 'import' ? 'current' : 'done',
    // Trimming is optional: the full clip is the default range, so the step is done once a clip is open.
    trim: beforeTranscribe ? 'upcoming' : 'done',
    transcribe: beforeTranscribe ? 'upcoming' : step === 'trim' ? 'current' : 'done',
    translate: beforeTranslate ? 'upcoming' : step === 'translate' ? 'current' : 'done',
    review: step === 'review' ? (exported ? 'done' : 'current') : 'upcoming',
    export: exported ? 'done' : 'upcoming'
  };
}

function focusStep(step: StepKey, hasSource: boolean): void {
  const target = step === 'import' && hasSource ? 'preview' : STEP_TARGETS[step];
  const element = document.querySelector<HTMLElement>(`[data-step-target="${target}"]`);
  element?.scrollIntoView?.({ block: 'nearest' });
  element?.focus({ preventScroll: true });
}

/**
 * The application frame. It owns the project store, jobs, export and the
 * settings sheet, so opening Settings never unmounts the project.
 */
export function WorkspaceShell({ runtime }: WorkspaceShellProps): ReactElement {
  const { t } = useTranslation();
  const store = useProjectStore({
    targetLanguage: runtime.settings.aiConnector.defaultTargetLanguage ?? DEFAULT_TARGET_LANGUAGE
  });
  const job = useJobRunner();
  const workspace = useWorkspace({ store, settings: runtime.settings, providers: runtime.providers, job });
  const exportModel = useExportDialog({ store, settings: runtime.settings, job });
  const ffmpeg = useFfmpegStatus();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { state, dispatch, saveError, loadError, retryLoad, isDirty, sourceStatus, flush, ready } = store;
  const project = state.project;
  const source = project.source;
  const clipName = source ? fileNameOf(source.inputPath) : null;
  const busy = job.job !== null;
  const exportNeedsTranslation = outputsNeedTranslation(exportModel.outputs);

  // Quit handshake: pending edits are written before main quits. A failed write rejects,
  // so main asks the user whether to retry, quit without saving or cancel. Registered once.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const api = window.tajtlisha as TajtlishaApi | undefined;
    return api?.app.onPrepareQuit(async () => {
      const outcome = await flushRef.current();
      if (!outcome.ok) throw new Error(outcome.error);
    });
  }, []);

  useKeyboardShortcuts([
    // Opening a video during a job is allowed: the job's result is dropped if the video changed.
    // Before the saved project has loaded, a new video would be replaced by the load, so it waits.
    { key: 'o', ctrlOrMeta: true, handler: () => ready && workspace.openVideo() },
    { key: 'e', ctrlOrMeta: true, handler: () => ready && source && !busy && exportModel.openDialog() },
    { key: 'z', ctrlOrMeta: true, handler: () => dispatch({ type: 'history/undo' }) },
    { key: 'z', ctrlOrMeta: true, shift: true, handler: () => dispatch({ type: 'history/redo' }) },
    { key: 'y', ctrlOrMeta: true, handler: () => dispatch({ type: 'history/redo' }) }
  ]);

  const save: SaveState = saveError
    ? { kind: 'error', message: saveError }
    : isDirty
      ? { kind: 'saving' }
      : { kind: 'saved' };

  const statuses = stepStatuses(project, exportModel.result !== null);
  const sourceMissing = source !== null && (sourceStatus === 'missing' || sourceStatus === 'changed');

  // Drops wait while the editor is not ready or another layer (dialog, settings) is on top.
  const dropEnabled = ready && !workspace.confirm && !exportModel.open && !settingsOpen && !workspace.summaryOpen;
  const fileDrop = useFileDrop({ enabled: dropEnabled, onFile: workspace.openDroppedVideo });

  return (
    <div className="app-shell">
      <TopBar
        clipName={clipName}
        save={save}
        onRetrySave={() => void flush()}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: 'history/undo' })}
        onRedo={() => dispatch({ type: 'history/redo' })}
        onOpenVideo={workspace.openVideo}
        openVideoDisabled={!ready}
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={exportModel.openDialog}
        exportDisabled={source === null || busy}
        exportDisabledReason={source === null ? t('shell.top.noClip') : undefined}
      />

      <StepIndicator statuses={statuses} onSelect={(step) => focusStep(step, source !== null)} />

      {sourceMissing && <SourceBanner onFind={workspace.relinkVideo} />}

      {loadError && (
        <div className="message message-error app-notice" role="alert">
          <CircleAlert aria-hidden="true" size={14} />
          <span className="app-notice-text">
            <strong>{t('shell.projectLoad.title')}</strong> {t('shell.projectLoad.body')}
          </span>
          <code className="app-notice-detail">{loadError}</code>
          <button type="button" className="btn btn-sm" onClick={retryLoad}>
            {t('shell.projectLoad.retry')}
          </button>
          <button type="button" className="btn btn-sm" onClick={workspace.openVideo}>
            {t('shell.projectLoad.openVideo')}
          </button>
        </div>
      )}

      {workspace.notice && (
        <div
          className={`message app-notice ${workspace.notice.tone === 'error' ? 'message-error' : 'message-warning'}`}
          role={workspace.notice.tone === 'error' ? 'alert' : 'status'}
        >
          <CircleAlert aria-hidden="true" size={14} />
          <span className="app-notice-text">{workspace.notice.text}</span>
          {workspace.notice.detail && <code className="app-notice-detail">{workspace.notice.detail}</code>}
          <button
            type="button"
            className="btn btn-icon btn-sm btn-ghost"
            aria-label={t('shell.dismiss')}
            title={t('shell.dismiss')}
            onClick={workspace.dismissNotice}
          >
            <X aria-hidden="true" size={12} />
          </button>
        </div>
      )}

      <main className="app-main">
        {!ready ? (
          <div className="app-loading" role="status">
            {t('shell.loading')}
          </div>
        ) : source ? (
          <EditorPage
            store={store}
            settings={runtime.settings}
            workspace={workspace}
            busy={busy}
            exportNeedsTranslation={exportNeedsTranslation}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <EmptyState onOpenVideo={workspace.openVideo} ffmpeg={ffmpeg} />
        )}
      </main>

      {(job.job || workspace.jobResult) && (
        <div className="app-jobs">
          <JobBar
            job={job.job}
            result={workspace.jobResult}
            onCancel={workspace.cancelJob}
            onDismiss={workspace.dismissJobResult}
          />
          {workspace.jobResult?.detail && (
            <details className="job-detail">
              <summary>{t('shell.result.details')}</summary>
              <code>{workspace.jobResult.detail}</code>
            </details>
          )}
        </div>
      )}

      <ExportDialog
        open={exportModel.open}
        onOpenChange={exportModel.onOpenChange}
        outputFolder={exportModel.outputFolder}
        onChooseFolder={exportModel.chooseFolder}
        baseName={exportModel.baseName}
        onBaseNameChange={exportModel.setBaseName}
        outputs={exportModel.outputs}
        onOutputsChange={exportModel.setOutputs}
        includeLogo={exportModel.includeLogo}
        onIncludeLogoChange={exportModel.setIncludeLogo}
        sourceLanguage={exportModel.sourceLanguage}
        targetLanguage={exportModel.targetLanguage}
        blockingIssueCount={exportModel.blockingIssueCount}
        missingTranslationCount={exportModel.missingTranslationCount}
        busy={exportModel.busy}
        progress={exportModel.progress}
        result={exportModel.result}
        errorMessage={exportModel.errorMessage}
        onExport={exportModel.start}
        onShowInFolder={exportModel.showInFolder}
      />

      {workspace.summary ? (
        <SummaryDialog
          open={workspace.summaryOpen}
          onOpenChange={workspace.setSummaryOpen}
          summary={workspace.summary}
          currentRevision={project.revision}
          busy={busy}
          onSummarizeAgain={workspace.summarize}
        />
      ) : null}

      <ConfirmDialog
        open={workspace.confirm !== null}
        title={workspace.confirm?.title ?? ''}
        description={workspace.confirm?.description ?? ''}
        confirmLabel={workspace.confirm?.confirmLabel ?? ''}
        onAnswer={workspace.answerConfirm}
      />

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SettingsPage
          settings={runtime.settings}
          providers={runtime.providers}
          allProviders={runtime.allProviders}
          onLanguageChange={runtime.changeLanguage}
          onSettingsChange={(patch) => runtime.updateSettings(patch)}
          onConnectProvider={runtime.connectProvider}
          onDisconnectProvider={runtime.disconnectProvider}
          onTestProvider={runtime.testProvider}
          onRefreshProviders={runtime.refreshProviders}
          onListModels={runtime.listModels}
          onClose={() => setSettingsOpen(false)}
        />
      </SettingsSheet>

      {fileDrop.dragging && (
        <div className="drop-overlay">
          <FileVideo size={40} aria-hidden="true" />
          <p className="drop-overlay-title">{t('shell.drop.title')}</p>
          {source && <p className="drop-overlay-hint muted">{t('shell.drop.replaceHint')}</p>}
        </div>
      )}
    </div>
  );
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
