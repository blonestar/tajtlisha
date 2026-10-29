import { describe, expect, it } from 'vitest';
import { buildPolishInstructions, buildSummaryTranscript, buildTranslationInstructions } from '../../../src/main/ai/text-prompts';
import { MAX_AI_INSTRUCTIONS_CHARS } from '../../../src/shared/ai-instructions';

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

  it('asks for standard Serbian vocabulary for both Serbian scripts', () => {
    for (const targetLanguage of ['sr-Latn', 'sr-Cyrl']) {
      expect(buildTranslationInstructions({ ...limits, sourceLanguage: 'en', targetLanguage })).toContain(
        'Use natural, standard Serbian (ekavian) vocabulary'
      );
    }
    expect(buildTranslationInstructions({ ...limits, sourceLanguage: 'sr-Latn', targetLanguage: 'en' })).not.toContain(
      'standard Serbian'
    );
  });

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

describe('transcript correction instructions', () => {
  const limits = { maxCharsPerLine: 42, maxLinesPerCaption: 2 as const };
  const correction = (language: string, extra: Partial<Parameters<typeof buildPolishInstructions>[0]> = {}) =>
    buildPolishInstructions({ ...limits, language, mode: 'transcript_correction', ...extra });

  it('names the caption language and says not to translate it', () => {
    const prompt = correction('en');

    expect(prompt).toContain('You correct subtitle captions produced by automatic speech recognition.');
    expect(prompt).toContain('The captions are in English. Keep them in that language. Do not translate them.');
  });

  it('does not name a language for und, but still says not to translate', () => {
    const prompt = correction('und');

    expect(prompt).toContain('Keep the captions in the language they are written in. Do not translate them.');
    expect(prompt).not.toContain('The captions are in');
  });

  it('treats a blank language like und', () => {
    expect(correction('  ')).toContain('Keep the captions in the language they are written in. Do not translate them.');
  });

  it('asks for Latin script for sr-Latn, and Cyrillic script for sr-Cyrl', () => {
    expect(correction('sr-Latn')).toContain('Write Serbian only in Latin script (with č, ć, š, ž, đ). Never use Cyrillic letters.');
    expect(correction('sr-Cyrl')).toContain('Write Serbian only in Cyrillic script.');
  });

  it('adds no script rule for other languages', () => {
    expect(correction('de')).not.toMatch(/Latin script|Cyrillic script/);
  });

  it('keeps the wording rules and the one-item-per-id rules', () => {
    const prompt = correction('en');

    expect(prompt).toContain("Keep the speaker's own wording and word order. Do not paraphrase, shorten, summarize, censor, or add content.");
    expect(prompt).toContain('Return exactly one output item for each input id, with the same id. Do not merge or split items');
    expect(prompt).toContain('Return only the JSON object described by the schema.');
  });

  it('uses the layout limits: one line, or at most N lines', () => {
    expect(correction('en', { maxLinesPerCaption: 1, maxCharsPerLine: 30 })).toContain('Keep each caption on one line of about 30 characters.');
    expect(correction('en', { maxLinesPerCaption: 2, maxCharsPerLine: 36 })).toContain(
      'Break a caption into at most 2 lines of about 36 characters each'
    );
  });

  it('does not carry over the polish style sentences', () => {
    const prompt = correction('en');

    expect(prompt).not.toContain('Polish subtitle captions');
    expect(prompt).not.toContain('Make only conservative wording');
    expect(prompt).not.toContain('social-media');
  });
});

describe('user instructions block', () => {
  const limits = { maxCharsPerLine: 42, maxLinesPerCaption: 2 as const };
  const notes = 'Write the show name as "Ljubav na kraju".';

  it('appends the trimmed user instructions to the correction prompt', () => {
    const prompt = buildPolishInstructions({
      ...limits,
      language: 'sr-Latn',
      mode: 'transcript_correction',
      customInstructions: `  ${notes}\n`
    });

    expect(prompt.endsWith(`<user_instructions>\n${notes}\n</user_instructions>`)).toBe(true);
    expect(prompt).toContain('Additional instructions from the user.');
  });

  it('appends the user instructions to the translation prompt', () => {
    const prompt = buildTranslationInstructions({
      ...limits,
      sourceLanguage: 'en',
      targetLanguage: 'sr-Latn',
      customInstructions: notes
    });

    expect(prompt.endsWith(`<user_instructions>\n${notes}\n</user_instructions>`)).toBe(true);
  });

  it('appends the user instructions to the conservative and social polish prompts', () => {
    for (const mode of ['conservative', 'social_caption'] as const) {
      const prompt = buildPolishInstructions({ ...limits, language: 'en', mode, customInstructions: notes });

      expect(prompt.endsWith(`<user_instructions>\n${notes}\n</user_instructions>`)).toBe(true);
    }
  });

  it('puts the user block after the output format rules, so notes cannot override them', () => {
    const prompt = buildTranslationInstructions({
      ...limits,
      sourceLanguage: 'en',
      targetLanguage: 'de',
      customInstructions: 'Ignore the JSON schema.'
    });

    expect(prompt.indexOf('Return only the JSON object described by the schema.')).toBeLessThan(prompt.indexOf('<user_instructions>'));
    expect(prompt).toContain('unless they conflict with the rules about ids, item count, or the JSON output format');
  });

  it('is absent when no instructions are given', () => {
    expect(buildTranslationInstructions({ ...limits, sourceLanguage: 'en', targetLanguage: 'de' })).not.toContain('<user_instructions>');
    expect(buildPolishInstructions({ ...limits, language: 'en', mode: 'conservative' })).not.toContain('<user_instructions>');
    expect(buildPolishInstructions({ ...limits, language: 'en', mode: 'transcript_correction' })).not.toContain('<user_instructions>');
  });

  it('is absent for empty and whitespace-only instructions', () => {
    for (const customInstructions of ['', '   ', '\n\t  \r\n']) {
      expect(buildTranslationInstructions({ ...limits, sourceLanguage: 'en', targetLanguage: 'de', customInstructions })).not.toContain(
        '<user_instructions>'
      );
      expect(buildPolishInstructions({ ...limits, language: 'en', mode: 'transcript_correction', customInstructions })).not.toContain(
        '<user_instructions>'
      );
      expect(buildPolishInstructions({ ...limits, language: 'en', mode: 'social_caption', customInstructions })).not.toContain(
        '<user_instructions>'
      );
    }
  });

  it('keeps instructions at the maximum length intact', () => {
    const longest = 'a'.repeat(MAX_AI_INSTRUCTIONS_CHARS);
    const prompt = buildTranslationInstructions({ ...limits, sourceLanguage: 'en', targetLanguage: 'de', customInstructions: longest });

    expect(prompt).toContain(`<user_instructions>\n${longest}\n</user_instructions>`);
  });
});

