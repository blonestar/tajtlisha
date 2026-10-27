import type { SubtitleStyle } from './style';

/**
 * One spoken word of a caption's `original` text, with SOURCE-absolute times.
 * Comes from a word-timestamp transcription. The text may drift from the
 * caption after manual edits; `timeCaptionWords` in src/shared/word-highlight.ts
 * re-aligns them, so never assume a 1:1 match.
 */
export type CaptionWord = {
  text: string;
  startMs: number;
  endMs: number;
};

/**
 * One caption = one shared timing pair with the original text and its
 * translation. Times are absolute positions in the SOURCE video (not trimmed
 * timeline). Export shifts them so the trimmed output starts at 00:00:00.
 */
export type CaptionRow = {
  id: string;
  startMs: number;
  endMs: number;
  /** Text in the spoken language. May contain '\n' for explicit line breaks. */
  original: string;
  /** Translated text. Empty string means "not translated yet". May contain '\n'. */
  translation: string;
  /**
   * The `original` text this translation was produced from (AI or manual).
   * When it differs from the current `original`, the translation is stale: the
   * UI marks it, and "translate again" only re-sends stale/empty rows. We mark
   * instead of clearing so manual translation fixes are never thrown away.
   */
  translatedFrom?: string;
  /**
   * Timed words of `original`, sorted by startMs. Absent when the transcription
   * had no word timing or the caption was added by hand. Used only for word
   * highlighting; caption timing is always startMs/endMs.
   */
  words?: CaptionWord[];
};

export type ProjectSource = {
  inputPath: string;
  /** Ephemeral playback URL (tajtlisha-media://...). Regenerated on every load; never trust a persisted value. */
  fileUrl: string;
  durationMs: number;
  /**
   * Display width/height in square pixels: rotation applied and sample aspect
   * ratio folded into the width. Export renders subtitles at exactly this size.
   */
  width: number;
  height: number;
  hasAudio: boolean;
  /** Size and mtime when probed; a mismatch on load means the file was replaced. */
  fileSizeBytes: number;
  mtimeMs: number;
};

export type TrimRange = {
  /** Source-absolute start, inclusive. */
  startMs: number;
  /** Source-absolute end, exclusive. Always > startMs. */
  endMs: number;
};

export type PreviewTrack = 'original' | 'translation';

export type ProjectDocument = {
  schemaVersion: 1;
  id: string;
  /**
   * Monotonic content revision, incremented by the renderer on every change.
   * Main ignores saves with a revision lower than the last saved one, and jobs
   * compare it to decide whether a finished result is stale.
   */
  revision: number;
  source: ProjectSource | null;
  trim: TrimRange;
  /** Language code of the spoken audio (detected or chosen), e.g. 'en'. Undefined until known. */
  sourceLanguage?: string;
  /** Target translation language code, e.g. 'sr-Latn'. */
  targetLanguage: string;
  /**
   * Language the existing translations were made in. When it differs from
   * targetLanguage, every translation is stale.
   */
  translationLanguage?: string;
  /** Sorted by startMs, non-overlapping when valid. */
  captions: CaptionRow[];
  style: SubtitleStyle;
  /** Which text is shown in the preview and burned into the video by default. */
  previewTrack: PreviewTrack;
  /** How caption timing was produced by the last transcription (approximate for speech_detection). */
  transcription?: {
    providerId: string;
    modelId?: string;
    timingSource: 'word' | 'segment' | 'speech_detection';
  };
  /**
   * What the clip is about, written by the user (topic, place, names, terms).
   * Helps transcription, AI correction and translation. Absent = none. At most
   * MAX_VIDEO_CONTEXT_CHARS.
   */
  videoContext?: string;
  /** ISO timestamp of the last modification (informational only, not used for ordering). */
  updatedAt: string;
};

export type ProjectLoadResult = {
  /** source.fileUrl is fresh when the file exists, '' when it is missing. */
  project: ProjectDocument;
  /** 'ok' | file not found | file exists but size/mtime changed since import. */
  sourceStatus: 'ok' | 'missing' | 'changed';
};

/** Languages offered in the UI for source/target selection. Codes are what AI providers receive. */
export const PROJECT_LANGUAGES = [
  'en',
  'sr-Latn',
  'sr-Cyrl',
  'hr',
  'bs',
  'sl',
  'mk',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'ru',
  'uk',
  'pl',
  'tr',
  'ar',
  'hi',
  'id',
  'th',
  'vi',
  'zh',
  'ja',
  'ko'
] as const;
