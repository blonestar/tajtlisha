import Info from 'lucide-react/dist/esm/icons/info.js';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExportOverwritePolicy } from '../../../../shared/types/export';
import type { AppSettings, ExportSettings } from '../../../../shared/types/settings';
import type { WatermarkPosition, WatermarkSettings, WatermarkVariant } from '../../../../shared/types/watermark';
import { WATERMARK_RANGES } from '../../../../shared/watermark-geometry';
import { SegmentedControl, SettingsRow, SettingsSwitch } from './SettingsPrimitives';

type ExportSectionProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

const positionOptions: { value: WatermarkPosition; labelKey: string }[] = [
  { value: 'top_left', labelKey: 'settings.export.logoPositionTopLeft' },
  { value: 'top_right', labelKey: 'settings.export.logoPositionTopRight' },
  { value: 'bottom_left', labelKey: 'settings.export.logoPositionBottomLeft' },
  { value: 'bottom_right', labelKey: 'settings.export.logoPositionBottomRight' }
];

const overwriteOptions: { value: ExportOverwritePolicy; labelKey: string }[] = [
  { value: 'ask', labelKey: 'settings.export.overwriteAsk' },
  { value: 'overwrite', labelKey: 'settings.export.overwriteReplace' },
  { value: 'create_copy', labelKey: 'settings.export.overwriteCopy' }
];

export function ExportSection({ settings, onSettingsChange }: ExportSectionProps): ReactElement {
  const { t } = useTranslation();
  const exportDefaults = settings.exportDefaults;
  const outputFolder = settings.defaultOutputFolder ?? '';
  const watermark = settings.watermark;
  const [folderFailed, setFolderFailed] = useState(false);

  function updateExportDefaults(patch: Partial<ExportSettings>): void {
    onSettingsChange?.({ exportDefaults: { ...exportDefaults, ...patch } });
  }

  function updateWatermark(patch: Partial<WatermarkSettings>): void {
    onSettingsChange?.({ watermark: { ...watermark, ...patch } });
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

      <SettingsRow label={t('settings.export.logo')} htmlFor="settings-logo-enabled" hint={t('settings.export.logoHint')}>
        <SettingsSwitch id="settings-logo-enabled" checked={watermark.enabled} onChange={(enabled) => updateWatermark({ enabled })} />
      </SettingsRow>

      <SettingsRow label={t('settings.export.logoVariant')} labelId="settings-logo-variant">
        <SegmentedControl<WatermarkVariant>
          labelledBy="settings-logo-variant"
          value={watermark.variant}
          disabled={!watermark.enabled}
          options={[
            { value: 'icon', label: t('settings.export.logoVariantIcon') },
            { value: 'icon_text', label: t('settings.export.logoVariantIconText') }
          ]}
          onChange={(variant) => updateWatermark({ variant })}
        />
      </SettingsRow>

      <SettingsRow label={t('settings.export.logoPosition')} labelId="settings-logo-position">
        <SegmentedControl<WatermarkPosition>
          labelledBy="settings-logo-position"
          value={watermark.position}
          disabled={!watermark.enabled}
          options={positionOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          onChange={(position) => updateWatermark({ position })}
        />
      </SettingsRow>

      <SettingsRow label={t('settings.export.logoSize')} htmlFor="settings-logo-size">
        <div className="settings-inline">
          <input
            id="settings-logo-size"
            className="settings-range"
            type="range"
            min={WATERMARK_RANGES.sizePercent.min}
            max={WATERMARK_RANGES.sizePercent.max}
            step={1}
            value={watermark.sizePercent}
            disabled={!watermark.enabled}
            onChange={(event) => updateWatermark({ sizePercent: Number(event.currentTarget.value) })}
          />
          <output htmlFor="settings-logo-size" className="settings-range-value">
            {t('settings.export.logoPercentValue', { value: watermark.sizePercent })}
          </output>
        </div>
      </SettingsRow>

      <SettingsRow label={t('settings.export.logoOpacity')} htmlFor="settings-logo-opacity">
        <div className="settings-inline">
          <input
            id="settings-logo-opacity"
            className="settings-range"
            type="range"
            min={WATERMARK_RANGES.opacity.min}
            max={WATERMARK_RANGES.opacity.max}
            step={0.05}
            value={watermark.opacity}
            disabled={!watermark.enabled}
            onChange={(event) => updateWatermark({ opacity: Number(event.currentTarget.value) })}
          />
          <output htmlFor="settings-logo-opacity" className="settings-range-value">
            {t('settings.export.logoPercentValue', { value: Math.round(watermark.opacity * 100) })}
          </output>
        </div>
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
