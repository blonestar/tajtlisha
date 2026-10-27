import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js';
import { APP_AUTHOR, REPOSITORY_URL } from '../../../../shared/app-links';
import type { AppSettings } from '../../../../shared/types/settings';
import { FfmpegPanel } from './FfmpegPanel';
import { useAppInfo } from './hooks';
import { SettingsRow, SettingsSwitch } from './SettingsPrimitives';
import { UpdatesPanel } from './UpdatesPanel';

const platformLabelKeys: Record<string, string> = {
  linux: 'settings.about.platformLinux',
  win32: 'settings.about.platformWindows',
  darwin: 'settings.about.platformMacos'
};

type AboutSectionProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

export function AboutSection({ settings, onSettingsChange }: AboutSectionProps): ReactElement {
  const { t } = useTranslation();
  const info = useAppInfo();
  const platformKey = info ? platformLabelKeys[info.platform] : undefined;

  function setAutoCheck(checked: boolean): void {
    onSettingsChange?.({ autoCheckUpdates: checked });
    // Turning it on should not wait up to an hour for the first automatic check.
    if (checked) {
      window.tajtlisha?.updates?.check().catch(() => undefined);
    }
  }

  return (
    <>
      <SettingsRow label={t('settings.about.appVersion')}>
        <span className="mono">{info?.version ?? '-'}</span>
      </SettingsRow>
      <SettingsRow label={t('settings.about.platform')}>
        <span>{platformKey ? t(platformKey) : (info?.platform ?? '-')}</span>
      </SettingsRow>
      <SettingsRow label={t('settings.about.author')}>
        <span>{APP_AUTHOR}</span>
      </SettingsRow>
      <SettingsRow label={t('settings.about.sourceCode')}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title={t('settings.about.openRepository')}
          onClick={() => void window.tajtlisha?.app?.openRepository?.().catch(() => undefined)}
        >
          <ExternalLink size={14} aria-hidden="true" />
          <span className="mono">{REPOSITORY_URL.replace(/^https:\/\//, '')}</span>
        </button>
      </SettingsRow>

      <h3 className="settings-subheading">{t('settings.about.updates')}</h3>
      <SettingsRow
        label={t('settings.about.autoCheck')}
        htmlFor="settings-auto-check-updates"
        hint={t('settings.about.autoCheckHint')}
      >
        <SettingsSwitch id="settings-auto-check-updates" checked={settings.autoCheckUpdates} onChange={setAutoCheck} />
      </SettingsRow>
      <UpdatesPanel isPackaged={info?.isPackaged} />

      <h3 className="settings-subheading">{t('settings.ffmpeg.heading')}</h3>
      <FfmpegPanel />
    </>
  );
}
