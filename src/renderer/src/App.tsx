import type { ReactElement } from 'react';
import { useEffect, useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import { DEFAULT_SUMMARY_PROMPT } from '../../shared/summary';
import { DEFAULT_WATERMARK } from '../../shared/watermark-geometry';
import type { AppSettings } from '../../shared/types/settings';
import { createI18n, resolveUiLanguage } from './i18n';
import { useAppRuntime } from './hooks/useAppRuntime';
import { useZoomShortcuts } from './hooks/useZoomShortcuts';
import { StartupScreen } from './components/shell/StartupScreen';
import { WorkspaceShell } from './components/shell/WorkspaceShell';

type AppProps = {
  /** Used when there is no desktop bridge (tests, plain browser). */
  initialSettings?: AppSettings;
};

const EMPTY_SETTINGS: AppSettings = {
  uiLanguage: 'system',
  autosaveEnabled: true,
  recentFilesEnabled: true,
  neverModifyOriginalVideo: true,
  uiZoomPercent: 100,
  exportDefaults: {
    exportOriginalSrt: true,
    exportTranslatedSrt: true,
    defaultBurnedInTrack: 'translation',
    overwritePolicy: 'ask',
    fileNamePattern: '{name}.{track}.{language}'
  },
  aiConnector: {
    authModeByProvider: {},
    transcriptionModelByProvider: {},
    textModelByProvider: {},
    autoDetectInputLanguage: true,
    conservativePolish: true,
    socialCaptionPolish: false,
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2,
    correctTranscript: false,
    transcriptCorrectionInstructions: '',
    translationInstructions: ''
  },
  summary: {
    enabled: false,
    systemPrompt: DEFAULT_SUMMARY_PROMPT,
    modelByProvider: {},
    reasoningEffort: 'default'
  },
  watermark: { ...DEFAULT_WATERMARK }
};

/**
 * Root component. Settings and providers load first. The editor mounts only
 * after that, so the project store starts with the default target language.
 */
export function App({ initialSettings = EMPTY_SETTINGS }: AppProps): ReactElement {
  const i18n = useMemo(() => createI18n(initialSettings.uiLanguage), [initialSettings.uiLanguage]);

  useEffect(() => {
    document.documentElement.lang = resolveUiLanguage(initialSettings.uiLanguage);
  }, [initialSettings.uiLanguage]);

  return (
    <I18nextProvider i18n={i18n}>
      <AppRoot fallbackSettings={initialSettings} />
    </I18nextProvider>
  );
}

function AppRoot({ fallbackSettings }: { fallbackSettings: AppSettings }): ReactElement {
  const runtime = useAppRuntime(fallbackSettings);
  // Mounted at app level, so Ctrl + / Ctrl - / Ctrl 0 also work on the start screen and in Settings.
  useZoomShortcuts({
    zoomPercent: runtime.settings.uiZoomPercent,
    enabled: runtime.phase === 'ready',
    onZoomChange: (uiZoomPercent) => void runtime.updateSettings({ uiZoomPercent })
  });

  if (runtime.phase === 'loading') {
    return <StartupScreen kind="loading" />;
  }
  if (runtime.phase === 'error') {
    return <StartupScreen kind="error" detail={runtime.loadError} onRetry={runtime.reload} />;
  }
  return <WorkspaceShell runtime={runtime} />;
}
