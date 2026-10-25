/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { validateProjectDocument } from '../../../src/main/project/project-schema';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';

function validSource(): Record<string, unknown> {
  return {
    inputPath: '/videos/clip.mp4',
    fileUrl: '',
    durationMs: 4000,
    width: 1280,
    height: 720,
    hasAudio: true,
    fileSizeBytes: 1234,
    mtimeMs: 99
  };
}

function captionWithWords(words: unknown[]): Record<string, unknown> {
  return { id: 'c1', startMs: 0, endMs: 2000, original: 'Hello world', translation: '', words };
}

function validDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'project-1',
    revision: 3,
    source: validSource(),
    trim: { startMs: 500, endMs: 3500 },
    sourceLanguage: 'en',
    targetLanguage: 'sr-Latn',
    translationLanguage: 'sr-Latn',
    captions: [
      { id: 'c1', startMs: 0, endMs: 1000, original: 'Hello', translation: 'Zdravo', translatedFrom: 'Hello' },
      { id: 'c2', startMs: 1000, endMs: 2000, original: 'Line one\nline two', translation: '' }
    ],
    style: { ...DEFAULT_SUBTITLE_STYLE },
    previewTrack: 'translation',
    transcription: { providerId: 'openai', modelId: 'whisper-1', timingSource: 'word' },
    updatedAt: '2026-10-22T10:00:00.000Z',
    ...overrides
  };
}

