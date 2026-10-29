import { LOCAL_CLI_PROVIDER_IDS, type AiProviderId } from './types/ai';
import type { AiConnectorSettings, SummarySettings } from './types/settings';

/**
 * Connectors that start turned off until the user turns them on in
 * Settings > Connectors. Claude Code uses the user's Claude subscription, which
 * Anthropic's terms may not allow for third-party apps, so it stays opt-in.
 */
export const DEFAULT_DISABLED_PROVIDER_IDS: readonly AiProviderId[] = ['claude_code_cli'];

/** The explicit choice if the user made one, otherwise the provider default. */
export function isProviderEnabled(connector: Pick<AiConnectorSettings, 'enabledProviders'>, providerId: AiProviderId): boolean {
  const explicit = connector.enabledProviders[providerId];
  if (typeof explicit === 'boolean') {
    return explicit;
  }
  return !DEFAULT_DISABLED_PROVIDER_IDS.includes(providerId);
}

export function isLocalCliProviderId(providerId: AiProviderId | undefined): boolean {
  return (LOCAL_CLI_PROVIDER_IDS as readonly string[]).includes(providerId ?? '');
}

/**
 * Provider used for translation, polish, and transcript correction (and the
 * summary, unless it has its own provider).
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

/** Provider used for the summary: its own choice when registered, else the text provider. */
export function resolveSummaryProviderId(
  connector: Pick<AiConnectorSettings, 'activeProviderId' | 'textProviderId'>,
  summary: Pick<SummarySettings, 'providerId'>,
  registeredIds: readonly AiProviderId[]
): AiProviderId | undefined {
  if (summary.providerId && registeredIds.includes(summary.providerId)) {
    return summary.providerId;
  }
  return resolveTextProviderId(connector, registeredIds);
}
