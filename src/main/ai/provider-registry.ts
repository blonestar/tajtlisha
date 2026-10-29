import type {
  AiProviderCapabilities,
  AiProviderId,
  ConnectProviderInput,
  ProviderModelDescriptor,
  ProviderStatus,
  ProviderSummary,
  TestConnectionResult
} from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import type { CredentialStore } from '../credentials/credential-store';
import { OpenAiProvider } from './openai-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { CodexCliProvider } from './codex-cli-provider';
import { ClaudeCodeCliProvider } from './claude-code-cli-provider';
import type {
  AiProvider,
  ProviderPolishRequest,
  ProviderSummarizeRequest,
  ProviderTextItem,
  ProviderTranscribeRequest,
  ProviderTranscribeResult,
  ProviderTranslateRequest
} from './provider';

export class AiProviderRegistry {
  private readonly providers = new Map<AiProviderId, AiProvider>();
  private readonly credentialStore: CredentialStore;

  constructor(providers: AiProvider[], credentialStore: CredentialStore) {
    this.credentialStore = credentialStore;

    for (const provider of providers) {
      this.providers.set(provider.id, provider);
    }
  }

  async listProviders(): Promise<ProviderSummary[]> {
    return Array.from(this.providers.values()).map((provider) => this.toSummary(provider));
  }

  async getProviderStatus(providerId: AiProviderId): Promise<ProviderStatus> {
    const provider = this.requireProvider(providerId);
    if (isLocalCliProvider(provider)) {
      return this.getLocalCliStatus(provider);
    }

    const credential = await this.credentialStore.get(providerId);

    return {
      ...this.toSummary(provider),
      connected: Boolean(credential),
      activeAuthMode: credential?.authMode,
      maskedCredential: credential ? await this.maskedCredential(providerId) : undefined,
      message: credential ? `${provider.displayName} is connected.` : `${provider.displayName} is not connected.`
    };
  }

  async connectProvider(input: ConnectProviderInput): Promise<ProviderStatus> {
    const provider = this.requireProvider(input.providerId);

    if (input.authMode === 'codex_auth_experimental') {
      throw new Error('Codex auth reuse is not supported. Tajtlisha will not read ~/.codex/auth.json.');
    }

    if (!provider.authModes.includes(input.authMode)) {
      throw new Error(`${provider.displayName} does not support auth mode ${input.authMode}.`);
    }

    // The CLI keeps its own login, so there is nothing to store. Only detection runs.
    if (input.authMode === 'local_cli') {
      return this.getProviderStatus(input.providerId);
    }

    const secret = input.secret?.trim();
    if (!secret) {
      throw new Error(`${provider.displayName} requires a credential secret for ${input.authMode}.`);
    }

    await this.credentialStore.set({
      providerId: input.providerId,
      authMode: input.authMode,
      secret
    });

    return this.getProviderStatus(input.providerId);
  }

  async disconnectProvider(providerId: AiProviderId): Promise<ProviderStatus> {
    const provider = this.requireProvider(providerId);
    if (!isLocalCliProvider(provider)) {
      await this.credentialStore.delete(providerId);
    }
    return this.getProviderStatus(providerId);
  }

  async testConnection(providerId: AiProviderId): Promise<TestConnectionResult> {
    return this.requireProvider(providerId).testConnection();
  }

  async listModels(
    providerId: AiProviderId,
    capability: keyof AiProviderCapabilities
  ): Promise<ProviderModelDescriptor[]> {
    return this.requireProvider(providerId).listModels(capability);
  }

  async transcribe(providerId: AiProviderId, request: ProviderTranscribeRequest): Promise<ProviderTranscribeResult> {
    return this.requireCapable(providerId, 'transcription').transcribe(request);
  }

  async translateTexts(providerId: AiProviderId, request: ProviderTranslateRequest): Promise<ProviderTextItem[]> {
    return this.requireCapable(providerId, 'translation').translateTexts(request);
  }

  async polishTexts(providerId: AiProviderId, request: ProviderPolishRequest): Promise<ProviderTextItem[]> {
    return this.requireCapable(providerId, 'subtitlePolish').polishTexts(request);
  }

  async summarizeText(providerId: AiProviderId, request: ProviderSummarizeRequest): Promise<string> {
    return this.requireCapable(providerId, 'summary').summarizeText(request);
  }

  private requireCapable(providerId: AiProviderId, capability: keyof AiProviderCapabilities): AiProvider {
    const provider = this.requireProvider(providerId);
    if (!provider.capabilities[capability]) {
      throw new AppError('PROVIDER_UNSUPPORTED', `${provider.displayName} does not support ${capability}.`);
    }

    return provider;
  }

  private requireProvider(providerId: AiProviderId): AiProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown AI provider: ${providerId}`);
    }

    return provider;
  }

  /** A local CLI counts as connected when its executable is found; no credential is read. */
  private async getLocalCliStatus(provider: AiProvider): Promise<ProviderStatus> {
    const detected = await provider.detectLocalCli?.();

    return {
      ...this.toSummary(provider),
      connected: Boolean(detected),
      activeAuthMode: detected ? 'local_cli' : undefined,
      cliVersion: detected?.version,
      cliPath: detected?.path,
      message: detected ? `${provider.displayName} found (${detected.version}).` : `${provider.displayName} was not found on this computer.`
    };
  }

  private toSummary(provider: AiProvider): ProviderSummary {
    return {
      id: provider.id,
      displayName: provider.displayName,
      authModes: [...provider.authModes],
      capabilities: { ...provider.capabilities },
      experimental: provider.experimental
    };
  }

  private async maskedCredential(providerId: AiProviderId): Promise<string | undefined> {
    return (await this.credentialStore.getMaskedStatus(providerId)).maskedCredential;
  }
}

export type CreateProvidersOptions = {
  /**
   * Shows Claude Code (local). Public builds keep it off: Anthropic does not allow
   * third-party products to offer Claude subscription use without approval.
   */
  enableClaudeCode: boolean;
};

export function createProviders(credentialStore: CredentialStore, options: CreateProvidersOptions): AiProvider[] {
  return [
    new OpenAiProvider({ credentialStore }),
    new OpenRouterProvider({ credentialStore }),
    new CodexCliProvider(),
    ...(options.enableClaudeCode ? [new ClaudeCodeCliProvider()] : [])
  ];
}

/** Providers that run a local CLI (they expose detectLocalCli) and never use the credential store. */
function isLocalCliProvider(provider: AiProvider): boolean {
  return typeof provider.detectLocalCli === 'function';
}
