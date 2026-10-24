import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AiProviderCapabilities, ProviderModelDescriptor } from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import { validatePath } from '../media/contracts';
import { transcriptionLanguageCode, languageCodeFromSpokenName } from './language';
import {
  BaseAiProvider,
  type AiProviderContext,
  type ProviderDefinition,
  type ProviderPolishRequest,
  type ProviderSummarizeRequest,
  type ProviderTextItem,
  type ProviderTranscribeRequest,
  type ProviderTranscribeResult,
  type ProviderTranslateRequest,
  type ProviderTimedText
} from './provider';
import {
  buildCaptionItemsInput,
  buildPolishInstructions,
  buildTranslationInstructions,
  CAPTION_ITEMS_SCHEMA,
  parseCaptionItems
} from './text-prompts';

export const OPENAI_DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1';
export const OPENAI_DEFAULT_TEXT_MODEL = 'gpt-4.1-mini';

export const openAiProviderDefinition: ProviderDefinition = {
  id: 'openai',
  displayName: 'OpenAI',
  authModes: ['api_key'],
  capabilities: {
    detectLanguage: true,
    transcription: true,
    segmentTimestamps: true,
    wordTimestamps: true,
    translation: true,
    subtitlePolish: true,
    textToSpeech: false,
    summary: true
  },
  modelDescriptors: [
    { id: 'whisper-1', label: 'Whisper (whisper-1)', capability: 'transcription', timestamps: 'word' },
    { id: 'gpt-transcribe', label: 'GPT Transcribe', capability: 'transcription', timestamps: 'none' },
    { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe', capability: 'transcription', timestamps: 'none' },
    { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o mini Transcribe', capability: 'transcription', timestamps: 'none' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'translation' },
    { id: 'gpt-4.1', label: 'GPT-4.1', capability: 'translation' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'subtitlePolish' },
    { id: 'gpt-4.1', label: 'GPT-4.1', capability: 'subtitlePolish' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'summary' },
    { id: 'gpt-4.1', label: 'GPT-4.1', capability: 'summary' }
  ]
};

const OPENAI_API = 'https://api.openai.com/v1';

type OpenAiVerboseTranscription = {
  language?: string;
  text?: string;
  words?: Array<{ word?: string; start?: number; end?: number }>;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
};

type OpenAiModelsPayload = {
  data?: Array<{ id?: unknown }>;
};

/** Chat-capable model ids; audio, image, embedding, and similar models are left out. */
const OPENAI_SUMMARY_MODEL_ID = /^(gpt-|chatgpt-|o\d)/;
const OPENAI_NON_TEXT_MODEL_ID = /(audio|realtime|transcribe|tts|image|search|embedding|moderation|instruct|whisper|dall-e)/i;

type OpenAiTextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export class OpenAiProvider extends BaseAiProvider {
  protected readonly modelsUrl = `${OPENAI_API}/models`;

  constructor(context: AiProviderContext) {
    super(openAiProviderDefinition, context);
  }

  override async transcribe(request: ProviderTranscribeRequest): Promise<ProviderTranscribeResult> {
    validatePath(request.audioPath, 'audioPath');
    await this.requireSecret();
    const modelId = request.modelId ?? OPENAI_DEFAULT_TRANSCRIPTION_MODEL;

    const audio = new Blob([await readFile(request.audioPath)], { type: mimeTypeForAudioFormat(request.audioFormat) });
    const form = buildOpenAiTranscriptionForm({
      modelId,
      language: request.language,
      audio,
      fileName: basename(request.audioPath)
    });

    const payload = await this.fetchJson(`${OPENAI_API}/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: request.signal
    });

    return parseOpenAiTranscription(payload, { modelId, requestedLanguage: request.language });
  }

  /**
   * Summary models are listed live so new releases appear without an app update.
   * If the live call fails, the static descriptors are returned instead.
   */
  override async listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]> {
    if (capability !== 'summary') {
      return super.listModels(capability);
    }

    try {
      const payload = (await this.fetchJson(this.modelsUrl, { method: 'GET' })) as OpenAiModelsPayload;
      return (payload.data ?? [])
        .flatMap((model) => (typeof model.id === 'string' ? [model.id] : []))
        .filter((id) => OPENAI_SUMMARY_MODEL_ID.test(id) && !OPENAI_NON_TEXT_MODEL_ID.test(id))
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({ id, label: id, capability: 'summary' }));
    } catch (error) {
      if (error instanceof AppError && error.code === 'JOB_CANCELED') throw error;
      return super.listModels(capability);
    }
  }

  override async summarizeText(request: ProviderSummarizeRequest): Promise<string> {
    const response = (await this.fetchJson(`${OPENAI_API}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.modelId ?? OPENAI_DEFAULT_TEXT_MODEL,
        store: false,
        instructions: request.systemPrompt,
        input: request.transcript,
        ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {})
      }),
      signal: request.signal
    })) as OpenAiTextResponse;

    const text = readOutputText(response).trim();
    if (!text) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'OpenAI returned an empty summary.');
    }

    return text;
  }

  override async translateTexts(request: ProviderTranslateRequest): Promise<ProviderTextItem[]> {
    const text = await this.requestCaptionText({
      model: request.modelId ?? OPENAI_DEFAULT_TEXT_MODEL,
      instructions: buildTranslationInstructions(request),
      items: request.items,
      signal: request.signal
    });
    return parseCaptionItems(text, this.displayName);
  }

  override async polishTexts(request: ProviderPolishRequest): Promise<ProviderTextItem[]> {
    const text = await this.requestCaptionText({
      model: request.modelId ?? OPENAI_DEFAULT_TEXT_MODEL,
      instructions: buildPolishInstructions(request),
      items: request.items,
      signal: request.signal
    });
    return parseCaptionItems(text, this.displayName);
  }

  private async requestCaptionText(input: {
    model: string;
    instructions: string;
    items: ProviderTextItem[];
    signal?: AbortSignal;
  }): Promise<string> {
    const response = (await this.fetchJson(`${OPENAI_API}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        store: false,
        input: [
          { role: 'system', content: input.instructions },
          { role: 'user', content: buildCaptionItemsInput(input.items) }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'caption_items',
            strict: true,
            schema: CAPTION_ITEMS_SCHEMA
          }
        }
      }),
      signal: input.signal
    })) as OpenAiTextResponse;

    const text = readOutputText(response);
    if (!text) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'OpenAI response did not contain output text.');
    }

    return text;
  }
}

/**
 * Builds the multipart body for /v1/audio/transcriptions. Only models with
 * word timestamps (whisper-1) get verbose_json plus timestamp granularities;
 * every other model gets plain json with text only.
 */
export function buildOpenAiTranscriptionForm(input: {
  modelId: string;
  language?: string;
  audio: Blob;
  fileName: string;
}): FormData {
  const form = new FormData();
  form.set('model', input.modelId);

  const language = transcriptionLanguageCode(input.language);
  if (language) {
    form.set('language', language);
  }

  if (openAiTimestamps(input.modelId) === 'word') {
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
  } else {
    form.set('response_format', 'json');
  }

  form.set('file', input.audio, input.fileName);
  return form;
}

/** Normalizes a verbose_json or json transcription payload into a provider result. */
export function parseOpenAiTranscription(
  payload: unknown,
  options: { modelId: string; requestedLanguage?: string }
): ProviderTranscribeResult {
  const body = (payload ?? {}) as OpenAiVerboseTranscription;
  const language = options.requestedLanguage ?? languageCodeFromSpokenName(body.language) ?? 'und';
  const words = toTimedText(body.words?.map((word) => ({ text: word.word, start: word.start, end: word.end })));
  const segments = toTimedText(body.segments);

  return {
    language,
    text: body.text?.trim() ?? '',
    ...(words.length ? { words } : {}),
    ...(segments.length ? { segments } : {})
  };
}

function openAiTimestamps(modelId: string): ProviderModelDescriptor['timestamps'] {
  return openAiProviderDefinition.modelDescriptors.find(
    (model) => model.capability === 'transcription' && model.id === modelId
  )?.timestamps;
}

function toTimedText(items: Array<{ text?: string; start?: number; end?: number }> | undefined): ProviderTimedText[] {
  if (!items) return [];

  return items.flatMap((item) => {
    const text = item.text?.trim();
    if (!text || typeof item.start !== 'number' || typeof item.end !== 'number') return [];

    const startMs = Math.max(0, Math.round(item.start * 1000));
    return [{ text, startMs, endMs: Math.max(startMs, Math.round(item.end * 1000)) }];
  });
}

function mimeTypeForAudioFormat(format: ProviderTranscribeRequest['audioFormat']): string {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
  }
}

/**
 * Returns the first output_text part, or '' when there is none. Reasoning items
 * come first in `output` on reasoning models; they carry no output_text part,
 * so they are skipped.
 */
function readOutputText(response: OpenAiTextResponse): string {
  if (response.output_text) {
    return response.output_text;
  }

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === 'output_text' && typeof content.text === 'string')?.text ?? ''
  );
}
