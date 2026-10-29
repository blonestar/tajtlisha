import type {
  AiProviderCapabilities,
  AiProviderId,
  AuthMode,
  ProviderModelDescriptor,
  ProviderSummary,
  ReasoningEffort,
  TestConnectionResult
} from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import type { CredentialStore } from '../credentials/credential-store';

export type AiProviderContext = {
  credentialStore: CredentialStore;
};

export type ProviderDefinition = ProviderSummary & {
  modelDescriptors: ProviderModelDescriptor[];
};

export type ProviderAudioFormat = 'wav' | 'mp3' | 'm4a';

export type ProviderTranscribeRequest = {
  audioPath: string;
  audioFormat: ProviderAudioFormat;
  /** Provider model id; undefined = provider default. */
  modelId?: string;
  /** Project language code; undefined = auto-detect. */
  language?: string;
  /** Context text that steers recognition (names, terms). Providers without prompt support ignore it. */
  prompt?: string;
  signal?: AbortSignal;
};

/** Times are milliseconds relative to the start of the audio file that was sent. */
export type ProviderTimedText = {
  text: string;
  startMs: number;
  endMs: number;
};

export type ProviderTranscribeResult = {
  /** Language code of the speech ('und' when unknown). */
  language: string;
  text: string;
  words?: ProviderTimedText[];
  segments?: ProviderTimedText[];
};

export type ProviderTextItem = {
  id: string;
  text: string;
};

type ProviderTextBaseRequest = {
  items: ProviderTextItem[];
  modelId?: string;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
  /** User instructions added after the built-in prompt rules. Undefined or '' = none. */
  customInstructions?: string;
  /** What the video is about, from the project. Undefined or '' = none. */
  videoContext?: string;
  signal?: AbortSignal;
};

export type ProviderTranslateRequest = ProviderTextBaseRequest & {
  sourceLanguage: string;
  targetLanguage: string;
};

/** 'transcript_correction' fixes speech recognition errors in the original text. */
export type ProviderPolishMode = 'conservative' | 'social_caption' | 'transcript_correction';

export type ProviderPolishRequest = ProviderTextBaseRequest & {
  language: string;
  mode: ProviderPolishMode;
};

export type ProviderSummarizeRequest = {
  systemPrompt: string;
  /** Transcript built by buildSummaryTranscript. */
  transcript: string;
  /** Provider model id; undefined = provider default text model. */
  modelId?: string;
  /** Undefined = send no reasoning parameter. */
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
};

export interface AiProvider extends ProviderSummary {
  listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]>;
  testConnection(): Promise<TestConnectionResult>;
  transcribe(request: ProviderTranscribeRequest): Promise<ProviderTranscribeResult>;
  translateTexts(request: ProviderTranslateRequest): Promise<ProviderTextItem[]>;
  polishTexts(request: ProviderPolishRequest): Promise<ProviderTextItem[]>;
  summarizeText(request: ProviderSummarizeRequest): Promise<string>;
  /**
   * Local CLI providers only: finds the installed CLI and reads its version.
   * Null when it is not installed. The registry uses this instead of a credential.
   */
  detectLocalCli?(): Promise<{ path: string; version: string } | null>;
}

