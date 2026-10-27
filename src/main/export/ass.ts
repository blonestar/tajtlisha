import { AppError } from '../../shared/errors';
import { assFontSize, clamp, computeSubtitleGeometry } from '../../shared/subtitle-geometry';
import type { CaptionWord } from '../../shared/types/project';
import type { SubtitleStyle } from '../../shared/types/style';
import type { WatermarkSettings } from '../../shared/types/watermark';
import { type WatermarkLayout, computeWatermarkLayout } from '../../shared/watermark-geometry';
import { WORDMARK } from '../../shared/watermark-wordmark.generated';
import {
  type CaptionTextPart,
  type ResolvedWordHighlight,
  highlightIntervals,
  isWordHighlighted,
  resolveWordHighlight,
  splitCaptionText,
  timeCaptionWords
} from '../../shared/word-highlight';

export type AssCaption = {
  startMs: number;
  endMs: number;
  text: string;
  /** Timed words of `text`. Used only when word highlight is on. */
  words?: CaptionWord[];
  /**
   * Word lit for the whole caption (the preview frame). -1 or missing means
   * timing decides. Used only when word highlight is on.
   */
  activeWordIndex?: number;
  /**
   * Unclipped caption range on this timeline, when a trim cut the caption.
   * Word timing is worked out over it, so the highlight matches the preview.
   * Missing means startMs/endMs.
   */
  timingStartMs?: number;
  timingEndMs?: number;
};

export type BuildAssDocumentInput = {
  captions: readonly AssCaption[];
  style: SubtitleStyle;
  videoWidth: number;
  videoHeight: number;
  /** Logo layer. Off or missing = no logo. The logo is drawn for the whole `endMs`, even with no captions. */
  watermark?: { settings: WatermarkSettings; endMs: number };
};

const ASS_STYLE_FORMAT =
  'Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

const ASS_EVENT_FORMAT = 'Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';

/** Unstyled text style for the logo drawings: no outline, no shadow, top-left anchor (overridden per event). */
const WATERMARK_STYLE_LINE = [
  'Watermark',
  'Noto Sans',
  '20',
  '&H00FFFFFF',
  '&H000000FF',
  '&H00000000',
  '&H00000000',
  '0',
  '0',
  '0',
  '0',
  '100',
  '100',
  '0',
  '0',
  '1',
  '0',
  '0',
  '7',
  '0',
  '0',
  '0',
  '1'
].join(',');

/** Shadow alpha used when the text has a drop shadow (ASS alpha: 00 opaque, FF transparent). */
const SHADOW_ALPHA = '60';

/** Default with no box, outline or shadow: the text layer drawn over the box layer. */
const HIGHLIGHT_TEXT_STYLE = 'HighlightText';

/**
 * Builds an ASS document whose PlayRes equals the video size. Every pixel value
 * comes from `computeSubtitleGeometry`, the same function the editor preview uses.
 */
export function buildAssDocument(input: BuildAssDocumentInput): string {
  const width = Math.round(input.videoWidth);
  const height = Math.round(input.videoHeight);
  const geometry = computeSubtitleGeometry(input.style, width, height);
  const style = input.style;
  const boxed = style.backgroundEnabled;

  const outlineColour = boxed
    ? `&H${alphaByte(1 - clamp(style.backgroundOpacity, 0, 1))}${bgrHex(style.backgroundColor)}`
    : `&H00${bgrHex(style.outlineColor)}`;
  const backColour = boxed ? outlineColour : `&H${SHADOW_ALPHA}${bgrHex(style.shadowColor)}`;

  const styleLine = [
    'Default',
    style.fontFamily.replace(/,/g, ''),
    assFontSize(style, geometry).toFixed(1),
    `&H00${bgrHex(style.textColor)}`,
    '&H000000FF',
    outlineColour,
    backColour,
    style.bold ? '-1' : '0',
    style.italic ? '-1' : '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    boxed ? '3' : '1',
    boxed ? `${Math.round(geometry.boxPaddingPx)}` : geometry.outlinePx.toFixed(1),
    boxed ? '0' : geometry.shadowPx.toFixed(1),
    `${alignment(style)}`,
    `${Math.round(geometry.marginHorizontalPx)}`,
    `${Math.round(geometry.marginHorizontalPx)}`,
    `${Math.round(geometry.marginVerticalPx)}`,
    '1'
  ];

  const highlight = resolveWordHighlight(style);
  // With a box, libass draws one box per colour run, and translucent boxes of
  // neighbouring runs overlap into dark seams. So the box gets its own layer
  // (text invisible, one run) and the coloured text is drawn above it without a box.
  const layeredBox = highlight.mode !== 'off' && boxed;
  const textStyleLine = layeredBox ? [HIGHLIGHT_TEXT_STYLE, ...styleLine.slice(1, 15), '1', '0', '0', ...styleLine.slice(18)] : null;

  const logo = input.watermark ? computeWatermarkLayout(input.watermark.settings, width, height) : null;

  const captionEvents = input.captions
    .filter((caption) => caption.text.replace(/\r/g, '').trim().length > 0)
    .flatMap((caption) =>
      highlight.mode === 'off'
        ? [
            `Dialogue: 0,${formatAssTimestamp(caption.startMs)},${formatAssTimestamp(caption.endMs)},Default,,0,0,0,,${escapeAssText(caption.text)}`
          ]
        : highlightDialogues(caption, highlight, layeredBox)
    );
  const events = [...captionEvents, ...(logo && input.watermark ? watermarkDialogues(logo, input.watermark.endMs) : [])];

  return [
    '[Script Info]',
    'Title: Tajtlisha export',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    // Explicit '\N' breaks only, matching the CSS preview (white-space: pre).
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    `Format: ${ASS_STYLE_FORMAT}`,
    `Style: ${styleLine.join(',')}`,
    ...(textStyleLine ? [`Style: ${textStyleLine.join(',')}`] : []),
    ...(logo ? [`Style: ${WATERMARK_STYLE_LINE}`] : []),
    '',
    '[Events]',
    `Format: ${ASS_EVENT_FORMAT}`,
    ...events,
    ''
  ].join('\n');
}

