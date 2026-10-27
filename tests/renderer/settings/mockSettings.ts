import type { ProviderStatus } from '../../../src/shared/types/ai';
import type { AppSettings } from '../../../src/shared/types/settings';
import type { SubtitleTrack } from '../../../src/shared/types/subtitles';
import { DEFAULT_WATERMARK } from '../../../src/shared/watermark-geometry';

export const mockSettings: AppSettings = {
  uiLanguage: 'en',
  defaultOutputFolder: '~/Videos/Tajtlisha exports',
  workingFolder: '~/.local/share/tajtlisha/work',
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
    activeProviderId: 'openai',
    authModeByProvider: {
      openai: 'api_key'
    },
    transcriptionModelByProvider: {
      openai: 'gpt-4o-transcribe'
    },
    textModelByProvider: {
      openai: 'gpt-4.1-mini'
    },
    defaultTargetLanguage: 'sr-Latn',
    autoDetectInputLanguage: true,
    conservativePolish: true,
    socialCaptionPolish: false,
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2
  },
  summary: {
    enabled: false,
    systemPrompt: 'Summarize the clip.',
    modelByProvider: {},
    reasoningEffort: 'default'
  },
  watermark: { ...DEFAULT_WATERMARK }
};

export const mockProviderStatuses: ProviderStatus[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    authModes: ['api_key'],
    connected: true,
    activeAuthMode: 'api_key',
    maskedCredential: 'API key ending in 1234',
    lastCheckedAt: '2026-06-17T12:00:00.000Z',
    capabilities: {
      detectLanguage: true,
      transcription: true,
      segmentTimestamps: true,
      wordTimestamps: true,
      translation: true,
      subtitlePolish: true,
      textToSpeech: false,
      summary: true
    }
  }
];

export const mockTracks: SubtitleTrack[] = [
  {
    id: 'original-en',
    kind: 'original',
    language: 'en',
    segments: [
      {
        id: 'seg-1',
        startMs: 1200,
        endMs: 3600,
        text: 'This launch build needs clear subtitles.',
        language: 'en',
        confidence: 0.94
      },
      {
        id: 'seg-2',
        startMs: 4200,
        endMs: 6900,
        text: 'Keep the rhythm short enough for social clips.',
        language: 'en',
        confidence: 0.91
      }
    ]
  },
  {
    id: 'translation-sr',
    kind: 'translation',
    language: 'sr-Latn',
    sourceLanguage: 'en',
    targetLanguage: 'sr-Latn',
    segments: [
      {
        id: 'seg-1-tr',
        startMs: 1200,
        endMs: 3600,
        text: 'Ovoj prvoj verziji trebaju jasni titlovi.',
        language: 'sr-Latn'
      },
      {
        id: 'seg-2-tr',
        startMs: 4200,
        endMs: 6900,
        text: 'Ritam treba da ostane kratak za klipove.',
        language: 'sr-Latn'
      }
    ]
  }
];
