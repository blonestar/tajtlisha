/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildAssDocument, escapeAssText, formatAssTimestamp } from '../../../src/main/export/ass';
import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_PRESETS,
  assFontSize,
  computeSubtitleGeometry
} from '../../../src/shared/subtitle-geometry';
import type { SubtitleStyle } from '../../../src/shared/types/style';

describe('ASS document', () => {
  it('sets PlayResX and PlayResY to the video size', () => {
    const doc = buildAssDocument({ captions: [], style: DEFAULT_SUBTITLE_STYLE, videoWidth: 720, videoHeight: 1280 });

    expect(doc).toContain('ScriptType: v4.00+');
    expect(doc).toContain('PlayResX: 720');
    expect(doc).toContain('PlayResY: 1280');
    expect(doc).toContain('WrapStyle: 2');
    expect(doc).toContain('ScaledBorderAndShadow: yes');
    expect(doc).toContain('YCbCr Matrix: None');
  });

  it('sizes the font from the shared geometry so the rendered em equals the geometry font size', () => {
    const style = styleLine(buildAssDocument({ captions: [], style: DEFAULT_SUBTITLE_STYLE, videoWidth: 720, videoHeight: 1280 }));

    // Geometry: 5.5% of the shorter side (720) = 39.6 px em. libass takes Fontsize as win ascent + descent, so 39.6 * 1.519 = 60.15 -> 60.2 (shared rounding to 0.1).
    expect(computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 720, 1280).fontSizePx).toBeCloseTo(39.6);
    expect(style.Fontsize).toBe('60.2');
    expect(style.Fontname).toBe('Noto Sans');
    expect(style.Encoding).toBe('1');
    expect(style.Name).toBe('Default');
  });

  it('uses the shared font factor for the ASS Fontsize', () => {
    const geometry = computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 720, 1280);
    expect(assFontSize(DEFAULT_SUBTITLE_STYLE, geometry)).toBeCloseTo(60.2, 0);

    const unknown = { ...DEFAULT_SUBTITLE_STYLE, fontFamily: 'Unknown Sans' };
    expect(assFontSize(unknown, computeSubtitleGeometry(unknown, 720, 1280))).toBeCloseTo(geometry.fontSizePx * 1.519, 1);
  });

  it('converts #rrggbb to ASS &HAABBGGRR', () => {
    const style: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE, textColor: '#112233', outlineColor: '#445566' };
    const fields = styleLine(buildAssDocument({ captions: [], style, videoWidth: 720, videoHeight: 1280 }));

    expect(fields.PrimaryColour).toBe('&H00332211');
    expect(fields.OutlineColour).toBe('&H00665544');
    expect(fields.SecondaryColour).toBe('&H000000FF');
  });

  it('maps every position and alignment to the numpad value', () => {
    const expected: Record<string, string> = {
      'bottom-left': '1',
      'bottom-center': '2',
      'bottom-right': '3',
      'middle-left': '4',
      'middle-center': '5',
      'middle-right': '6',
      'top-left': '7',
      'top-center': '8',
      'top-right': '9'
    };

    for (const [key, value] of Object.entries(expected)) {
      const [position, align] = key.split('-') as [SubtitleStyle['position'], SubtitleStyle['align']];
      const style: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE, position, align };
      const fields = styleLine(buildAssDocument({ captions: [], style, videoWidth: 720, videoHeight: 1280 }));
      expect(fields.Alignment, key).toBe(value);
    }
  });

  it('uses the outline and shadow for the default style', () => {
    const geometry = computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 720, 1280);
    const fields = styleLine(buildAssDocument({ captions: [], style: DEFAULT_SUBTITLE_STYLE, videoWidth: 720, videoHeight: 1280 }));

    expect(fields.BorderStyle).toBe('1');
    expect(fields.Outline).toBe(geometry.outlinePx.toFixed(1));
    expect(fields.Shadow).toBe(geometry.shadowPx.toFixed(1));
    expect(fields.BackColour).toBe('&H60000000');
    expect(fields.Bold).toBe('-1');
    expect(fields.MarginL).toBe(String(Math.round(geometry.marginHorizontalPx)));
    expect(fields.MarginV).toBe(String(Math.round(geometry.marginVerticalPx)));
  });

  it('builds the box style with BorderStyle 3 and the background alpha', () => {
    const style = SUBTITLE_PRESETS.box;
    const geometry = computeSubtitleGeometry(style, 720, 1280);
    const fields = styleLine(buildAssDocument({ captions: [], style, videoWidth: 720, videoHeight: 1280 }));

    expect(fields.BorderStyle).toBe('3');
    expect(fields.Outline).toBe(String(Math.round(geometry.boxPaddingPx)));
    expect(fields.Shadow).toBe('0');
    // opacity 0.65 -> transparency 0.35 -> round(0.35 * 255) = 89 = 0x59
    expect(fields.OutlineColour).toBe('&H59000000');
    expect(fields.BackColour).toBe(fields.OutlineColour);
    expect(fields.Bold).toBe('0');
  });

  it('writes centisecond timestamps and skips blank captions', () => {
    const doc = buildAssDocument({
      captions: [
        { startMs: 6000, endMs: 9000, text: 'First' },
        { startMs: 9000, endMs: 10005, text: '   ' },
        { startMs: 10005, endMs: 3_723_040, text: 'Last' }
      ],
      style: DEFAULT_SUBTITLE_STYLE,
      videoWidth: 720,
      videoHeight: 1280
    });

    const dialogues = doc.split('\n').filter((line) => line.startsWith('Dialogue:'));
    expect(dialogues).toEqual([
      'Dialogue: 0,0:00:06.00,0:00:09.00,Default,,0,0,0,,First',
      'Dialogue: 0,0:00:10.01,1:02:03.04,Default,,0,0,0,,Last'
    ]);
    expect(formatAssTimestamp(3_723_040)).toBe('1:02:03.04');
    expect(formatAssTimestamp(10_005)).toBe('0:00:10.01');
  });

  it('escapes newlines, braces, and backslashes in caption text', () => {
    expect(escapeAssText('line one\r\nline two')).toBe('line one\\Nline two');
    expect(escapeAssText('{\\an8}hi}')).toBe('(⧵an8)hi)');
    expect(escapeAssText('a\\Nb')).toBe('a⧵Nb');
  });

  it('keeps escaped text as the last Dialogue field', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1000, text: 'Ćao, {x}\nđače' }],
      style: DEFAULT_SUBTITLE_STYLE,
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(doc).toContain('Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Ćao, (x)\\Nđače');
  });
});

