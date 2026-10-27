import { LOGO_FONT_METRICS } from './logo-font-metrics.generated';
import { measureLogoText } from './logo-font-metrics';
import { clamp } from './subtitle-geometry';
import {
  WATERMARK_BACKGROUNDS,
  WATERMARK_CONTENTS,
  WATERMARK_POSITIONS,
  type WatermarkSettings
} from './types/watermark';

/**
 * Single source of truth for the logo layout. The ASS export
 * (src/main/export/ass.ts) and the renderer preview (WatermarkOverlay) both
 * call computeWatermarkLayout with the frame size they draw into, so the logo
 * keeps the same proportions on screen and in the exported video.
 *
 * Everything is in frame pixels. `short` is the shorter side of the frame,
 * `S` is the logo height and `M` is the margin from the nearest edges.
 * The badge letters and the text are real Noto Sans Bold text; their widths
 * come from the generated metrics table.
 */
export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: true,
  content: 'mark_text',
  markText: 'T',
  text: 'tajtliša',
  background: 'all',
  backgroundColor: '#1D2025',
  markColor: '#F2A93B',
  textColor: '#F2F2F2',
  cornerRadiusPercent: 19,
  position: 'top_left',
  sizePercent: 7,
  marginPercent: 3,
  opacity: 0.9
};

export const WATERMARK_RANGES = {
  cornerRadiusPercent: { min: 0, max: 50 },
  sizePercent: { min: 3, max: 15 },
  marginPercent: { min: 0, max: 10 },
  opacity: { min: 0.2, max: 1 }
} as const;

/** Length limits in code points. An empty value is allowed and hides that part. */
export const WATERMARK_TEXT_LIMITS = { markText: 3, text: 30 } as const;

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Badge letter em size in logo heights. */
const MARK_EM = 0.7;
/** Text em size in logo heights. */
const TEXT_EM = 0.62;
/** Space around the content, in logo heights. */
const PAD = 0.3;
/** Space on each side of the badge letters inside the badge cell, in logo heights. */
const MARK_CELL_PAD = 0.25;
/** Gap between the right ink of the badge letters and the text, in logo heights. */
const MARK_TEXT_GAP = 0.1;

export type WatermarkBox = { x: number; y: number; width: number; height: number; radius: number };

/** One line of logo text. `x` is the pen start, `baseline` the baseline, both in frame pixels. */
export type WatermarkTextPart = { x: number; baseline: number; em: number; text: string; color: string };

export type WatermarkLayout = {
  /** Logo top-left corner in frame pixels. */
  origin: { x: number; y: number };
  width: number;
  height: number;
  /** Background rounded rectangle, or null when there is no background. */
  background: WatermarkBox | null;
  backgroundColor: string;
  /** Badge letters, or null when the badge is hidden. */
  mark: WatermarkTextPart | null;
  /** Text, or null when the text is hidden. */
  text: WatermarkTextPart | null;
  opacity: number;
};

export function isWatermarkColor(value: string): boolean {
  return COLOR_PATTERN.test(value);
}

/**
 * Hand-edited or stored values, and IPC input after the type checks: unknown
 * enums and invalid colours fall back to the defaults, non-finite numbers too,
 * numbers are clamped to their ranges and text is cleaned.
 */
export function normalizeWatermark(value: unknown): WatermarkSettings {
  const input: Record<string, unknown> =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_WATERMARK.enabled,
    content: oneOf(WATERMARK_CONTENTS, input.content, DEFAULT_WATERMARK.content),
    markText: textOr(input.markText, WATERMARK_TEXT_LIMITS.markText, DEFAULT_WATERMARK.markText),
    text: textOr(input.text, WATERMARK_TEXT_LIMITS.text, DEFAULT_WATERMARK.text),
    background: oneOf(WATERMARK_BACKGROUNDS, input.background, DEFAULT_WATERMARK.background),
    backgroundColor: colorOr(input.backgroundColor, DEFAULT_WATERMARK.backgroundColor),
    markColor: colorOr(input.markColor, DEFAULT_WATERMARK.markColor),
    textColor: colorOr(input.textColor, DEFAULT_WATERMARK.textColor),
    cornerRadiusPercent: clamp(
      finiteOr(input.cornerRadiusPercent, DEFAULT_WATERMARK.cornerRadiusPercent),
      WATERMARK_RANGES.cornerRadiusPercent.min,
      WATERMARK_RANGES.cornerRadiusPercent.max
    ),
    position: oneOf(WATERMARK_POSITIONS, input.position, DEFAULT_WATERMARK.position),
    sizePercent: clamp(
      finiteOr(input.sizePercent, DEFAULT_WATERMARK.sizePercent),
      WATERMARK_RANGES.sizePercent.min,
      WATERMARK_RANGES.sizePercent.max
    ),
    marginPercent: clamp(
      finiteOr(input.marginPercent, DEFAULT_WATERMARK.marginPercent),
      WATERMARK_RANGES.marginPercent.min,
      WATERMARK_RANGES.marginPercent.max
    ),
    opacity: clamp(finiteOr(input.opacity, DEFAULT_WATERMARK.opacity), WATERMARK_RANGES.opacity.min, WATERMARK_RANGES.opacity.max)
  };
}

