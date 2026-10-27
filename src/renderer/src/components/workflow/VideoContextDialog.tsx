import type { ReactElement } from 'react';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { MAX_VIDEO_CONTEXT_CHARS } from '../../../../shared/ai-instructions';
import './workflow.css';

export type VideoContextDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Stored video context. '' = none. */
  value: string;
  /** Called on Save (with the draft) and Clear (with ''). Esc and Cancel never call it. */
  onSave(text: string): void;
};

/**
 * Edits the per-video context. The draft lives in the form, which Radix unmounts
 * on close, so every open starts from the stored value and Esc or Cancel discards the draft.
 */
export function VideoContextDialog({ open, onOpenChange, value, onSave }: VideoContextDialogProps): ReactElement {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content context-dialog">
          <VideoContextForm
            value={value}
            onCancel={() => onOpenChange(false)}
            onSave={(text) => {
              onSave(text);
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type VideoContextFormProps = {
  value: string;
  onCancel(): void;
  onSave(text: string): void;
};

function VideoContextForm({ value, onCancel, onSave }: VideoContextFormProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  return (
    <>
      <Dialog.Title className="dialog-title context-title">{t('captions.context.dialogTitle')}</Dialog.Title>
      <Dialog.Description className="muted context-description">{t('captions.context.description')}</Dialog.Description>

      <div className="context-body">
        <textarea
          className="textarea context-text"
          aria-label={t('captions.context.textLabel')}
          placeholder={t('captions.context.placeholder')}
          maxLength={MAX_VIDEO_CONTEXT_CHARS}
          rows={6}
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <div className="context-meta">
          <span className="muted context-hint">{t('captions.context.languageHint')}</span>
          <span className="muted context-count">
            {t('captions.context.counter', { count: draft.length, max: MAX_VIDEO_CONTEXT_CHARS })}
          </span>
        </div>
      </div>

      <div className="dialog-footer context-footer">
        {value.trim() !== '' && (
          <button type="button" className="btn btn-ghost context-clear" onClick={() => onSave('')}>
            {t('captions.context.clear')}
          </button>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          {t('captions.context.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          {t('captions.context.save')}
        </button>
      </div>
    </>
  );
}