type FetchJsonOptions = {
  method: 'GET' | 'POST';
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

/**
 * Shared credential, HTTP, and error handling. Concrete providers only build
 * request bodies and parse responses. Errors are AppError with safe details:
 * the API key never reaches an error message.
 */
export abstract class BaseAiProvider implements AiProvider {
  readonly id: AiProviderId;
  readonly displayName: string;
  readonly authModes: AuthMode[];
  readonly capabilities: AiProviderCapabilities;

  private readonly modelDescriptors: ProviderModelDescriptor[];
  protected readonly credentialStore: CredentialStore;

  protected abstract readonly modelsUrl: string;

  constructor(definition: ProviderDefinition, context: AiProviderContext) {
    this.id = definition.id;
    this.displayName = definition.displayName;
    this.authModes = definition.authModes;
    this.capabilities = definition.capabilities;
    this.modelDescriptors = definition.modelDescriptors;
    this.credentialStore = context.credentialStore;
  }

  async listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]> {
    if (!this.capabilities[capability]) {
      return [];
    }

    return this.modelDescriptors
      .filter((model) => model.capability === capability)
      .map((model) => ({ ...model, available: model.available ?? true }));
  }

  async testConnection(): Promise<TestConnectionResult> {
    const checkedAt = new Date().toISOString();

    if (!(await this.credentialStore.get(this.id))) {
      return { ok: false, providerId: this.id, checkedAt, message: `${this.displayName} is not connected.` };
    }

    try {
      await this.fetchJson(this.modelsUrl, { method: 'GET' });
      return { ok: true, providerId: this.id, checkedAt, message: `${this.displayName} connection verified.` };
    } catch (error) {
      if (error instanceof AppError && error.code === 'JOB_CANCELED') throw error;
      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: error instanceof AppError ? error.detail : `${this.displayName} connection could not be verified.`
      };
    }
  }

  transcribe(_request: ProviderTranscribeRequest): Promise<ProviderTranscribeResult> {
    return Promise.reject(this.unsupported('transcription'));
  }

  translateTexts(_request: ProviderTranslateRequest): Promise<ProviderTextItem[]> {
    return Promise.reject(this.unsupported('translation'));
  }

  polishTexts(_request: ProviderPolishRequest): Promise<ProviderTextItem[]> {
    return Promise.reject(this.unsupported('subtitle polish'));
  }

  summarizeText(_request: ProviderSummarizeRequest): Promise<string> {
    return Promise.reject(this.unsupported('summary'));
  }

  protected unsupported(operation: string): AppError {
    return new AppError('PROVIDER_UNSUPPORTED', `${this.displayName} does not support ${operation}.`);
  }

  protected async requireSecret(): Promise<string> {
    const credential = await this.credentialStore.get(this.id);
    if (!credential?.secret) {
      throw new AppError('PROVIDER_NOT_CONNECTED', `${this.displayName} API key is required before calling this provider.`);
    }

    return credential.secret;
  }

  /**
   * Sends an authorized request and parses the JSON body. Abort maps to
   * JOB_CANCELED; network failures and unreadable bodies map to
   * PROVIDER_REQUEST_FAILED.
   */
  protected async fetchJson(url: string, options: FetchJsonOptions): Promise<unknown> {
    const secret = await this.requireSecret();
    const headers = new Headers(options.headers);
    headers.set('authorization', `Bearer ${secret}`);

    let response: Response;
    try {
      response = await fetch(url, { method: options.method, body: options.body, headers, signal: options.signal });
    } catch (error) {
      throwIfAbort(error, options.signal);
      throw new AppError(
        'PROVIDER_REQUEST_FAILED',
        `Unable to reach ${this.displayName}. Check your internet connection and try again.`
      );
    }

    if (!response.ok) {
      throw await providerHttpError(this.displayName, response, secret);
    }

    try {
      return await response.json();
    } catch (error) {
      throwIfAbort(error, options.signal);
      throw new AppError('PROVIDER_REQUEST_FAILED', `${this.displayName} returned an unreadable response. Please try again.`);
    }
  }
}

/** Maps a non-OK HTTP response to an AppError. The API error message is scrubbed of secrets. */
export async function providerHttpError(displayName: string, response: Response, secret: string): Promise<AppError> {
  const status = response.status;

  if (status === 401 || status === 403) {
    return new AppError('PROVIDER_AUTH_FAILED', `${displayName} rejected the API key.`);
  }

  if (status === 413) {
    return new AppError('AUDIO_TOO_LARGE', `${displayName} rejected the audio because it is too large.`);
  }

  if (status === 429) {
    return new AppError('PROVIDER_RATE_LIMITED', `${displayName} rate limit or quota blocked this request. Check billing and rate limits, then try again.`);
  }

  const apiMessage = await readApiErrorMessage(response, secret);
  return new AppError(
    'PROVIDER_REQUEST_FAILED',
    apiMessage ? `${displayName} request failed (HTTP ${status}): ${apiMessage}` : `${displayName} request failed (HTTP ${status}).`
  );
}

async function readApiErrorMessage(response: Response, secret: string): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } | string };
    const message = typeof payload.error === 'string' ? payload.error : payload.error?.message;
    if (typeof message !== 'string' || !message.trim()) return undefined;
    return scrubSecrets(message, secret).slice(0, 300);
  } catch {
    return undefined;
  }
}

/** Removes the active key and anything that looks like an API key from text. */
export function scrubSecrets(text: string, secret: string): string {
  const withoutSecret = secret ? text.split(secret).join('[redacted]') : text;
  return withoutSecret.replace(/\b(sk|sk-or|sk-proj)-[A-Za-z0-9_-]{6,}/g, '[redacted]');
}

function throwIfAbort(error: unknown, signal?: AbortSignal): void {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    throw new AppError('JOB_CANCELED');
  }
}
