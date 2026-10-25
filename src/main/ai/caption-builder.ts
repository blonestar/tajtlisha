/**
 * Pure caption layout. Turns timed words, timed segments, or plain text plus
 * speech regions into caption drafts that respect the line and duration limits.
 * Times are milliseconds relative to the audio the provider was given; the
 * workflow offsets them into source time.
 */

export type TimedSpan = {
  text: string;
  startMs: number;
  endMs: number;
};

export type SpeechRegion = {
  startMs: number;
  endMs: number;
};

export type CaptionDraft = {
  startMs: number;
  endMs: number;
  text: string;
  /**
   * Timed words of `text`, sorted and inside [startMs, endMs]. Only word-timed
   * transcription sets them; segment and speech-detection drafts have none.
   */
  words?: TimedSpan[];
};

export type CaptionLimits = {
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type CaptionBuildOptions = CaptionLimits & {
  /** Clip length in ms. Captions never extend past it. */
  clipDurationMs?: number;
};

export const MAX_CAPTION_DURATION_MS = 6000;
export const MIN_CAPTION_DURATION_MS = 700;
export const MAX_GAP_BETWEEN_WORDS_MS = 600;

/** A caption ends after sentence punctuation (optionally followed by closing quotes or brackets). */
const SENTENCE_END = /[.!?\u2026]["'\u201d\u2019)\]]*$/;
/** Clause punctuation is a preferred cut only when a limit forces a break. */
const CLAUSE_END = /[,;:]["'\u201d\u2019)\]]*$/;

type Token = {
  text: string;
  startMs: number;
  endMs: number;
};

/** Groups timed words into captions. Words are sorted and overlaps are clamped. */
export function buildCaptionsFromWords(words: TimedSpan[], options: CaptionBuildOptions): CaptionDraft[] {
  const tokens = normalizeTokens(words);
  const drafts = chunkTokens(tokens, options, true).map((group) => ({
    ...captionFromTokens(options)(group),
    words: group.map((token) => ({ text: token.text, startMs: token.startMs, endMs: token.endMs }))
  }));
  return finalizeDrafts(drafts, options);
}

/**
 * Keeps a segment as one caption when it fits the limits. Otherwise splits it
 * at word boundaries, allocating its time to words by character count.
 * Segments never merge into each other.
 */
export function buildCaptionsFromSegments(segments: TimedSpan[], options: CaptionBuildOptions): CaptionDraft[] {
  const drafts: CaptionDraft[] = [];

  for (const segment of segments) {
    const words = splitWords(segment.text);
    if (words.length === 0) continue;

    const startMs = Math.max(0, Math.round(segment.startMs));
    const endMs = Math.max(startMs + 1, Math.round(segment.endMs));
    const fitsWhole = layoutLines(words, options) !== null && endMs - startMs <= MAX_CAPTION_DURATION_MS;

    if (fitsWhole) {
      drafts.push({ startMs, endMs, text: layoutCaptionText(words, options) });
      continue;
    }

    const tokens = allocateByCharacters(words, startMs, endMs);
    drafts.push(...chunkTokens(tokens, options, true).map(captionFromTokens(options)));
  }

  return finalizeDrafts(drafts, options);
}

/**
 * Provider returned text without timing. Splits the text into caption-sized
 * chunks and places each chunk inside one speech region, so no caption spans
 * a silent gap. Chunks are assigned to regions in proportion to region length.
 */
export function buildCaptionsFromSpeechRegions(
  text: string,
  regions: SpeechRegion[],
  options: CaptionBuildOptions
): CaptionDraft[] {
  const words = splitWords(text);
  const speech = mergeRegions(regions);
  if (words.length === 0 || speech.length === 0) return [];

  const chunks = chunkTokens(
    words.map((word) => ({ text: word, startMs: 0, endMs: 0 })),
    options,
    false
  ).map((group) => {
    const words = group.map((token) => token.text);
    return { text: layoutCaptionText(words, options), chars: charLength(words.join(' ')) };
  });

  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.chars, 0);
  const totalDurationMs = speech.reduce((sum, region) => sum + (region.endMs - region.startMs), 0);

  // Each region owns a slice of the character stream proportional to its duration.
  // A chunk belongs to the region that contains its character midpoint.
  const regionCharEnds: number[] = [];
  let budget = 0;
  for (const region of speech) {
    budget += (totalChars * (region.endMs - region.startMs)) / totalDurationMs;
    regionCharEnds.push(budget);
  }

  const assigned: Array<typeof chunks> = speech.map(() => []);
  let cursor = 0;
  for (const chunk of chunks) {
    const midpoint = cursor + chunk.chars / 2;
    cursor += chunk.chars;
    const index = regionCharEnds.findIndex((end) => midpoint <= end);
    assigned[index === -1 ? speech.length - 1 : index].push(chunk);
  }

  const drafts: CaptionDraft[] = [];
  speech.forEach((region, index) => {
    const regionChunks = assigned[index];
    const regionChars = regionChunks.reduce((sum, chunk) => sum + chunk.chars, 0);
    if (regionChars === 0) return;

    const durationMs = region.endMs - region.startMs;
    let consumed = 0;
    for (const chunk of regionChunks) {
      const startMs = region.startMs + Math.round((durationMs * consumed) / regionChars);
      consumed += chunk.chars;
      const endMs = region.startMs + Math.round((durationMs * consumed) / regionChars);
      drafts.push({ startMs, endMs, text: chunk.text });
    }
  });

  return finalizeDrafts(drafts, options);
}

/**
 * Line layout for one caption. Returns null when the words do not fit within
 * maxLinesPerCaption lines of maxCharsPerLine. A single word always fits, since
 * words are never broken.
 */
export function layoutLines(words: string[], limits: CaptionLimits): string[] | null {
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0]];

  // A caption wraps only when it does not fit on one line.
  const line = words.join(' ');
  if (charLength(line) <= limits.maxCharsPerLine) return [line];
  if (limits.maxLinesPerCaption === 1) return null;

  // Two lines: pick the word boundary that makes the lines closest in length.
  let best: { index: number; difference: number } | null = null;
  for (let index = 1; index < words.length; index++) {
    const firstLength = charLength(words.slice(0, index).join(' '));
    const secondLength = charLength(words.slice(index).join(' '));
    if (firstLength > limits.maxCharsPerLine || secondLength > limits.maxCharsPerLine) continue;

    const difference = Math.abs(firstLength - secondLength);
    if (!best || difference < best.difference) {
      best = { index, difference };
    }
  }

  if (!best) return null;
  return [words.slice(0, best.index).join(' '), words.slice(best.index).join(' ')];
}

