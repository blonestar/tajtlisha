import { describe, expect, it } from 'vitest';
import { buildPolishInstructions, buildSummaryTranscript, buildTranslationInstructions } from '../../../src/main/ai/text-prompts';

describe('buildSummaryTranscript', () => {
  it('starts with the language name and a blank line, then one timed line per segment', () => {
    const transcript = buildSummaryTranscript(
      [
        { startMs: 0, endMs: 1000, text: 'Hello.' },
        { startMs: 5_000, endMs: 6_000, text: 'Bye.' }
      ],
      'sr-Latn'
    );

    expect(transcript).toBe('Transcript language: Serbian (Latin script)\n\n[0:00] Hello.\n[0:05] Bye.');
  });

  it('says the language is unknown for und', () => {
    expect(buildSummaryTranscript([{ startMs: 0, endMs: 1000, text: 'Hi' }], 'und').split('\n')[0]).toBe(
      'Transcript language: unknown'
    );
  });

  it('formats times from one hour on as h:mm:ss and rounds down to whole seconds', () => {
    const transcript = buildSummaryTranscript(
      [
        { startMs: 9_999, endMs: 10_000, text: 'a' },
        { startMs: 61_000, endMs: 62_000, text: 'b' },
        { startMs: 3_723_999, endMs: 3_725_000, text: 'c' }
      ],
      'en'
    );

    expect(transcript.split('\n').slice(2)).toEqual(['[0:09] a', '[1:01] b', '[1:02:03] c']);
  });

  it('collapses internal newlines to one space and trims the text', () => {
    const transcript = buildSummaryTranscript([{ startMs: 0, endMs: 1000, text: '  first line\r\n\n  second line  ' }], 'en');

    expect(transcript.split('\n')[2]).toBe('[0:00] first line second line');
  });
});

describe('script instructions', () => {
  const limits = { maxCharsPerLine: 42, maxLinesPerCaption: 2 as const };

  it('asks for Latin script for an sr-Latn translation and polish', () => {
    expect(buildTranslationInstructions({ ...limits, sourceLanguage: 'en', targetLanguage: 'sr-Latn' })).toContain(
      'Never use Cyrillic letters.'
    );
    expect(buildPolishInstructions({ ...limits, language: 'sr-Latn', mode: 'conservative' })).toContain(
      'Never use Cyrillic letters.'
    );
  });

  it('asks for Cyrillic script for an sr-Cyrl target', () => {
    expect(buildTranslationInstructions({ ...limits, sourceLanguage: 'en', targetLanguage: 'sr-Cyrl' })).toContain(
      'Write Serbian only in Cyrillic script.'
    );
  });

  it('adds no script rule for other languages', () => {
    expect(buildTranslationInstructions({ ...limits, sourceLanguage: 'sr-Latn', targetLanguage: 'de' })).not.toMatch(/Never use/);
  });
});
