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
  /** Provider for transcription. Also the text provider when textProviderId is not set. */
  activeProviderId?: AiProviderId;
  /**
   * Provider for translation, polish, transcript correction, and summary.
   * Undefined, or a provider that is not registered, = activeProviderId.
   * Resolve it with resolveTextProviderId.
   */
  textProviderId?: AiProviderId;
  authModeByProvider: Partial<Record<AiProviderId, AuthMode>>;
  transcriptionModelByProvider: Partial<Record<AiProviderId, string>>;
  textModelByProvider: Partial<Record<AiProviderId, string>>;
  defaultTargetLanguage?: string;
  autoDetectInputLanguage: boolean;
  conservativePolish: boolean;
  socialCaptionPolish: boolean;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
  /** Runs an AI correction pass on the transcript right after transcription. */
  correctTranscript: boolean;
  /** User instructions added to the correction prompt. '' = none. At most MAX_AI_INSTRUCTIONS_CHARS. */
  transcriptCorrectionInstructions: string;
  /** User instructions added to the translation (and translation polish) prompt. '' = none. */
  translationInstructions: string;
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
  /** Checks GitHub for a new version at startup and every hour. Install still needs a user action. */
  autoCheckUpdates: boolean;
  neverModifyOriginalVideo: true;
  /** Whole-UI page zoom in percent, one of UI_ZOOM_LEVELS. */
  uiZoomPercent: number;
  exportDefaults: ExportSettings;
  aiConnector: AiConnectorSettings;
  summary: SummarySettings;
  /** Logo drawn into the exported MP4 and shown in the preview. */
  watermark: WatermarkSettings;
};
