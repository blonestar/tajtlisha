import { AppError } from '../../shared/errors';
import { languageDisplayName } from './language';
import { isSerbianLanguage, serbianVariant } from './serbian-variant';
import type { ProviderPolishMode, ProviderTextItem } from './provider';

export type SummarySegmentInput = {
  startMs: number;
  endMs: number;
  text: string;
};

export type CaptionLimits = {
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

/** Optional user text added to the caption prompts. */
type PromptExtras = {
  customInstructions?: string;
  videoContext?: string;
};

/** JSON schema for `{ items: [{ id, text }] }`, used with structured output. */
export const CAPTION_ITEMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string' }
        }
      }
    }
  }
} as const;

export function buildTranslationInstructions(
  input: CaptionLimits & { sourceLanguage: string; targetLanguage: string } & PromptExtras
): string {
  return [
    `Translate subtitle captions from ${languageDisplayName(input.sourceLanguage)} to ${languageDisplayName(input.targetLanguage)}.`,
    'Keep the meaning of every caption. Do not summarize, omit, or add content.',
    'Each input item is one on-screen caption.',
    layoutInstruction(input),
    'Return exactly one output item for each input id, with the same id. Do not merge or split items.',
    scriptInstruction(input.targetLanguage),
    serbianVariantInstruction(input.targetLanguage, input),
    'Return only the JSON object described by the schema.'
  ]
    .filter(Boolean)
    .join(' ')
    .concat(videoContextBlock(input.videoContext), userInstructionsBlock(input.customInstructions));
}

export function buildPolishInstructions(
  input: CaptionLimits & { language: string; mode: ProviderPolishMode } & PromptExtras
): string {
  if (input.mode === 'transcript_correction') {
    return buildCorrectionInstructions(input);
  }

  const style =
    input.mode === 'social_caption'
      ? 'Make the wording short, natural, and punchy for social-media captions.'
      : 'Make only conservative wording and punctuation fixes; keep the existing phrasing.';

  return [
    `Polish subtitle captions written in ${languageDisplayName(input.language)}, without changing their meaning.`,
    style,
    'Each input item is one on-screen caption.',
    layoutInstruction(input),
    'Return exactly one output item for each input id, with the same id. Do not merge or split items.',
    scriptInstruction(input.language),
    serbianVariantInstruction(input.language, input),
    'Return only the JSON object described by the schema.'
  ]
    .filter(Boolean)
    .join(' ')
    .concat(videoContextBlock(input.videoContext), userInstructionsBlock(input.customInstructions));
}

/**
 * Correction of raw speech recognition output. The captions are already timed
 * word by word, so the model must keep the spoken wording and only fix what
 * was misheard or badly written; rewording would break the word timing.
 */
function buildCorrectionInstructions(input: CaptionLimits & { language: string } & PromptExtras): string {
  const language =
    input.language.trim() === '' || input.language === 'und'
      ? 'Keep the captions in the language they are written in. Do not translate them.'
      : `The captions are in ${languageDisplayName(input.language)}. Keep them in that language. Do not translate them.`;

  return [
    'You correct subtitle captions produced by automatic speech recognition.',
    language,
    'Fix misheard or misspelled words, names, and terms, and fix capitalization and punctuation.',
    'Use the surrounding captions as context to decide what was really said.',
    'Keep the speaker\'s own wording and word order. Do not paraphrase, shorten, summarize, censor, or add content.',
    'If a caption is already correct, return it unchanged.',
    'Each input item is one on-screen caption, in spoken order.',
    layoutInstruction(input),
    'Return exactly one output item for each input id, with the same id. Do not merge or split items, and never return an empty text.',
    scriptInstruction(input.language),
    serbianVariantInstruction(input.language, input, { correction: true }),
    'Return only the JSON object described by the schema.'
  ]
    .filter(Boolean)
    .join(' ')
    .concat(videoContextBlock(input.videoContext), userInstructionsBlock(input.customInstructions));
}

/**
 * What the video is about, as the user described it. It is background only:
 * the model uses it to recognize names, terms and the topic, and never copies
 * it into captions.
 */
function videoContextBlock(videoContext: string | undefined): string {
  const text = videoContext?.trim();
  if (!text) return '';

  return [
    '',
    '',
    'Context about the video, written by the user. Use it to understand the topic and to recognize names and terms. It is not caption text: never copy it into the captions.',
    '<video_context>',
    text,
    '</video_context>'
  ].join('\n');
}