/**
 * Greedy chunking. A word is appended while the group still lays out within
 * the limits. When it does not, the group is cut at the latest clause boundary
 * that leaves at least half a line, or else where it stands. Sentence-ending
 * words always close a group. In timed mode, gaps longer than
 * MAX_GAP_BETWEEN_WORDS_MS and spans longer than MAX_CAPTION_DURATION_MS also
 * close a group.
 */
function chunkTokens(tokens: Token[], options: CaptionLimits, timed: boolean): Token[][] {
  const groups: Token[][] = [];
  let current: Token[] = [];

  const flush = (count: number): void => {
    groups.push(current.slice(0, count));
    current = current.slice(count);
  };

  for (const token of tokens) {
    if (timed && current.length > 0 && token.startMs - current[current.length - 1].endMs > MAX_GAP_BETWEEN_WORDS_MS) {
      flush(current.length);
    }

    while (current.length > 0 && !canAppend([...current, token], options, timed)) {
      flush(preferredCut(current, options));
    }

    current.push(token);
    if (SENTENCE_END.test(token.text)) {
      flush(current.length);
    }
  }

  if (current.length > 0) {
    flush(current.length);
  }

  return groups;
}

function canAppend(candidate: Token[], options: CaptionLimits, timed: boolean): boolean {
  if (layoutLines(candidate.map((token) => token.text), options) === null) return false;
  if (timed && spanMs(candidate) > MAX_CAPTION_DURATION_MS) return false;
  return true;
}

function preferredCut(current: Token[], options: CaptionLimits): number {
  const minimumChars = Math.ceil(options.maxCharsPerLine / 2);

  for (let count = current.length; count >= 1; count--) {
    const prefix = current.slice(0, count);
    if (CLAUSE_END.test(current[count - 1].text) && charLength(joinTexts(prefix)) >= minimumChars) {
      return count;
    }
  }

  return current.length;
}

