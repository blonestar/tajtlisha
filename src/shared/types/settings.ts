import type { AiProviderId, AuthMode, ReasoningEffort } from './ai';
import type { ExportOverwritePolicy } from './export';
import type { WatermarkSettings } from './watermark';

export type UiLanguage = 'system' | 'en' | 'sr-Latn' | 'sr-Cyrl';

export type ExportSettings = {
  exportOriginalSrt: boolean;
  exportTranslatedSrt: boolean;
  defaultBurnedInTrack: 'original' | 'translation';
  overwritePolicy: ExportOverwritePolicy;
  fileNamePattern: string;
};

export type AiConnectorSettings = {
  activeProviderId?: AiProviderId;
  authModeByProvider: Partial<Record<AiProviderId, AuthMode>>;
  transcriptionModelByProvider: Partial<Record<AiProviderId, string>>;
  textModelByProvider: Partial<Record<AiProviderId, string>>;
  defaultTargetLanguage?: string;
  autoDetectInputLanguage: boolean;
  conservativePolish: boolean;
  socialCaptionPolish: boolean;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

/**
 * Optional on-demand summary of the transcript (for example the point of a
 * clip for a social post). Off by default; the Editor shows the action only
 * when enabled.
 */
export type SummarySettings = {
  enabled: boolean;
  /** System prompt the model receives. Blank is normalized back to DEFAULT_SUMMARY_PROMPT. */
  systemPrompt: string;
  /** '' or missing = use the provider's text model (textModelByProvider), then the provider default. */
  modelByProvider: Partial<Record<AiProviderId, string>>;
  /** 'default' sends no reasoning parameter, so non-reasoning models keep working. */
  reasoningEffort: 'default' | ReasoningEffort;
};

export type AppSettings = {
  uiLanguage: UiLanguage;
  defaultOutputFolder?: string;
  workingFolder?: string;
  autosaveEnabled: boolean;
  recentFilesEnabled: boolean;
  neverModifyOriginalVideo: true;
  /** Whole-UI page zoom in percent, one of UI_ZOOM_LEVELS. */
  uiZoomPercent: number;
  exportDefaults: ExportSettings;
  aiConnector: AiConnectorSettings;
  summary: SummarySettings;
  /** Logo drawn into the exported MP4 and shown in the preview. */
  watermark: WatermarkSettings;
};
