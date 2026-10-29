import type { AiProviderId, ProviderStatus } from '../../../shared/types/ai';
import { resolveSummaryProviderId, resolveTextProviderId } from '../../../shared/ai-providers';
import type { AppSettings } from '../../../shared/types/settings';
import type { GenerateProviderInfo } from '../components/workflow/GeneratePanel';

/** The provider chosen for each AI task. Undefined = no provider chosen. */
export type ProviderRoles = {
  /** Transcription (aiConnector.activeProviderId). */
  transcriptionId?: AiProviderId;
  /** Translation, polish, transcript correction (aiConnector.textProviderId, resolved). */
  textId?: AiProviderId;
  /** Summary (summary.providerId, resolved). */
  summaryId?: AiProviderId;
};

export function providerRolesOf(
  settings: Pick<AppSettings, 'aiConnector' | 'summary'>,
  providers: readonly ProviderStatus[]
): ProviderRoles {
  const registeredIds = providers.map((provider) => provider.id);
  return {
    transcriptionId: settings.aiConnector.activeProviderId,
    textId: resolveTextProviderId(settings.aiConnector, registeredIds),
    summaryId: resolveSummaryProviderId(settings.aiConnector, settings.summary, registeredIds)
  };
}

/**
 * Transcription provider after an API key was saved for `connectedId`. The new
 * provider takes the transcription role only when no provider is chosen, or the
 * chosen one is not connected. A provider that cannot transcribe never takes it.
 */
export function activeProviderAfterConnect(
  activeId: AiProviderId | undefined,
  connectedId: AiProviderId,
  providers: readonly ProviderStatus[]
): AiProviderId | undefined {
  const connected = providers.find((provider) => provider.id === connectedId);
  if (!connected?.connected || !connected.capabilities.transcription) {
    return activeId;
  }

  const active = providers.find((provider) => provider.id === activeId);
  return active?.connected ? activeId : connectedId;
}

/** Generate-panel view of one provider. Null when no provider is chosen; an unknown id keeps its id as the name. */
export function generateProviderInfo(
  id: AiProviderId | undefined,
  providers: readonly ProviderStatus[]
): GenerateProviderInfo | null {
  if (!id) return null;

  const status = providers.find((provider) => provider.id === id);
  return {
    id,
    displayName: status?.displayName ?? id,
    connected: status?.connected ?? false,
    canTranscribe: status?.capabilities.transcription ?? false,
    canTranslate: status?.capabilities.translation ?? false,
    canSummarize: status?.capabilities.summary ?? false
  };
}
