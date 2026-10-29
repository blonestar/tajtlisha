import { MemoryCredentialStore } from '../credentials/memory-credential-store';
import type { CredentialStore } from '../credentials/credential-store';
import { AiProviderRegistry, createProviders, type AiProviderRegistryOptions } from './provider-registry';

export function createDefaultAiProviderRegistry(
  credentialStore: CredentialStore = new MemoryCredentialStore(),
  options: AiProviderRegistryOptions = {}
): AiProviderRegistry {
  return new AiProviderRegistry(createProviders(credentialStore), credentialStore, options);
}

export { AiProviderRegistry, type AiProviderRegistryOptions } from './provider-registry';
export { CodexCliProvider } from './codex-cli-provider';
export { ClaudeCodeCliProvider } from './claude-code-cli-provider';
export { LocalCliProvider } from './local-cli-provider';
export { SubtitleWorkflowService } from './subtitle-workflow';
export type {
  AiProvider,
  AiProviderContext,
  ProviderAudioFormat,
  ProviderPolishMode,
  ProviderPolishRequest,
  ProviderTextItem,
  ProviderTimedText,
  ProviderTranscribeRequest,
  ProviderTranscribeResult,
  ProviderTranslateRequest,
  ProviderDefinition
} from './provider';
