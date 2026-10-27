import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js';
import { APP_AUTHOR, REPOSITORY_URL } from '../../../../shared/app-links';
import { FfmpegPanel } from './FfmpegPanel';
import { useAppInfo } from './hooks';
import { SettingsRow } from './SettingsPrimitives';
import { UpdatesPanel } from './UpdatesPanel';

const platformLabelKeys: Record<string, string> = {
  linux: 'settings.about.platformLinux',
  win32: 'settings.about.platformWindows',
  darwin: 'settings.about.platformMacos'
};

export function AboutSection(): ReactElement {
  const { t } = useTranslation();
  const info = useAppInfo();
  const platformKey = info ? platformLabelKeys[info.platform] : undefined;

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
      <UpdatesPanel isPackaged={info?.isPackaged} />

      <h3 className="settings-subheading">{t('settings.ffmpeg.heading')}</h3>
      <FfmpegPanel />
    </>
  );
}
