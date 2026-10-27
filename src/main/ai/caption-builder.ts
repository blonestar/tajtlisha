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
  /**
   * Spoken language code. Languages written without spaces (Chinese, Japanese,
   * Thai...) are split into words with Intl.Segmenter and joined without spaces.
   */
  language?: string;
};

export const MAX_CAPTION_DURATION_MS = 6000;
export const MIN_CAPTION_DURATION_MS = 700;
export const MAX_GAP_BETWEEN_WORDS_MS = 600;

/** A caption ends after sentence punctuation (optionally followed by closing quotes or brackets). */
const SENTENCE_END = /[.!?\u2026\u3002\uff01\uff1f]["'\u201d\u2019)\]\u300d\u300f\uff09]*$/;
/** Clause punctuation is a preferred cut only when a limit forces a break. */
const CLAUSE_END = /[,;:\u3001\uff0c\uff1b\uff1a]["'\u201d\u2019)\]\u300d\u300f\uff09]*$/;

/** Languages written without spaces between words (ISO 639 base codes). */
const SPACELESS_LANGUAGES = new Set(['zh', 'yue', 'ja', 'th', 'lo', 'km', 'my', 'bo']);

/**
 * How words of one language are split and joined. In spaceless scripts a word
 * that followed a space in the source keeps it as a leading ' ', so joining
 * with '' restores the original spacing.
 */
type WordScript = { joiner: string; language?: string };

function wordScript(language: string | undefined): WordScript {
  const base = language?.split('-')[0].toLowerCase();
  return base && SPACELESS_LANGUAGES.has(base) ? { joiner: '', language: base } : { joiner: ' ' };
}

export function isSpacelessLanguage(language: string | undefined): boolean {
  return wordScript(language).joiner === '';
}

type Token = {
  text: string;
  startMs: number;
  endMs: number;
};

/** Groups timed words into captions. Words are sorted and overlaps are clamped. */
export function buildCaptionsFromWords(words: TimedSpan[], options: CaptionBuildOptions): CaptionDraft[] {
  const script = wordScript(options.language);
  const normalized = normalizeTokens(words);
  // Whisper times spaceless scripts per character or fragment; regroup them into real words.
  const tokens = script.joiner === '' ? regroupSpacelessTokens(normalized, script) : normalized;
  const drafts = chunkTokens(tokens, options, true, script.joiner).map((group) => ({
    ...captionFromTokens(options, script.joiner)(group),
    words: group.map((token) => ({ text: token.text.trim(), startMs: token.startMs, endMs: token.endMs }))
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
  const script = wordScript(options.language);

  for (const segment of segments) {
    const words = splitWords(segment.text, script);
    if (words.length === 0) continue;

    const startMs = Math.max(0, Math.round(segment.startMs));
    const endMs = Math.max(startMs + 1, Math.round(segment.endMs));
    const fitsWhole = layoutLines(words, options, script.joiner) !== null && endMs - startMs <= MAX_CAPTION_DURATION_MS;

    if (fitsWhole) {
      drafts.push({ startMs, endMs, text: layoutCaptionText(words, options, script.joiner) });
      continue;
    }

    const tokens = allocateByCharacters(words, startMs, endMs);
    drafts.push(...chunkTokens(tokens, options, true, script.joiner).map(captionFromTokens(options, script.joiner)));
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
  const script = wordScript(options.language);
  const words = splitWords(text, script);
  const speech = mergeRegions(regions);
  if (words.length === 0 || speech.length === 0) return [];

  const chunks = chunkTokens(
    words.map((word) => ({ text: word, startMs: 0, endMs: 0 })),
    options,
    false,
    script.joiner
  ).map((group) => {
    const words = group.map((token) => token.text);
    return { text: layoutCaptionText(words, options, script.joiner), chars: charLength(joinWords(words, script.joiner)) };
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
 * words are never broken. `joiner` is '' for spaceless scripts.
 */
export function layoutLines(words: string[], limits: CaptionLimits, joiner = ' '): string[] | null {
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0].trim()];

  // A caption wraps only when it does not fit on one line.
  const line = joinWords(words, joiner);
  if (charLength(line) <= limits.maxCharsPerLine) return [line];
  if (limits.maxLinesPerCaption === 1) return null;

  // Two lines: pick the word boundary that makes the lines closest in length.
  let best: { index: number; difference: number } | null = null;
  for (let index = 1; index < words.length; index++) {
    const firstLength = charLength(joinWords(words.slice(0, index), joiner));
    const secondLength = charLength(joinWords(words.slice(index), joiner));
    if (firstLength > limits.maxCharsPerLine || secondLength > limits.maxCharsPerLine) continue;

    const difference = Math.abs(firstLength - secondLength);
    if (!best || difference < best.difference) {
      best = { index, difference };
    }
  }

  if (!best) return null;
  return [joinWords(words.slice(0, best.index), joiner), joinWords(words.slice(best.index), joiner)];
}

/**
 * Greedy chunking. A word is appended while the group still lays out within
 * the limits. When it does not, the group is cut at the latest clause boundary
 * that leaves at least half a line, or else where it stands. Sentence-ending
 * words always close a group. In timed mode, gaps longer than
 * MAX_GAP_BETWEEN_WORDS_MS and spans longer than MAX_CAPTION_DURATION_MS also
 * close a group.
 */
function chunkTokens(tokens: Token[], options: CaptionLimits, timed: boolean, joiner: string): Token[][] {
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

    while (current.length > 0 && !canAppend([...current, token], options, timed, joiner)) {
      flush(preferredCut(current, options, joiner));
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

function canAppend(candidate: Token[], options: CaptionLimits, timed: boolean, joiner: string): boolean {
  if (layoutLines(candidate.map((token) => token.text), options, joiner) === null) return false;
  if (timed && spanMs(candidate) > MAX_CAPTION_DURATION_MS) return false;
  return true;
}

function preferredCut(current: Token[], options: CaptionLimits, joiner: string): number {
  const minimumChars = Math.ceil(options.maxCharsPerLine / 2);

  for (let count = current.length; count >= 1; count--) {
    const prefix = current.slice(0, count);
    if (CLAUSE_END.test(current[count - 1].text) && charLength(joinWords(prefix.map((token) => token.text), joiner)) >= minimumChars) {
      return count;
    }
  }

  return current.length;
}

function captionFromTokens(options: CaptionLimits, joiner: string): (group: Token[]) => CaptionDraft {
  return (group) => ({
    startMs: group[0].startMs,
    endMs: group[group.length - 1].endMs,
    text: layoutCaptionText(group.map((token) => token.text), options, joiner)
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

function layoutCaptionText(words: string[], options: CaptionLimits, joiner: string): string {
  return (layoutLines(words, options, joiner) ?? [joinWords(words, joiner)]).join('\n');
}

function spanMs(tokens: Token[]): number {
  return tokens[tokens.length - 1].endMs - tokens[0].startMs;
}

function splitWords(text: string, script: WordScript): string[] {
  const collapsed = collapseWhitespace(text);
  if (script.joiner !== '') return collapsed.split(' ').filter((word) => word.length > 0);
  return segmentSpaceless(collapsed, script.language).map((piece) => piece.text);
}

/** Joins words into one line. Leading spaces kept by spaceless scripts never start or end a line. */
function joinWords(words: string[], joiner: string): string {
  return words.join(joiner).trim();
}

type SpacelessPiece = { text: string; start: number; end: number };

/**
 * Splits spaceless text into words with Intl.Segmenter. Punctuation sticks to
 * the word before it, and a word after a space keeps one leading ' '.
 * start/end are UTF-16 offsets into `text`.
 */
function segmentSpaceless(text: string, language: string | undefined): SpacelessPiece[] {
  const pieces: SpacelessPiece[] = [];
  let spaceBefore = false;
  for (const { segment, index, isWordLike } of new Intl.Segmenter(language, { granularity: 'word' }).segment(text)) {
    if (/^\s+$/.test(segment)) {
      spaceBefore = pieces.length > 0;
      continue;
    }

    const last = pieces[pieces.length - 1];
    if (!isWordLike && !spaceBefore && last) {
      last.text += segment;
      last.end = index + segment.length;
      continue;
    }

    pieces.push({ text: spaceBefore ? ` ${segment}` : segment, start: index, end: index + segment.length });
    spaceBefore = false;
  }
  return pieces;
}

/**
 * Regroups character or fragment tokens of a spaceless script into words.
 * Each word takes the start of its first fragment and the end of its last.
 */
function regroupSpacelessTokens(tokens: Token[], script: WordScript): Token[] {
  if (tokens.length === 0) return tokens;

  let text = '';
  const owner: number[] = [];
  tokens.forEach((token, tokenIndex) => {
    text += token.text;
    for (let offset = 0; offset < token.text.length; offset++) owner.push(tokenIndex);
  });

  return segmentSpaceless(text, script.language).map((piece) => ({
    text: piece.text,
    startMs: tokens[owner[piece.start]].startMs,
    endMs: tokens[owner[piece.end - 1]].endMs
  }));
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Hangul, CJK ideographs, kana and fullwidth forms take about two Latin characters of width. */
const WIDE_CHARACTER = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u;

/**
 * Line width in Latin-character units: one per code point (so Cyrillic and
 * combining characters count once), two for wide East Asian characters.
 */
function charLength(text: string): number {
  let width = 0;
  for (const character of text) width += WIDE_CHARACTER.test(character) ? 2 : 1;
  return width;
}
