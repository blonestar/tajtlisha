/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildAssDocument } from '../../../src/main/export/ass';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import { DEFAULT_WATERMARK } from '../../../src/shared/watermark-geometry';
import type { WatermarkSettings } from '../../../src/shared/types/watermark';

const base = { style: DEFAULT_SUBTITLE_STYLE, videoWidth: 1080, videoHeight: 1920 };

function watermarkEvents(doc: string): string[] {
  return doc.split('\n').filter((line) => line.startsWith('Dialogue:') && line.includes(',Watermark,'));
}

function withLogo(settings: Partial<WatermarkSettings>, captions: Parameters<typeof buildAssDocument>[0]['captions'] = []): string {
  return buildAssDocument({ ...base, captions, watermark: { settings: { ...DEFAULT_WATERMARK, ...settings }, endMs: 1000 } });
}

describe('ASS watermark layer', () => {
  it('adds no Watermark style or events when the logo is absent', () => {
    const doc = buildAssDocument({ ...base, captions: [] });

    expect(doc).not.toContain('Style: Watermark,');
    expect(watermarkEvents(doc)).toEqual([]);
  });

  it('adds no Watermark events when the logo is disabled', () => {
    const doc = withLogo({ enabled: false });

    expect(doc).not.toContain('Style: Watermark,');
    expect(watermarkEvents(doc)).toEqual([]);
  });

  it('draws the icon as two events: background on layer 5, T on layer 6', () => {
    const events = watermarkEvents(withLogo({ variant: 'icon' }));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatch(/^Dialogue: 5,/);
    expect(events[1]).toMatch(/^Dialogue: 6,/);
  });

  it('draws the icon_text variant as three events: background on layer 5, T and wordmark on layer 6', () => {
    const events = watermarkEvents(withLogo({ variant: 'icon_text' }));

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.split(',')[0])).toEqual(['Dialogue: 5', 'Dialogue: 6', 'Dialogue: 6']);
  });

  it('runs every logo event from 0 to endMs', () => {
    const events = watermarkEvents(withLogo({}));

    for (const event of events) {
      expect(event).toContain(',0:00:00.00,0:00:01.00,Watermark,');
    }
  });

  it('shows the logo even when there are no captions', () => {
    const doc = withLogo({}, []);

    expect(watermarkEvents(doc)).toHaveLength(3);
    expect(doc.split('\n').filter((line) => line.startsWith('Dialogue:'))).toEqual(watermarkEvents(doc));
  });

  it('places the icon_text badge at the top-left margin with the background bbox at (32.40, 32.40)', () => {
    const events = watermarkEvents(withLogo({ variant: 'icon_text', position: 'top_left' }));

    expect(events[0]).toContain('\\an7\\pos(32.40,32.40)');
    expect(events[1]).toContain('\\an7\\pos(55.87,54.99)');
    expect(events[2]).toContain('\\an7\\pos(93.96,56.89)');
  });

  it('places the icon_text badge at the bottom-right corner, one margin from the right and bottom edges', () => {
    const events = watermarkEvents(withLogo({ variant: 'icon_text', position: 'bottom_right' }));

    // Badge width is 242.91 px (0.80S + wordmark ink + 0.31S), so x = 1080 - 32.4 - 242.91.
    expect(events[0]).toContain('\\an7\\pos(804.69,1812.00)');
  });

  it('draws the icon badge as a square at the top-left corner', () => {
    const events = watermarkEvents(withLogo({ variant: 'icon', position: 'top_left' }));

    expect(events[0]).toContain('\\an7\\pos(32.40,32.40)');
    expect(events[1]).toContain('\\an7\\pos(55.87,54.99)');
  });

  it('colours the layers from the brand palette, in ASS BGR order', () => {
    const events = watermarkEvents(withLogo({}));

    expect(events[0]).toContain('\\1c&H25201D&');
    expect(events[1]).toContain('\\1c&H3BA9F2&');
    expect(events[2]).toContain('\\1c&HF2F2F2&');
  });

  it('converts opacity to the ASS alpha byte (0 = opaque, FF = transparent)', () => {
    expect(watermarkEvents(withLogo({ opacity: 1 }))[0]).toContain('\\alpha&H00&');
    expect(watermarkEvents(withLogo({ opacity: 0.5 }))[0]).toContain('\\alpha&H80&');
    expect(watermarkEvents(withLogo({ opacity: 0.2 }))[0]).toContain('\\alpha&HCC&');
  });

  it('writes the background as a rounded rectangle and the T as two rectangles in quarter pixels', () => {
    const [background, tMark] = watermarkEvents(withLogo({ variant: 'icon' }));

    // Icon: 75.6 px square, radius 0.1875 * 75.6 = 14.175 px, control offset c = 6.345 px. Quarter pixels: r = 57, w - r = 246, w = 302.
    expect(background).toContain('\\p3}m 57 0 l 246 0 b 277 0 302 25 302 57 ');
    expect(background).toContain(' l 0 57 b 0 25 25 0 57 0');
    // T crossbar 0.379S wide and 0.0879S tall, starting at the T bbox origin.
    expect(tMark).toContain('\\p3}m 0 0 l 115 0 115 27 0 27 m 41 27 l 73 27 73 151 41 151');
  });

  it('converts the wordmark outlines to ASS drawing commands without SVG Z', () => {
    const wordmark = watermarkEvents(withLogo({ variant: 'icon_text' }))[2];
    const drawing = wordmark.slice(wordmark.indexOf('\\p3}') + 4);

    expect(drawing.startsWith('m 53 123 b 57 123 60 123 62 122 ')).toBe(true);
    expect(drawing).not.toMatch(/[MLCZ]/);
    expect(drawing).not.toMatch(/Z/);
  });

  it('keeps caption events in the document alongside the logo events', () => {
    const doc = withLogo({}, [{ startMs: 0, endMs: 500, text: 'Hi' }]);

    expect(doc).toContain('Dialogue: 0,0:00:00.00,0:00:00.50,Default,,0,0,0,,Hi');
    expect(watermarkEvents(doc)).toHaveLength(3);
  });
});
