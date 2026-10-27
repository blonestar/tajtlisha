import Info from 'lucide-react/dist/esm/icons/info.js';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExportOverwritePolicy } from '../../../../shared/types/export';
import type { AppSettings, ExportSettings } from '../../../../shared/types/settings';
import { SegmentedControl, SettingsRow } from './SettingsPrimitives';

type ExportSectionProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

const overwriteOptions: { value: ExportOverwritePolicy; labelKey: string }[] = [
  { value: 'ask', labelKey: 'settings.export.overwriteAsk' },
  { value: 'overwrite', labelKey: 'settings.export.overwriteReplace' },
  { value: 'create_copy', labelKey: 'settings.export.overwriteCopy' }
];

export function ExportSection({ settings, onSettingsChange }: ExportSectionProps): ReactElement {
  const { t } = useTranslation();
  const exportDefaults = settings.exportDefaults;
  const outputFolder = settings.defaultOutputFolder ?? '';
  const [folderFailed, setFolderFailed] = useState(false);

  function updateExportDefaults(patch: Partial<ExportSettings>): void {
    onSettingsChange?.({ exportDefaults: { ...exportDefaults, ...patch } });
  }

  async function chooseOutputFolder(): Promise<void> {
    setFolderFailed(false);
    try {
      const result = await window.tajtlisha.export.selectOutputFolder();
      if (result) {
        onSettingsChange?.({ defaultOutputFolder: result.outputFolder });
      }
    } catch {
      setFolderFailed(true);
    }
  }

  // The settings store ignores undefined in a patch, so "not set" is sent as ''.
  function clearOutputFolder(): void {
    onSettingsChange?.({ defaultOutputFolder: '' });
  }

  return (
    <>
      <p className="settings-fact">
        <Info aria-hidden="true" size={15} />
        {t('settings.export.originalNeverModified')}
      </p>

      <SettingsRow label={t('settings.export.outputFolder')} labelId="settings-output-folder" hint={t('settings.export.outputFolderHint')}>
        {outputFolder.trim() ? (
          <code className="settings-path" title={outputFolder}>
            {outputFolder}
          </code>
        ) : (
          <span className="muted">{t('settings.export.sameFolder')}</span>
        )}
        <div className="settings-inline">
          <button type="button" className="btn" onClick={() => void chooseOutputFolder()}>
            {t('settings.export.chooseFolder')}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!outputFolder} onClick={clearOutputFolder}>
            {t('settings.export.clearFolder')}
          </button>
        </div>
        {folderFailed ? <p className="message message-error">{t('settings.export.folderFailed')}</p> : null}
      </SettingsRow>

      <SettingsRow label={t('settings.export.defaultOutputs')} labelId="settings-default-outputs" hint={t('settings.export.defaultOutputsHint')}>
        <div className="settings-checks" role="group" aria-labelledby="settings-default-outputs">
          <label className="settings-check-option">
            <input
              type="checkbox"
              checked={exportDefaults.exportOriginalSrt}
              onChange={(event) => updateExportDefaults({ exportOriginalSrt: event.currentTarget.checked })}
            />
            {t('settings.export.originalSrt')}
          </label>
          <label className="settings-check-option">
            <input
              type="checkbox"
              checked={exportDefaults.exportTranslatedSrt}
              onChange={(event) => updateExportDefaults({ exportTranslatedSrt: event.currentTarget.checked })}
            />
            {t('settings.export.translatedSrt')}
          </label>
        </div>
      </SettingsRow>

      <SettingsRow label={t('settings.export.burnedIn')} labelId="settings-burned-in" hint={t('settings.export.burnedInHint')}>
        <SegmentedControl
          labelledBy="settings-burned-in"
          value={exportDefaults.defaultBurnedInTrack}
          options={[
            { value: 'original', label: t('settings.export.trackOriginal') },
            { value: 'translation', label: t('settings.export.trackTranslated') }
          ]}
          onChange={(defaultBurnedInTrack) => updateExportDefaults({ defaultBurnedInTrack })}
        />
      </SettingsRow>

      <SettingsRow label={t('settings.export.overwrite')} labelId="settings-overwrite" hint={t('settings.export.overwriteHint')}>
        <SegmentedControl
          labelledBy="settings-overwrite"
          value={exportDefaults.overwritePolicy}
          options={overwriteOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          onChange={(overwritePolicy) => updateExportDefaults({ overwritePolicy })}
        />
      </SettingsRow>
    </>
  );
}
