/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { resolveMainLanguage } from '../../../src/main/i18n';

describe('resolveMainLanguage', () => {
  it('keeps an explicit UI language', () => {
    expect(resolveMainLanguage('sr-Cyrl', 'en-US')).toBe('sr-Cyrl');
    expect(resolveMainLanguage('en', 'sr-RS')).toBe('en');
  });

  it('maps Serbian-family system locales to Serbian Latin', () => {
    for (const locale of ['sr', 'sr-RS', 'sr_RS.UTF-8', 'sr-Latn', 'hr', 'hr-HR', 'bs', 'sh', 'sh-RS', 'sh_BA']) {
      expect(resolveMainLanguage('system', locale)).toBe('sr-Latn');
    }
  });

  it('maps a Cyrillic system locale to Serbian Cyrillic', () => {
    expect(resolveMainLanguage('system', 'sr-Cyrl')).toBe('sr-Cyrl');
  });

  it('falls back to English for other locales', () => {
    for (const locale of ['en-US', 'de-DE', 'shi', 'srn', '']) {
      expect(resolveMainLanguage('system', locale)).toBe('en');
    }
  });
});
