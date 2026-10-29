import { containsCyrillic, serbianCyrillicToLatin } from './serbian-script';

/**
 * Serbian is written in two standard variants: Ekavian (mesto, vreme, uvek),
 * the norm in Serbia, and Ijekavian (mjesto, vrijeme, uvijek). Whisper mixes
 * Serbian, Croatian and Bosnian and often writes Ekavian speech in Ijekavian
 * forms, and no transcription prompt fixes that reliably.
 */
export type SerbianVariant = 'ekavian' | 'ijekavian';

const IJEKAVIAN_MENTION = /(?<!\p{L})(?:i?jekav|и?јекав)/iu;
const EKAVIAN_MENTION = /(?<!\p{L})(?:ekav|екав)/iu;

/**
 * The variant the user asked for in the video context or instructions, or
 * undefined when none is named. Naming both means Ekavian.
 */
export function requestedSerbianVariant(...texts: Array<string | undefined>): SerbianVariant | undefined {
  const text = texts.filter(Boolean).join('\n');
  if (EKAVIAN_MENTION.test(text)) return 'ekavian';
  if (IJEKAVIAN_MENTION.test(text)) return 'ijekavian';
  return undefined;
}

/** Variant used for Serbian text: the requested one, Ekavian by default. */
export function serbianVariant(...texts: Array<string | undefined>): SerbianVariant {
  return requestedSerbianVariant(...texts) ?? 'ekavian';
}

export function isSerbianLanguage(language: string | undefined): boolean {
  return language === 'sr-Latn' || language === 'sr-Cyrl';
}

type Rule = [pattern: RegExp, replacement: string];

/** Whole words. */
const WORD_RULES: Rule[] = [
  [/^gdje$/, 'gde'],
  [/^ovdje$/, 'ovde'],
  [/^ondje$/, 'onde'],
  [/^negdje$/, 'negde'],
  [/^nigdje$/, 'nigde'],
  [/^igdje$/, 'igde'],
  [/^svugdje$/, 'svugde'],
  [/^svagdje$/, 'svagde'],
  [/^prije$/, 'pre'],
  [/^poslije$/, 'posle'],
  [/^poslijepodne$/, 'poslepodne'],
  [/^dvije$/, 'dve'],
  [/^obje$/, 'obe'],
  [/^objema$/, 'obema'],
  [/^dijete$/, 'dete'],
  [/^dio$/, 'deo'],
  [/^udio$/, 'udeo'],
  [/^sio$/, 'seo'],
  [/^prijedlog/, 'predlog'],
  [/^nalijevo$/, 'nalevo'],
  [/^lijev/, 'lev']
];

/**
 * Jat stems found anywhere in a word, so prefixed forms are covered too
 * (podsjetiti, umjesto, izvještaj). Each stem is a jat reflex in every common
 * word that contains it; the lookaheads skip s+jedin / ob+jedin words.
 */
const STEM_RULES: Rule[] = [
  // Long jat: ije -> e
  [/vrijem/g, 'vrem'],
  [/vrije([dđ])/g, 'vre$1'],
  [/slijed/g, 'sled'],
  [/riječ/g, 'reč'],
  [/rijek/g, 'rek'],
  [/rijet/g, 'ret'],
  [/riješ/g, 'reš'],
  [/lijep/g, 'lep'],
  [/bijel/g, 'bel'],
  [/cijel/g, 'cel'],
  [/cijen/g, 'cen'],
  [/mlijek/g, 'mlek'],
  [/snijeg/g, 'sneg'],
  [/lijek/g, 'lek'],
  [/dijel/g, 'del'],
  [/tijel/g, 'tel'],
  [/svijet/g, 'svet'],
  [/vijest/g, 'vest'],
  [/vijek/g, 'vek'],
  [/vijeć/g, 'več'],
  [/vijed/g, 'ved'],
  [/mijen/g, 'men'],
  [/miješ/g, 'meš'],
  [/mijet/g, 'met'],
  [/cvijet/g, 'cvet'],
  [/cvijeć/g, 'cveć'],
  [/zvijezd/g, 'zvezd'],
  [/grijeh/g, 'greh'],
  [/griješ/g, 'greš'],
  [/smijeh/g, 'smeh'],
  [/smiješ/g, 'smeš'],
  [/nijem/g, 'nem'],
  [/bijes/g, 'bes'],
  [/bijed/g, 'bed'],
  [/bijeg/g, 'beg'],
  [/brijeg/g, 'breg'],
  [/pijes(?=a?k)/g, 'pes'],
  [/prijev/g, 'prev'],
  [/prijel/g, 'prel'],
  [/zahtijev/g, 'zahtev'],
  [/uspijev/g, 'uspev'],
  [/dospijev/g, 'dospev'],
  [/razumij/g, 'razum'],
  // Short jat: je -> e (and lje/nje/rje -> le/ne/re)
  [/uspje/g, 'uspe'],
  [/sljed/g, 'sled'],
  [/sjem/g, 'sem'],
  [/mjes/g, 'mes'],
  [/mješ/g, 'meš'],
  [/mjer/g, 'mer'],
  [/mjen/g, 'men'],
  [/sjet/g, 'set'],
  [/sjeć/g, 'seć'],
  [/sjed(?!in)/g, 'sed'],
  [/sjev/g, 'sev'],
  [/sjen/g, 'sen'],
  [/sjek/g, 'sek'],
  [/vjer/g, 'ver'],
  [/vjet/g, 'vet'],
  [/vjež/g, 'vež'],
  [/vjek/g, 'vek'],
  [/vjest/g, 'vest'],
  [/vješ/g, 'veš'],
  [/vjenč/g, 'venč'],
  [/vjed/g, 'ved'],
  [/djel/g, 'del'],
  [/djec/g, 'dec'],
  [/djet/g, 'det'],
  [/djev/g, 'dev'],
  [/tjer/g, 'ter'],
  [/tjel/g, 'tel'],
  [/htje/g, 'hte'],
  [/bjež/g, 'bež'],
  [/bjeg/g, 'beg'],
  [/bjel/g, 'bel'],
  [/bjed(?!in)/g, 'bed'],
  [/bjeđ/g, 'beđ'],
  [/pjes/g, 'pes'],
  [/pjev/g, 'pev'],
  [/cjel/g, 'cel'],
  [/cjen/g, 'cen'],
  [/ljep/g, 'lep'],
  [/zvjer/g, 'zver'],
  [/snjež/g, 'snež'],
  [/njemač/g, 'nemač'],
  [/rječ/g, 'reč'],
  [/rješ/g, 'reš'],
  [/rjeđ/g, 'ređ']
];

