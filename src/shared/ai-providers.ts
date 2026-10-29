import { LOCAL_CLI_PROVIDER_IDS, type AiProviderId } from './types/ai';
import type { AiConnectorSettings } from './types/settings';

export function isLocalCliProviderId(providerId: AiProviderId | undefined): boolean {
  return (LOCAL_CLI_PROVIDER_IDS as readonly string[]).includes(providerId ?? '');
}

/**
 * Provider used for translation, polish, transcript correction, and summary.
 * A textProviderId that is not among the registered providers (for example a
 * provider hidden in this build) falls back to the transcription provider.
 */
export function resolveTextProviderId(
  connector: Pick<AiConnectorSettings, 'activeProviderId' | 'textProviderId'>,
  registeredIds: readonly AiProviderId[]
): AiProviderId | undefined {
  const textId = connector.textProviderId;
  if (textId && registeredIds.includes(textId)) {
    return textId;
  }
  return connector.activeProviderId;
}
