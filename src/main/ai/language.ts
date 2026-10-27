/** Project language codes (see PROJECT_LANGUAGES) mapped to names used in prompts. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  'sr-Latn': 'Serbian (Latin script)',
  'sr-Cyrl': 'Serbian (Cyrillic script)',
  hr: 'Croatian',
  bs: 'Bosnian',
  sl: 'Slovenian',
  mk: 'Macedonian',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  uk: 'Ukrainian',
  pl: 'Polish',
  tr: 'Turkish',
  ar: 'Arabic',
  hi: 'Hindi',
  id: 'Indonesian',
  th: 'Thai',
  vi: 'Vietnamese',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean'
};

/**
 * Names Whisper returns in verbose_json (for example "english") mapped to
 * project codes. Covers every language Whisper detects, plus common aliases.
 * Serbian is labeled sr-Latn; Whisper's "javanese" (code jw) maps to ISO jv.
 */
const SPOKEN_LANGUAGE_NAMES: Record<string, string> = {
  afrikaans: 'af',
  albanian: 'sq',
  amharic: 'am',
  arabic: 'ar',
  armenian: 'hy',
  assamese: 'as',
  azerbaijani: 'az',
  bashkir: 'ba',
  basque: 'eu',
  belarusian: 'be',
  bengali: 'bn',
  bosnian: 'bs',
  breton: 'br',
  bulgarian: 'bg',
  burmese: 'my',
  cantonese: 'yue',
  castilian: 'es',
  catalan: 'ca',
  chinese: 'zh',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  english: 'en',
  estonian: 'et',
  faroese: 'fo',
  finnish: 'fi',
  flemish: 'nl',
  french: 'fr',
  galician: 'gl',
  georgian: 'ka',
  german: 'de',
  greek: 'el',
  gujarati: 'gu',
  haitian: 'ht',
  'haitian creole': 'ht',
  hausa: 'ha',
  hawaiian: 'haw',
  hebrew: 'he',
  hindi: 'hi',
  hungarian: 'hu',
  icelandic: 'is',
  indonesian: 'id',
  italian: 'it',
  japanese: 'ja',
  javanese: 'jv',
  kannada: 'kn',
  kazakh: 'kk',
  khmer: 'km',
  korean: 'ko',
  lao: 'lo',
  latin: 'la',
  latvian: 'lv',
  letzeburgesch: 'lb',
  lingala: 'ln',
  lithuanian: 'lt',
  luxembourgish: 'lb',
  macedonian: 'mk',
  malagasy: 'mg',
  malay: 'ms',
  malayalam: 'ml',
  maltese: 'mt',
  mandarin: 'zh',
  maori: 'mi',
  marathi: 'mr',
  moldavian: 'ro',
  moldovan: 'ro',
  mongolian: 'mn',
  myanmar: 'my',
  nepali: 'ne',
  norwegian: 'no',
  nynorsk: 'nn',
  occitan: 'oc',
  panjabi: 'pa',
  pashto: 'ps',
  persian: 'fa',
  polish: 'pl',
  portuguese: 'pt',
  punjabi: 'pa',
  pushto: 'ps',
  romanian: 'ro',
  russian: 'ru',
  sanskrit: 'sa',
  serbian: 'sr-Latn',
  shona: 'sn',
  sindhi: 'sd',
  sinhala: 'si',
  sinhalese: 'si',
  slovak: 'sk',
  slovenian: 'sl',
  somali: 'so',
  spanish: 'es',
  sundanese: 'su',
  swahili: 'sw',
  swedish: 'sv',
  tagalog: 'tl',
  tajik: 'tg',
  tamil: 'ta',
  tatar: 'tt',
  telugu: 'te',
  thai: 'th',
  tibetan: 'bo',
  turkish: 'tr',
  turkmen: 'tk',
  ukrainian: 'uk',
  urdu: 'ur',
  uzbek: 'uz',
  valencian: 'ca',
  vietnamese: 'vi',
  welsh: 'cy',
  yiddish: 'yi',
  yoruba: 'yo'
};

export function languageDisplayName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/**
 * ISO 639-1 code sent to transcription APIs. Script variants collapse to the
 * base language because transcription APIs do not take a script.
 */
export function transcriptionLanguageCode(code: string | undefined): string | undefined {
  if (!code || code === 'und') return undefined;
  return code.split('-')[0].toLowerCase();
}

/** Maps a spoken-language name from a provider response to a project code, or 'und'. */
export function languageCodeFromSpokenName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  return SPOKEN_LANGUAGE_NAMES[normalized] ?? (/^[a-z]{2,3}$/.test(normalized) ? normalized : undefined);
}
