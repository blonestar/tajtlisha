import type { ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js';
import type { ExportOutputs, ProjectExportResult } from '../../../../shared/types/jobs';import './workflow.css';


export type ExportDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  outputFolder: string | null;
  onChooseFolder(): void;
  baseName: string;
  onBaseNameChange(value: string): void;
  outputs: ExportOutputs;
  onOutputsChange(outputs: ExportOutputs): void;
  includeLogo: boolean;
  onIncludeLogoChange(value: boolean): void;
  sourceLanguage: string;
  targetLanguage: string;
  blockingIssueCount: number;
  missingTranslationCount: number;
  busy: boolean;
  /** 0..1 when known; undefined renders an indeterminate bar while busy. */
  progress?: number;
  result: ProjectExportResult | null;
  errorMessage: string | null;
  onExport(): void;
  onShowInFolder(path: string): void;
};

const VIDEO_CHOICES = ['none', 'original', 'translation'] as const;

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function isValidBaseName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/[\\/]/.test(trimmed);
}

/**
 * Export choices with a live list of the files that will be created. Export is
 * disabled with the reason spelled out, never silently.
 */
export function ExportDialog({
  open,
  onOpenChange,
  outputFolder,
  onChooseFolder,
  baseName,
  onBaseNameChange,
  outputs,
  onOutputsChange,
  includeLogo,
  onIncludeLogoChange,
  sourceLanguage,
  targetLanguage,
  blockingIssueCount,
  missingTranslationCount,
  busy,
  progress,
  result,
  errorMessage,
  onExport,
  onShowInFolder
}: ExportDialogProps): ReactElement {
  const { t } = useTranslation();
  const base = baseName.trim();
  const baseNameValid = isValidBaseName(baseName);
  const usesTranslation = outputs.translationSrt || outputs.video === 'translation';

  const blockers: string[] = [];
  if (!outputs.originalSrt && !outputs.translationSrt && outputs.video === 'none') {
    blockers.push(t('captions.export.reason.nothingSelected'));
  }
  if (!outputFolder) blockers.push(t('captions.export.reason.noFolder'));
  if (!baseNameValid) blockers.push(t('captions.export.reason.invalidBaseName'));
  if (blockingIssueCount > 0) {
    blockers.push(t('captions.export.reason.blockingIssues', { count: blockingIssueCount }));
  }
  if (usesTranslation && missingTranslationCount > 0) {
    blockers.push(t('captions.export.reason.missingTranslations', { count: missingTranslationCount }));
  }

  const plannedFiles: string[] = [];
  if (outputs.originalSrt) plannedFiles.push(`${base}.${sourceLanguage}.srt`);
  if (outputs.translationSrt) plannedFiles.push(`${base}.${targetLanguage}.srt`);
  if (outputs.video !== 'none') plannedFiles.push(`${base}.subtitled.mp4`);

  const exportDisabled = busy || blockers.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content export-dialog">
          <Dialog.Title className="dialog-title">{t('captions.export.title')}</Dialog.Title>
          <Dialog.Description className="muted export-description">
            {t('captions.export.description')}
          </Dialog.Description>

          <div className="export-body">
            <fieldset className="export-group" disabled={busy}>
              <legend className="field-label">{t('captions.export.outputs')}</legend>
              <label className="export-check">
                <input
                  type="checkbox"
                  checked={outputs.originalSrt}
                  onChange={(event) => onOutputsChange({ ...outputs, originalSrt: event.target.checked })}
                />
                <span>{t('captions.export.originalSrt')}</span>
              </label>
              <label className="export-check">
                <input
                  type="checkbox"
                  checked={outputs.translationSrt}
                  onChange={(event) => onOutputsChange({ ...outputs, translationSrt: event.target.checked })}
                />
                <span>{t('captions.export.translationSrt')}</span>
              </label>
            </fieldset>

            <div className="export-group">
              <span className="field-label">{t('captions.export.video')}</span>
              <div className="segmented" role="group" aria-label={t('captions.export.video')}>
                {VIDEO_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={outputs.video === choice}
                    disabled={busy}
                    onClick={() => onOutputsChange({ ...outputs, video: choice })}
                  >
                    {t(
                      choice === 'none'
                        ? 'captions.export.videoNone'
                        : choice === 'original'
                          ? 'captions.export.videoOriginal'
                          : 'captions.export.videoTranslation'
                    )}
                  </button>
                ))}
              </div>
              <label className="export-check">
                <input
                  type="checkbox"
                  checked={includeLogo}
                  disabled={busy || outputs.video === 'none'}
                  onChange={(event) => onIncludeLogoChange(event.target.checked)}
                />
                <span>{t('captions.export.logo')}</span>
              </label>
            </div>

            <div className="export-group">
              <span className="field-label">{t('captions.export.folder')}</span>
              <div className="export-folder">
                <span
                  className={outputFolder ? 'export-folder-path mono' : 'export-folder-path muted'}
                  title={outputFolder ?? undefined}
                >
                  {outputFolder ?? t('captions.export.noFolder')}
                </span>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={onChooseFolder}>
                  <FolderOpen aria-hidden="true" size={14} />
                  {t('captions.export.chooseFolder')}
                </button>
              </div>
            </div>

            <label className="field export-group">
              <span className="field-label">{t('captions.export.baseName')}</span>
              <input
                className="input input-mono"
                value={baseName}
                disabled={busy}
                aria-invalid={!baseNameValid}
                spellCheck={false}
                onChange={(event) => onBaseNameChange(event.target.value)}
              />
            </label>

            <div className="export-group">
              <span className="field-label">{t('captions.export.files')}</span>
              {plannedFiles.length > 0 ? (
                <ul className="export-planned mono">
                  {plannedFiles.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : (
                <span className="muted">{t('captions.export.noFiles')}</span>
              )}
            </div>

            {blockers.length > 0 && !busy && (
              <ul className="export-blockers">
                {blockers.map((reason) => (
                  <li key={reason} className="message message-warning">
                    {reason}
                  </li>
                ))}
              </ul>
            )}

            {busy && (
              <div className="export-progress">
                <div
                  className={progress === undefined ? 'job-bar-track is-indeterminate' : 'job-bar-track'}
                  role="progressbar"
                  aria-label={t('captions.export.exporting')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress === undefined ? undefined : Math.round(progress * 100)}
                >
                  {progress !== undefined && (
                    <span
                      className="job-bar-fill"
                      style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
                    />
                  )}
                </div>
                <span className="muted">{t('captions.export.exporting')}</span>
              </div>
            )}

            {errorMessage && (
              <div className="message message-error" role="alert">
                {errorMessage}
              </div>
            )}

            {result && (
              <section className="export-result" aria-label={t('captions.export.created')}>
                <span className="field-label">{t('captions.export.created')}</span>
                <ul>
                  {result.files.map((file) => (
                    <li key={file.path} className="export-result-row">
                      <span className="export-result-kind">
                        {t(`captions.export.kind.${file.kind}`)}
                      </span>
                      <span className="mono export-result-name" title={file.path}>
                        {fileNameOf(file.path)}
                      </span>
                      <button type="button" className="btn btn-sm" onClick={() => onShowInFolder(file.path)}>
                        {t('captions.export.showInFolder')}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="dialog-footer">
            <Dialog.Close asChild>
              <button type="button" className="btn">
                {t('captions.export.close')}
              </button>
            </Dialog.Close>
            <button type="button" className="btn btn-primary" disabled={exportDisabled} onClick={onExport}>
              {busy ? t('captions.export.exporting') : t('captions.export.start')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
