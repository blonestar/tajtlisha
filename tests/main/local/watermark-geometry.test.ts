/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { measureLogoText } from '../../../src/shared/logo-font-metrics';
import {
  DEFAULT_WATERMARK,
  computeWatermarkLayout,
  normalizeWatermark
} from '../../../src/shared/watermark-geometry';
import type { WatermarkSettings } from '../../../src/shared/types/watermark';

const markOnly: WatermarkSettings = { ...DEFAULT_WATERMARK, content: 'mark' };
const textOnly: WatermarkSettings = { ...DEFAULT_WATERMARK, content: 'text' };

describe('watermark geometry', () => {
  it('uses the shorter side of the frame for size and margin, in both orientations', () => {
    // 1080 is the shorter side: S = 7% of 1080 = 75.6 px, M = 3% = 32.4 px.
    const portrait = computeWatermarkLayout(DEFAULT_WATERMARK, 1080, 1920);
    const landscape = computeWatermarkLayout(DEFAULT_WATERMARK, 1920, 1080);

    expect(portrait?.height).toBeCloseTo(75.6);
    expect(portrait?.origin.x).toBeCloseTo(32.4);
    expect(portrait?.origin.y).toBeCloseTo(32.4);
    expect(landscape?.height).toBeCloseTo(75.6);
    expect(landscape?.origin.x).toBeCloseTo(32.4);
  });

  it('gives the defaults the sizes from the layout spec on 1080x1920', () => {
    const layout = computeWatermarkLayout(DEFAULT_WATERMARK, 1080, 1920);
    if (!layout) throw new Error('expected a layout');

    // T at 0.70 S = 52.92 px em is 30.53 px wide; 30.53 + 0.5 S = 68.3 < S, so the cell is S wide.
    expect(measureLogoText('T', 52.92)).toBeCloseTo(30.53, 2);
    // 'tajtliša' at 0.62 S = 46.872 px em: 3463 units.
    expect(measureLogoText('tajtliša', 46.872)).toBeCloseTo(162.32, 2);

    // Text pen: the letters' right ink (22.53 + 30.53 = 53.07 px) + 0.1 S gap = 60.63 px from the logo's left edge.
    expect(layout.background).toMatchObject({ x: expect.closeTo(32.4), y: expect.closeTo(32.4), width: expect.closeTo(245.63, 1), height: expect.closeTo(75.6) });
    expect(layout.width).toBeCloseTo(245.63, 1);
    expect(layout.mark?.x).toBeCloseTo(32.4 + (75.6 - 30.53) / 2, 1);
    expect(layout.text?.x).toBeCloseTo(32.4 + 60.63, 2);
  });

  it('puts the mark and text baselines at the vertical centre of the cap height', () => {
    const layout = computeWatermarkLayout(DEFAULT_WATERMARK, 1080, 1920);
    if (!layout) throw new Error('expected a layout');

    // Bm = (S + capHeight * Em) / 2 = (75.6 + 0.714 * 52.92) / 2 = 56.69 px below the logo top.
    expect(layout.mark?.baseline).toBeCloseTo(32.4 + 56.69, 2);
    expect(layout.text?.baseline).toBeCloseTo(32.4 + 56.69, 2);
    expect(layout.mark?.em).toBeCloseTo(52.92);
    expect(layout.text?.em).toBeCloseTo(46.872);
  });

  it('makes the mark-only logo as wide as its cell', () => {
    const layout = computeWatermarkLayout(markOnly, 1080, 1920);

    expect(layout?.width).toBeCloseTo(75.6);
    expect(layout?.text).toBeNull();
    expect(layout?.mark).not.toBeNull();
  });

  it('makes the text-only logo as wide as the text plus one padding on each side', () => {
    const layout = computeWatermarkLayout(textOnly, 1080, 1920);

    // P = 0.3 S = 22.68 px on both sides of the 162.32 px text.
    expect(layout?.width).toBeCloseTo(162.32 + 2 * 22.68, 1);
    expect(layout?.mark).toBeNull();
    expect(layout?.text?.x).toBeCloseTo(32.4 + 22.68, 2);
  });

  it('widens the badge cell for longer letters once they pass S minus the cell padding', () => {
    const two = computeWatermarkLayout({ ...DEFAULT_WATERMARK, markText: 'TJ', content: 'mark' }, 1080, 1920);
    const wide = measureLogoText('TJ', 52.92);

    // markW + 0.5 S = wide + 37.8 > S, so the cell grows to fit.
    expect(wide + 0.5 * 75.6).toBeGreaterThan(75.6);
    expect(two?.width).toBeCloseTo(wide + 0.5 * 75.6, 4);
    expect(two?.mark?.x).toBeCloseTo(32.4 + ((wide + 0.5 * 75.6) - wide) / 2, 4);
  });

  it('centres the logo horizontally for the centre positions', () => {
    const layout = computeWatermarkLayout({ ...DEFAULT_WATERMARK, position: 'bottom_center' }, 1080, 1920);
    if (!layout) throw new Error('expected a layout');

    expect(layout.origin.x).toBeCloseTo((1080 - layout.width) / 2, 6);
    expect(layout.origin.y).toBeCloseTo(1920 - 32.4 - 75.6, 6);
  });

  it('places right corners so the logo ends one margin from the right edge', () => {
    const layout = computeWatermarkLayout({ ...DEFAULT_WATERMARK, position: 'bottom_right' }, 1080, 1920);

    expect(layout?.origin.x).toBeCloseTo(1080 - 32.4 - (layout?.width ?? Number.NaN), 6);
    expect(layout?.origin.x).toBeCloseTo(801.98, 1);
    expect(layout?.origin.y).toBeCloseTo(1920 - 32.4 - 75.6, 6);
  });

  it('returns no background for the none option and only the mark cell for the mark option', () => {
    expect(computeWatermarkLayout({ ...DEFAULT_WATERMARK, background: 'none' }, 1080, 1920)?.background).toBeNull();

    const markBackground = computeWatermarkLayout({ ...DEFAULT_WATERMARK, background: 'mark' }, 1080, 1920)?.background;
    expect(markBackground?.width).toBeCloseTo(75.6);
  });

  it('has no badge background when the badge is hidden', () => {
    const layout = computeWatermarkLayout({ ...textOnly, background: 'mark' }, 1080, 1920);

    expect(layout?.background).toBeNull();
  });

  it('clamps the corner radius to half the shorter box side', () => {
    const round = computeWatermarkLayout({ ...DEFAULT_WATERMARK, cornerRadiusPercent: 50 }, 1080, 1920);
    expect(round?.background?.radius).toBeCloseTo(75.6 / 2);

    const square = computeWatermarkLayout({ ...markOnly, cornerRadiusPercent: 50 }, 1080, 1920);
    expect(square?.background?.radius).toBeCloseTo(75.6 / 2);
    expect(computeWatermarkLayout({ ...DEFAULT_WATERMARK, cornerRadiusPercent: 0 }, 1080, 1920)?.background?.radius).toBe(0);
  });

  it('returns null when the logo is off', () => {
    expect(computeWatermarkLayout({ ...DEFAULT_WATERMARK, enabled: false }, 1080, 1920)).toBeNull();
  });

  it('returns null when neither the badge nor the text has content to show', () => {
    expect(computeWatermarkLayout({ ...DEFAULT_WATERMARK, content: 'text', text: '' }, 1080, 1920)).toBeNull();
    expect(computeWatermarkLayout({ ...DEFAULT_WATERMARK, content: 'mark', markText: '' }, 1080, 1920)).toBeNull();
    expect(computeWatermarkLayout({ ...DEFAULT_WATERMARK, markText: '', text: '' }, 1080, 1920)).toBeNull();
  });

  it('keeps the badge when the text is empty but the content still asks for both', () => {
    const layout = computeWatermarkLayout({ ...DEFAULT_WATERMARK, text: '' }, 1080, 1920);

    expect(layout?.mark).not.toBeNull();
    expect(layout?.text).toBeNull();
    expect(layout?.width).toBeCloseTo(75.6);
  });

  it('clamps out-of-range numbers when laying out directly', () => {
    const layout = computeWatermarkLayout({ ...DEFAULT_WATERMARK, sizePercent: 90, opacity: 0 }, 1000, 1000);

    expect(layout?.height).toBeCloseTo(150);
    expect(layout?.opacity).toBe(0.2);
  });
});

