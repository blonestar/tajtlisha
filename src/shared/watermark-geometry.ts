import { clamp } from './subtitle-geometry';
import { WORDMARK } from './watermark-wordmark.generated';
import {
  WATERMARK_POSITIONS,
  WATERMARK_VARIANTS,
  type WatermarkSettings
} from './types/watermark';

/**
 * Single source of truth for the logo watermark layout. The ASS export
 * (src/main/export/ass.ts) and the renderer preview (WatermarkOverlay) both
 * call computeWatermarkLayout with the frame size they draw into, so the logo
 * keeps the same proportions on screen and in the exported video.
 *
 * Everything is in frame pixels. `short` is the shorter side of the frame,
 * `S` is the logo height and `M` is the margin from the nearest edges.
 */
export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: true,
  variant: 'icon_text',
  position: 'top_left',
  sizePercent: 7,
  marginPercent: 3,
  opacity: 0.9
};

export const WATERMARK_RANGES = {
  sizePercent: { min: 3, max: 15 },
  marginPercent: { min: 0, max: 10 },
  opacity: { min: 0.2, max: 1 }
} as const;

export const WATERMARK_COLORS = {
  background: '#1D2025',
  tMark: '#F2A93B',
  wordmark: '#F2F2F2'
} as const;

/** Background corner radius, in logo heights. */
const BADGE_RADIUS = 0.1875;
/** Wordmark origin in logo heights, measured from the logo's left edge. */
const WORDMARK_LEFT = 0.8;
/** Wordmark baseline in logo heights, measured from the logo's top edge. */
const WORDMARK_BASELINE = 0.7988;
/** Wordmark em size in logo heights. */
const WORDMARK_EM = 0.62;
/** Space right of the wordmark ink, in logo heights. */
const WORDMARK_RIGHT_PAD = 0.31;
/** T crossbar and stem, in logo heights, measured from the logo's top-left corner. */
const T_CROSSBAR = { x0: 0.3105, y0: 0.2988, x1: 0.6895, y1: 0.3867 };
const T_STEM = { x0: 0.4473, y0: 0.3867, x1: 0.5527, y1: 0.7988 };

export type WatermarkRect = { x: number; y: number; width: number; height: number };

export type WatermarkLayout = {
  /** Logo top-left corner in frame pixels. */
  origin: { x: number; y: number };
  width: number;
  height: number;
  /** Corner radius of the background rounded rectangle. */
  radius: number;
  /** The two rectangles of the T badge: crossbar first, then stem. */
  tRects: [WatermarkRect, WatermarkRect];
  /**
   * Wordmark placement. Font unit (fx, fy) maps to
   * (offsetX + fx * scale, baselineY + fy * scale). Null for the icon-only variant.
   */
  wordmark: { offsetX: number; baselineY: number; scale: number } | null;
  colors: typeof WATERMARK_COLORS;
  opacity: number;
};

/** Clamps numeric fields to their ranges. Shared by the settings store and IPC validation. */
export function clampWatermark(settings: WatermarkSettings): WatermarkSettings {
  return {
    ...settings,
    sizePercent: clamp(settings.sizePercent, WATERMARK_RANGES.sizePercent.min, WATERMARK_RANGES.sizePercent.max),
    marginPercent: clamp(settings.marginPercent, WATERMARK_RANGES.marginPercent.min, WATERMARK_RANGES.marginPercent.max),
    opacity: clamp(settings.opacity, WATERMARK_RANGES.opacity.min, WATERMARK_RANGES.opacity.max)
  };
}

/**
 * Hand-edited or stored values: unknown enums and non-finite numbers fall back
 * to the defaults, numbers are clamped to their ranges.
 */
export function normalizeWatermark(value: unknown): WatermarkSettings {
  const input: Record<string, unknown> =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return clampWatermark({
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_WATERMARK.enabled,
    variant: WATERMARK_VARIANTS.find((variant) => variant === input.variant) ?? DEFAULT_WATERMARK.variant,
    position: WATERMARK_POSITIONS.find((position) => position === input.position) ?? DEFAULT_WATERMARK.position,
    sizePercent: finiteOr(input.sizePercent, DEFAULT_WATERMARK.sizePercent),
    marginPercent: finiteOr(input.marginPercent, DEFAULT_WATERMARK.marginPercent),
    opacity: finiteOr(input.opacity, DEFAULT_WATERMARK.opacity)
  });
}

/** Layout for the frame size, or null when the logo is off. */
export function computeWatermarkLayout(settings: WatermarkSettings, frameWidth: number, frameHeight: number): WatermarkLayout | null {
  if (!settings.enabled) return null;

  const width = Math.max(1, frameWidth);
  const height = Math.max(1, frameHeight);
  const { variant, position, sizePercent, marginPercent, opacity } = clampWatermark(settings);
  const short = Math.min(width, height);
  const logoHeight = (short * sizePercent) / 100;
  const margin = (short * marginPercent) / 100;

  const wordmarkScale = (WORDMARK_EM * logoHeight) / WORDMARK.unitsPerEm;
  const logoWidth =
    variant === 'icon'
      ? logoHeight
      : WORDMARK_LEFT * logoHeight + WORDMARK.maxX * wordmarkScale + WORDMARK_RIGHT_PAD * logoHeight;

  const left = position.endsWith('left');
  const top = position.startsWith('top');
  const originX = left ? margin : width - margin - logoWidth;
  const originY = top ? margin : height - margin - logoHeight;

  return {
    origin: { x: originX, y: originY },
    width: logoWidth,
    height: logoHeight,
    radius: BADGE_RADIUS * logoHeight,
    tRects: [
      rectIn(originX, originY, logoHeight, T_CROSSBAR),
      rectIn(originX, originY, logoHeight, T_STEM)
    ],
    wordmark:
      variant === 'icon_text'
        ? {
            offsetX: originX + WORDMARK_LEFT * logoHeight,
            baselineY: originY + WORDMARK_BASELINE * logoHeight,
            scale: wordmarkScale
          }
        : null,
    colors: WATERMARK_COLORS,
    opacity
  };
}

function rectIn(originX: number, originY: number, logoHeight: number, box: { x0: number; y0: number; x1: number; y1: number }): WatermarkRect {
  return {
    x: originX + box.x0 * logoHeight,
    y: originY + box.y0 * logoHeight,
    width: (box.x1 - box.x0) * logoHeight,
    height: (box.y1 - box.y0) * logoHeight
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