describe('validateProjectDocument', () => {
  it('accepts a complete document and returns it unchanged', () => {
    const input = validDocument();

    expect(validateProjectDocument(input)).toEqual(input);
  });

  it('round-trips through JSON without losing a field', () => {
    const doc = validateProjectDocument(validDocument());

    expect(validateProjectDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('accepts a document without a source or optional languages', () => {
    const doc = validateProjectDocument(validDocument({ source: null, sourceLanguage: undefined, translationLanguage: undefined, transcription: undefined }));

    expect(doc.source).toBeNull();
    expect(doc).not.toHaveProperty('sourceLanguage');
    expect(doc).not.toHaveProperty('transcription');
  });

  it('returns a new object and drops unknown fields at every level', () => {
    const input = validDocument({
      extra: 'document',
      source: { ...validSource(), extraSource: 1 },
      captions: [{ id: 'c1', startMs: 0, endMs: 1000, original: 'a', translation: '', extraCaption: true }],
      style: { ...DEFAULT_SUBTITLE_STYLE, extraStyle: 'x' },
      transcription: { providerId: 'openai', timingSource: 'segment', apiKey: 'sk-leak' }
    });

    const doc = validateProjectDocument(input) as unknown as Record<string, unknown>;

    expect(doc).not.toBe(input);
    expect(doc).not.toHaveProperty('extra');
    expect((doc.source as Record<string, unknown>)).not.toHaveProperty('extraSource');
    expect((doc.captions as Array<Record<string, unknown>>)[0]).not.toHaveProperty('extraCaption');
    expect(doc.style as Record<string, unknown>).not.toHaveProperty('extraStyle');
    expect(doc.transcription as Record<string, unknown>).not.toHaveProperty('apiKey');
    expect(JSON.stringify(doc)).not.toContain('sk-leak');
  });

  it.each([
    ['missing trim', { trim: undefined }, 'project.trim'],
    ['missing style', { style: undefined }, 'project.style'],
    ['missing target language', { targetLanguage: undefined }, 'project.targetLanguage'],
    ['wrong schema version', { schemaVersion: 2 }, 'project.schemaVersion'],
    ['unknown preview track', { previewTrack: 'both' }, 'project.previewTrack'],
    ['path-like project id', { id: '../evil' }, 'project.id'],
    ['fractional revision', { revision: 1.5 }, 'project.revision'],
    ['negative revision', { revision: -1 }, 'project.revision'],
    ['trim that ends before it starts', { trim: { startMs: 2000, endMs: 1000 } }, 'project.trim'],
    ['NaN trim', { trim: { startMs: Number.NaN, endMs: 1000 } }, 'project.trim.startMs'],
    ['unknown font family', { style: { ...DEFAULT_SUBTITLE_STYLE, fontFamily: 'Comic Sans' } }, 'project.style.fontFamily'],
    ['font size out of range', { style: { ...DEFAULT_SUBTITLE_STYLE, fontSizePercent: 40 } }, 'project.style.fontSizePercent'],
    ['bad colour', { style: { ...DEFAULT_SUBTITLE_STYLE, textColor: 'red' } }, 'project.style.textColor'],
    ['bad alignment', { style: { ...DEFAULT_SUBTITLE_STYLE, align: 'justify' } }, 'project.style.align'],
    ['boolean as string', { style: { ...DEFAULT_SUBTITLE_STYLE, bold: 'yes' } }, 'project.style.bold'],
    ['style missing a field', { style: { ...DEFAULT_SUBTITLE_STYLE, maxWidthPercent: undefined } }, 'project.style.maxWidthPercent'],
    ['source with zero duration', { source: { ...validSource(), durationMs: 0 } }, 'project.source.durationMs'],
    ['source with fractional width', { source: { ...validSource(), width: 1280.5 } }, 'project.source.width'],
    ['source without a path', { source: { ...validSource(), inputPath: '' } }, 'project.source.inputPath'],
    ['captions not an array', { captions: {} }, 'project.captions'],
    ['too many captions', { captions: Array.from({ length: 5001 }, (_, i) => ({ id: `c${i}`, startMs: 0, endMs: 1, original: '', translation: '' })) }, 'project.captions'],
    ['caption text too long', { captions: [{ id: 'c1', startMs: 0, endMs: 1, original: 'x'.repeat(2001), translation: '' }] }, 'project.captions[0].original'],
    ['caption with a non-string translation', { captions: [{ id: 'c1', startMs: 0, endMs: 1, original: '', translation: 3 }] }, 'project.captions[0].translation'],
    ['caption ending before it starts', { captions: [{ id: 'c1', startMs: 5, endMs: 1, original: '', translation: '' }] }, 'project.captions[0].endMs'],
    ['unknown transcription timing', { transcription: { providerId: 'openai', timingSource: 'guess' } }, 'project.transcription.timingSource'],
    ['word with empty text', { captions: [captionWithWords([{ text: ' ', startMs: 0, endMs: 1 }])] }, 'project.captions[0].words[0].text'],
    ['word text over 200 characters', { captions: [captionWithWords([{ text: 'x'.repeat(201), startMs: 0, endMs: 1 }])] }, 'project.captions[0].words[0].text'],
    ['word with negative start', { captions: [captionWithWords([{ text: 'a', startMs: -1, endMs: 1 }])] }, 'project.captions[0].words[0].startMs'],
    ['word ending before it starts', { captions: [captionWithWords([{ text: 'a', startMs: 500, endMs: 400 }])] }, 'project.captions[0].words[0].endMs'],
    ['word with a non-finite end', { captions: [captionWithWords([{ text: 'a', startMs: 0, endMs: Number.POSITIVE_INFINITY }])] }, 'project.captions[0].words[0].endMs'],
    ['words not an array', { captions: [{ ...captionWithWords([]), words: 'hello' }] }, 'project.captions[0].words'],
    ['more than 1000 words', { captions: [captionWithWords(Array.from({ length: 1001 }, (_, i) => ({ text: 'a', startMs: i, endMs: i })))] }, 'project.captions[0].words'],
    ['unknown word highlight mode', { style: { ...DEFAULT_SUBTITLE_STYLE, wordHighlight: 'karaoke' } }, 'project.style.wordHighlight'],
    ['highlight colour not hex', { style: { ...DEFAULT_SUBTITLE_STYLE, highlightColor: 'yellow' } }, 'project.style.highlightColor']
  ])('rejects %s', (_label, overrides, field) => {
    expect(() => validateProjectDocument(validDocument(overrides))).toThrow(`[UNKNOWN] invalid project: ${field}`);
  });

  it('keeps caption words and the highlight style through a JSON round trip', () => {
    const input = validDocument({
      captions: [captionWithWords([{ text: 'Hello', startMs: 1000, endMs: 1400 }, { text: 'world', startMs: 1500, endMs: 1900 }])],
      style: { ...DEFAULT_SUBTITLE_STYLE, wordHighlight: 'progressive', highlightColor: '#ffd400' }
    });

    const doc = validateProjectDocument(input);

    expect(doc.captions[0].words).toEqual([
      { text: 'Hello', startMs: 1000, endMs: 1400 },
      { text: 'world', startMs: 1500, endMs: 1900 }
    ]);
    expect(doc.style.wordHighlight).toBe('progressive');
    expect(doc.style.highlightColor).toBe('#ffd400');
    expect(validateProjectDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('loads a legacy document without word timing or highlight fields, leaving them absent', () => {
    const legacyStyle: Record<string, unknown> = { ...DEFAULT_SUBTITLE_STYLE };
    delete legacyStyle.wordHighlight;
    delete legacyStyle.highlightColor;

    const doc = validateProjectDocument(validDocument({ style: legacyStyle }));

    expect(doc.captions[0]).not.toHaveProperty('words');
    expect(doc.style).not.toHaveProperty('wordHighlight');
    expect(doc.style).not.toHaveProperty('highlightColor');
  });

  it('rejects values that are not objects at all', () => {
    expect(() => validateProjectDocument(undefined)).toThrow('[UNKNOWN] invalid project: project');
    expect(() => validateProjectDocument([])).toThrow('[UNKNOWN] invalid project: project');
  });
});
