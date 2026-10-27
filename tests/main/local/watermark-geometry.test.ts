/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WATERMARK,
  computeWatermarkLayout,
  normalizeWatermark
} from '../../../src/shared/watermark-geometry';
import { WORDMARK } from '../../../src/shared/watermark-wordmark.generated';
import type { WatermarkSettings } from '../../../src/shared/types/watermark';

const iconTop: WatermarkSettings = { ...DEFAULT_WATERMARK, variant: 'icon', position: 'top_left' };

describe('watermark geometry', () => {
  it('uses the shorter side of the frame for size and margin, in both orientations', () => {
    // 1080 is the shorter side: S = 7% of 1080 = 75.6 px, M = 3% = 32.4 px.
    const portrait = computeWatermarkLayout(DEFAULT_WATERMARK, 1080, 1920);
    const landscape = computeWatermarkLayout(DEFAULT_WATERMARK, 1920, 1080);

    expect(portrait?.height).toBeCloseTo(75.6);
    expect(portrait?.origin).toEqual({ x: expect.closeTo(32.4), y: expect.closeTo(32.4) });
    expect(landscape?.height).toBeCloseTo(75.6);
    expect(landscape?.origin.x).toBeCloseTo(32.4);
  });

  it('makes the icon-only badge square: width equals the logo height', () => {
    const layout = computeWatermarkLayout(iconTop, 1080, 1920);

    expect(layout?.width).toBeCloseTo(75.6);
    expect(layout?.width).toBeCloseTo(layout?.height ?? Number.NaN);
    expect(layout?.wordmark).toBeNull();
  });

  it('sizes the icon_text badge as 0.80S + wordmark ink right edge + 0.31S', () => {
    // S = 75.6, em = 0.62 S, k = em / 1000. Expected width ~242.9 px (the ffmpeg check gives a 244 px box with antialiasing).
    const layout = computeWatermarkLayout(DEFAULT_WATERMARK, 1080, 1920);
    const k = (0.62 * 75.6) / WORDMARK.unitsPerEm;

    expect(layout?.width).toBeCloseTo(0.8 * 75.6 + WORDMARK.maxX * k + 0.31 * 75.6, 6);
    expect(layout?.width).toBeCloseTo(242.9, 1);
    expect(layout?.wordmark?.scale).toBeCloseTo(k, 9);
  });

  it('places right corners so the badge ends one margin from the right edge', () => {
    const layout = computeWatermarkLayout({ ...DEFAULT_WATERMARK, position: 'bottom_right' }, 1080, 1920);

    expect(layout?.origin.x).toBeCloseTo(1080 - 32.4 - (layout?.width ?? Number.NaN), 6);
    expect(layout?.origin.x).toBeCloseTo(804.7, 1);
    expect(layout?.origin.y).toBeCloseTo(1920 - 32.4 - 75.6, 6);
  });

  it('keeps the T badge and wordmark inside the logo box, relative to its origin', () => {
    const layout = computeWatermarkLayout(DEFAULT_WATERMARK, 1080, 1920);
    if (!layout) throw new Error('expected a layout');
    const [crossbar, stem] = layout.tRects;

    expect(crossbar.x).toBeCloseTo(layout.origin.x + 0.3105 * 75.6);
    expect(crossbar.y).toBeCloseTo(layout.origin.y + 0.2988 * 75.6);
    expect(crossbar.width).toBeCloseTo(0.379 * 75.6);
    expect(stem.x).toBeCloseTo(layout.origin.x + 0.4473 * 75.6);
    expect(stem.y + stem.height).toBeCloseTo(layout.origin.y + 0.7988 * 75.6);
    expect(layout.radius).toBeCloseTo(0.1875 * 75.6);
    expect(layout.wordmark?.offsetX).toBeCloseTo(layout.origin.x + 0.8 * 75.6);
    expect(layout.wordmark?.baselineY).toBeCloseTo(layout.origin.y + 0.7988 * 75.6);
  });

  it('returns null when the logo is off', () => {
    expect(computeWatermarkLayout({ ...DEFAULT_WATERMARK, enabled: false }, 1080, 1920)).toBeNull();
  });

  it('clamps out-of-range numbers when laying out directly', () => {
    const layout = computeWatermarkLayout({ ...iconTop, sizePercent: 90, opacity: 0 }, 1000, 1000);

    expect(layout?.height).toBeCloseTo(150);
    expect(layout?.opacity).toBe(0.2);
  });
});

describe('normalizeWatermark', () => {
  it('returns the defaults for a missing or non-object value', () => {
    expect(normalizeWatermark(undefined)).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark(null)).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark('on')).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark([])).toEqual(DEFAULT_WATERMARK);
  });

  it('keeps valid values and falls back per field for invalid ones', () => {
    expect(
      normalizeWatermark({ enabled: false, variant: 'icon', position: 'bottom_left', sizePercent: 10, marginPercent: 5, opacity: 0.5 })
    ).toEqual({ enabled: false, variant: 'icon', position: 'bottom_left', sizePercent: 10, marginPercent: 5, opacity: 0.5 });

    expect(normalizeWatermark({ enabled: 'no', variant: 'big', position: 'center', sizePercent: null, opacity: 'high' })).toEqual(
      DEFAULT_WATERMARK
    );
  });

  it('clamps numbers to their ranges', () => {
    expect(normalizeWatermark({ sizePercent: 99, marginPercent: -4, opacity: 0.05 })).toMatchObject({
      sizePercent: 15,
      marginPercent: 0,
      opacity: 0.2
    });
    expect(normalizeWatermark({ sizePercent: 0 }).sizePercent).toBe(3);
  });
});
