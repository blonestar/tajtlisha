import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, AiConnectorSettings } from '../../../../shared/types/settings';
import { InstructionsRow } from './InstructionsRow';
import { SegmentedControl, SettingsRow, SettingsSwitch } from './SettingsPrimitives';

type TranscriptionSettingsProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

const MIN_CHARS_PER_LINE = 20;
const MAX_CHARS_PER_LINE = 60;

/** The Transcription tab: how the speech is recognized, split into captions, and corrected afterwards. */
export function TranscriptionSettings({ settings, onSettingsChange }: TranscriptionSettingsProps): ReactElement {
  const { t } = useTranslation();
  const connector = settings.aiConnector;

  function updateConnector(patch: Partial<AiConnectorSettings>): void {
    onSettingsChange?.({ aiConnector: { ...connector, ...patch } });
  }

  return (
    <>
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
