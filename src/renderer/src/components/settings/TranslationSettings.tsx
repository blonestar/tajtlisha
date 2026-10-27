import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, AiConnectorSettings } from '../../../../shared/types/settings';
import { InstructionsRow } from './InstructionsRow';
import { SegmentedControl, SettingsRow } from './SettingsPrimitives';

type TranslationSettingsProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

type PolishMode = 'none' | 'light' | 'social';

/** The Translation tab: the polish pass after translation and the user's translation instructions. */
export function TranslationSettings({ settings, onSettingsChange }: TranslationSettingsProps): ReactElement {
  const { t } = useTranslation();
  const connector = settings.aiConnector;

  function updateConnector(patch: Partial<AiConnectorSettings>): void {
    onSettingsChange?.({ aiConnector: { ...connector, ...patch } });
  }

  // The two polish flags are one choice in the UI, so exactly one is ever set.
  const polishMode: PolishMode = connector.socialCaptionPolish ? 'social' : connector.conservativePolish ? 'light' : 'none';

  function setPolishMode(mode: PolishMode): void {
    updateConnector({
      conservativePolish: mode === 'light',
      socialCaptionPolish: mode === 'social'
    });
  }

  return (
    <>
      <SettingsRow label={t('settings.captions.polish')} labelId="settings-polish" hint={t(`settings.captions.polishHint.${polishMode}`)}>
        <SegmentedControl<PolishMode>
          labelledBy="settings-polish"
          value={polishMode}
          options={[
            { value: 'none', label: t('settings.captions.polishNone') },
            { value: 'light', label: t('settings.captions.polishLight') },
            { value: 'social', label: t('settings.captions.polishSocial') }
          ]}
          onChange={setPolishMode}
        />
      </SettingsRow>

      <InstructionsRow
        id="settings-translation-instructions"
        label={t('settings.translation.instructions')}
        hint={t('settings.translation.instructionsHint')}
        placeholder={t('settings.translation.instructionsPlaceholder')}
        value={connector.translationInstructions}
        onCommit={(translationInstructions) => updateConnector({ translationInstructions })}
      />
    </>
  );
}
