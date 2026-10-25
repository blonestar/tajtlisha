import { describe, expect, it } from 'vitest';
import { containsCyrillic, serbianCyrillicToLatin } from '../../../src/main/ai/serbian-script';

describe('serbianCyrillicToLatin', () => {
  it('maps every Serbian Cyrillic letter', () => {
    expect(serbianCyrillicToLatin('абвгдђежзијклљмнњопрстћуфхцчџш')).toBe('abvgdđežzijklljmnnjoprstćufhcčdžš');
  });

  it('title-cases digraphs at the start of a word and upper-cases them in all-caps words', () => {
    expect(serbianCyrillicToLatin('Љубав Њујорк Џеп')).toBe('Ljubav Njujork Džep');
    expect(serbianCyrillicToLatin('ЉУБАВ ЊУШКА ЏЕП')).toBe('LJUBAV NJUŠKA DŽEP');
    expect(serbianCyrillicToLatin('Љ.')).toBe('Lj.');
  });

  it('keeps Latin text, digits, punctuation, and line breaks unchanged', () => {
    expect(serbianCyrillicToLatin('Već je 10:30,\nzar ne?')).toBe('Već je 10:30,\nzar ne?');
    expect(serbianCyrillicToLatin('Ово је OK!\nДа.')).toBe('Ovo je OK!\nDa.');
  });

  it('detects Cyrillic letters', () => {
    expect(containsCyrillic('zdravo')).toBe(false);
    expect(containsCyrillic('здраво')).toBe(true);
  });
});