/** Layout for the frame size, or null when the logo is off or has nothing to show. */
export function computeWatermarkLayout(settings: WatermarkSettings, frameWidth: number, frameHeight: number): WatermarkLayout | null {
  const logo = normalizeWatermark(settings);
  if (!logo.enabled) return null;

  const width = Math.max(1, frameWidth);
  const height = Math.max(1, frameHeight);
  const short = Math.min(width, height);
  const logoHeight = (short * logo.sizePercent) / 100;
  const margin = (short * logo.marginPercent) / 100;

  const showMark = logo.content !== 'text' && logo.markText !== '';
  const showText = logo.content !== 'mark' && logo.text !== '';
  if (!showMark && !showText) return null;

  const markEm = MARK_EM * logoHeight;
  const textEm = TEXT_EM * logoHeight;
  const pad = PAD * logoHeight;
  const capRatio = LOGO_FONT_METRICS.capHeight / LOGO_FONT_METRICS.unitsPerEm;

  const markWidth = showMark ? measureLogoText(logo.markText, markEm) : 0;
  const cellWidth = showMark ? Math.max(logoHeight, markWidth + 2 * MARK_CELL_PAD * logoHeight) : 0;
  const letterX = (cellWidth - markWidth) / 2;
  const markBaseline = (logoHeight + capRatio * markEm) / 2;

  const textWidth = showText ? measureLogoText(logo.text, textEm) : 0;
  const textX = showMark ? letterX + markWidth + MARK_TEXT_GAP * logoHeight : pad;
  const textBaseline = showMark ? markBaseline : (logoHeight + capRatio * textEm) / 2;

  const logoWidth = showMark && showText ? textX + textWidth + pad : showMark ? cellWidth : pad + textWidth + pad;

  const left = logo.position.endsWith('left');
  const right = logo.position.endsWith('right');
  const top = logo.position.startsWith('top');
  const originX = left ? margin : right ? width - margin - logoWidth : (width - logoWidth) / 2;
  const originY = top ? margin : height - margin - logoHeight;

  const cornerRadius = (logo.cornerRadiusPercent * logoHeight) / 100;
  const box = (boxWidth: number): WatermarkBox => ({
    x: originX,
    y: originY,
    width: boxWidth,
    height: logoHeight,
    radius: Math.max(0, Math.min(cornerRadius, boxWidth / 2, logoHeight / 2))
  });

  let background: WatermarkBox | null = null;
  if (logo.background === 'all') background = box(logoWidth);
  if (logo.background === 'mark' && showMark) background = box(cellWidth);

  return {
    origin: { x: originX, y: originY },
    width: logoWidth,
    height: logoHeight,
    background,
    backgroundColor: logo.backgroundColor,
    mark: showMark
      ? {
          x: originX + letterX,
          baseline: originY + markBaseline,
          em: markEm,
          text: logo.markText,
          color: logo.markColor
        }
      : null,
    text: showText
      ? {
          x: originX + textX,
          baseline: originY + textBaseline,
          em: textEm,
          text: logo.text,
          color: logo.textColor
        }
      : null,
    opacity: logo.opacity
  };
}

/** Removes line breaks, trims and keeps at most `maxChars` code points. */
export function cleanWatermarkText(value: string, maxChars: number): string {
  return Array.from(value.replace(/[\r\n]+/g, '').trim())
    .slice(0, maxChars)
    .join('')
    .trimEnd();
}

function textOr(value: unknown, maxChars: number, fallback: string): string {
  return typeof value === 'string' ? cleanWatermarkText(value, maxChars) : fallback;
}

function colorOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && COLOR_PATTERN.test(value) ? value : fallback;
}

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