describe('measureLogoText', () => {
  it('sums advances per code point, so the Serbian letter counts as one character', () => {
    // 'š' (U+0161) is 502 units in Noto Sans Bold, 's' is 653: one code point each.
    expect(measureLogoText('š', 1000)).toBeCloseTo(502, 6);
    expect(measureLogoText('šš', 1000)).toBeCloseTo(1004, 6);
    expect(measureLogoText('', 52.92)).toBe(0);
  });

  it('uses the fallback advance for characters missing from the table', () => {
    // U+1F600 is not in the table; the fallback is the advance of 'n' (650 units).
    expect(measureLogoText('\u{1F600}', 1000)).toBeCloseTo(650, 6);
  });
});

describe('normalizeWatermark', () => {
  it('returns the defaults for a missing or non-object value', () => {
    expect(normalizeWatermark(undefined)).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark(null)).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark('on')).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark([])).toEqual(DEFAULT_WATERMARK);
  });

  it('gives the new fields their defaults for an old object with variant', () => {
    expect(normalizeWatermark({ enabled: false, variant: 'icon', position: 'bottom_left', sizePercent: 10 })).toEqual({
      ...DEFAULT_WATERMARK,
      enabled: false,
      position: 'bottom_left',
      sizePercent: 10
    });
  });

  it('keeps valid values and falls back per field for invalid ones', () => {
    expect(
      normalizeWatermark({
        enabled: false,
        content: 'text',
        markText: 'MK',
        text: 'Kanal',
        background: 'mark',
        backgroundColor: '#112233',
        markColor: '#AABBCC',
        textColor: '#ffffff',
        cornerRadiusPercent: 30,
        position: 'bottom_center',
        sizePercent: 10,
        marginPercent: 5,
        opacity: 0.5
      })
    ).toEqual({
      enabled: false,
      content: 'text',
      markText: 'MK',
      text: 'Kanal',
      background: 'mark',
      backgroundColor: '#112233',
      markColor: '#AABBCC',
      textColor: '#ffffff',
      cornerRadiusPercent: 30,
      position: 'bottom_center',
      sizePercent: 10,
      marginPercent: 5,
      opacity: 0.5
    });

    expect(
      normalizeWatermark({ enabled: 'no', content: 'both', background: 'some', position: 'center', sizePercent: null, opacity: 'high' })
    ).toEqual(DEFAULT_WATERMARK);
  });

  it('clamps numbers to their ranges', () => {
    expect(normalizeWatermark({ sizePercent: 99, marginPercent: -4, opacity: 0.05, cornerRadiusPercent: 80 })).toMatchObject({
      sizePercent: 15,
      marginPercent: 0,
      opacity: 0.2,
      cornerRadiusPercent: 50
    });
    expect(normalizeWatermark({ sizePercent: 0 }).sizePercent).toBe(3);
  });

  it('falls back to the default for a non-finite number', () => {
    expect(normalizeWatermark({ sizePercent: Number.POSITIVE_INFINITY, cornerRadiusPercent: Number.NaN })).toMatchObject({
      sizePercent: 7,
      cornerRadiusPercent: 19
    });
  });

  it('cuts the text to 30 code points and the badge letters to 3', () => {
    const long = 'a'.repeat(40);
    expect(normalizeWatermark({ text: long }).text).toBe('a'.repeat(30));
    expect(normalizeWatermark({ markText: 'ABCDE' }).markText).toBe('ABC');
    // Code points, not UTF-16 units: an astral character counts once.
    expect(normalizeWatermark({ markText: '\u{1F600}\u{1F600}\u{1F600}\u{1F600}' }).markText).toBe('\u{1F600}'.repeat(3));
  });

  it('trims the text and removes line breaks', () => {
    expect(normalizeWatermark({ text: '  Moj\nkanal  ' }).text).toBe('Mojkanal');
    expect(normalizeWatermark({ markText: ' M\r\nK ' }).markText).toBe('MK');
  });

  it('keeps an inner space and allows an empty text', () => {
    expect(normalizeWatermark({ text: 'Moj kanal' }).text).toBe('Moj kanal');
    expect(normalizeWatermark({ text: '   ' }).text).toBe('');
    expect(normalizeWatermark({ markText: '' }).markText).toBe('');
  });

  it('replaces an invalid colour with the default', () => {
    expect(normalizeWatermark({ backgroundColor: 'red', markColor: '#12345', textColor: 5 })).toMatchObject({
      backgroundColor: '#1D2025',
      markColor: '#F2A93B',
      textColor: '#F2F2F2'
    });
  });
});
