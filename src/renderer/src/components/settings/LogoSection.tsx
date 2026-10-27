import type { KeyboardEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '../../../../shared/types/settings';
import {
  WATERMARK_BACKGROUNDS,
  WATERMARK_CONTENTS,
  WATERMARK_POSITIONS,
  type WatermarkBackground,
  type WatermarkContent,
  type WatermarkPosition,
  type WatermarkSettings
} from '../../../../shared/types/watermark';
import {
  DEFAULT_WATERMARK,
  WATERMARK_RANGES,
  WATERMARK_TEXT_LIMITS,
  cleanWatermarkText
} from '../../../../shared/watermark-geometry';
import { WatermarkOverlay } from '../preview/WatermarkOverlay';
import { SegmentedControl, SettingsRow, SettingsSwitch } from './SettingsPrimitives';

type LogoSectionProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

/** Sample frame for the live preview: a 16:9 box, so the logo keeps its proportions. */
const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 180;

const contentLabelKeys: Record<WatermarkContent, string> = {
  mark_text: 'settings.logo.contentMarkText',
  mark: 'settings.logo.contentMark',
  text: 'settings.logo.contentText'
};

const backgroundLabelKeys: Record<WatermarkBackground, string> = {
  all: 'settings.logo.backgroundAll',
  mark: 'settings.logo.backgroundMark',
  none: 'settings.logo.backgroundNone'
};

const positionLabelKeys: Record<WatermarkPosition, string> = {
  top_left: 'settings.logo.positionTopLeft',
  top_center: 'settings.logo.positionTopCenter',
  top_right: 'settings.logo.positionTopRight',
  bottom_left: 'settings.logo.positionBottomLeft',
  bottom_center: 'settings.logo.positionBottomCenter',
  bottom_right: 'settings.logo.positionBottomRight'
};

export function LogoSection({ settings, onSettingsChange }: LogoSectionProps): ReactElement {
  const { t } = useTranslation();
  const logo = settings.watermark;
  const off = !logo.enabled;
  // Bumped by Reset so the text fields drop their drafts even when the cleaned value did not change.
  const [resetCount, setResetCount] = useState(0);

  function updateLogo(patch: Partial<WatermarkSettings>): void {
    onSettingsChange?.({ watermark: { ...logo, ...patch } });
  }

  return (
    <>
      <SettingsRow label={t('settings.logo.enabled')} htmlFor="settings-logo-enabled" hint={t('settings.logo.enabledHint')}>
        <SettingsSwitch id="settings-logo-enabled" checked={logo.enabled} onChange={(enabled) => updateLogo({ enabled })} />
      </SettingsRow>

      <SettingsRow label={t('settings.logo.preview')} labelId="settings-logo-preview">
        <div className="logo-preview" aria-labelledby="settings-logo-preview">
          <WatermarkOverlay watermark={logo} frameWidth={PREVIEW_WIDTH} frameHeight={PREVIEW_HEIGHT} />
        </div>
      </SettingsRow>

      <SettingsRow label={t('settings.logo.content')} labelId="settings-logo-content">
        <SegmentedControl<WatermarkContent>
          labelledBy="settings-logo-content"
          value={logo.content}
          disabled={off}
          options={WATERMARK_CONTENTS.map((value) => ({ value, label: t(contentLabelKeys[value]) }))}
          onChange={(content) => updateLogo({ content })}
        />
      </SettingsRow>

      {logo.content !== 'text' ? (
        <TextFieldRow
          key={`mark-${resetCount}`}
          id="settings-logo-mark-text"
          label={t('settings.logo.markText')}
          hint={t('settings.logo.markTextHint')}
          value={logo.markText}
          maxChars={WATERMARK_TEXT_LIMITS.markText}
          disabled={off}
          onCommit={(markText) => updateLogo({ markText })}
        />
      ) : null}

      {logo.content !== 'mark' ? (
        <TextFieldRow
          key={`text-${resetCount}`}
          id="settings-logo-text"
          label={t('settings.logo.text')}
          hint={t('settings.logo.textHint')}
          value={logo.text}
          maxChars={WATERMARK_TEXT_LIMITS.text}
          disabled={off}
          onCommit={(text) => updateLogo({ text })}
        />
      ) : null}

      <SettingsRow label={t('settings.logo.background')} labelId="settings-logo-background">
        <SegmentedControl<WatermarkBackground>
          labelledBy="settings-logo-background"
          value={logo.background}
          disabled={off}
          options={WATERMARK_BACKGROUNDS.map((value) => ({ value, label: t(backgroundLabelKeys[value]) }))}
          onChange={(background) => updateLogo({ background })}
        />
      </SettingsRow>

      <SettingsRow label={t('settings.logo.colors')} labelId="settings-logo-colors">
        <div className="logo-colors" role="group" aria-labelledby="settings-logo-colors">
          <ColorOption
            label={t('settings.logo.colorBackground')}
            value={logo.backgroundColor}
            disabled={off}
            onChange={(backgroundColor) => updateLogo({ backgroundColor })}
          />
          <ColorOption
            label={t('settings.logo.colorMark')}
            value={logo.markColor}
            disabled={off}
            onChange={(markColor) => updateLogo({ markColor })}
          />
          <ColorOption
            label={t('settings.logo.colorText')}
            value={logo.textColor}
            disabled={off}
            onChange={(textColor) => updateLogo({ textColor })}
          />
        </div>
      </SettingsRow>

      <RangeRow
        id="settings-logo-radius"
        label={t('settings.logo.cornerRadius')}
        range={WATERMARK_RANGES.cornerRadiusPercent}
        step={1}
        value={logo.cornerRadiusPercent}
        disabled={off}
        display={t('settings.logo.percentValue', { value: logo.cornerRadiusPercent })}
        onChange={(cornerRadiusPercent) => updateLogo({ cornerRadiusPercent })}
      />

      <SettingsRow label={t('settings.logo.position')} labelId="settings-logo-position">
        <PositionGrid
          labelledBy="settings-logo-position"
          value={logo.position}
          disabled={off}
          labelFor={(position) => t(positionLabelKeys[position])}
          onChange={(position) => updateLogo({ position })}
        />
      </SettingsRow>

      <RangeRow
        id="settings-logo-size"
        label={t('settings.logo.size')}
        range={WATERMARK_RANGES.sizePercent}
        step={1}
        value={logo.sizePercent}
        disabled={off}
        display={t('settings.logo.percentValue', { value: logo.sizePercent })}
        onChange={(sizePercent) => updateLogo({ sizePercent })}
      />

      <RangeRow
        id="settings-logo-margin"
        label={t('settings.logo.margin')}
        range={WATERMARK_RANGES.marginPercent}
        step={1}
        value={logo.marginPercent}
        disabled={off}
        display={t('settings.logo.percentValue', { value: logo.marginPercent })}
        onChange={(marginPercent) => updateLogo({ marginPercent })}
      />

      <RangeRow
        id="settings-logo-opacity"
        label={t('settings.logo.opacity')}
        range={WATERMARK_RANGES.opacity}
        step={0.05}
        value={logo.opacity}
        disabled={off}
        display={t('settings.logo.percentValue', { value: Math.round(logo.opacity * 100) })}
        onChange={(opacity) => updateLogo({ opacity })}
      />

      <div className="settings-inline">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={off}
          onClick={() => {
            setResetCount((count) => count + 1);
            onSettingsChange?.({ watermark: { ...DEFAULT_WATERMARK } });
          }}
        >
          {t('settings.logo.reset')}
        </button>
      </div>
    </>
  );
}

type TextFieldRowProps = {
  id: string;
  label: string;
  hint: string;
  value: string;
  maxChars: number;
  disabled: boolean;
  onCommit: (value: string) => void;
};

/**
 * Text input that keeps the typed draft, so a space typed between words stays
 * while the store receives the cleaned value. The draft follows the store only
 * when the store's value changes from outside this field.
 */
function TextFieldRow({ id, label, hint, value, maxChars, disabled, onCommit }: TextFieldRowProps): ReactElement {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft((current) => (cleanWatermarkText(current, maxChars) === value ? current : value));
  }, [value, maxChars]);

  return (
    <SettingsRow label={label} htmlFor={id} hint={hint}>
      <input
        id={id}
        className="input logo-text-input"
        type="text"
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          // The limit counts code points of the cleaned text (maxLength would count UTF-16 units).
          // Within it the raw draft is kept, so a space typed between words stays; past it the cleaned, cut text is shown.
          const raw = event.currentTarget.value;
          const tooLong = Array.from(cleanWatermarkText(raw, Number.POSITIVE_INFINITY)).length > maxChars;
          const typed = tooLong ? cleanWatermarkText(raw, maxChars) : raw;
          setDraft(typed);
          onCommit(cleanWatermarkText(typed, maxChars));
        }}
        // Show what is actually used once the user leaves the field (dropped characters, trimmed spaces).
        onBlur={() => setDraft(cleanWatermarkText(draft, maxChars))}
      />
    </SettingsRow>
  );
}

