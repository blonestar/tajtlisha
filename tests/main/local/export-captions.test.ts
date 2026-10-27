/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { captionCuesFor, toExportCaptions } from '../../../src/main/export/captions';
import type { CaptionRow } from '../../../src/shared/types/project';

const caption = (overrides: Partial<CaptionRow> = {}): CaptionRow => ({
  id: 'c1',
  startMs: 2000,
  endMs: 3000,
  original: 'Hello big world',
  translation: 'Zdravo veliki svete',
  ...overrides
});

describe('export captions with word timing', () => {
  it('shifts words onto the trimmed timeline with the caption', () => {
    const [exported] = toExportCaptions(
      [
        caption({
          words: [
            { text: 'Hello', startMs: 2000, endMs: 2300 },
            { text: 'world', startMs: 2600, endMs: 3000 }
          ]
        })
      ],
      { startMs: 1500, endMs: 4000 }
    );

    expect(exported.startMs).toBe(500);
    expect(exported.words).toEqual([
      { text: 'Hello', startMs: 500, endMs: 800 },
      { text: 'world', startMs: 1100, endMs: 1500 }
    ]);
  });

  it('keeps the full caption range and unclamped words when the trim cuts the caption', () => {
    const [exported] = toExportCaptions(
      [caption({ startMs: 0, endMs: 4000, words: [{ text: 'Hello', startMs: 200, endMs: 600 }] })],
      { startMs: 1000, endMs: 3000 }
    );

    expect(exported).toMatchObject({ startMs: 0, endMs: 2000, timingStartMs: -1000, timingEndMs: 3000 });
    expect(exported.words).toEqual([{ text: 'Hello', startMs: -800, endMs: -400 }]);
    expect(captionCuesFor([exported], 'translation')[0]).toMatchObject({ timingStartMs: -1000, timingEndMs: 3000 });
  });

  it('sets no timing range on captions the trim does not cut', () => {
    const [exported] = toExportCaptions([caption()], { startMs: 0, endMs: 5000 });

    expect(exported).not.toHaveProperty('timingStartMs');
    expect(exported).not.toHaveProperty('timingEndMs');
  });

  it('leaves words absent on captions without word timing', () => {
    const [exported] = toExportCaptions([caption()], { startMs: 0, endMs: 5000 });

    expect(exported).not.toHaveProperty('words');
  });

  it('passes words only for the original text cues', () => {
    const words = [{ text: 'Hello', startMs: 0, endMs: 300 }];
    const captions = toExportCaptions([caption({ words })], { startMs: 0, endMs: 5000 });

    expect(captionCuesFor(captions, 'original')[0].words).toEqual(words);
    expect(captionCuesFor(captions, 'translation')[0]).not.toHaveProperty('words');
  });
});
