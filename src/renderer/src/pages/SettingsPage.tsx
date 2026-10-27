import AudioLines from 'lucide-react/dist/esm/icons/audio-lines.js';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js';
import Stamp from 'lucide-react/dist/esm/icons/stamp.js';
import Info from 'lucide-react/dist/esm/icons/info.js';
import Languages from 'lucide-react/dist/esm/icons/languages.js';
import Plug from 'lucide-react/dist/esm/icons/plug.js';
import ScrollText from 'lucide-react/dist/esm/icons/scroll-text.js';
import Settings from 'lucide-react/dist/esm/icons/settings.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderCapabilities, AiProviderId, AuthMode, ProviderModelDescriptor, ProviderStatus, TestConnectionResult } from '../../../shared/types/ai';
import type { AppSettings, UiLanguage } from '../../../shared/types/settings';
import { AboutSection } from '../components/settings/AboutSection';
import { ConnectorsSection } from '../components/settings/ConnectorsSection';
import { ExportSection } from '../components/settings/ExportSection';
import { GeneralSection } from '../components/settings/GeneralSection';
import { LogoSection } from '../components/settings/LogoSection';
import { SummarySettings } from '../components/settings/SummarySettings';
import { TranscriptionSettings } from '../components/settings/TranscriptionSettings';
import { TranslationSettings } from '../components/settings/TranslationSettings';
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

type SettingsSectionId = 'general' | 'connectors' | 'transcription' | 'translation' | 'summary' | 'export' | 'logo' | 'about';

const sections: { id: SettingsSectionId; icon: typeof Settings }[] = [
  { id: 'general', icon: Settings },
  { id: 'connectors', icon: Plug },
  { id: 'transcription', icon: AudioLines },
  { id: 'translation', icon: Languages },
  { id: 'summary', icon: ScrollText },
  { id: 'export', icon: FolderOpen },
  { id: 'logo', icon: Stamp },
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
            {section === 'connectors' ? (
              <ConnectorsSection
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
            {section === 'transcription' ? (
              <TranscriptionSettings settings={settings} onSettingsChange={onSettingsChange} />
            ) : null}
            {section === 'translation' ? (
              <TranslationSettings settings={settings} onSettingsChange={onSettingsChange} />
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
            {section === 'logo' ? <LogoSection settings={settings} onSettingsChange={onSettingsChange} /> : null}
            {section === 'about' ? <AboutSection settings={settings} onSettingsChange={onSettingsChange} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
