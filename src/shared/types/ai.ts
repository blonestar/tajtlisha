export type AiProviderId = 'openai' | 'openrouter';

export type AuthMode = 'api_key' | 'codex_auth_experimental';

export type AiProviderCapabilities = {
  detectLanguage: boolean;
  transcription: boolean;
  segmentTimestamps: boolean;
  wordTimestamps: boolean;
  translation: boolean;
  subtitlePolish: boolean;
  textToSpeech: boolean;
  /** Free-form summary of a whole transcript, driven by a user system prompt. */
  summary: boolean;
};

/**
 * Thinking effort sent to reasoning models. Which values a model accepts is
 * model-specific; an unsupported value is rejected by the provider API.
 */
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type ProviderSummary = {
  id: AiProviderId;
  displayName: string;
  authModes: AuthMode[];
  capabilities: AiProviderCapabilities;
};

export type ProviderStatus = ProviderSummary & {
  connected: boolean;
  activeAuthMode?: AuthMode;
  maskedCredential?: string;
  lastCheckedAt?: string;
  message?: string;
};

export type ProviderModelDescriptor = {
  id: string;
  label: string;
  capability: keyof AiProviderCapabilities;
  available?: boolean;
  /**
   * Timing a transcription model returns. 'word' models give per-word times,
   * 'segment' models give segment times, 'none' models give text only and the
   * workflow falls back to speech detection. Undefined for non-transcription models.
   */
  timestamps?: 'word' | 'segment' | 'none';
};

export type TestConnectionResult = {
  ok: boolean;
  providerId: AiProviderId;
  message?: string;
  checkedAt: string;
};

export type ConnectProviderInput = {
  providerId: AiProviderId;
  authMode: AuthMode;
  secret?: string;
};
