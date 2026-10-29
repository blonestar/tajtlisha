import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderCapabilities, AiProviderId, ProviderModelDescriptor, ProviderStatus } from '../../../../shared/types/ai';
import type { AppSettings, AiConnectorSettings } from '../../../../shared/types/settings';
import { providerRolesOf } from '../../utils/providerRoles';
import { useProviderModels } from './hooks';
import { InstructionsRow } from './InstructionsRow';
import { EffortSelect, ModelPicker, ProviderSelect } from './ProviderControls';
import { SegmentedControl, SettingsRow } from './SettingsPrimitives';

type TranslationSettingsProps = {
  settings: AppSettings;
  providers?: ProviderStatus[];
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
  /** Opens the Connectors tab. Shown as a button when no connected provider can translate. */
  onOpenConnectors?: () => void;
};

type PolishMode = 'none' | 'light' | 'social';

/**
 * The Translation tab: the provider and model for translation, polish and transcript
 * correction, then the polish pass and the user's translation instructions.
 */
export function TranslationSettings({
  settings,
  providers = [],
  onSettingsChange,
  onListModels,
  onOpenConnectors
}: TranslationSettingsProps): ReactElement {
  const { t } = useTranslation();
  const connector = settings.aiConnector;
  const { textId } = providerRolesOf(settings, providers);
  const chosen = providers.find((provider) => provider.id === textId);
  const canTranslate = providers.some((provider) => provider.connected && provider.capabilities.translation);
  const { models, state } = useProviderModels(textId, 'translation', Boolean(chosen?.connected), onListModels);
  const modelId = (textId && connector.textModelByProvider[textId]) || '';

  function updateConnector(patch: Partial<AiConnectorSettings>): void {
    onSettingsChange?.({ aiConnector: { ...connector, ...patch } });
  }

  // "Default" is stored as '', see TranscriptionSettings. Blank text models mean the provider default.
  function updateModel(textModel: string): void {
    if (!textId) return;
    updateConnector({ textModelByProvider: { ...connector.textModelByProvider, [textId]: textModel } });
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
      <h3 className="settings-subheading">{t('settings.ai.providerAndModel')}</h3>
      <SettingsRow label={t('settings.ai.textProvider')} htmlFor="settings-text-provider" hint={t('settings.ai.textProviderHint')}>
        <ProviderSelect
          id="settings-text-provider"
          value={textId ?? ''}
          providers={providers}
          capability="translation"
          onChange={(providerId) => {
            if (providerId) updateConnector({ textProviderId: providerId });
          }}
        />
      </SettingsRow>

      {canTranslate ? null : (
        <div className="settings-inline settings-provider-notice">
          <span className="muted">{t('settings.ai.noTextProvider')}</span>
          {onOpenConnectors ? (
            <button type="button" className="btn btn-sm" onClick={onOpenConnectors}>
              {t('settings.ai.openConnectors')}
            </button>
          ) : null}
        </div>
      )}

      {chosen?.connected ? (
        <SettingsRow label={t('settings.ai.textModel')} htmlFor="settings-text-model" hint={t('settings.ai.textHint')}>
          <ModelPicker id="settings-text-model" value={modelId} models={models} state={state} onChange={updateModel} />
        </SettingsRow>
      ) : textId ? (
        <p className="settings-card-note muted">{t('settings.ai.connectToChooseModels')}</p>
      ) : null}

      <SettingsRow label={t('settings.ai.textEffort')} htmlFor="settings-text-effort" hint={t('settings.ai.textEffortHint')}>
        <EffortSelect
          id="settings-text-effort"
          value={connector.textReasoningEffort}
          onChange={(textReasoningEffort) => updateConnector({ textReasoningEffort })}
        />
      </SettingsRow>

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
