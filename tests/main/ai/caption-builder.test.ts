import { describe, expect, it } from 'vitest';
import {
  buildCaptionsFromSegments,
  buildCaptionsFromSpeechRegions,
  buildCaptionsFromWords,
  layoutLines,
  MAX_CAPTION_DURATION_MS,
  MIN_CAPTION_DURATION_MS,
  type CaptionBuildOptions,
  type CaptionDraft,
  type TimedSpan
} from '../../../src/main/ai/caption-builder';

// Serbian Cyrillic 'Zdravo' and 'svete', written as escapes to keep the file ASCII.
const CYR_HELLO = '\u0417\u0434\u0440\u0430\u0432\u043e';
const CYR_WORLD = '\u0441\u0432\u0435\u0442\u0435';
const oneLine = (maxCharsPerLine: number): CaptionBuildOptions => ({ maxCharsPerLine, maxLinesPerCaption: 1 });
const twoLines = (maxCharsPerLine: number): CaptionBuildOptions => ({ maxCharsPerLine, maxLinesPerCaption: 2 });

/** Words spaced `stepMs` apart, each lasting `wordMs`. */
function timedWords(text: string, stepMs: number, wordMs = stepMs / 2): TimedSpan[] {
  return text.split(' ').map((word, index) => ({
    text: word,
    startMs: index * stepMs,
    endMs: index * stepMs + wordMs
  }));
}

function expectValidCaptions(captions: CaptionDraft[]): void {
  for (let index = 0; index < captions.length; index++) {
    const caption = captions[index];
    expect(caption.endMs).toBeGreaterThan(caption.startMs);
    if (index > 0) {
      expect(caption.startMs).toBeGreaterThanOrEqual(captions[index - 1].endMs);
    }
  }
}