/** Word endings of jat verbs: vidjeti, vidjela, vidio -> videti, videla, video. */
const ENDING_RULES: Rule[] = [
  [/([dtvmbps])je(ti|la|lo|li|le)$/, '$1e$2'],
  [/lje(ti|la|lo|li|le)$/, 'le$1'],
  [/(vid|živ|ht|vol|žel|razum|usp|sm|let|trp|vrt|sed|mrz|stid|gor)io$/, '$1eo']
];

/**
 * Proper names that keep Ijekavian forms in Serbian too (Rijeka, Bijeljina,
 * Prijedor, Bijelo Polje, Sjenica). Checked only for capitalized words.
 */
const IJEKAVIAN_NAMES = /^(?:rijek|bijeljin|bijelo$|bijelom$|prijedor|prijepolj|sjenic|bjelovar)/;

/** Converts common Ijekavian words in Serbian text (Latin or Cyrillic) to Ekavian. */
export function toEkavian(text: string): string {
  return text.replace(/\p{L}+/gu, (word) => (containsCyrillic(word) ? cyrillicWordToEkavian(word) : latinWordToEkavian(word)));
}

function latinWordToEkavian(word: string): string {
  const lower = word.toLowerCase();
  if (!/je|io$/.test(lower)) return word;
  if (lower !== word && IJEKAVIAN_NAMES.test(lower)) return word;

  let converted = lower;
  for (const [pattern, replacement] of WORD_RULES) converted = converted.replace(pattern, replacement);
  for (const [pattern, replacement] of STEM_RULES) converted = converted.replace(pattern, replacement);
  for (const [pattern, replacement] of ENDING_RULES) converted = converted.replace(pattern, replacement);

  return converted === lower ? word : restoreCase(word, converted);
}

function cyrillicWordToEkavian(word: string): string {
  const latin = serbianCyrillicToLatin(word);
  // Only words that survive a round trip, so Latin digraphs map back exactly.
  if (serbianLatinToCyrillic(latin) !== word) return word;
  const converted = latinWordToEkavian(latin);
  return converted === latin ? word : serbianLatinToCyrillic(converted);
}

/** All caps stays all caps, a capital first letter stays capital. */
function restoreCase(original: string, lower: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return lower.toUpperCase();
  if (original[0] !== original[0].toLowerCase()) return lower[0].toUpperCase() + lower.slice(1);
  return lower;
}

const LATIN_TO_CYRILLIC: Record<string, string> = {
  lj: 'љ', nj: 'њ', dž: 'џ',
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', đ: 'ђ', e: 'е', ž: 'ж', z: 'з', i: 'и',
  j: 'ј', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т',
  ć: 'ћ', u: 'у', f: 'ф', h: 'х', c: 'ц', č: 'ч', š: 'ш'
};

function serbianLatinToCyrillic(text: string): string {
  return text.replace(/lj|nj|dž|\p{L}/giu, (match) => {
    const cyrillic = LATIN_TO_CYRILLIC[match.toLowerCase()];
    if (cyrillic === undefined) return match;
    return match[0] === match[0].toLowerCase() ? cyrillic : cyrillic.toUpperCase();
  });
}
