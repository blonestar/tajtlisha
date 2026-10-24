import { readFile } from 'node:fs/promises';
import type { AiProviderCapabilities, ProviderModelDescriptor } from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import { validatePath } from '../media/contracts';
import { transcriptionLanguageCode } from './language';
import {
  BaseAiProvider,
  type AiProviderContext,
  type ProviderDefinition,
  type ProviderPolishRequest,
  type ProviderSummarizeRequest,
  type ProviderTextItem,
  type ProviderTranscribeRequest,
  type ProviderTranscribeResult,
  type ProviderTranslateRequest
} from './provider';
import { buildCaptionItemsInput, buildPolishInstructions, buildTranslationInstructions, parseCaptionItems } from './text-prompts';

export const OPENROUTER_DEFAULT_TRANSCRIPTION_MODEL = 'openai/whisper-large-v3';
export const OPENROUTER_DEFAULT_TEXT_MODEL = 'openai/gpt-4.1-mini';

const OPENROUTER_API = 'https://openrouter.ai/api/v1';

export const openRouterProviderDefinition: ProviderDefinition = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  authModes: ['api_key'],
  capabilities: {
    detectLanguage: false,
    transcription: true,
    segmentTimestamps: false,
    wordTimestamps: false,
    translation: true,
    subtitlePolish: true,
    textToSpeech: false,
    summary: true
  },
  modelDescriptors: [
    { id: OPENROUTER_DEFAULT_TRANSCRIPTION_MODEL, label: 'OpenAI Whisper Large v3', capability: 'transcription', timestamps: 'none' }
  ]
};

type OpenRouterModelsPayload = {
  data?: Array<{
    id?: string;
    name?: string;
    architecture?: { output_modalities?: string[] };
  }>;
};

type OpenRouterTranscriptionPayload = {
  text?: string;
};

type OpenRouterChatPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class OpenRouterProvider extends BaseAiProvider {
  protected readonly modelsUrl = `${OPENROUTER_API}/models`;

  constructor(context: AiProviderContext) {
    super(openRouterProviderDefinition, context);
  }

  override async listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]> {
    if (capability === 'transcription') {
      return super.listModels(capability);
    }
    if (capability !== 'translation' && capability !== 'subtitlePolish' && capability !== 'summary') {
      return [];
    }

    const payload = (await this.fetchJson(this.modelsUrl, { method: 'GET' })) as OpenRouterModelsPayload;
    return (payload.data ?? [])
      .filter((model) => model.id && model.architecture?.output_modalities?.includes('text'))
      .map((model) => ({
        id: model.id as string,
        label: model.name ? `${model.name} (${model.id})` : (model.id as string),
        capability
      }));
  }

  /**
   * OpenRouter returns plain text only. Caption timing for this provider comes
   * from speech detection in the workflow, never from a fake whole-clip segment.
   */
  override async transcribe(request: ProviderTranscribeRequest): Promise<ProviderTranscribeResult> {
    validatePath(request.audioPath, 'audioPath');
    const modelId = request.modelId ?? OPENROUTER_DEFAULT_TRANSCRIPTION_MODEL;
    const language = transcriptionLanguageCode(request.language);

    const payload = (await this.fetchJson(`${OPENROUTER_API}/audio/transcriptions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-title': 'Tajtlisha' },
      body: JSON.stringify({
        input_audio: {
          data: (await readFile(request.audioPath)).toString('base64'),
          format: request.audioFormat
        },
        model: modelId,
        ...(language ? { language } : {})
      }),
      signal: request.signal
    })) as OpenRouterTranscriptionPayload;

    return {
      language: request.language ?? 'und',
      text: payload.text?.trim() ?? ''
    };
  }

  override async summarizeText(request: ProviderSummarizeRequest): Promise<string> {
    const payload = (await this.fetchJson(`${OPENROUTER_API}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-title': 'Tajtlisha' },
      body: JSON.stringify({
        model: request.modelId ?? OPENROUTER_DEFAULT_TEXT_MODEL,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.transcript }
        ],
        ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {})
      }),
      signal: request.signal
    })) as OpenRouterChatPayload;

    const content = payload.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'OpenRouter returned an empty summary.');
    }

    return text;
  }

  override async translateTexts(request: ProviderTranslateRequest): Promise<ProviderTextItem[]> {
    const text = await this.requestCaptionText({
      model: request.modelId ?? OPENROUTER_DEFAULT_TEXT_MODEL,
      instructions: buildTranslationInstructions(request),
      items: request.items,
      signal: request.signal
    });
    return parseCaptionItems(text, this.displayName);
  }

  override async polishTexts(request: ProviderPolishRequest): Promise<ProviderTextItem[]> {
    const text = await this.requestCaptionText({
      model: request.modelId ?? OPENROUTER_DEFAULT_TEXT_MODEL,
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
    const payload = (await this.fetchJson(`${OPENROUTER_API}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-title': 'Tajtlisha' },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: 'system',
            content: `${input.instructions} Return JSON only: {"items":[{"id":"...","text":"..."}]}.`
          },
          { role: 'user', content: buildCaptionItemsInput(input.items) }
        ]
      }),
      signal: input.signal
    })) as OpenRouterChatPayload;

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'OpenRouter returned no text response.');
    }

    return content;
  }
}
