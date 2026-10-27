import type { KeyboardEvent, ReactElement } from 'react';
import { useRef, useState } from 'react';
import Minus from 'lucide-react/dist/esm/icons/minus.js';
import Plus from 'lucide-react/dist/esm/icons/plus.js';
import { formatTimecode, parseTimecode } from '../../utils/time';

type TimecodeFieldProps = {
  label: string;
  /** Source-absolute position in ms. */
  valueMs: number;
  trimStartMs: number;
  earlierLabel: string;
  laterLabel: string;
  /** Receives a source-absolute ms value that differs from valueMs. */
  onCommit(valueMs: number): void;
  onNudge(deltaMs: number): void;
};

export const NUDGE_STEP_MS = 100;

/**
 * Editable timecode shown relative to the trim start. Enter or blur commits,
 * Escape reverts. Invalid input reverts without calling onCommit.
 */
export function TimecodeField({
  label,
  valueMs,
  trimStartMs,
  earlierLabel,
  laterLabel,
  onCommit,
  onNudge
}: TimecodeFieldProps): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const skipCommitRef = useRef(false);
  const shown = formatTimecode(valueMs - trimStartMs, { precision: 'ms' });

  function commit(): void {
    if (draft === null) return;

    setDraft(null);
    const relativeMs = parseTimecode(draft);
    if (relativeMs === null) return;

    const absoluteMs = relativeMs + trimStartMs;
    if (absoluteMs !== valueMs) onCommit(absoluteMs);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      skipCommitRef.current = true;
      setDraft(null);
      event.currentTarget.blur();
    }
  }

  function handleBlur(): void {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    commit();
  }

  return (
    <div className="caption-time-field">
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm caption-nudge"
        title={earlierLabel}
        aria-label={earlierLabel}
        onClick={() => onNudge(-NUDGE_STEP_MS)}
      >
        <Minus aria-hidden="true" size={12} />
      </button>
      <input
        className="input input-mono caption-time-input"
        aria-label={label}
        title={label}
        data-column="time"
        inputMode="decimal"
        spellCheck={false}
        value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm caption-nudge"
        title={laterLabel}
        aria-label={laterLabel}
        onClick={() => onNudge(NUDGE_STEP_MS)}
      >
        <Plus aria-hidden="true" size={12} />
      </button>
    </div>
  );
}