type ColorOptionProps = {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function ColorOption({ label, value, disabled, onChange }: ColorOptionProps): ReactElement {
  return (
    <label className="settings-check-option">
      <input
        type="color"
        className="settings-color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {label}
    </label>
  );
}

type RangeRowProps = {
  id: string;
  label: string;
  range: { min: number; max: number };
  step: number;
  value: number;
  disabled: boolean;
  display: string;
  onChange: (value: number) => void;
};

/** Slider that writes the store on every step. Steps are coarse (1 % or 0.05), so this stays cheap. */
function RangeRow({ id, label, range, step, value, disabled, display, onChange }: RangeRowProps): ReactElement {
  return (
    <SettingsRow label={label} htmlFor={id}>
      <div className="settings-inline">
        <input
          id={id}
          className="settings-range"
          type="range"
          min={range.min}
          max={range.max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <output htmlFor={id} className="settings-range-value">
          {display}
        </output>
      </div>
    </SettingsRow>
  );
}

type PositionGridProps = {
  labelledBy: string;
  value: WatermarkPosition;
  disabled: boolean;
  labelFor: (position: WatermarkPosition) => string;
  onChange: (position: WatermarkPosition) => void;
};

/**
 * Six corners as a 3 x 2 radio grid (top row, then bottom row). Arrow keys move
 * the selection and focus; only the checked option is in the tab order.
 */
function PositionGrid({ labelledBy, value, disabled, labelFor, onChange }: PositionGridProps): ReactElement {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const step = { ArrowRight: 1, ArrowDown: 3, ArrowLeft: -1, ArrowUp: -3 }[event.key];
    if (step === undefined) return;

    event.preventDefault();
    const next = (index + step + WATERMARK_POSITIONS.length) % WATERMARK_POSITIONS.length;
    onChange(WATERMARK_POSITIONS[next]);
    buttons.current[next]?.focus();
  }

  return (
    <div className="logo-position-grid" role="radiogroup" aria-labelledby={labelledBy}>
      {WATERMARK_POSITIONS.map((position, index) => {
        const checked = position === value;
        return (
          <button
            key={position}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            className="btn logo-position-option"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(position)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {labelFor(position)}
          </button>
        );
      })}
    </div>
  );
}
