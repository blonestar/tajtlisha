import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderId, ProviderStatus, TestConnectionResult } from '../../../../shared/types/ai';
import { userFacingErrorMessage } from '../../utils/error-message';
import { SettingsRow } from './SettingsPrimitives';

type LocalCliPanelProps = {
  provider: ProviderStatus;
  onRefreshProviders?: () => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
};

type Notice = { tone: 'success' | 'error'; text: string };

/**
 * A local CLI provider has no key. It is connected when its CLI is found on this
 * computer, and the CLI uses its own login. This panel shows what was found.
 */
export function LocalCliPanel({ provider, onRefreshProviders, onTestProvider }: LocalCliPanelProps): ReactElement {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const found = provider.connected;
  const titleId = `settings-cli-${provider.id}-title`;

  async function handleCheckAgain(): Promise<void> {
    if (!onRefreshProviders) return;

    setNotice(null);
    setBusy(true);
    try {
      await onRefreshProviders();
    } catch (error) {
      setNotice({ tone: 'error', text: userFacingErrorMessage(error, t('settings.ai.checkFailed')) });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestConnection(): Promise<void> {
    if (!onTestProvider) return;

    setNotice(null);
    setBusy(true);
    try {
      const result = await onTestProvider(provider.id);
      setNotice({
        tone: result.ok ? 'success' : 'error',
        text: result.message ?? (result.ok ? t('settings.ai.testSucceeded') : t('settings.ai.testFailed'))
      });
    } catch (error) {
      setNotice({ tone: 'error', text: userFacingErrorMessage(error, t('settings.ai.testFailed')) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card" aria-labelledby={titleId}>
      <div className="settings-card-head">
        <h3 id={titleId}>{provider.displayName}</h3>
      </div>
      <p className="settings-card-note muted">{t('settings.ai.localCliNote')}</p>

      {found ? (
        <>
          <SettingsRow label={t('settings.ai.cliVersion')} labelId={`${titleId}-version`}>
            <code className="settings-mono-value" aria-labelledby={`${titleId}-version`}>
              {provider.cliVersion ?? ''}
            </code>
          </SettingsRow>
          <SettingsRow label={t('settings.ai.cliPath')} labelId={`${titleId}-path`}>
            <code className="settings-mono-value" aria-labelledby={`${titleId}-path`} title={provider.cliPath}>
              {provider.cliPath ?? ''}
            </code>
          </SettingsRow>
        </>
      ) : (
        <p className="message message-error" role="status">
          {t('settings.ai.cliNotFoundHint', { provider: provider.displayName })}
        </p>
      )}

      <div className="settings-inline settings-cli-actions">
        <button type="button" className="btn" disabled={!onRefreshProviders || busy} onClick={() => void handleCheckAgain()}>
          {t('settings.ai.checkAgain')}
        </button>
        <button type="button" className="btn" disabled={!onTestProvider || busy} onClick={() => void handleTestConnection()}>
          {t('settings.ai.testConnection')}
        </button>
      </div>
      {notice ? (
        <p className={`message message-${notice.tone}`} role="status">
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