/**
 * Logo as ASS vector drawings: background on layer 5, T badge and wordmark on
 * layer 6. libass places a drawing by its bounding box, so each shape is drawn
 * relative to its own bbox and `\pos` is that bbox's top-left corner (\an7).
 * Coordinates are quarter pixels (\p3). Verified against libass.
 */
function watermarkDialogues(logo: WatermarkLayout, endMs: number): string[] {
  const end = formatAssTimestamp(endMs);
  const alpha = alphaByte(1 - logo.opacity);
  const dialogue = (layer: number, x: number, y: number, colour: string, drawing: string): string =>
    `Dialogue: ${layer},0:00:00.00,${end},Watermark,,0,0,0,,{\\an7\\pos(${x.toFixed(2)},${y.toFixed(2)})\\1c&H${bgrHex(colour)}&\\alpha&H${alpha}&\\p3}${drawing}`;

  const { origin, width, height, radius, tRects, wordmark, colors } = logo;
  const tLeft = Math.min(...tRects.map((rect) => rect.x));
  const tTop = Math.min(...tRects.map((rect) => rect.y));

  const events = [
    dialogue(5, origin.x, origin.y, colors.background, roundedRectDrawing(width, height, radius)),
    dialogue(
      6,
      tLeft,
      tTop,
      colors.tMark,
      tRects
        .map(
          (rect) =>
            `m ${quarterPixels(rect.x - tLeft)} ${quarterPixels(rect.y - tTop)} l ${quarterPixels(rect.x + rect.width - tLeft)} ${quarterPixels(rect.y - tTop)} ${quarterPixels(rect.x + rect.width - tLeft)} ${quarterPixels(rect.y + rect.height - tTop)} ${quarterPixels(rect.x - tLeft)} ${quarterPixels(rect.y + rect.height - tTop)}`
        )
        .join(' ')
    )
  ];

  if (wordmark) {
    events.push(
      dialogue(
        6,
        wordmark.offsetX + WORDMARK.minX * wordmark.scale,
        wordmark.baselineY + WORDMARK.minY * wordmark.scale,
        colors.wordmark,
        wordmarkDrawing(wordmark.scale)
      )
    );
  }
  return events;
}

/** Rounded rectangle at 0,0 with cubic corners (control offset 0.5523 of the radius). */
function roundedRectDrawing(w: number, h: number, r: number): string {
  const c = r * (1 - 0.5523);
  const q = quarterPixels;
  return `m ${q(r)} 0 l ${q(w - r)} 0 b ${q(w - c)} 0 ${q(w)} ${q(c)} ${q(w)} ${q(r)} l ${q(w)} ${q(h - r)} b ${q(w)} ${q(h - c)} ${q(w - c)} ${q(h)} ${q(w - r)} ${q(h)} l ${q(r)} ${q(h)} b ${q(c)} ${q(h)} 0 ${q(h - c)} 0 ${q(h - r)} l 0 ${q(r)} b 0 ${q(c)} ${q(c)} 0 ${q(r)} 0`;
}

/**
 * Wordmark outlines from WORDMARK.path, moved so their bbox starts at 0,0 and
 * scaled. SVG M/L/C become ASS m/l/b; Z is dropped because ASS closes contours itself.
 */
