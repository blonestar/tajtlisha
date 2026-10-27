/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildAssDocument } from '../../../src/main/export/ass';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import { DEFAULT_WATERMARK } from '../../../src/shared/watermark-geometry';
import type { WatermarkSettings } from '../../../src/shared/types/watermark';

const base = { style: DEFAULT_SUBTITLE_STYLE, videoWidth: 1080, videoHeight: 1920 };

/** Logo events: the background drawing (Watermark style) and the badge and text (WatermarkText style). */
function watermarkEvents(doc: string): string[] {
  return doc.split('\n').filter((line) => line.startsWith('Dialogue:') && /,Watermark(Text)?,/.test(line));
}

function withLogo(settings: Partial<WatermarkSettings>, captions: Parameters<typeof buildAssDocument>[0]['captions'] = []): string {
  return buildAssDocument({ ...base, captions, watermark: { settings: { ...DEFAULT_WATERMARK, ...settings }, endMs: 1000 } });
}

describe('ASS watermark layer', () => {
  it('adds no logo style or events when the logo is absent', () => {
    const doc = buildAssDocument({ ...base, captions: [] });

    expect(doc).not.toContain('Style: Watermark');
    expect(watermarkEvents(doc)).toEqual([]);
  });

  it('adds no logo events when the logo is disabled', () => {
    const doc = withLogo({ enabled: false });

    expect(doc).not.toContain('Style: Watermark');
    expect(watermarkEvents(doc)).toEqual([]);
  });

  it('draws the defaults as a background on layer 5 and the badge and text on layer 6', () => {
    const events = watermarkEvents(withLogo({}));

    expect(events).toHaveLength(3);
    expect(events[0]).toMatch(/^Dialogue: 5,/);
    expect(events[0]).toContain(',Watermark,');
    expect(events[1]).toMatch(/^Dialogue: 6,.*,WatermarkText,/);
    expect(events[2]).toMatch(/^Dialogue: 6,.*,WatermarkText,/);
  });

  it('defines the WatermarkText style as bold Noto Sans with no outline or shadow', () => {
    const doc = withLogo({});

    expect(doc).toContain('Style: WatermarkText,Noto Sans,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1');
  });

  it('never asks for kerning, so libass lays the text out with plain advances', () => {
    expect(withLogo({})).not.toContain('Kerning');
  });

  it('runs every logo event from 0 to endMs', () => {
    const events = watermarkEvents(withLogo({}));

    for (const event of events) {
      expect(event).toContain(',0:00:00.00,0:00:01.00,');
    }
  });

  it('shows the logo even when there are no captions', () => {
    const doc = withLogo({}, []);

    expect(watermarkEvents(doc)).toHaveLength(3);
    expect(doc.split('\n').filter((line) => line.startsWith('Dialogue:'))).toEqual(watermarkEvents(doc));
  });

  it('places the defaults at the top-left margin: background bbox, badge and text pen with the baseline', () => {
    const [background, mark, text] = watermarkEvents(withLogo({}));

    expect(background).toContain('{\\an7\\pos(32.40,32.40)');
    // Badge: pen x = 32.4 + (75.6 - 30.53) / 2, baseline 32.4 + 56.69 = 89.09, minus 0.70 S * 1.124 for libass.
    expect(mark).toContain('{\\an7\\pos(54.93,29.61)\\fs80.4\\1c&H3BA9F2&');
    // Text: pen x = 32.4 + 60.63 (letters' right ink + 0.1 S), baseline 89.09, minus 0.62 S * 1.124.
    expect(text).toContain('{\\an7\\pos(93.03,36.41)\\fs71.2\\1c&HF2F2F2&');
    expect(mark.endsWith('}T')).toBe(true);
    expect(text.endsWith('}tajtliša')).toBe(true);
  });

  it('places the default logo at the bottom-right corner, one margin from the right and bottom edges', () => {
    const [background] = watermarkEvents(withLogo({ position: 'bottom_right' }));

    // Logo width is 245.63 px, so x = 1080 - 32.4 - 245.63.
    expect(background).toContain('{\\an7\\pos(801.97,1812.00)');
  });

  it('centres the logo for the bottom-centre position', () => {
    const [background] = watermarkEvents(withLogo({ position: 'bottom_center' }));

    expect(background).toContain('{\\an7\\pos(417.19,1812.00)');
  });

  it('colours each element from its own colour setting, in ASS BGR order', () => {
    const [background, mark, text] = watermarkEvents(
      withLogo({ backgroundColor: '#112233', markColor: '#AABBCC', textColor: '#00FF00' })
    );

    expect(background).toContain('\\1c&H332211&');
    expect(mark).toContain('\\1c&HCCBBAA&');
    expect(text).toContain('\\1c&H00FF00&');
  });

  it('converts opacity to the ASS alpha byte (0 = opaque, FF = transparent) on every element', () => {
    for (const event of watermarkEvents(withLogo({ opacity: 1 }))) {
      expect(event).toContain('\\alpha&H00&');
    }
    expect(watermarkEvents(withLogo({ opacity: 0.5 }))[1]).toContain('\\alpha&H80&');
    expect(watermarkEvents(withLogo({ opacity: 0.2 }))[0]).toContain('\\alpha&HCC&');
  });

  it('writes the background as a rounded rectangle in quarter pixels', () => {
    const [background] = watermarkEvents(withLogo({}));

    // Radius 19% of 75.6 = 14.36 px = 57 quarter pixels; width 245.63 px = 983 quarter pixels.
    expect(background).toContain('\\p3}m 57 0 l 925 0 b ');
    expect(background).toContain(' l 0 57 b 0 ');
  });

  it('draws no background event for the none option, but keeps the text', () => {
    const events = watermarkEvents(withLogo({ background: 'none' }));

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.includes(',WatermarkText,'))).toBe(true);
  });

  it('draws a background only behind the badge for the mark option', () => {
    const [background] = watermarkEvents(withLogo({ background: 'mark' }));

    // The cell is one logo height wide (75.6 px, 302 quarter pixels), so the top edge ends at 302 - 57 = 245.
    expect(background).toContain('\\p3}m 57 0 l 245 0 b ');
  });

  it('draws only the badge for the mark content, and only the text for the text content', () => {
    const markOnly = watermarkEvents(withLogo({ content: 'mark' }));
    const textOnly = watermarkEvents(withLogo({ content: 'text' }));

    expect(markOnly).toHaveLength(2);
    expect(markOnly[1]).toContain('}T');
    expect(textOnly).toHaveLength(2);
    expect(textOnly[1]).toContain('}tajtliša');
  });

  it('leaves out the badge when its letters are empty', () => {
    const events = watermarkEvents(withLogo({ markText: '' }));

    expect(events).toHaveLength(2);
    expect(events.some((event) => event.endsWith('}tajtliša'))).toBe(true);
  });

  it('drops ASS markup characters from the custom text, so the export draws the measured text', () => {
    const events = watermarkEvents(withLogo({ markText: 'A{B', text: 'Moj {kanal}\\nova' }));

    expect(events[1]).toMatch(/\}AB$/);
    expect(events[2]).toMatch(/\}Moj kanalnova$/);
  });

  it('keeps the Serbian letters of the custom text and lets the caption events sit alongside', () => {
    const doc = withLogo({ text: 'Moj kanal ŠĐ' }, [{ startMs: 0, endMs: 500, text: 'Hi' }]);

    expect(watermarkEvents(doc)[2]).toMatch(/\}Moj kanal ŠĐ$/);
    expect(doc).toContain('Dialogue: 0,0:00:00.00,0:00:00.50,Default,,0,0,0,,Hi');
    expect(watermarkEvents(doc)).toHaveLength(3);
  });
});
