import type { AppSettings } from '../../../src/shared/types/settings';
import type { ProviderStatus } from '../../../src/shared/types/ai';
import type { CaptionRow, ProjectDocument, ProjectSource } from '../../../src/shared/types/project';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import { DEFAULT_WATERMARK } from '../../../src/shared/watermark-geometry';

export const SOURCE: ProjectSource = {
  inputPath: '/clips/intro.mp4',
  fileUrl: 'tajtlisha-media://intro',
  durationMs: 12000,
  width: 720,
  height: 1280,
  hasAudio: true,
  fileSizeBytes: 1024,
  mtimeMs: 1
};

export function caption(id: string, startMs: number, endMs: number, original: string, translation = ''): CaptionRow {
  return translation
    ? { id, startMs, endMs, original, translation, translatedFrom: original }
    : { id, startMs, endMs, original, translation };
}

export const VALID_CAPTIONS: CaptionRow[] = [
  caption('c1', 500, 2500, 'Zdravo svima', 'Hello everyone'),
  caption('c2', 3000, 5000, 'Danas idemo na more', 'Today we go to the sea')
];

export function makeProject(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    schemaVersion: 1,
    id: 'project-1',
    revision: 3,
    source: SOURCE,
    trim: { startMs: 0, endMs: 12000 },
    sourceLanguage: 'sr-Latn',
    targetLanguage: 'en',
    translationLanguage: 'en',
    captions: VALID_CAPTIONS,
    style: { ...DEFAULT_SUBTITLE_STYLE },
    previewTrack: 'translation',
    updatedAt: '2026-10-22T10:00:00.000Z',
    ...overrides
  };
}

export const SETTINGS: AppSettings = {
  uiLanguage: 'en',
  defaultOutputFolder: '/exports',
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
    authModeByProvider: { openai: 'api_key' },
    transcriptionModelByProvider: { openai: 'whisper-1' },
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
    systemPrompt: 'Summarize the clip.',
    modelByProvider: {},
    reasoningEffort: 'default'
  },
  watermark: { ...DEFAULT_WATERMARK }
};

export const OPENAI_STATUS: ProviderStatus = {
  id: 'openai',
  displayName: 'OpenAI',
  authModes: ['api_key'],
  connected: true,
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
};