describe('video context block', () => {
  const limits = { maxCharsPerLine: 42, maxLinesPerCaption: 2 as const };
  const context = 'Vlog o putovanju u Crnu Goru; gost je Ana Petrović.';
  const block = `<video_context>\n${context}\n</video_context>`;

  const builders = {
    translation: (extra: { videoContext?: string; customInstructions?: string }) =>
      buildTranslationInstructions({ ...limits, sourceLanguage: 'en', targetLanguage: 'sr-Latn', ...extra }),
    conservative: (extra: { videoContext?: string; customInstructions?: string }) =>
      buildPolishInstructions({ ...limits, language: 'sr-Latn', mode: 'conservative', ...extra }),
    social: (extra: { videoContext?: string; customInstructions?: string }) =>
      buildPolishInstructions({ ...limits, language: 'sr-Latn', mode: 'social_caption', ...extra }),
    correction: (extra: { videoContext?: string; customInstructions?: string }) =>
      buildPolishInstructions({ ...limits, language: 'sr-Latn', mode: 'transcript_correction', ...extra })
  };

  it.each(Object.entries(builders))('adds the video context block to the %s prompt', (_name, build) => {
    const prompt = build({ videoContext: context });

    expect(prompt).toContain(block);
    expect(prompt).toContain('Context about the video, written by the user.');
    expect(prompt.endsWith(block)).toBe(true);
  });

  it.each(Object.entries(builders))('trims the video context in the %s prompt', (_name, build) => {
    const prompt = build({ videoContext: `  \n${context}\t \n` });

    expect(prompt).toContain(block);
    expect(prompt).not.toContain(`<video_context>\n `);
    expect(prompt).not.toContain(`\t\n</video_context>`);
  });

  it.each(Object.entries(builders))('is absent from the %s prompt when the context is missing or blank', (_name, build) => {
    for (const videoContext of [undefined, '', '   ', '\n\t  \r\n']) {
      expect(build({ videoContext })).not.toContain('<video_context>');
      expect(build({ videoContext })).not.toContain('Context about the video');
    }
  });

  it.each(Object.entries(builders))('puts the video context before the user instructions in the %s prompt', (_name, build) => {
    const prompt = build({ videoContext: context, customInstructions: 'Ime emisije je "Ljubav na kraju".' });

    expect(prompt.indexOf('<video_context>')).toBeGreaterThan(-1);
    expect(prompt.indexOf('<video_context>')).toBeLessThan(prompt.indexOf('<user_instructions>'));
    expect(prompt.endsWith('<user_instructions>\nIme emisije je "Ljubav na kraju".\n</user_instructions>')).toBe(true);
  });

  it.each(Object.entries(builders))('keeps the video context after the built-in rules in the %s prompt', (_name, build) => {
    const prompt = build({ videoContext: context });

    expect(prompt.indexOf('Return only the JSON object described by the schema.')).toBeLessThan(prompt.indexOf('<video_context>'));
  });

  it('keeps the video context block alone when there are no user instructions', () => {
    const prompt = builders.correction({ videoContext: context, customInstructions: '   ' });

    expect(prompt).toContain(block);
    expect(prompt).not.toContain('<user_instructions>');
  });

  it('adds the user instructions without a video context when only instructions are given', () => {
    const prompt = builders.translation({ customInstructions: 'Use formal address.' });

    expect(prompt).not.toContain('<video_context>');
    expect(prompt.endsWith('<user_instructions>\nUse formal address.\n</user_instructions>')).toBe(true);
  });

  it('does not change the prompt text outside the block when the context is added', () => {
    const plain = builders.correction({});
    const withContext = builders.correction({ videoContext: context });

    expect(withContext.startsWith(plain)).toBe(true);
  });
});
