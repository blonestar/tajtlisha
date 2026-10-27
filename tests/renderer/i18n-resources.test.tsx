import { describe, expect, it } from 'vitest';
import { resources } from '../../src/renderer/src/i18n/resources';

type Messages = Record<string, unknown>;

// Serbian Cyrillic is phonetic, so the Latin twin must be its exact transliteration.
const cyrillicToLatin: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j',
  к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š'
};

const transliterationMap: Record<string, string> = { ...cyrillicToLatin };
for (const [cyrillic, latin] of Object.entries(cyrillicToLatin)) {
  transliterationMap[cyrillic.toUpperCase()] = latin.charAt(0).toUpperCase() + latin.slice(1);
}

// Keys whose Latin value is intentionally not a transliteration (product names).
const latinOverrides: Record<string, string> = {
  'app.name': 'Tajtlisha'
};

// Latin tokens that are allowed inside sr-Cyrl text (technical or product names).
// Ctrl is a keyboard key name, kept in Latin in Serbian Cyrillic UI too.
// T and tajtliša are the logo badge and wordmark, which are drawn in Latin on the video.
const allowedLatinTokens = ['Tajtlisha', 'OpenAI', 'OpenRouter', 'FFmpeg', 'SRT', 'MP4', 'API', 'AI', 'Ctrl', 'T', 'tajtliša'];

const placeholderPattern = /(\{\{[^}]+\}\})/;

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {};

  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      flat[path] = value;
    } else {
      Object.assign(flat, flatten(value as Messages, path));
    }
  }

  return flat;
}

function normalizePlaceholders(value: string): string {
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, '{{$1}}');
}

function transliterate(value: string): string {
  // Placeholders sit at odd indexes after splitting on the capturing pattern.
  return value
    .split(placeholderPattern)
    .map((part, index) =>
      index % 2 === 1 ? part : [...part].map((character) => transliterationMap[character] ?? character).join('')
    )
    .join('');
}

const en = flatten(resources.en.translation);
const srLatn = flatten(resources['sr-Latn'].translation);
const srCyrl = flatten(resources['sr-Cyrl'].translation);

describe('i18n resources', () => {
  it('defines the same non-empty key set in every language', () => {
    const keys = Object.keys(en).sort();

    expect(Object.keys(srLatn).sort()).toEqual(keys);
    expect(Object.keys(srCyrl).sort()).toEqual(keys);

    for (const messages of [en, srLatn, srCyrl]) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('keeps sr-Latn as the exact Latin transliteration of sr-Cyrl', () => {
    const mismatches = Object.keys(srCyrl).flatMap((key) => {
      const expected = normalizePlaceholders(latinOverrides[key] ?? transliterate(srCyrl[key]));
      const actual = normalizePlaceholders(srLatn[key]);

      return actual === expected ? [] : [`${key}: expected "${expected}", got "${actual}"`];
    });

    expect(mismatches).toEqual([]);
  });

  it('keeps sr-Cyrl free of Latin text except allowed technical names', () => {
    const allowed = new RegExp(`\\b(${allowedLatinTokens.join('|')})\\b`, 'g');
    const mismatches = Object.entries(srCyrl).flatMap(([key, value]) => {
      const stripped = value.replace(new RegExp(placeholderPattern.source, 'g'), '').replace(allowed, '');

      return /[A-Za-z]/.test(stripped) ? [`${key}: "${value}"`] : [];
    });

    expect(mismatches).toEqual([]);
  });

  it('keeps sr-Latn free of Cyrillic characters', () => {
    const mismatches = Object.entries(srLatn).flatMap(([key, value]) =>
      /[Ѐ-ӿ]/.test(value) ? [`${key}: "${value}"`] : []
    );

    expect(mismatches).toEqual([]);
  });

  it('keeps interpolation placeholders identical across languages', () => {
    for (const key of Object.keys(en)) {
      const placeholders = (value: string): string[] => value.match(/\{\{[^}]+\}\}/g)?.sort() ?? [];

      expect(placeholders(srLatn[key]), key).toEqual(placeholders(en[key]));
      expect(placeholders(srCyrl[key]), key).toEqual(placeholders(en[key]));
    }
  });
});
