import type { CaptionWord } from './types/project';
import type { SubtitleStyle, WordHighlightMode } from './types/style';

/**
 * Word-by-word highlight (karaoke) shared by the editor preview and the ASS
 * export, so both pick the same word at the same moment.
 *
 * Flow: `splitCaptionText` cuts the caption into word and separator parts,
 * `timeCaptionWords` gives every word a time span, and `activeWordIndex` /
 * `highlightIntervals` turn those spans into "which word is lit now". A word
 * stays lit from its start until the next word starts, so short pauses do not
 * flicker.
 */

export const DEFAULT_HIGHLIGHT_COLOR = '#ffd400';

export type ResolvedWordHighlight = {
  mode: WordHighlightMode;
  color: string;
};

/** Fills in the defaults for the optional highlight fields of a style. */
export function resolveWordHighlight(style: SubtitleStyle): ResolvedWordHighlight {
  const mode = style.wordHighlight ?? 'off';
  const color = style.highlightColor && /^#[0-9a-fA-F]{6}$/.test(style.highlightColor) ? style.highlightColor : DEFAULT_HIGHLIGHT_COLOR;
  return { mode, color };
}

export type CaptionTextPart = {
  text: string;
  /** Index among the caption's words, or null for whitespace and line breaks. */
  wordIndex: number | null;
};

/**
 * Splits caption text into alternating word and whitespace parts. Joining every
 * part's text gives the input back unchanged, so layout ('\n' breaks, spaces)
 * is kept exactly.
 */
export function splitCaptionText(text: string): CaptionTextPart[] {
  const parts: CaptionTextPart[] = [];
  let wordIndex = 0;
  for (const match of text.matchAll(/\s+|\S+/g)) {
    const piece = match[0];
    if (/^\s/.test(piece)) {
      parts.push({ text: piece, wordIndex: null });
    } else {
      parts.push({ text: piece, wordIndex: wordIndex++ });
    }
  }
  return parts;
}

/** Number of words in caption text, as counted by `splitCaptionText`. */
export function countCaptionWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

export type WordSpan = {
  startMs: number;
  endMs: number;
};

export type CaptionWordTiming = {
  /** One span per word of the text, in order, inside [startMs, endMs] of the caption. */
  spans: WordSpan[];
  /** True when every word took its time from a matching timed word. */
  exact: boolean;
};

/**
 * Gives each word of `text` a time span inside the caption.
 *
 * Words that match a timed word (compared without case and punctuation, in
 * order) keep that word's time. The rest share the gap between their matched
 * neighbours by character count. With no timed words the whole caption is
 * shared out that way, which is what the translation track and captions made
 * without word timing get.
 */
export function timeCaptionWords(
  text: string,
  startMs: number,
  endMs: number,
  words?: readonly CaptionWord[]
): CaptionWordTiming {
  const tokens = text.match(/\S+/g) ?? [];
  if (tokens.length === 0) return { spans: [], exact: false };

  const captionStart = Math.round(startMs);
  const captionEnd = Math.max(captionStart, Math.round(endMs));
  const timed = normalizeTimedWords(words ?? [], captionStart, captionEnd);
  const matches = alignWords(tokens.map(normalizeWord), timed.map((word) => normalizeWord(word.text)));

  const spans: Array<WordSpan | null> = tokens.map(() => null);
  for (const [tokenIndex, wordIndex] of matches) {
    spans[tokenIndex] = { startMs: timed[wordIndex].startMs, endMs: timed[wordIndex].endMs };
  }

  // Share each run of unmatched words over the gap between its matched neighbours.
  let index = 0;
  while (index < tokens.length) {
    if (spans[index]) {
      index++;
      continue;
    }
    const runStart = index;
    while (index < tokens.length && !spans[index]) index++;
    const before = runStart > 0 ? spans[runStart - 1] : null;
    const after = index < tokens.length ? spans[index] : null;
    const from = before ? before.endMs : captionStart;
    const to = Math.max(from, after ? after.startMs : captionEnd);
    const allocated = allocateByCharacters(tokens.slice(runStart, index), from, to);
    allocated.forEach((span, offset) => {
      spans[runStart + offset] = span;
    });
  }

  const exact = matches.length === tokens.length && timed.length === tokens.length;
  return { spans: spans as WordSpan[], exact };
}

