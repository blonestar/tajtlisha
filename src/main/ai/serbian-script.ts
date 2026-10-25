/**
 * Serbian Cyrillic to Latin transliteration. The mapping is one-to-one per
 * letter, so it is safe to apply to model output. The reverse direction is
 * ambiguous (lj, nj, dz digraphs) and is left to the model.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š'
};

const CYRILLIC_LETTER = /[Ѐ-ӿ]/;
const CYRILLIC_LETTERS = /[Ѐ-ӿ]/g;

export function containsCyrillic(text: string): boolean {
  return CYRILLIC_LETTER.test(text);
}

export function serbianCyrillicToLatin(text: string): string {
  if (!containsCyrillic(text)) return text;

  return text.replace(CYRILLIC_LETTERS, (char, offset: number, whole: string) => {
    const lower = char.toLowerCase();
    const latin = CYRILLIC_TO_LATIN[lower];
    if (latin === undefined) return char;
    if (char === lower) return latin;
    if (latin.length === 1) return latin.toUpperCase();

    // Digraphs (Lj, Nj, Dž): all caps inside an all-caps word, title case otherwise.
    const next = whole[offset + 1] ?? '';
    const prev = whole[offset - 1] ?? '';
    const neighbourIsUpper = isUpperLetter(next) || (!isLetter(next) && isUpperLetter(prev));
    return neighbourIsUpper ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
  });
}

/** ђ and ћ exist only in Serbian (and Montenegrin) Cyrillic, not in Russian, Ukrainian, Bulgarian, or Macedonian. */
const SERBIAN_ONLY_CYRILLIC = /[ђћЂЋ]/;

/** True when text in an unknown language is clearly Serbian Cyrillic. */
export function looksLikeSerbianCyrillic(text: string): boolean {
  return SERBIAN_ONLY_CYRILLIC.test(text);
}

/** True when text in `language` must be written in Latin script. */
export function requiresSerbianLatin(language: string | undefined): boolean {
  return language === 'sr-Latn';
}

function isLetter(char: string): boolean {
  return char !== '' && char.toLowerCase() !== char.toUpperCase();
}

function isUpperLetter(char: string): boolean {
  return isLetter(char) && char === char.toUpperCase();
}