describe('ASS word highlight', () => {
  const HIGHLIGHT = '{\\c&H00D4FF&}'; // #ffd400 (the default highlight colour) in BBGGRR
  const RESET = '{\\r}';
  const wordStyle = (wordHighlight: SubtitleStyle['wordHighlight']): SubtitleStyle => ({ ...DEFAULT_SUBTITLE_STYLE, wordHighlight });
  const timedWords = [
    { text: 'Hello', startMs: 0, endMs: 400 },
    { text: 'big', startMs: 400, endMs: 800 },
    { text: 'world', startMs: 800, endMs: 1200 }
  ];

  it('is byte-identical to the plain export when highlight is off, whatever words are given', () => {
    const plain = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1200, text: 'Hello big world' }],
      style: DEFAULT_SUBTITLE_STYLE,
      videoWidth: 720,
      videoHeight: 1280
    });
    const withWords = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1200, text: 'Hello big world', words: timedWords, activeWordIndex: 1 }],
      style: wordStyle('off'),
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(withWords).toBe(plain);
  });

  it('writes one event per interval in word mode, coloring only the spoken word', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1200, text: 'Hello big world', words: timedWords }],
      style: wordStyle('word'),
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(dialogueLines(doc)).toEqual([
      `Dialogue: 0,0:00:00.00,0:00:00.40,Default,,0,0,0,,${HIGHLIGHT}Hello${RESET} big world`,
      `Dialogue: 0,0:00:00.40,0:00:00.80,Default,,0,0,0,,Hello ${HIGHLIGHT}big${RESET} world`,
      `Dialogue: 0,0:00:00.80,0:00:01.20,Default,,0,0,0,,Hello big ${HIGHLIGHT}world${RESET}`
    ]);
  });

  it('keeps every word up to the spoken one colored in progressive mode', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1200, text: 'Hello big world', words: timedWords }],
      style: wordStyle('progressive'),
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(dialogueLines(doc)).toEqual([
      `Dialogue: 0,0:00:00.00,0:00:00.40,Default,,0,0,0,,${HIGHLIGHT}Hello${RESET} big world`,
      `Dialogue: 0,0:00:00.40,0:00:00.80,Default,,0,0,0,,${HIGHLIGHT}Hello${RESET} ${HIGHLIGHT}big${RESET} world`,
      `Dialogue: 0,0:00:00.80,0:00:01.20,Default,,0,0,0,,${HIGHLIGHT}Hello${RESET} ${HIGHLIGHT}big${RESET} ${HIGHLIGHT}world${RESET}`
    ]);
  });

  it('writes one event for the whole caption when an active word index is given', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1000, text: 'Hello big world', words: timedWords, activeWordIndex: 1 }],
      style: wordStyle('word'),
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(dialogueLines(doc)).toEqual([`Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello ${HIGHLIGHT}big${RESET} world`]);
  });

  it('colors nothing when the active index is -1', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1000, text: 'Hello big world', activeWordIndex: -1 }],
      style: wordStyle('word'),
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(dialogueLines(doc)).toEqual(['Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello big world']);
  });

  it('cannot let braces or backslashes in the text inject override tags', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1000, text: 'Hi {\\an8}there', activeWordIndex: 1 }],
      style: wordStyle('word'),
      videoWidth: 720,
      videoHeight: 1280
    });

    const [line] = dialogueLines(doc);
    expect(line).toBe(`Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hi ${HIGHLIGHT}(⧵an8)there${RESET}`);
    // Only our own colour override and reset may appear as tags.
    expect(line.match(/\{[^}]*\}/g)).toEqual([HIGHLIGHT, RESET]);
  });

  it('keeps explicit line breaks as \\N and colors words on the second line', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1000, text: 'Hello big\nworld', activeWordIndex: 2 }],
      style: wordStyle('word'),
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(dialogueLines(doc)).toEqual([`Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello big\\N${HIGHLIGHT}world${RESET}`]);
  });

  it('skips an interval that rounds to zero length in centiseconds', () => {
    const doc = buildAssDocument({
      captions: [
        {
          startMs: 0,
          endMs: 1000,
          text: 'Hello big',
          words: [
            { text: 'Hello', startMs: 0, endMs: 2 },
            { text: 'big', startMs: 2, endMs: 1000 }
          ]
        }
      ],
      style: wordStyle('word'),
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(dialogueLines(doc)).toEqual([`Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello ${HIGHLIGHT}big${RESET}`]);
  });

  it('uses the highlight colour from the style, in ASS colour order', () => {
    const doc = buildAssDocument({
      captions: [{ startMs: 0, endMs: 1000, text: 'Hi there', activeWordIndex: 0 }],
      style: { ...wordStyle('word'), highlightColor: '#112233' },
      videoWidth: 720,
      videoHeight: 1280
    });

    expect(dialogueLines(doc)).toEqual([`Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\c&H332211&}Hi${RESET} there`]);
  });
});

/** The Dialogue lines of an ASS document, in order. */
function dialogueLines(doc: string): string[] {
  return doc.split('\n').filter((line) => line.startsWith('Dialogue:'));
}

/** Returns the Style line as a field map keyed by the Format line names. */
function styleLine(doc: string): Record<string, string> {
  const format = doc.split('\n').find((line) => line.startsWith('Format: Name, Fontname'));
  const style = doc.split('\n').find((line) => line.startsWith('Style: Default,'));
  if (!format || !style) throw new Error('Style section is missing.');

  const names = format.slice('Format: '.length).split(', ');
  const values = style.slice('Style: '.length).split(',');
  expect(values).toHaveLength(names.length);
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}