describe('layoutLines', () => {
  it('keeps text on one line when it fits and wraps only when it does not', () => {
    expect(layoutLines(['short', 'phrase'], twoLines(42))).toEqual(['short phrase']);
  });

  it('splits two lines at the word boundary closest to the middle', () => {
    // Candidate splits: 5|24 (too long), 10|19 (diff 9), 16|13 (diff 3), 22|7 (too long).
    expect(layoutLines(['alpha', 'beta', 'gamma', 'delta', 'epsilon'], twoLines(20))).toEqual([
      'alpha beta gamma',
      'delta epsilon'
    ]);
  });

  it('returns null when words cannot fit within the allowed lines', () => {
    expect(layoutLines(['one', 'two', 'three', 'four'], oneLine(7))).toBeNull();
    expect(layoutLines(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'], twoLines(8))).toBeNull();
  });

  it('keeps a single over-long word on its own line instead of breaking it', () => {
    expect(layoutLines(['Supercalifragilistic'], oneLine(5))).toEqual(['Supercalifragilistic']);
  });

  it('counts Cyrillic characters as one character each', () => {
    expect(layoutLines([CYR_HELLO, CYR_WORLD], oneLine(12))).toEqual([`${CYR_HELLO} ${CYR_WORLD}`]);
    expect(layoutLines([CYR_HELLO, CYR_WORLD], oneLine(11))).toBeNull();
  });
});

describe('buildCaptionsFromWords', () => {
  it('returns one caption with no line break for a short phrase', () => {
    // Words start at 0, 400, 800 and last 200 ms each, so the caption ends at 1000.
    const captions = buildCaptionsFromWords(timedWords('Good morning everyone', 400), twoLines(42));

    expect(withoutWords(captions)).toEqual([{ startMs: 0, endMs: 1000, text: 'Good morning everyone' }]);
  });

  it('never lets a line exceed maxCharsPerLine with one line per caption', () => {
    const words = 'the quick brown fox jumps over the lazy dog while the cat watches from the window sill quietly'.split(' ');
    const captions = buildCaptionsFromWords(timedWords(words.join(' '), 300), oneLine(16));

    expect(captions.length).toBeGreaterThan(1);
    for (const caption of captions) {
      expect(caption.text.split('\n')).toHaveLength(1);
      expect(caption.text.length).toBeLessThanOrEqual(16);
    }
    expect(captions.map((caption) => caption.text).join(' ')).toBe(words.join(' '));
  });

  it('balances two lines inside one caption and joins them with a newline', () => {
    const captions = buildCaptionsFromWords(timedWords('alpha beta gamma delta epsilon zeta', 200), twoLines(20));

    const wrapped = captions.find((caption) => caption.text.includes('\n'));
    expect(wrapped).toBeDefined();
    const [first, second] = (wrapped as CaptionDraft).text.split('\n');
    expect(first.length).toBeLessThanOrEqual(20);
    expect(second.length).toBeLessThanOrEqual(20);
    expect(Math.abs(first.length - second.length)).toBeLessThanOrEqual('epsilon'.length);
  });

  it('breaks after sentence punctuation even when there is room', () => {
    const captions = buildCaptionsFromWords(timedWords('Hello there. How are you?', 300), twoLines(42));

    expect(captions.map((caption) => caption.text)).toEqual(['Hello there.', 'How are you?']);
  });

  it('prefers a comma break when a limit forces a cut', () => {
    const captions = buildCaptionsFromWords(
      timedWords('I went to the store, and then I bought some milk and eggs today', 250),
      oneLine(20)
    );

    expect(captions[0].text).toBe('I went to the store,');
  });

  it('starts a new caption after a silence longer than 600 ms', () => {
    const captions = buildCaptionsFromWords(
      [
        { text: 'First', startMs: 0, endMs: 300 },
        { text: 'part', startMs: 400, endMs: 700 },
        { text: 'Second', startMs: 1800, endMs: 2100 }
      ],
      twoLines(42)
    );

    expect(captions.map((caption) => caption.text)).toEqual(['First part', 'Second']);
    expect(captions[0].endMs).toBe(700);
    expect(captions[1].startMs).toBe(1800);
  });

  it('caps caption duration at 6000 ms', () => {
    const captions = buildCaptionsFromWords(timedWords(Array.from({ length: 30 }, (_, i) => `w${i}`).join(' '), 1000), twoLines(200));

    expect(captions.length).toBeGreaterThanOrEqual(5);
    for (const caption of captions) {
      expect(caption.endMs - caption.startMs).toBeLessThanOrEqual(MAX_CAPTION_DURATION_MS);
    }
  });

  it('extends a short caption into following silence but never past the next caption', () => {
    const captions = buildCaptionsFromWords(
      [
        { text: 'Hi', startMs: 0, endMs: 200 },
        { text: 'there', startMs: 1000, endMs: 1500 }
      ],
      twoLines(42)
    );

    expect(captions[0]).toMatchObject({ startMs: 0, endMs: 700 });
    expect(captions[1]).toMatchObject({ startMs: 1000, endMs: 1000 + MIN_CAPTION_DURATION_MS });
  });

  it('extends a short caption without overlapping the next one when the gap is small', () => {
    const captions = buildCaptionsFromWords(
      [
        { text: 'Quick', startMs: 0, endMs: 100 },
        { text: 'gap', startMs: 500, endMs: 900 },
        { text: 'after', startMs: 1300, endMs: 1800 }
      ],
      oneLine(5)
    );

    expectValidCaptions(captions);
    expect(captions[0].endMs).toBeLessThanOrEqual(captions[1].startMs);
  });

  it('keeps captions sorted and non-overlapping even when input is unsorted or overlapping', () => {
    const captions = buildCaptionsFromWords(
      [
        { text: 'c', startMs: 2000, endMs: 2400 },
        { text: 'a', startMs: 0, endMs: 900 },
        { text: 'b', startMs: 800, endMs: 1500 }
      ],
      twoLines(42)
    );

    expectValidCaptions(captions);
    expect(captions.map((caption) => caption.text).join(' ')).toBe('a b c');
  });

  it('clamps the last caption to the clip duration', () => {
    const captions = buildCaptionsFromWords(
      [{ text: 'Late', startMs: 0, endMs: 500 }],
      { ...twoLines(42), clipDurationMs: 600 }
    );

    expect(withoutWords(captions)).toEqual([{ startMs: 0, endMs: 600, text: 'Late' }]);
  });

  it('drops empty words and returns nothing for empty input', () => {
    expect(buildCaptionsFromWords([], twoLines(42))).toEqual([]);
    expect(buildCaptionsFromWords([{ text: '   ', startMs: 0, endMs: 100 }], twoLines(42))).toEqual([]);
  });
});

describe('word timing on drafts', () => {
  it('attaches each caption its own words, sorted and inside the caption', () => {
    const captions = buildCaptionsFromWords(timedWords('Good morning everyone', 400), twoLines(42));

    expect(captions[0].words).toEqual([
      { text: 'Good', startMs: 0, endMs: 200 },
      { text: 'morning', startMs: 400, endMs: 600 },
      { text: 'everyone', startMs: 800, endMs: 1000 }
    ]);
  });

  it('keeps word times inside the caption after the clip clamp', () => {
    const captions = buildCaptionsFromWords(
      [
        { text: 'Late', startMs: 0, endMs: 500 },
        { text: 'again', startMs: 550, endMs: 900 }
      ],
      { ...twoLines(42), clipDurationMs: 600 }
    );

    expect(captions).toEqual([
      {
        startMs: 0,
        endMs: 600,
        text: 'Late again',
        words: [
          { text: 'Late', startMs: 0, endMs: 500 },
          { text: 'again', startMs: 550, endMs: 600 }
        ]
      }
    ]);
  });

  it('gives segment and speech-detection drafts no words', () => {
    const fromSegments = buildCaptionsFromSegments([{ text: 'Hello world', startMs: 0, endMs: 1500 }], twoLines(42));
    const fromSpeech = buildCaptionsFromSpeechRegions('Hello world again', [{ startMs: 0, endMs: 2000 }], twoLines(42));

    for (const caption of [...fromSegments, ...fromSpeech]) {
      expect(caption).not.toHaveProperty('words');
    }
  });
});

/** Drops word timing so the grouping and timing of a draft can be compared exactly. */
function withoutWords(captions: CaptionDraft[]): Omit<CaptionDraft, 'words'>[] {
  return captions.map(({ words: _words, ...caption }) => caption);
}

describe('buildCaptionsFromSegments', () => {
  it('keeps a segment that fits the limits as a single caption', () => {
    const captions = buildCaptionsFromSegments([{ text: 'Hello world', startMs: 0, endMs: 1500 }], twoLines(42));

    expect(captions).toEqual([{ startMs: 0, endMs: 1500, text: 'Hello world' }]);
  });

  it('does not merge separate segments', () => {
    const captions = buildCaptionsFromSegments(
      [
        { text: 'Hi', startMs: 0, endMs: 300 },
        { text: 'Yo', startMs: 300, endMs: 600 }
      ],
      twoLines(42)
    );

    expect(captions.map((caption) => caption.text)).toEqual(['Hi', 'Yo']);
  });

  it('splits a long segment at word boundaries and allocates time by character count', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve';
    const captions = buildCaptionsFromSegments([{ text, startMs: 0, endMs: 12000 }], oneLine(16));

    expect(captions.length).toBeGreaterThan(2);
    for (const caption of captions) {
      expect(caption.text.length).toBeLessThanOrEqual(16);
    }
    expect(captions.map((caption) => caption.text).join(' ')).toBe(text);
    expect(captions[0].startMs).toBe(0);
    expect(captions[captions.length - 1].endMs).toBe(12000);
    expectValidCaptions(captions);

    const longest = captions.reduce((best, caption) => (caption.text.length > best.text.length ? caption : best));
    const shortest = captions.reduce((best, caption) => (caption.text.length < best.text.length ? caption : best));
    expect(longest.endMs - longest.startMs).toBeGreaterThanOrEqual(shortest.endMs - shortest.startMs);
  });

  it('skips blank segments', () => {
    expect(buildCaptionsFromSegments([{ text: '  ', startMs: 0, endMs: 1000 }], twoLines(42))).toEqual([]);
  });
});

describe('buildCaptionsFromSpeechRegions', () => {
  const text = 'one two three four five six seven eight';

  it('places every caption inside one speech region and keeps the text in order', () => {
    const regions = [
      { startMs: 0, endMs: 2000 },
      { startMs: 5000, endMs: 8000 }
    ];
    const captions = buildCaptionsFromSpeechRegions(text, regions, oneLine(15));

    expect(captions.map((caption) => caption.text.replace('\n', ' ')).join(' ')).toBe(text);
    for (const caption of captions) {
      const insideOne = regions.some((region) => caption.startMs >= region.startMs && caption.endMs <= region.endMs);
      expect(insideOne).toBe(true);
    }
    expectValidCaptions(captions);
    expect(captions.some((caption) => caption.startMs >= 5000)).toBe(true);
  });

  it('returns nothing without speech regions or text', () => {
    expect(buildCaptionsFromSpeechRegions(text, [], oneLine(15))).toEqual([]);
    expect(buildCaptionsFromSpeechRegions('   ', [{ startMs: 0, endMs: 1000 }], oneLine(15))).toEqual([]);
  });

  it('merges overlapping regions before distributing text', () => {
    const captions = buildCaptionsFromSpeechRegions(
      'alpha beta',
      [
        { startMs: 0, endMs: 1000 },
        { startMs: 500, endMs: 1500 }
      ],
      twoLines(42)
    );

    expect(captions).toEqual([{ startMs: 0, endMs: 1500, text: 'alpha beta' }]);
  });
});
