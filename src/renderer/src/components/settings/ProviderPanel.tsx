import type { FormEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AiProviderCapabilities,
  AiProviderId,
  ProviderModelDescriptor,
  ProviderStatus,
  TestConnectionResult
} from '../../../../shared/types/ai';
import type { AppSettings } from '../../../../shared/types/settings';
import { userFacingErrorMessage } from '../../utils/error-message';
import { SettingsRow } from './SettingsPrimitives';

/** Timing whisper-1 gives; the hint names it because OpenAI retires it. */
const EXACT_TIMING_MODEL = 'whisper-1';

type ProviderPanelProps = {
  provider: ProviderStatus;
  isActive: boolean;
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onActivate?: (providerId: AiProviderId) => void;
  onConnectProvider?: (providerId: AiProviderId, authMode: 'api_key', secret: string) => Promise<void>;
  onDisconnectProvider?: (providerId: AiProviderId) => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
};

type Notice = { tone: 'success' | 'error'; text: string };

type ModelsState = 'idle' | 'loading' | 'ready' | 'error';

export function ProviderPanel({
  provider,
  isActive,
  settings,
  onSettingsChange,
  onActivate,
  onConnectProvider,
  onDisconnectProvider,
  onTestProvider,
  onListModels
}: ProviderPanelProps): ReactElement {
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [transcriptionModels, setTranscriptionModels] = useState<ProviderModelDescriptor[]>([]);
  const [textModels, setTextModels] = useState<ProviderModelDescriptor[]>([]);
  const [modelsState, setModelsState] = useState<ModelsState>('idle');

  const providerId = provider.id;
  const connected = provider.connected;
  const supportsApiKey = provider.authModes.includes('api_key');
  const keyInputId = `settings-ai-key-${providerId}`;
  const transcriptionId = settings.aiConnector.transcriptionModelByProvider[providerId] ?? '';
  const textId = settings.aiConnector.textModelByProvider[providerId] ?? '';
  const selectedTranscription = transcriptionModels.find((model) => model.id === transcriptionId);

  useEffect(() => {
    if (!connected || !onListModels) {
      setTranscriptionModels([]);
      setTextModels([]);
      setModelsState('idle');
      return undefined;
    }

    let active = true;
    setModelsState('loading');
    Promise.all([onListModels(providerId, 'transcription'), onListModels(providerId, 'translation')])
      .then(([nextTranscription, nextText]) => {
        if (active) {
          setTranscriptionModels(nextTranscription);
          setTextModels(nextText);
          setModelsState('ready');
        }
      })
      .catch(() => {
        if (active) {
          setTranscriptionModels([]);
          setTextModels([]);
          setModelsState('error');
        }
      });

    return () => {
      active = false;
    };
  }, [providerId, connected, onListModels]);

  // "Default" is stored as ''. Settings patches merge maps deeply, so a deleted key would keep its old model.
  // Requests treat a blank id as absent (see optionalModelId in useWorkspace).
  function updateModel(kind: 'transcription' | 'translation', modelId: string): void {
    const connector = settings.aiConnector;
    onSettingsChange?.({
      aiConnector:
        kind === 'transcription'
          ? {
              ...connector,
              transcriptionModelByProvider: { ...connector.transcriptionModelByProvider, [providerId]: modelId }
            }
          : {
              ...connector,
              textModelByProvider: { ...connector.textModelByProvider, [providerId]: modelId }
            }
    });
  }

  async function handleConnect(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const key = secret.trim();
    if (!key || !onConnectProvider) {
      return;
    }

    // The typed key leaves React state as soon as it is submitted.
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
          {connected && !isActive ? (
            <button type="button" className="btn" disabled={busy} onClick={() => onActivate?.(providerId)}>
              {t('settings.ai.useForSubtitles')}
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

      {connected ? (
        <>
          <SettingsRow
            label={t('settings.ai.transcriptionModel')}
            htmlFor={`${keyInputId}-transcription`}
            hint={
              providerId === 'openai' ? (
                <>
                  {t('settings.ai.transcriptionHint')} {t('settings.ai.whisperRetired', { model: EXACT_TIMING_MODEL })}
                </>
              ) : (
                t('settings.ai.transcriptionHint')
              )
            }
          >
            <div className="settings-inline">
              <select
                id={`${keyInputId}-transcription`}
                className="select"
                value={transcriptionId}
                onChange={(event) => updateModel('transcription', event.currentTarget.value)}
              >
                <option value="">{t('settings.ai.modelDefault')}</option>
                {modelOptions(transcriptionModels, transcriptionId).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <TimingBadge model={selectedTranscription} />
            </div>
            <ModelsStatus state={modelsState} />
          </SettingsRow>

          <SettingsRow label={t('settings.ai.textModel')} htmlFor={`${keyInputId}-text`} hint={t('settings.ai.textHint')}>
            <select
              id={`${keyInputId}-text`}
              className="select"
              value={textId}
              onChange={(event) => updateModel('translation', event.currentTarget.value)}
            >
              <option value="">{t('settings.ai.modelDefault')}</option>
              {modelOptions(textModels, textId).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </SettingsRow>

        </>
      ) : (
        <p className="settings-card-note muted">{t('settings.ai.connectToChooseModels')}</p>
      )}
    </section>
  );
}

function ModelsStatus({ state }: { state: ModelsState }): ReactElement | null {
  const { t } = useTranslation();

  if (state === 'loading') {
    return <p className="settings-row-hint">{t('settings.ai.modelsLoading')}</p>;
  }

  if (state === 'error') {
    return <p className="message message-error">{t('settings.ai.modelsError')}</p>;
  }

  return null;
}

function TimingBadge({ model }: { model?: ProviderModelDescriptor }): ReactElement | null {
  const { t } = useTranslation();

  switch (model?.timestamps) {
    case 'word':
      return <span className="badge badge-success">{t('settings.ai.timing.word')}</span>;
    case 'none':
      return <span className="badge badge-warning">{t('settings.ai.timing.none')}</span>;
    case 'segment':
      return <span className="badge badge-muted">{t('settings.ai.timing.segment')}</span>;
    default:
      return null;
  }
}

/** Keeps a saved model selectable even when the provider no longer lists it. */
function modelOptions(models: ProviderModelDescriptor[], selectedModelId: string): ProviderModelDescriptor[] {
  if (!selectedModelId || models.some((model) => model.id === selectedModelId)) {
    return models;
  }

  return [{ id: selectedModelId, label: selectedModelId, capability: 'translation' }, ...models];
}
