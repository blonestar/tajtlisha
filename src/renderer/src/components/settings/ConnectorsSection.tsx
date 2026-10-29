import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderId, ProviderStatus, TestConnectionResult } from '../../../../shared/types/ai';
import type { AppSettings } from '../../../../shared/types/settings';
import { providerRolesOf } from '../../utils/providerRoles';
import { LocalCliPanel } from './LocalCliPanel';
import { ProviderPanel } from './ProviderPanel';

type ConnectorsSectionProps = {
  settings: AppSettings;
  providers: ProviderStatus[];
  onConnectProvider?: (providerId: AiProviderId, authMode: 'api_key', secret: string) => Promise<void>;
  onDisconnectProvider?: (providerId: AiProviderId) => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
  onRefreshProviders?: () => Promise<void>;
};

/**
 * Connects the providers. Which provider does which task is chosen in the
 * Transcription, Translation and Summary tabs; the badges here only show it.
 */
export function ConnectorsSection({
  settings,
  providers,
  onConnectProvider,
  onDisconnectProvider,
  onTestProvider,
  onRefreshProviders
}: ConnectorsSectionProps): ReactElement {
  const { t } = useTranslation();
  const roles = providerRolesOf(settings, providers);
  const [selectedId, setSelectedId] = useState<AiProviderId | undefined>();
  const selected = providers.find((provider) => provider.id === (selectedId ?? roles.transcriptionId)) ?? providers[0];

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
    </>
  );
}
