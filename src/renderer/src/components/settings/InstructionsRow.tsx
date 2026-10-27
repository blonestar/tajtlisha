import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_AI_INSTRUCTIONS_CHARS } from '../../../../shared/ai-instructions';
import { SettingsRow } from './SettingsPrimitives';
import { useCommitOnUnmount } from './hooks';

type InstructionsRowProps = {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  /** Stored instructions. '' = none. */
  value: string;
  onCommit: (value: string) => void;
};

/**
 * Free-text instructions for an AI pass. Edited as a local draft and committed on
 * blur, so typing does not write settings on every keystroke. Unlike the summary
 * prompt there is no default: blank means no extra instructions and is stored as ''.
 */
export function InstructionsRow({ id, label, hint, placeholder, value, onCommit }: InstructionsRowProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  // The last value saved or loaded, so a blur that already saved it never causes a second write.
  const committed = useRef(value);
  useEffect(() => {
    committed.current = value;
  }, [value]);

  function save(pending: string): void {
    const next = pending.trim();
    if (next === committed.current) return;

    committed.current = next;
    onCommit(next);
  }

  // Esc closes Settings without a blur, so an unsaved draft is committed on unmount.
  useCommitOnUnmount(draft, save);

  function commitDraft(): void {
    const next = draft.trim();
    setDraft(next);
    save(next);
  }

  return (
    <SettingsRow label={label} htmlFor={id} hint={hint}>
      <textarea
        id={id}
        className="textarea settings-instructions"
        rows={5}
        maxLength={MAX_AI_INSTRUCTIONS_CHARS}
        spellCheck={false}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commitDraft}
      />
      <span className="muted settings-instructions-counter">
        {t('settings.instructions.counter', { count: draft.length, max: MAX_AI_INSTRUCTIONS_CHARS })}
      </span>
    </SettingsRow>
  );
}
