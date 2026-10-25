import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js';
import { SUBTITLE_PRESETS, computeSubtitleGeometry } from '../../../../shared/subtitle-geometry';
import type { SubtitlePresetId, SubtitleStyle, WordHighlightMode } from '../../../../shared/types/style';
import { resolveWordHighlight } from '../../../../shared/word-highlight';
import { buildSubtitleBoxStyle, buildSubtitleTextStyle } from './subtitleStyles';
import './preview.css';

export type StyleDrawerProps = {
  style: SubtitleStyle;
  onChange: (patch: Partial<SubtitleStyle>) => void;
  onApplyPreset: (id: SubtitlePresetId) => void;
  defaultOpen?: boolean;
  /** Controlled open state. Leave it out and the drawer manages its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Explicit height in px. The body scrolls inside it. Leave it out for the content height. */
  height?: number;
};

const PRESET_LABEL_KEYS: Record<SubtitlePresetId, string> = {
  clean: 'preview.presetClean',
  box: 'preview.presetBox',
  bold_yellow: 'preview.presetBoldYellow',
  karaoke: 'preview.presetKaraoke'
};

const SAMPLE_FONT_PX = 16;

/** Collapsible subtitle style editor. Changes go out as partial patches; presets replace the whole style. */
export function StyleDrawer({
  style,
  onChange,
  onApplyPreset,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  height
}: StyleDrawerProps) {
  const { t } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const bodyId = useId();
  const outlineDisabled = style.backgroundEnabled;
  const highlight = resolveWordHighlight(style);
  const presetIds = Object.keys(SUBTITLE_PRESETS) as SubtitlePresetId[];

  function toggle(): void {
    const next = !open;
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return (
    <section
      className={height === undefined ? 'panel style-drawer' : 'panel style-drawer style-drawer-sized'}
      style={height === undefined ? undefined : { height }}
    >
      <button
        type="button"
        className="style-drawer-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <span className="panel-title">{t('preview.styleSection')}</span>
      </button>

      {open ? (
        <div id={bodyId} className="style-drawer-body">
          <div className="style-presets" role="group" aria-label={t('preview.presets')}>
            {presetIds.map((id) => (
              <button
                key={id}
                type="button"
                className="style-preset"
                aria-pressed={style.presetId === id}
                onClick={() => onApplyPreset(id)}
              >
                <PresetSample preset={SUBTITLE_PRESETS[id]} />
                <span>{t(PRESET_LABEL_KEYS[id])}</span>
              </button>
            ))}
          </div>

          <div className="style-grid">
            <div className="style-font-size">
              <NumberField
                label={t('preview.fontSize')}
                value={style.fontSizePercent}
                min={2}
                max={12}
                step={0.1}
                onCommit={(fontSizePercent) => onChange({ fontSizePercent })}
              />
              <Slider.Root
                className="slider"
                min={2}
                max={12}
                step={0.1}
                value={[style.fontSizePercent]}
                onValueChange={([value]) => onChange({ fontSizePercent: Math.round(value * 10) / 10 })}
              >
                <Slider.Track className="slider-track">
                  <Slider.Range className="slider-range" />
                </Slider.Track>
                <Slider.Thumb className="slider-thumb" aria-label={t('preview.fontSize')} />
              </Slider.Root>
            </div>

            <SwitchField
              label={t('preview.bold')}
              checked={style.bold}
              onCheckedChange={(bold) => onChange({ bold })}
            />
            <SwitchField
              label={t('preview.italic')}
              checked={style.italic}
              onCheckedChange={(italic) => onChange({ italic })}
            />
            <ColorField
              label={t('preview.textColor')}
              value={style.textColor}
              onChange={(textColor) => onChange({ textColor })}
            />

            <div className="style-group">
              <SwitchField
                label={t('preview.outline')}
                checked={style.outlineEnabled}
                disabled={outlineDisabled}
                onCheckedChange={(outlineEnabled) => onChange({ outlineEnabled })}
              />
              <ColorField
                label={t('preview.outlineColor')}
                value={style.outlineColor}
                disabled={outlineDisabled}
                onChange={(outlineColor) => onChange({ outlineColor })}
              />
              <NumberField
                label={t('preview.outlineWidth')}
                value={style.outlineWidthPercent}
                min={0}
                max={20}
                step={0.5}
                disabled={outlineDisabled}
                onCommit={(outlineWidthPercent) => onChange({ outlineWidthPercent })}
              />
              {outlineDisabled ? <p className="style-hint muted">{t('preview.outlineDisabledHint')}</p> : null}
            </div>

            <div className="style-group">
              <SwitchField
                label={t('preview.shadow')}
                checked={style.shadowEnabled}
                onCheckedChange={(shadowEnabled) => onChange({ shadowEnabled })}
              />
              <ColorField
                label={t('preview.shadowColor')}
                value={style.shadowColor}
                disabled={!style.shadowEnabled}
                onChange={(shadowColor) => onChange({ shadowColor })}
              />
            </div>

            <div className="style-group">
              <SwitchField
                label={t('preview.background')}
                checked={style.backgroundEnabled}
                onCheckedChange={(backgroundEnabled) => onChange({ backgroundEnabled })}
              />
              <ColorField
                label={t('preview.backgroundColor')}
                value={style.backgroundColor}
                disabled={!style.backgroundEnabled}
                onChange={(backgroundColor) => onChange({ backgroundColor })}
              />
              <NumberField
                label={t('preview.backgroundOpacity')}
                value={Math.round(style.backgroundOpacity * 100)}
                min={0}
                max={100}
                disabled={!style.backgroundEnabled}
                onCommit={(percent) => onChange({ backgroundOpacity: percent / 100 })}
              />
            </div>

            <div className="style-group">
              <SegmentedField<WordHighlightMode>
                label={t('preview.wordHighlight')}
                value={highlight.mode}
                options={[
                  { value: 'off', label: t('preview.wordHighlightOff') },
                  { value: 'word', label: t('preview.wordHighlightWord') },
                  { value: 'progressive', label: t('preview.wordHighlightProgressive') }
                ]}
                onChange={(wordHighlight) => onChange({ wordHighlight })}
              />
              <ColorField
                label={t('preview.wordHighlightColor')}
                value={highlight.color}
                disabled={highlight.mode === 'off'}
                onChange={(highlightColor) => onChange({ highlightColor })}
              />
              <p className="style-hint muted">{t('preview.wordHighlightHint')}</p>
            </div>

            <SegmentedField<SubtitleStyle['position']>
              label={t('preview.position')}
              value={style.position}
              options={[
                { value: 'top', label: t('preview.positionTop') },
                { value: 'middle', label: t('preview.positionMiddle') },
                { value: 'bottom', label: t('preview.positionBottom') }
              ]}
              onChange={(position) => onChange({ position })}
            />
            <SegmentedField<SubtitleStyle['align']>
              label={t('preview.alignment')}
              value={style.align}
              options={[
                { value: 'left', label: t('preview.alignLeft') },
                { value: 'center', label: t('preview.alignCenter') },
                { value: 'right', label: t('preview.alignRight') }
              ]}
              onChange={(align) => onChange({ align })}
            />

            <NumberField
              label={t('preview.marginVertical')}
              value={style.marginVerticalPercent}
              min={0}
              max={30}
              onCommit={(marginVerticalPercent) => onChange({ marginVerticalPercent })}
            />
            <NumberField
              label={t('preview.maxWidth')}
              value={style.maxWidthPercent}
              min={40}
              max={100}
              onCommit={(maxWidthPercent) => onChange({ maxWidthPercent })}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Mini "Aa" drawn with the preset's real colors, outline, shadow and box. */
function PresetSample({ preset }: { preset: SubtitleStyle }) {
  // Pick a frame height where the font renders at SAMPLE_FONT_PX; every other length scales with it.
  const sampleFrame = (SAMPLE_FONT_PX * 100) / preset.fontSizePercent;
  const geometry = computeSubtitleGeometry(preset, sampleFrame, sampleFrame);

  return (
    <span
      className="preset-sample"
      style={{ ...buildSubtitleTextStyle(preset, geometry), ...buildSubtitleBoxStyle(preset, geometry), lineHeight: 1.2 }}
    >
      Aa
    </span>
  );
}

type SwitchFieldProps = {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function SwitchField({ label, checked, disabled = false, onCheckedChange }: SwitchFieldProps) {
  const id = useId();

  return (
    <div className="style-switch">
      <label htmlFor={id}>{label}</label>
      <Switch.Root id={id} className="switch" checked={checked} disabled={disabled} onCheckedChange={onCheckedChange}>
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>
    </div>
  );
}

type ColorFieldProps = {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function ColorField({ label, value, disabled = false, onChange }: ColorFieldProps) {
  const id = useId();

  return (
    <div className="style-color">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="color"
        className="color-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  /** Value in the displayed unit (percent where the label says so). */
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
};

/**
 * Numeric input that keeps the typed text while it is in progress. Only
 * in-range numbers are committed; blur restores the stored value.
 */
function NumberField({ label, value, min, max, step = 1, disabled = false, onCommit }: NumberFieldProps) {
  const id = useId();
  const displayed = String(value);
  const [draft, setDraft] = useState(displayed);

  useEffect(() => {
    setDraft(displayed);
  }, [displayed]);

  return (
    <div className="style-number">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="input input-mono"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() !== '' && Number.isFinite(next) && next >= min && next <= max) {
            onCommit(next);
          }
        }}
        onBlur={() => setDraft(displayed)}
      />
    </div>
  );
}

type SegmentedFieldProps<T extends string> = {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
};

function SegmentedField<T extends string>({ label, value, options, onChange }: SegmentedFieldProps<T>) {
  const labelId = useId();

  return (
    <div className="style-segment">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
