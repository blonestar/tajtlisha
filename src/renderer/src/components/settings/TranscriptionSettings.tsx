import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderCapabilities, AiProviderId, ProviderModelDescriptor, ProviderStatus } from '../../../../shared/types/ai';
import type { AppSettings, AiConnectorSettings } from '../../../../shared/types/settings';
import { providerRolesOf } from '../../utils/providerRoles';
import { useProviderModels } from './hooks';
import { InstructionsRow } from './InstructionsRow';
import { ModelPicker, ProviderSelect } from './ProviderControls';
import { SegmentedControl, SettingsRow, SettingsSwitch } from './SettingsPrimitives';

type TranscriptionSettingsProps = {
  settings: AppSettings;
  providers?: ProviderStatus[];
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
  /** Opens the Connectors tab. Shown as a button when no connected provider can transcribe. */
  onOpenConnectors?: () => void;
};

const MIN_CHARS_PER_LINE = 20;
const MAX_CHARS_PER_LINE = 60;

/** Timing whisper-1 gives; the hint names it because OpenAI retires it. */
const EXACT_TIMING_MODEL = 'whisper-1';

/** The Transcription tab: which provider transcribes, how the speech is split into captions, and the correction pass. */
export function TranscriptionSettings({
  settings,
  providers = [],
  onSettingsChange,
  onListModels,
  onOpenConnectors
}: TranscriptionSettingsProps): ReactElement {
  const { t } = useTranslation();
  const connector = settings.aiConnector;
  const { transcriptionId } = providerRolesOf(settings, providers);
  const chosen = providers.find((provider) => provider.id === transcriptionId);
  const canTranscribe = providers.some((provider) => provider.connected && provider.capabilities.transcription);
  const { models, state } = useProviderModels(transcriptionId, 'transcription', Boolean(chosen?.connected), onListModels);
  const modelId = (transcriptionId && connector.transcriptionModelByProvider[transcriptionId]) || '';

  function updateConnector(patch: Partial<AiConnectorSettings>): void {
    onSettingsChange?.({ aiConnector: { ...connector, ...patch } });
  }

  // "Default" is stored as ''. Settings patches merge maps deeply, so a deleted key would keep its old model.
  // Requests treat a blank id as absent (see optionalModelId in useWorkspace).
  function updateModel(transcriptionModel: string): void {
    if (!transcriptionId) return;
    updateConnector({
      transcriptionModelByProvider: { ...connector.transcriptionModelByProvider, [transcriptionId]: transcriptionModel }
    });
  }

  return (
    <>
      <h3 className="settings-subheading">{t('settings.ai.providerAndModel')}</h3>
      <SettingsRow
        label={t('settings.ai.transcriptionProvider')}
        htmlFor="settings-transcription-provider"
        hint={t('settings.ai.transcriptionProviderHint')}
      >
        <ProviderSelect
          id="settings-transcription-provider"
          value={transcriptionId ?? ''}
          providers={providers}
          capability="transcription"
          onChange={(providerId) => {
            if (providerId) updateConnector({ activeProviderId: providerId });
          }}
        />
      </SettingsRow>

      {canTranscribe ? null : (
        <div className="settings-inline settings-provider-notice">
          <span className="muted">{t('settings.ai.noTranscriptionProvider')}</span>
          {onOpenConnectors ? (
            <button type="button" className="btn btn-sm" onClick={onOpenConnectors}>
              {t('settings.ai.openConnectors')}
            </button>
          ) : null}
        </div>
      )}

      {chosen?.connected ? (
        <SettingsRow
          label={t('settings.ai.transcriptionModel')}
          htmlFor="settings-transcription-model"
          hint={
            transcriptionId === 'openai' ? (
              <>
                {t('settings.ai.transcriptionHint')} {t('settings.ai.whisperRetired', { model: EXACT_TIMING_MODEL })}
              </>
            ) : (
              t('settings.ai.transcriptionHint')
            )
          }
        >
          <ModelPicker
            id="settings-transcription-model"
            value={modelId}
            models={models}
            state={state}
            showTiming
            onChange={updateModel}
          />
        </SettingsRow>
      ) : transcriptionId ? (
        <p className="settings-card-note muted">{t('settings.ai.connectToChooseModels')}</p>
      ) : null}

      <SettingsRow
        label={t('settings.captions.detectLanguage')}
        htmlFor="settings-auto-detect"
        hint={t('settings.captions.detectHint')}
      >
        <SettingsSwitch
          id="settings-auto-detect"
          checked={connector.autoDetectInputLanguage}
          onChange={(autoDetectInputLanguage) => updateConnector({ autoDetectInputLanguage })}
        />
      </SettingsRow>

      <SettingsRow
        label={t('settings.captions.maxChars')}
        htmlFor="settings-max-chars"
        hint={t('settings.captions.maxCharsHint')}
      >
        <div className="settings-inline">
          <input
            id="settings-max-chars"
            className="settings-range"
            type="range"
            min={MIN_CHARS_PER_LINE}
            max={MAX_CHARS_PER_LINE}
            step={1}
            value={connector.maxCharsPerLine}
            onChange={(event) => updateConnector({ maxCharsPerLine: Number(event.currentTarget.value) })}
          />
          <output htmlFor="settings-max-chars" className="settings-range-value">
            {t('settings.captions.charactersValue', { count: connector.maxCharsPerLine })}
          </output>
        </div>
      </SettingsRow>

      <SettingsRow label={t('settings.captions.maxLines')} labelId="settings-max-lines">
        <SegmentedControl<1 | 2>
          labelledBy="settings-max-lines"
          value={connector.maxLinesPerCaption}
          options={[
            { value: 1, label: '1' },
            { value: 2, label: '2' }
          ]}
          onChange={(maxLinesPerCaption) => updateConnector({ maxLinesPerCaption })}
        />
      </SettingsRow>

      <SettingsRow label={t('settings.transcription.correct')} htmlFor="settings-correct-transcript" hint={t('settings.transcription.correctHint')}>
        <SettingsSwitch
          id="settings-correct-transcript"
          checked={connector.correctTranscript}
          onChange={(correctTranscript) => updateConnector({ correctTranscript })}
        />
      </SettingsRow>

      <InstructionsRow
        id="settings-correction-instructions"
        label={t('settings.transcription.correctionInstructions')}
        hint={t('settings.transcription.correctionInstructionsHint')}
        placeholder={t('settings.transcription.correctionPlaceholder')}
        value={connector.transcriptCorrectionInstructions}
        onCommit={(transcriptCorrectionInstructions) => updateConnector({ transcriptCorrectionInstructions })}
      />
    </>
  );
}
