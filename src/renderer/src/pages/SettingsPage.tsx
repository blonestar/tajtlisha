import Bot from 'lucide-react/dist/esm/icons/bot.js';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js';
import Info from 'lucide-react/dist/esm/icons/info.js';
import ScrollText from 'lucide-react/dist/esm/icons/scroll-text.js';
import Settings from 'lucide-react/dist/esm/icons/settings.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderCapabilities, AiProviderId, AuthMode, ProviderModelDescriptor, ProviderStatus, TestConnectionResult } from '../../../shared/types/ai';
import type { AppSettings, UiLanguage } from '../../../shared/types/settings';
import { AboutSection } from '../components/settings/AboutSection';
import { AiSection } from '../components/settings/AiSection';
import { ExportSection } from '../components/settings/ExportSection';
import { GeneralSection } from '../components/settings/GeneralSection';
import { SummarySettings } from '../components/settings/SummarySettings';
import '../components/settings/settings.css';

type SettingsPageProps = {
  settings: AppSettings;
  providers?: ProviderStatus[];
  onLanguageChange: (language: UiLanguage) => void;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onActiveProviderChange?: (providerId: AiProviderId) => void;
  onConnectProvider?: (providerId: AiProviderId, authMode: AuthMode, secret: string) => Promise<void>;
  onDisconnectProvider?: (providerId: AiProviderId) => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
  /** Shows the close button in the header. The container handles Esc. */
  onClose?: () => void;
};

type SettingsSectionId = 'general' | 'ai' | 'summary' | 'export' | 'about';

const sections: { id: SettingsSectionId; icon: typeof Settings }[] = [
  { id: 'general', icon: Settings },
  { id: 'ai', icon: Bot },
  { id: 'summary', icon: ScrollText },
  { id: 'export', icon: FolderOpen },
  { id: 'about', icon: Info }
];

export function SettingsPage({
  settings,
  providers = [],
  onLanguageChange,
  onSettingsChange,
  onActiveProviderChange,
  onConnectProvider,
  onDisconnectProvider,
  onTestProvider,
  onListModels,
  onClose
}: SettingsPageProps): ReactElement {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSectionId>('general');

  return (
    <section className="settings-sheet" aria-labelledby="settings-title">
      <header className="settings-sheet-header">
        <h1 id="settings-title">{t('settings.title')}</h1>
        {onClose ? (
          <button type="button" className="btn btn-ghost btn-icon" title={t('settings.close')} aria-label={t('settings.close')} onClick={onClose}>
            <X aria-hidden="true" size={16} />
          </button>
        ) : null}
      </header>

      <div className="settings-sheet-body">
        <nav className="settings-nav" aria-label={t('settings.sections')}>
          {sections.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="settings-nav-item"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              <Icon aria-hidden="true" size={16} />
              {t(`settings.nav.${id}`)}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <div className="settings-section">
            <h2>{t(`settings.nav.${section}`)}</h2>
            {section === 'general' ? (
              <GeneralSection settings={settings} onLanguageChange={onLanguageChange} onSettingsChange={onSettingsChange} />
            ) : null}
            {section === 'ai' ? (
              <AiSection
                settings={settings}
                providers={providers}
                onSettingsChange={onSettingsChange}
                onActiveProviderChange={onActiveProviderChange}
                onConnectProvider={onConnectProvider}
                onDisconnectProvider={onDisconnectProvider}
                onTestProvider={onTestProvider}
                onListModels={onListModels}
              />
            ) : null}
            {section === 'summary' ? (
              <SummarySettings
                settings={settings}
                providers={providers}
                onSettingsChange={onSettingsChange}
                onListModels={onListModels}
              />
            ) : null}
            {section === 'export' ? <ExportSection settings={settings} onSettingsChange={onSettingsChange} /> : null}
            {section === 'about' ? <AboutSection /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