/**
 * The user's own instructions, added after the built-in rules. The output
 * format rules still win, so a user note cannot break response parsing.
 */
function userInstructionsBlock(customInstructions: string | undefined): string {
  const text = customInstructions?.trim();
  if (!text) return '';

  return [
    '',
    '',
    'Additional instructions from the user. Follow them, unless they conflict with the rules about ids, item count, or the JSON output format:',
    '<user_instructions>',
    text,
    '</user_instructions>'
  ].join('\n');
}

export function buildCaptionItemsInput(items: ProviderTextItem[]): string {
  return JSON.stringify({ items: items.map(({ id, text }) => ({ id, text })) });
}

/**
 * Parses `{ items: [{ id, text }] }` from model output. Entries with the wrong
 * shape are dropped; the workflow reports ids that are still missing.
 */
export function parseCaptionItems(raw: string, providerName: string): ProviderTextItem[] {
  let payload: unknown;
  try {
    payload = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new AppError('PROVIDER_REQUEST_FAILED', `${providerName} returned an invalid caption response.`);
  }

  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    throw new AppError('PROVIDER_REQUEST_FAILED', `${providerName} returned an invalid caption response.`);
  }

  return items
    .filter((item): item is ProviderTextItem => typeof item?.id === 'string' && typeof item?.text === 'string')
    .map(({ id, text }) => ({ id, text }));
}

/**
 * Plain-text transcript for the summary prompt: a language line, then one
 * `[time] text` line per segment. Times are already clip-relative.
 */
export function buildSummaryTranscript(segments: SummarySegmentInput[], language: string): string {
  const languageLine =
    language === 'und' ? 'Transcript language: unknown' : `Transcript language: ${languageDisplayName(language)}`;
  const lines = segments.map(
    (segment) => `[${formatClockTime(segment.startMs)}] ${segment.text.replace(/\s*[\r\n]+\s*/g, ' ').trim()}`
  );

  return [languageLine, '', ...lines].join('\n');
}

/** `m:ss`, or `h:mm:ss` from one hour on. Whole seconds, rounded down. */
function formatClockTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Explicit script rule for Serbian targets; empty for other languages. */
function scriptInstruction(language: string): string {
  if (language === 'sr-Latn') {
    return 'Write Serbian only in Latin script (with č, ć, š, ž, đ). Never use Cyrillic letters.';
  }
  if (language === 'sr-Cyrl') {
    return 'Write Serbian only in Cyrillic script. Never use Latin letters for Serbian words.';
  }
  return '';
}

/**
 * Ekavian or Ijekavian Serbian; empty for other languages. Ekavian unless the
 * video context or the user's instructions name Ijekavian. In correction, the
 * recognizer's Ijekavian forms count as spelling mistakes.
 */
function serbianVariantInstruction(language: string, extras: PromptExtras, options: { correction?: boolean } = {}): string {
  if (!isSerbianLanguage(language)) return '';

  if (serbianVariant(extras.videoContext, extras.customInstructions) === 'ijekavian') {
    return 'Write Serbian in the Ijekavian variant (for example mjesto, vrijeme, uvijek, riječ, djeca, gdje, poslije), as the user asked.';
  }

  return [
    'Write Serbian in the standard Ekavian variant used in Serbia (for example mesto, vreme, uvek, reč, deca, gde, posle, podsetiti, izveštavati), never in Ijekavian forms (mjesto, vrijeme, uvijek, riječ, djeca, gdje, poslije, podsjetiti, izvještavati), and use Serbian words rather than Croatian or Bosnian ones.',
    options.correction
      ? 'Speech recognition often writes Serbian in Ijekavian forms: change them to Ekavian. This is a spelling fix, not rewording.'
      : ''
  ]
    .filter(Boolean)
    .join(' ');
}

function layoutInstruction({ maxCharsPerLine, maxLinesPerCaption }: CaptionLimits): string {
  return maxLinesPerCaption === 1
    ? `Keep each caption on one line of about ${maxCharsPerLine} characters.`
    : `Break a caption into at most ${maxLinesPerCaption} lines of about ${maxCharsPerLine} characters each, using "\\n" between lines. Use a line break only when needed.`;
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
