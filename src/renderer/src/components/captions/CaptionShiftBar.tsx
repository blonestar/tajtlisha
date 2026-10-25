import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChevronsLeft from 'lucide-react/dist/esm/icons/chevrons-left.js';
import ChevronsRight from 'lucide-react/dist/esm/icons/chevrons-right.js';
import './captions.css';

export type CaptionShiftBarProps = {
  disabled?: boolean;
  /** Negative moves every caption earlier, positive later. */
  onShift(deltaMs: number): void;
};

export const DEFAULT_SHIFT_SECONDS = '0.5';
/** Upper bound for one shift. Clips are short, so a larger value is almost surely a typo. */
export const MAX_SHIFT_MS = 10 * 60 * 1000;

/** Parses "1.5" or "1,5" seconds into whole ms. Returns null unless 0 < value <= MAX_SHIFT_MS. */
export function parseShiftSeconds(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return null;
  const ms = Math.round(Number(text) * 1000);
  return ms > 0 && ms <= MAX_SHIFT_MS ? ms : null;
}

/** One control that moves all captions earlier or later by the same amount. */
export function CaptionShiftBar({ disabled = false, onShift }: CaptionShiftBarProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(DEFAULT_SHIFT_SECONDS);
  const amountMs = parseShiftSeconds(draft);
  const invalid = amountMs === null;
  const seconds = invalid ? draft.trim() : String(amountMs / 1000);

  return (
    <div className="caption-shift-bar" role="group" aria-label={t('captions.shift.label')}>
      <span className="caption-shift-label">{t('captions.shift.label')}</span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={disabled || invalid}
        title={t('captions.shift.earlierTooltip', { seconds })}
        onClick={() => amountMs !== null && onShift(-amountMs)}
      >
        <ChevronsLeft aria-hidden="true" size={14} />
        {t('captions.shift.earlier')}
      </button>
      <input
        className="input input-mono caption-shift-input"
        aria-label={t('captions.shift.amount')}
        aria-invalid={invalid ? 'true' : undefined}
        title={invalid ? t('captions.shift.invalid') : undefined}
        inputMode="decimal"
        spellCheck={false}
        disabled={disabled}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <span className="caption-shift-unit">{t('captions.shift.unit')}</span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={disabled || invalid}
        title={t('captions.shift.laterTooltip', { seconds })}
        onClick={() => amountMs !== null && onShift(amountMs)}
      >
        {t('captions.shift.later')}
        <ChevronsRight aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