/**
 * Index of the lit word at `ms`: the last word that has started. -1 before the
 * first word starts (or when there are no words).
 */
export function activeWordIndex(spans: readonly WordSpan[], ms: number): number {
  let active = -1;
  for (let index = 0; index < spans.length; index++) {
    if (spans[index].startMs <= ms) active = index;
    else break;
  }
  return active;
}

/** Whether the word at `wordIndex` is drawn in the highlight color. */
export function isWordHighlighted(mode: WordHighlightMode, wordIndex: number, activeIndex: number): boolean {
  if (mode === 'word') return wordIndex === activeIndex;
  if (mode === 'progressive') return wordIndex <= activeIndex;
  return false;
}

export type HighlightInterval = {
  startMs: number;
  endMs: number;
  /** Lit word index during the interval, -1 for none. */
  activeIndex: number;
};

/**
 * Cuts the caption into back-to-back intervals with a constant lit word. They
 * cover [captionStart, captionEnd) exactly; empty intervals are dropped. The
 * ASS export writes one event per interval.
 */
export function highlightIntervals(spans: readonly WordSpan[], captionStart: number, captionEnd: number): HighlightInterval[] {
  const intervals: HighlightInterval[] = [];
  let cursor = captionStart;
  let active = -1;

  for (let index = 0; index < spans.length; index++) {
    const start = Math.min(captionEnd, Math.max(cursor, spans[index].startMs));
    if (start > cursor) {
      intervals.push({ startMs: cursor, endMs: start, activeIndex: active });
      cursor = start;
    }
    active = index;
  }

  if (captionEnd > cursor) {
    intervals.push({ startMs: cursor, endMs: captionEnd, activeIndex: active });
  }
  return intervals;
}

/** Shifts word times by `deltaMs`, never below 0. */
export function shiftCaptionWords(words: readonly CaptionWord[], deltaMs: number): CaptionWord[] {
  return words.map((word) => ({
    text: word.text,
    startMs: Math.max(0, word.startMs + deltaMs),
    endMs: Math.max(0, word.endMs + deltaMs)
  }));
}

/** Lowercase letters and digits only, so "Hello," matches "hello". */
function normalizeWord(word: string): string {
  return word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Sorted, clamped to the caption, never overlapping, empty texts removed. */
function normalizeTimedWords(words: readonly CaptionWord[], captionStart: number, captionEnd: number): CaptionWord[] {
  const sorted = words
    .filter((word) => word.text.trim().length > 0 && Number.isFinite(word.startMs) && Number.isFinite(word.endMs))
    .map((word) => ({
      text: word.text,
      startMs: clampMs(word.startMs, captionStart, captionEnd),
      endMs: clampMs(word.endMs, captionStart, captionEnd)
    }))
    .sort((a, b) => a.startMs - b.startMs);

  let previousEnd = captionStart;
  return sorted.map((word) => {
    const startMs = Math.max(word.startMs, previousEnd);
    const endMs = Math.max(word.endMs, startMs);
    previousEnd = endMs;
    return { text: word.text, startMs, endMs };
  });
}

/**
 * Longest common subsequence of the normalized words. Returns matched
 * [tokenIndex, timedIndex] pairs in order. Empty normalized words (pure
 * punctuation) never match. Captions are short, so O(n*m) is fine.
 */
function alignWords(tokens: string[], timed: string[]): Array<[number, number]> {
  const rows = tokens.length;
  const cols = timed.length;
  if (rows === 0 || cols === 0) return [];

  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] =
        tokens[i] !== '' && tokens[i] === timed[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (tokens[i] !== '' && tokens[i] === timed[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/** Splits [from, to] across words in proportion to their length. Neighbours share boundaries. */
function allocateByCharacters(tokens: string[], from: number, to: number): WordSpan[] {
  const weights = tokens.map((token) => Array.from(token).length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = Math.max(0, to - from);
  let cursor = from;
  let consumed = 0;

  return tokens.map((_, index) => {
    consumed += weights[index];
    const end = index === tokens.length - 1 ? to : Math.round(from + (duration * consumed) / total);
    const span = { startMs: cursor, endMs: Math.max(cursor, end) };
    cursor = span.endMs;
    return span;
  });
}

function clampMs(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
