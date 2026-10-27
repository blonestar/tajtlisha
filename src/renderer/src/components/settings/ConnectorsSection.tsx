import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AiProviderCapabilities,
  AiProviderId,
  ProviderModelDescriptor,
  ProviderStatus,
  TestConnectionResult
} from '../../../../shared/types/ai';
import type { AppSettings } from '../../../../shared/types/settings';
import { ProviderPanel } from './ProviderPanel';

type ConnectorsSectionProps = {
  settings: AppSettings;
  providers: ProviderStatus[];
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onActiveProviderChange?: (providerId: AiProviderId) => void;
  onConnectProvider?: (providerId: AiProviderId, authMode: 'api_key', secret: string) => Promise<void>;
  onDisconnectProvider?: (providerId: AiProviderId) => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
};

export function ConnectorsSection({
  settings,
  providers,
  onSettingsChange,
  onActiveProviderChange,
  onConnectProvider,
  onDisconnectProvider,
  onTestProvider,
  onListModels
}: ConnectorsSectionProps): ReactElement {
  const { t } = useTranslation();
  const activeId = settings.aiConnector.activeProviderId ?? providers[0]?.id;
  const [selectedId, setSelectedId] = useState<AiProviderId | undefined>();
  const selected = providers.find((provider) => provider.id === (selectedId ?? activeId)) ?? providers[0];

  return (
    <>
      <h3 className="settings-subheading">{t('settings.ai.providers')}</h3>
      {providers.length === 0 ? (
        <p className="muted">{t('settings.ai.noProviders')}</p>
      ) : (
        <div className="provider-cards" role="group" aria-label={t('settings.ai.providers')}>
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="provider-card"
              aria-pressed={provider.id === selected?.id}
              onClick={() => setSelectedId(provider.id)}
            >
              <span className="provider-card-head">
                <strong>{provider.displayName}</strong>
                {provider.id === activeId ? <span className="badge badge-accent">{t('settings.ai.active')}</span> : null}
              </span>
              <span className="provider-card-state">
                <span className={`badge ${provider.connected ? 'badge-success' : 'badge-muted'}`}>
                  {provider.connected ? t('settings.ai.connected') : t('settings.ai.notConnected')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <ProviderPanel
          key={selected.id}
          provider={selected}
          isActive={selected.id === activeId}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onActivate={onActiveProviderChange}
          onConnectProvider={onConnectProvider}
          onDisconnectProvider={onDisconnectProvider}
          onTestProvider={onTestProvider}
          onListModels={onListModels}
        />
      ) : null}
    </>
  );
}
