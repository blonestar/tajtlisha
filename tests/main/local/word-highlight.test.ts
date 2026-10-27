import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  activeWordIndex,
  countCaptionWords,
  highlightIntervals,
  isWordHighlighted,
  matchedCaptionWords,
  resolveWordHighlight,
  shiftCaptionWords,
  splitCaptionText,
  timeCaptionWords
} from '../../../src/shared/word-highlight';

const words = (...items: Array<[string, number, number]>) =>
  items.map(([text, startMs, endMs]) => ({ text, startMs, endMs }));

describe('word highlight', () => {
  it('resolves defaults for styles saved before the feature', () => {
    const { wordHighlight: _mode, highlightColor: _color, ...legacy } = DEFAULT_SUBTITLE_STYLE;
    expect(resolveWordHighlight(legacy)).toEqual({ mode: 'off', color: DEFAULT_HIGHLIGHT_COLOR });
    expect(resolveWordHighlight({ ...legacy, wordHighlight: 'word', highlightColor: '#00ff00' })).toEqual({
      mode: 'word',
      color: '#00ff00'
    });
    expect(resolveWordHighlight({ ...legacy, highlightColor: 'yellow' }).color).toBe(DEFAULT_HIGHLIGHT_COLOR);
  });

  it('splits text into words and separators without losing characters', () => {
    const text = 'Hello,  world\nagain';
    const parts = splitCaptionText(text);
    expect(parts.map((part) => part.text).join('')).toBe(text);
    expect(parts).toEqual([
      { text: 'Hello,', wordIndex: 0 },
      { text: '  ', wordIndex: null },
      { text: 'world', wordIndex: 1 },
      { text: '\n', wordIndex: null },
      { text: 'again', wordIndex: 2 }
    ]);
    expect(countCaptionWords(text)).toBe(3);
    expect(splitCaptionText('')).toEqual([]);
  });

  it('uses exact word times when the text matches the timed words', () => {
    const timing = timeCaptionWords('Hello, world', 1000, 2000, words(['hello', 1100, 1400], ['world', 1500, 1900]));
    expect(timing.exact).toBe(true);
    expect(timing.spans).toEqual([
      { startMs: 1100, endMs: 1400 },
      { startMs: 1500, endMs: 1900 }
    ]);
  });

  it('keeps matched words and interpolates an inserted word', () => {
    const timing = timeCaptionWords('one big two', 0, 1000, words(['one', 0, 200], ['two', 600, 900]));
    expect(timing.exact).toBe(false);
    expect(timing.spans[0]).toEqual({ startMs: 0, endMs: 200 });
    expect(timing.spans[1]).toEqual({ startMs: 200, endMs: 600 });
    expect(timing.spans[2]).toEqual({ startMs: 600, endMs: 900 });
  });

  it('shares the caption by characters when there are no timed words', () => {
    const timing = timeCaptionWords('aa bbbbbb', 0, 1000);
    expect(timing.exact).toBe(false);
    expect(timing.spans).toEqual([
      { startMs: 0, endMs: 300 },
      { startMs: 300, endMs: 1000 }
    ]);
  });

  it('clamps timed words into the caption and keeps them in order', () => {
    const timing = timeCaptionWords('a b', 1000, 2000, words(['b', 1800, 2500], ['a', 500, 1200]));
    expect(timing.spans).toEqual([
      { startMs: 1000, endMs: 1200 },
      { startMs: 1800, endMs: 2000 }
    ]);
  });

  it('picks the last started word, holding it through pauses', () => {
    const spans = [
      { startMs: 100, endMs: 200 },
      { startMs: 500, endMs: 600 }
    ];
    expect(activeWordIndex(spans, 50)).toBe(-1);
    expect(activeWordIndex(spans, 100)).toBe(0);
    expect(activeWordIndex(spans, 400)).toBe(0);
    expect(activeWordIndex(spans, 500)).toBe(1);
    expect(activeWordIndex(spans, 9999)).toBe(1);
    expect(activeWordIndex([], 100)).toBe(-1);
  });

  it('highlights one word or every spoken word by mode', () => {
    expect(isWordHighlighted('word', 1, 1)).toBe(true);
    expect(isWordHighlighted('word', 0, 1)).toBe(false);
    expect(isWordHighlighted('progressive', 0, 1)).toBe(true);
    expect(isWordHighlighted('progressive', 2, 1)).toBe(false);
    expect(isWordHighlighted('off', 1, 1)).toBe(false);
    expect(isWordHighlighted('word', 0, -1)).toBe(false);
  });

  it('cuts the caption into back-to-back intervals', () => {
    const spans = [
      { startMs: 1100, endMs: 1400 },
      { startMs: 1500, endMs: 1900 }
    ];
    expect(highlightIntervals(spans, 1000, 2000)).toEqual([
      { startMs: 1000, endMs: 1100, activeIndex: -1 },
      { startMs: 1100, endMs: 1500, activeIndex: 0 },
      { startMs: 1500, endMs: 2000, activeIndex: 1 }
    ]);
    expect(highlightIntervals([{ startMs: 0, endMs: 10 }], 0, 500)).toEqual([{ startMs: 0, endMs: 500, activeIndex: 0 }]);
    expect(highlightIntervals([], 0, 500)).toEqual([{ startMs: 0, endMs: 500, activeIndex: -1 }]);
  });

  it('keeps only the timed words that still match the text', () => {
    const timed = words(['two', 300, 600], ['one', 0, 300], ['three', 600, 900]);
    expect(matchedCaptionWords('One, three', timed)).toEqual(words(['one', 0, 300], ['three', 600, 900]));
    expect(matchedCaptionWords('', timed)).toEqual([]);
  });

  it('shifts words without going below zero', () => {
    expect(shiftCaptionWords(words(['a', 100, 300]), -200)).toEqual(words(['a', 0, 100]));
  });
});
