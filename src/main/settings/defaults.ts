import type { AppSettings } from '../../shared/types/settings';
import { DEFAULT_SUMMARY_PROMPT } from '../../shared/summary';
import { DEFAULT_UI_ZOOM_PERCENT } from '../../shared/ui-zoom';
import { DEFAULT_WATERMARK } from '../../shared/watermark-geometry';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  uiLanguage: 'system',
  autosaveEnabled: true,
  recentFilesEnabled: true,
  autoCheckUpdates: true,
  neverModifyOriginalVideo: true,
  uiZoomPercent: DEFAULT_UI_ZOOM_PERCENT,
  exportDefaults: {
    exportOriginalSrt: true,
    exportTranslatedSrt: true,
    defaultBurnedInTrack: 'translation',
    overwritePolicy: 'ask',
    fileNamePattern: '{name}.{track}'
  },
  aiConnector: {
    activeProviderId: 'openai',
    authModeByProvider: {},
    // whisper-1 is the only OpenAI transcription model with word timestamps.
    transcriptionModelByProvider: { openai: 'whisper-1' },
    textModelByProvider: { openai: 'gpt-4.1-mini' },
    defaultTargetLanguage: 'sr-Latn',
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