function captionFromTokens(options: CaptionLimits): (group: Token[]) => CaptionDraft {
  return (group) => ({
    startMs: group[0].startMs,
    endMs: group[group.length - 1].endMs,
    text: layoutCaptionText(group.map((token) => token.text), options)
  });
}

/**
 * Enforces the minimum caption duration by extending into following silence,
 * never past the next caption's start. Also sorts, removes overlaps, and clamps
 * to the clip length.
 */
function finalizeDrafts(drafts: CaptionDraft[], options: CaptionBuildOptions): CaptionDraft[] {
  const sorted = [...drafts].sort((a, b) => a.startMs - b.startMs);
  const clipDurationMs = options.clipDurationMs;
  const result: CaptionDraft[] = [];

  sorted.forEach((draft, index) => {
    const nextStartMs = sorted[index + 1]?.startMs ?? clipDurationMs ?? Number.POSITIVE_INFINITY;
    const startMs = clipDurationMs === undefined ? draft.startMs : Math.min(draft.startMs, clipDurationMs);
    let endMs = draft.endMs;

    if (endMs - startMs < MIN_CAPTION_DURATION_MS) {
      endMs = Math.max(endMs, Math.min(startMs + MIN_CAPTION_DURATION_MS, nextStartMs));
    }

    endMs = Math.min(endMs, nextStartMs);
    if (clipDurationMs !== undefined) {
      endMs = Math.min(endMs, clipDurationMs);
    }

    if (endMs > startMs) {
      result.push({
        startMs,
        endMs,
        text: draft.text,
        ...(draft.words ? { words: clampWords(draft.words, startMs, endMs) } : {})
      });
    }
  });

  return result;
}

/** Keeps word times inside the final caption range. Clamping never reorders sorted words. */
function clampWords(words: TimedSpan[], startMs: number, endMs: number): TimedSpan[] {
  const clamp = (value: number): number => Math.min(endMs, Math.max(startMs, value));
  return words.map((word) => {
    const wordStart = clamp(word.startMs);
    return { text: word.text, startMs: wordStart, endMs: Math.max(wordStart, clamp(word.endMs)) };
  });
}

function normalizeTokens(words: TimedSpan[]): Token[] {
  const sorted = words
    .map((word) => ({
      text: collapseWhitespace(word.text),
      startMs: Math.max(0, Math.round(word.startMs)),
      endMs: Math.max(0, Math.round(word.endMs))
    }))
    .filter((word) => word.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs);

  let previousEnd = 0;
  return sorted.map((word) => {
    const startMs = Math.max(word.startMs, previousEnd);
    const endMs = Math.max(word.endMs, startMs);
    previousEnd = endMs;
    return { text: word.text, startMs, endMs };
  });
}

/** Splits word times across the text proportionally to character count. Consecutive words share boundaries. */
function allocateByCharacters(words: string[], startMs: number, endMs: number): Token[] {
  const weights = words.map((word) => charLength(word) + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const span = endMs - startMs;
  let accumulated = 0;

  return words.map((text, index) => {
    const tokenStart = startMs + Math.round((span * accumulated) / total);
    accumulated += weights[index];
    const tokenEnd = startMs + Math.round((span * accumulated) / total);
    return { text, startMs: tokenStart, endMs: tokenEnd };
  });
}

function mergeRegions(regions: SpeechRegion[]): SpeechRegion[] {
  const sorted = regions
    .map((region) => ({ startMs: Math.max(0, Math.round(region.startMs)), endMs: Math.round(region.endMs) }))
    .filter((region) => region.endMs > region.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: SpeechRegion[] = [];
  for (const region of sorted) {
    const last = merged[merged.length - 1];
    if (last && region.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, region.endMs);
    } else {
      merged.push({ ...region });
    }
  }

  return merged;
}

function layoutCaptionText(words: string[], options: CaptionLimits): string {
  return (layoutLines(words, options) ?? [words.join(' ')]).join('\n');
}

function spanMs(tokens: Token[]): number {
  return tokens[tokens.length - 1].endMs - tokens[0].startMs;
}

function splitWords(text: string): string[] {
  return collapseWhitespace(text).split(' ').filter((word) => word.length > 0);
}

function joinTexts(tokens: Token[]): string {
  return tokens.map((token) => token.text).join(' ');
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Length in Unicode code points, so Cyrillic and combining characters count once. */
function charLength(text: string): number {
  return [...text].length;
}
