import type { AiProviderId, ReasoningEffort } from './ai';
import type { CaptionRow, TrimRange } from './project';
import type { SubtitleStyle } from './style';
import type { WatermarkSettings } from './watermark';

/**
 * Long-running operations (AI, ffmpeg) are identified by a renderer-generated
 * jobId. The renderer can cancel a job with jobs.cancel(jobId) and receives
 * progress through jobs.onProgress. A canceled job rejects with an error whose
 * message contains '[JOB_CANCELED]'. Job ids are scoped to the invoking window;
 * main rejects duplicate active ids and cancels a window's jobs when it closes.
 * Cancellation resolves only after the child process has exited.
 *
 * Stale results: the renderer captures project id + revision when starting a
 * job and applies the result only if they still match (see useJobRunner).
 */
export type JobStage =
  | 'extracting_audio'
  | 'detecting_speech'
  | 'transcribing'
  | 'translating'
  | 'polishing'
  | 'correcting'
  | 'summarizing'
  | 'rendering_video'
  | 'writing_srt';

export type JobProgressEvent = {
  jobId: string;
  stage: JobStage;
  /** 0..1 when known; undefined for indeterminate stages. */
  progress?: number;
};

/** How the caption timing was obtained. */
export type CaptionTimingSource = 'word' | 'segment' | 'speech_detection';

export type TranscribeClipRequest = {
  jobId: string;
  inputPath: string;
  trim: TrimRange;
  providerId: AiProviderId;
  modelId?: string;
  /** Spoken language code; undefined = auto-detect. */
  language?: string;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
  /** When set, an AI pass corrects the transcript text after transcription. Timing is kept. */
  correction?: TranscriptCorrectionRequest;
  /**
   * The project's video context. Used by the correction pass, and as a
   * transcription prompt when `language` is set. At most MAX_VIDEO_CONTEXT_CHARS.
   */
  videoContext?: string;
};

export type TranscriptCorrectionRequest = {
  /** Text provider for the correction pass; undefined = the request's providerId. */
  providerId?: AiProviderId;
  /** Text model id; undefined = provider default text model. */
  modelId?: string;
  /** User instructions; '' = none. At most MAX_AI_INSTRUCTIONS_CHARS. */
  instructions: string;
};

/**
 * 'applied': the correction ran on every caption. 'failed': it failed and the
 * raw transcript was kept (cancel still cancels the whole job). Absent when no
 * correction was requested.
 */
export type TranscriptCorrectionOutcome = 'applied' | 'failed';

export type TranscribeClipResult = {
  /** Detected or requested language code ('und' when unknown). */
  language: string;
  /** Source-absolute timings; translation is always ''. */
  captions: CaptionRow[];
  timingSource: CaptionTimingSource;
  correction?: TranscriptCorrectionOutcome;
};

export type PolishMode = 'none' | 'conservative' | 'social_caption';

export type TranslateCaptionsRequest = {
  jobId: string;
  providerId: AiProviderId;
  modelId?: string;
  sourceLanguage: string;
  targetLanguage: string;
  captions: Array<{ id: string; text: string }>;
  polish: PolishMode;
  /** User instructions for translation and its polish pass. Undefined or '' = none. */
  instructions?: string;
  /** The project's video context. Undefined or '' = none. At most MAX_VIDEO_CONTEXT_CHARS. */
  videoContext?: string;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type TranslateCaptionsResult = {
  /** Exactly one entry per requested caption id, same order. Never silently falls back to source text. */
  translations: Array<{ id: string; text: string }>;
};

/**
 * Summarizes the transcript with the user's system prompt. Times are relative
 * to the trimmed clip (00:00 = trim start), so the model sees the final timeline.
 */
export type SummarizeTranscriptRequest = {
  jobId: string;
  providerId: AiProviderId;
  /** Undefined = provider default text model. */
  modelId?: string;
  /** Undefined = send no reasoning parameter. */
  reasoningEffort?: ReasoningEffort;
  /** Non-empty, at most MAX_SUMMARY_PROMPT_CHARS. */
  systemPrompt: string;
  /** Spoken language code of the transcript ('und' when unknown). */
  language: string;
  /** Non-empty captions in timeline order; blank texts are dropped by main. */
  segments: Array<{ startMs: number; endMs: number; text: string }>;
};

export type SummarizeTranscriptResult = {
  /** Model output, trimmed. Never empty. */
  text: string;
};

export type ExportOutputs = {
  originalSrt: boolean;
  translationSrt: boolean;
  /** Which text to burn into the MP4; 'none' skips video rendering entirely. */
  video: 'none' | 'original' | 'translation';
};

export type ProjectExportRequest = {
  jobId: string;
  inputPath: string;
  outputFolder: string;
  /** File name stem without extension, e.g. 'my-clip'. Must not contain path separators. */
  baseName: string;
  /** Display size of the source video, used for ASS PlayRes and style geometry. */
  videoWidth: number;
  videoHeight: number;
  trim: TrimRange;
  captions: CaptionRow[];
  sourceLanguage: string;
  targetLanguage: string;
  style: SubtitleStyle;
  /** Logo drawn into the MP4 when a video is rendered. Missing or enabled: false = no logo. */
  watermark?: WatermarkSettings;
  outputs: ExportOutputs;
  /**
   * 'ask': when outputs exist, MAIN shows a native dialog (Replace / Create
   * copies / Cancel) and continues; the renderer never parses conflict paths.
   * Cancel rejects with EXPORT_CANCELED.
   */
  overwritePolicy: 'ask' | 'overwrite' | 'create_copy';
};

export type ExportedFileKind = 'original_srt' | 'translation_srt' | 'video';

export type ProjectExportResult = {
  files: Array<{ kind: ExportedFileKind; path: string }>;
};
