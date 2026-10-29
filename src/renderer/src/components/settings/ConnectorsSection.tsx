import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TriangleAlert from 'lucide-react/dist/esm/icons/triangle-alert.js';
import type { AiProviderId, ProviderStatus, TestConnectionResult } from '../../../../shared/types/ai';
import { isProviderEnabled } from '../../../../shared/ai-providers';
import type { AppSettings } from '../../../../shared/types/settings';
import { providerRolesOf } from '../../utils/providerRoles';
import { LocalCliPanel } from './LocalCliPanel';
import { ProviderPanel } from './ProviderPanel';

type ConnectorsSectionProps = {
  settings: AppSettings;
  /** Connectors that are turned on. The cards and every provider choice use only these. */
  providers: ProviderStatus[];
  /** Every connector, turned on or off, for the Enabled connectors checkboxes. Defaults to providers. */
  allProviders?: ProviderStatus[];
  onConnectProvider?: (providerId: AiProviderId, authMode: 'api_key', secret: string) => Promise<void>;
  onDisconnectProvider?: (providerId: AiProviderId) => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
  onRefreshProviders?: () => Promise<void>;
  onSettingsChange?: (patch: Partial<AppSettings>) => void | Promise<void>;
};

/** Claude Code runs on the user's Claude subscription, which Anthropic's terms may restrict for third-party apps. */
const CLAUDE_CODE_ID: AiProviderId = 'claude_code_cli';

/**
 * Connects the providers. Which provider does which task is chosen in the
 * Transcription, Translation and Summary tabs; the badges here only show it.
 */
export function ConnectorsSection({
  settings,
  providers,
  allProviders = providers,
  onConnectProvider,
  onDisconnectProvider,
  onTestProvider,
  onRefreshProviders,
  onSettingsChange
}: ConnectorsSectionProps): ReactElement {
  const { t } = useTranslation();
  const roles = providerRolesOf(settings, providers);
  const [selectedId, setSelectedId] = useState<AiProviderId | undefined>();
  // A turned-off connector drops out of the cards, so the panel falls back to the first enabled one.
  const selected = providers.find((provider) => provider.id === (selectedId ?? roles.transcriptionId)) ?? providers[0];

  // Saves the choice first, then reloads the statuses so `enabled` and `connected` follow it.
  async function setProviderEnabled(providerId: AiProviderId, enabled: boolean): Promise<void> {
    const connector = settings.aiConnector;
    await onSettingsChange?.({
      aiConnector: { ...connector, enabledProviders: { ...connector.enabledProviders, [providerId]: enabled } }
    });
    await onRefreshProviders?.();
  }

  function roleLabels(providerId: AiProviderId): string[] {
    const labels: string[] = [];
    if (providerId === roles.transcriptionId) labels.push(t('settings.ai.roleTranscription'));
    if (providerId === roles.textId) labels.push(t('settings.ai.roleTranslation'));
    if (providerId === roles.summaryId) labels.push(t('settings.ai.roleSummary'));
    return labels;
  }

  return (
    <>
      <h3 className="settings-subheading">{t('settings.ai.providers')}</h3>
      {providers.length === 0 ? (
        <p className="muted">{t('settings.ai.noProviders')}</p>
      ) : (
        <div className="provider-cards" role="group" aria-label={t('settings.ai.providers')}>
          {providers.map((provider) => {
            const isLocalCli = provider.authModes.includes('local_cli');
            const stateLabel = isLocalCli
              ? provider.connected
                ? t('settings.ai.cliFound')
                : t('settings.ai.cliNotFound')
              : provider.connected
                ? t('settings.ai.connected')
                : t('settings.ai.notConnected');
            return (
              <button
                key={provider.id}
                type="button"
                className="provider-card"
                aria-pressed={provider.id === selected?.id}
                onClick={() => setSelectedId(provider.id)}
              >
                <span className="provider-card-head">
                  <strong>{provider.displayName}</strong>
                  {provider.experimental ? <span className="badge badge-warning">{t('settings.ai.experimental')}</span> : null}
                </span>
                {roleLabels(provider.id).length > 0 ? (
                  <span className="provider-card-roles">
                    {roleLabels(provider.id).map((label) => (
                      <span key={label} className="badge badge-accent">
                        {label}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="provider-card-state">
                  <span className={`badge ${provider.connected ? 'badge-success' : 'badge-muted'}`}>{stateLabel}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        selected.authModes.includes('local_cli') ? (
          <LocalCliPanel
            key={selected.id}
            provider={selected}
            onRefreshProviders={onRefreshProviders}
            onTestProvider={onTestProvider}
          />
        ) : (
          <ProviderPanel
            key={selected.id}
            provider={selected}
            onConnectProvider={onConnectProvider}
            onDisconnectProvider={onDisconnectProvider}
            onTestProvider={onTestProvider}
          />
        )
      ) : null}

      <h3 className="settings-subheading">{t('settings.ai.enabledConnectors')}</h3>
      <p className="settings-row-hint">{t('settings.ai.enabledConnectorsHint')}</p>
      <div className="connector-toggles">
        {allProviders.map((provider) => {
          const inputId = `settings-connector-${provider.id}`;
          return (
            <div key={provider.id} className="connector-toggle">
              <div className="connector-toggle-row">
                <label className="connector-toggle-label" htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={isProviderEnabled(settings.aiConnector, provider.id)}
                    onChange={(event) => void setProviderEnabled(provider.id, event.currentTarget.checked)}
                  />
                  <span>{provider.displayName}</span>
                </label>
                {provider.experimental ? <span className="badge badge-warning">{t('settings.ai.experimental')}</span> : null}
              </div>
              {provider.id === CLAUDE_CODE_ID ? (
                <div className="message message-warning connector-warning" role="note">
                  <TriangleAlert aria-hidden="true" size={16} />
                  <p>{t('settings.ai.claudeCodeWarning')}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
