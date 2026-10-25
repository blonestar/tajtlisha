import type { SubtitlePresetId, SubtitleStyle } from './types/style';

/**
 * Single source of truth for subtitle layout. Both the renderer preview (CSS)
 * and the ASS export call this with the frame size they render into, so the
 * text keeps the same proportions on screen and in the exported video.
 *
 * Rendering rules both sides must follow (verified against libass by Sol):
 * - `fontSizePx` is the CSS em size. libass sizes fonts by the Windows
 *   ascent+descent instead of the em box, so the ASS Fontsize must be
 *   `fontSizePx * ASS_FONT_SIZE_FACTOR[family]` (see assFontSize()).
 * - Line height in CSS is `lineHeightPx` (= the libass line metric).
 * - ASS Outline grows outward by `outlinePx`; CSS -webkit-text-stroke is
 *   centered on the glyph path, so CSS uses `cssStrokeWidthPx` (2x) with
 *   `paint-order: stroke fill`.
 * - Shadow: equal x/y offset `shadowPx`, no blur, on both sides.
 * - No automatic wrapping: captions carry explicit '\n' line breaks. ASS uses
 *   WrapStyle 2, CSS uses `white-space: pre`. Lines that do not fit are
 *   flagged in the editor (line_too_long) instead of being re-wrapped.
 * - The background box (ASS BorderStyle 3) is drawn per line around the line
 *   metrics; CSS approximates it with `box-decoration-break: clone` padding.
 * - Pixel-exact checks use the paused-frame preview rendered by ffmpeg.
 */
export type SubtitleGeometry = {
  /** CSS font size (em) in pixels of the given frame. */
  fontSizePx: number;
  /** Line advance in pixels (libass line metric for the bundled font). */
  lineHeightPx: number;
  /** -webkit-text-stroke width for the CSS preview (twice outlinePx). */
  cssStrokeWidthPx: number;
  /** Outline thickness in pixels (0 when disabled or when the box is enabled). */
  outlinePx: number;
  /** Shadow offset in pixels (0 when disabled). */
  shadowPx: number;
  /** Padding around text when the background box is enabled. */
  boxPaddingPx: number;
  /** Distance from the top or bottom edge, in pixels. Unused for `middle`. */
  marginVerticalPx: number;
  /** Left and right margin, in pixels, derived from maxWidthPercent. */
  marginHorizontalPx: number;
};

/**
 * libass Fontsize / CSS font-size for each bundled family. Noto Sans:
 * unitsPerEm 1000, OS/2 usWinAscent 1124 + usWinDescent 395 = 1519.
 */
export const ASS_FONT_SIZE_FACTOR: Record<string, number> = {
  'Noto Sans': 1.519
};

export function fontMetricFactor(fontFamily: string): number {
  return ASS_FONT_SIZE_FACTOR[fontFamily] ?? ASS_FONT_SIZE_FACTOR['Noto Sans'];
}

/** ASS `Fontsize` value that renders the same glyph size as CSS `fontSizePx`. */
export function assFontSize(style: SubtitleStyle, geometry: SubtitleGeometry): number {
  return Math.round(geometry.fontSizePx * fontMetricFactor(style.fontFamily) * 10) / 10;
}

export function computeSubtitleGeometry(style: SubtitleStyle, frameWidth: number, frameHeight: number): SubtitleGeometry {
  const width = Math.max(1, frameWidth);
  const height = Math.max(1, frameHeight);
  // Relative to the SHORTER side: on vertical 9:16 clips the width limits how
  // much text fits, on landscape clips the height does.
  const fontSizePx = (Math.min(width, height) * clamp(style.fontSizePercent, 2, 12)) / 100;
  const outlinePx =
    style.outlineEnabled && !style.backgroundEnabled ? (fontSizePx * clamp(style.outlineWidthPercent, 0, 20)) / 100 : 0;

  return {
    fontSizePx,
    lineHeightPx: fontSizePx * fontMetricFactor(style.fontFamily),
    cssStrokeWidthPx: outlinePx * 2,
    outlinePx,
    shadowPx: style.shadowEnabled ? fontSizePx * 0.06 : 0,
    boxPaddingPx: style.backgroundEnabled ? fontSizePx * 0.18 : 0,
    marginVerticalPx: (height * clamp(style.marginVerticalPercent, 0, 30)) / 100,
    marginHorizontalPx: (width * (100 - clamp(style.maxWidthPercent, 40, 100))) / 200
  };
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  presetId: 'clean',
  fontFamily: 'Noto Sans',
  fontSizePercent: 5.5,
  bold: true,
  italic: false,
  textColor: '#ffffff',
  outlineEnabled: true,
  outlineColor: '#000000',
  outlineWidthPercent: 9,
  shadowEnabled: true,
  shadowColor: '#000000',
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.6,
  position: 'bottom',
  align: 'center',
  marginVerticalPercent: 12,
  maxWidthPercent: 86,
  wordHighlight: 'off',
  highlightColor: '#ffd400'
};

export const SUBTITLE_PRESETS: Record<SubtitlePresetId, SubtitleStyle> = {
  clean: DEFAULT_SUBTITLE_STYLE,
  box: {
    ...DEFAULT_SUBTITLE_STYLE,
    presetId: 'box',
    bold: false,
    outlineEnabled: false,
    shadowEnabled: false,
    backgroundEnabled: true,
    backgroundColor: '#000000',
    backgroundOpacity: 0.65
  },
  bold_yellow: {
    ...DEFAULT_SUBTITLE_STYLE,
    presetId: 'bold_yellow',
    fontSizePercent: 6.2,
    textColor: '#ffd84a',
    outlineWidthPercent: 11
  },
  karaoke: {
    ...DEFAULT_SUBTITLE_STYLE,
    presetId: 'karaoke',
    fontSizePercent: 6.2,
    outlineWidthPercent: 11,
    wordHighlight: 'word',
    highlightColor: '#ffd400'
  }
};

/**
 * Average advance width per character as a fraction of the em, measured on
 * mixed Serbian/English text with the bundled font (Regular 0.461, Bold 0.491),
 * plus a small margin for capitals and wide letters.
 */
const AVERAGE_CHAR_WIDTH_EM = { regular: 0.49, bold: 0.52 } as const;

/**
 * How many characters fit on one subtitle line for this style and frame.
 * Captions carry explicit line breaks and are never re-wrapped, so this limit
 * drives caption building (AI transcription/translation) and the editor's
 * line_too_long warning. On a 720x1280 vertical clip with the default style it
 * is about 20; on 1920x1080 it is much larger and the user setting caps it.
 */
export function estimateMaxCharsPerLine(style: SubtitleStyle, frameWidth: number, frameHeight: number): number {
  const geometry = computeSubtitleGeometry(style, frameWidth, frameHeight);
  const sidePadding = Math.max(geometry.outlinePx, geometry.boxPaddingPx) * 2;
  const availablePx = Math.max(1, frameWidth) - geometry.marginHorizontalPx * 2 - sidePadding;
  const charWidthPx = geometry.fontSizePx * (style.bold ? AVERAGE_CHAR_WIDTH_EM.bold : AVERAGE_CHAR_WIDTH_EM.regular);
  return Math.max(8, Math.min(60, Math.floor(availablePx / charWidthPx)));
}

/** The effective line limit: the user's setting, but never more than fits the frame. */
export function effectiveMaxCharsPerLine(
  settingMaxChars: number,
  style: SubtitleStyle,
  frameWidth: number,
  frameHeight: number
): number {
  return Math.min(settingMaxChars, estimateMaxCharsPerLine(style, frameWidth, frameHeight));
}
