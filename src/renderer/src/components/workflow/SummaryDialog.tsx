import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import Check from 'lucide-react/dist/esm/icons/check.js';
import Copy from 'lucide-react/dist/esm/icons/copy.js';
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js';
import './workflow.css';

/** One finished summary run. `revision` is the project revision the run read. */
export type SummaryResult = {
  projectId: string;
  revision: number;
  text: string;
};

export type SummaryDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  summary: SummaryResult;
  /** Project revision now. When it differs, captions changed after the summary. */
  currentRevision: number;
  busy: boolean;
  onSummarizeAgain(): void;
};

const COPIED_MESSAGE_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Shows the summary as editable text, for example a social post. Edits stay
 * local to the dialog and are copied as they are. A new result replaces the text.
 */
export function SummaryDialog({
  open,
  onOpenChange,
  summary,
  currentRevision,
  busy,
  onSummarizeAgain
}: SummaryDialogProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(summary.text);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    setDraft(summary.text);
    setCopyState('idle');
  }, [summary]);

  useEffect(() => {
    if (copyState !== 'copied') return undefined;

    const timer = window.setTimeout(() => setCopyState('idle'), COPIED_MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const captionsChanged = summary.revision !== currentRevision;

  async function copyDraft(): Promise<void> {
    setCopyState((await copyText(draft)) ? 'copied' : 'failed');
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content summary-dialog">
          <Dialog.Title className="dialog-title">{t('captions.summary.title')}</Dialog.Title>
          <Dialog.Description className="muted summary-description">{t('captions.summary.description')}</Dialog.Description>

          <div className="summary-body">
            <textarea
              className="textarea summary-text"
              aria-label={t('captions.summary.textLabel')}
              rows={8}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <div className="summary-meta">
              <span className="muted">{t('captions.summary.characterCount', { count: draft.length })}</span>
              {captionsChanged ? <span className="muted summary-note">{t('captions.summary.revisionChanged')}</span> : null}
            </div>
            {copyState === 'failed' ? (
              <p className="message message-error" role="status">
                {t('captions.summary.copyFailed')}
              </p>
            ) : null}
          </div>

          <div className="dialog-footer">
            <button type="button" className="btn" disabled={busy} onClick={onSummarizeAgain}>
              <RotateCw aria-hidden="true" size={14} />
              {t('captions.generate.summarizeAgain')}
            </button>
            <button type="button" className="btn btn-primary" disabled={draft.trim() === ''} onClick={() => void copyDraft()}>
              {copyState === 'copied' ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
              {copyState === 'copied' ? t('captions.summary.copied') : t('captions.summary.copy')}
            </button>
            <Dialog.Close asChild>
              <button type="button" className="btn">
                {t('captions.summary.close')}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Clipboard API first. A hidden textarea and execCommand cover runtimes where the API is missing or refused. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
