import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderId, ProviderStatus, TestConnectionResult } from '../../../../shared/types/ai';
import { userFacingErrorMessage } from '../../utils/error-message';
import { SettingsRow } from './SettingsPrimitives';

type ProviderPanelProps = {
  provider: ProviderStatus;
  onConnectProvider?: (providerId: AiProviderId, authMode: 'api_key', secret: string) => Promise<void>;
  onDisconnectProvider?: (providerId: AiProviderId) => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
};

type Notice = { tone: 'success' | 'error'; text: string };

/** Connects an API provider with its key. Models are chosen in the Transcription and Translation tabs. */
export function ProviderPanel({ provider, onConnectProvider, onDisconnectProvider, onTestProvider }: ProviderPanelProps): ReactElement {
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const providerId = provider.id;
  const connected = provider.connected;
  const supportsApiKey = provider.authModes.includes('api_key');
  const keyInputId = `settings-ai-key-${providerId}`;

  // The typed key leaves React state as soon as it is submitted.
  async function handleConnect(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const key = secret.trim();
    if (!key || !onConnectProvider) {
      return;
    }

    setSecret('');
    setNotice(null);
    setBusy(true);
    try {
      await onConnectProvider(providerId, 'api_key', key);
      setNotice({ tone: 'success', text: t('settings.ai.connectSucceeded') });
    } catch (error) {
      setNotice({ tone: 'error', text: userFacingErrorMessage(error, t('settings.ai.connectFailed')) });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestConnection(): Promise<void> {
    if (!onTestProvider) {
      return;
    }

    setNotice(null);
    setBusy(true);
    try {
      const result = await onTestProvider(providerId);
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

  async function handleDisconnect(): Promise<void> {
    if (!onDisconnectProvider) {
      return;
    }

    setNotice(null);
    setBusy(true);
    try {
      await onDisconnectProvider(providerId);
      setNotice({ tone: 'success', text: t('settings.ai.disconnectSucceeded') });
    } catch (error) {
      setNotice({ tone: 'error', text: userFacingErrorMessage(error, t('settings.ai.connectFailed')) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card" aria-labelledby={`${keyInputId}-title`}>
      <div className="settings-card-head">
        <h3 id={`${keyInputId}-title`}>{provider.displayName}</h3>
      </div>

      <SettingsRow
        label={t('settings.ai.apiKey')}
        htmlFor={keyInputId}
        hint={supportsApiKey ? t('settings.ai.apiKeyHint') : t('settings.ai.keyNotSupported')}
      >
        {connected ? (
          <div className="settings-stored-key">
            <span className="muted">{t('settings.ai.storedKey')}</span>
            <code>{provider.maskedCredential ?? ''}</code>
          </div>
        ) : null}
        <form className="settings-inline settings-key-form" onSubmit={(event) => void handleConnect(event)}>
          <input
            id={keyInputId}
            className="input input-mono"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={connected ? t('settings.ai.replaceKeyPlaceholder') : t('settings.ai.apiKeyPlaceholder')}
            value={secret}
            disabled={!supportsApiKey || busy}
            onChange={(event) => setSecret(event.currentTarget.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!supportsApiKey || !secret.trim() || !onConnectProvider || busy}
          >
            {connected ? t('settings.ai.replaceKey') : t('settings.ai.connect')}
          </button>
        </form>
        <div className="settings-inline">
          {connected ? (
            <button type="button" className="btn" disabled={!onTestProvider || busy} onClick={() => void handleTestConnection()}>
              {t('settings.ai.testConnection')}
            </button>
          ) : null}
          {connected ? (
            <button type="button" className="btn btn-ghost btn-danger" disabled={!onDisconnectProvider || busy} onClick={() => void handleDisconnect()}>
              {t('settings.ai.disconnect')}
            </button>
          ) : null}
        </div>
        {notice ? (
          <p className={`message message-${notice.tone}`} role="status">
            {notice.text}
          </p>
        ) : null}
      </SettingsRow>
    </section>
  );
}
