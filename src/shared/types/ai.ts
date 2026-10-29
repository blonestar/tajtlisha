/**
 * 'codex_cli' and 'claude_code_cli' run the AI CLI installed on this computer
 * (Codex CLI, Claude Code) with the user's own login. They have no transcription,
 * so they can only be the text provider (translation, polish, correction, summary).
 */
export type AiProviderId = 'openai' | 'openrouter' | 'codex_cli' | 'claude_code_cli';

export const AI_PROVIDER_IDS = ['openai', 'openrouter', 'codex_cli', 'claude_code_cli'] as const satisfies readonly AiProviderId[];

export const LOCAL_CLI_PROVIDER_IDS = ['codex_cli', 'claude_code_cli'] as const satisfies readonly AiProviderId[];

/**
 * 'local_cli': no secret. The provider is connected when its CLI is found on
 * this computer; the CLI uses its own login. Tajtlisha never reads CLI auth files.
 */
export type AuthMode = 'api_key' | 'codex_auth_experimental' | 'local_cli';

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
  /** Shown with an "experimental" badge in Settings. */
  experimental?: boolean;
};

export type ProviderStatus = ProviderSummary & {
  /** False when the user turned the connector off in Settings > Connectors. A turned-off connector never runs. */
  enabled: boolean;
  connected: boolean;
  activeAuthMode?: AuthMode;
  maskedCredential?: string;
  /** Local CLI providers only: the detected CLI, for example "codex-cli 0.165.0". Undefined when not found. */
  cliVersion?: string;
  /** Local CLI providers only: absolute path of the detected executable. */
  cliPath?: string;
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