function wordmarkDrawing(scale: number): string {
  const commands: string[] = [];
  for (const match of WORDMARK.path.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const command = match[1];
    if (command === 'Z') continue;

    const numbers = match[2].trim().split(/[\s,]+/).map(Number);
    const arity = command === 'C' ? 6 : 2;
    for (let i = 0; i + arity <= numbers.length; i += arity) {
      const points: string[] = [];
      for (let j = i; j < i + arity; j += 2) {
        points.push(`${quarterPixels((numbers[j] - WORDMARK.minX) * scale)} ${quarterPixels((numbers[j + 1] - WORDMARK.minY) * scale)}`);
      }
      const kind = command === 'C' ? 'b' : command === 'M' && i === 0 ? 'm' : 'l';
      commands.push(`${kind} ${points.join(' ')}`);
    }
  }
  return commands.join(' ');
}

/** Drawing units are quarter pixels because the tags use \p3. */
function quarterPixels(value: number): number {
  return Math.round(value * 4);
}

/**
 * One Dialogue line per stretch with a constant lit word. The Default style
 * is shared, so only the highlighted word gets an inline colour override.
 */
function highlightDialogues(caption: AssCaption, highlight: ResolvedWordHighlight, layeredBox: boolean): string[] {
  const text = caption.text.replace(/\r/g, '').trim();
  const parts = splitCaptionText(text);
  const startMs = Math.round(caption.startMs);
  const endMs = Math.round(caption.endMs);
  const colour = bgrHex(highlight.color);

  const intervals =
    caption.activeWordIndex !== undefined
      ? [{ startMs, endMs, activeIndex: caption.activeWordIndex }]
      : highlightIntervals(
          timeCaptionWords(text, caption.timingStartMs ?? startMs, caption.timingEndMs ?? endMs, caption.words).spans,
          startMs,
          endMs
        );

  const textLayer = layeredBox ? `1` : `0`;
  const textStyle = layeredBox ? HIGHLIGHT_TEXT_STYLE : 'Default';
  const dialogues = intervals.flatMap((interval) => {
    const start = formatAssTimestamp(interval.startMs);
    const end = formatAssTimestamp(interval.endMs);
    // Centisecond rounding can collapse a very short interval to nothing; skip it instead of writing an empty event.
    if (start === end) return [];

    const body = highlightedText(parts, highlight.mode, interval.activeIndex, colour);
    return [`Dialogue: ${textLayer},${start},${end},${textStyle},,0,0,0,,${body}`];
  });

  if (!layeredBox || dialogues.length === 0) return dialogues;
  const box = `Dialogue: 0,${formatAssTimestamp(startMs)},${formatAssTimestamp(endMs)},Default,,0,0,0,,{\\1a&HFF&}${escapeAssText(text)}`;
  return [box, ...dialogues];
}

function highlightedText(parts: CaptionTextPart[], mode: ResolvedWordHighlight['mode'], activeIndex: number, colour: string): string {
  return parts
    .map((part) => {
      if (part.wordIndex === null) {
        return part.text.replace(/\n/g, '\\N');
      }
      const word = escapeAssMarkup(part.text);
      return isWordHighlighted(mode, part.wordIndex, activeIndex) ? `{\\c&H${colour}&}${word}{\\r}` : word;
    })
    .join('');
}

/** H:MM:SS.cc with centiseconds, as ASS requires. */
export function formatAssTimestamp(ms: number): string {
  const centiseconds = Math.max(0, Math.round(ms / 10));
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor((centiseconds % 360_000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const hundredths = centiseconds % 100;

  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
}

/**
 * Keeps user text from being read as ASS markup: braces would start override
 * tags, a backslash would start an escape, and '\n' becomes the ASS line break.
 */
export function escapeAssText(text: string): string {
  return escapeAssMarkup(text.replace(/\r/g, '').trim()).replace(/\n/g, '\\N');
}

/** Backslash and braces are the only characters ASS reads as markup inside a line. */
function escapeAssMarkup(text: string): string {
  return text.replace(/\\/g, '⧵').replace(/\{/g, '(').replace(/\}/g, ')');
}

/** Numpad alignment: bottom 1-3, middle 4-6, top 7-9 for left, center, right. */
function alignment(style: SubtitleStyle): number {
  const column = style.align === 'left' ? 1 : style.align === 'right' ? 3 : 2;
  const row = style.position === 'top' ? 7 : style.position === 'middle' ? 4 : 1;
  return row + column - 1;
}

/** '#rrggbb' to 'BBGGRR' (ASS stores colours blue first). */
function bgrHex(hex: string): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    throw new AppError('UNKNOWN', `Invalid subtitle colour "${hex}".`);
  }

  const rgb = match[1];
  return `${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`.toUpperCase();
}

/** Transparency 0..1 (1 = fully transparent) as the two-digit ASS alpha. */
function alphaByte(transparency: number): string {
  return Math.round(clamp(transparency, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
