import { AppError } from '../../shared/errors';
import { languageDisplayName } from './language';
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
  input: CaptionLimits & { sourceLanguage: string; targetLanguage: string }
): string {
  return [
    `Translate subtitle captions from ${languageDisplayName(input.sourceLanguage)} to ${languageDisplayName(input.targetLanguage)}.`,
    'Keep the meaning of every caption. Do not summarize, omit, or add content.',
    'Each input item is one on-screen caption.',
    layoutInstruction(input),
    'Return exactly one output item for each input id, with the same id. Do not merge or split items.',
    'Write the target language in the script named in its label: sr-Latn is Serbian in Latin script, sr-Cyrl is Serbian in Cyrillic script.',
    'Return only the JSON object described by the schema.'
  ].join(' ');
}

export function buildPolishInstructions(input: CaptionLimits & { language: string; mode: ProviderPolishMode }): string {
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
    'Return only the JSON object described by the schema.'
  ].join(' ');
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

function layoutInstruction({ maxCharsPerLine, maxLinesPerCaption }: CaptionLimits): string {
  return maxLinesPerCaption === 1
    ? `Keep each caption on one line of about ${maxCharsPerLine} characters.`
    : `Break a caption into at most ${maxLinesPerCaption} lines of about ${maxCharsPerLine} characters each, using "\\n" between lines. Use a line break only when needed.`;
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
