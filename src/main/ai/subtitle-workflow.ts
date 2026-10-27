import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_TRANSCRIPTION_PROMPT_CHARS } from '../../shared/ai-instructions';
import { AppError } from '../../shared/errors';
import type {
  CaptionTimingSource,
  JobStage,
  SummarizeTranscriptRequest,
  SummarizeTranscriptResult,
  TranscribeClipRequest,
  TranscribeClipResult,
  TranscriptCorrectionOutcome,
  TranslateCaptionsRequest,
  TranslateCaptionsResult
} from '../../shared/types/jobs';
import type { CaptionRow, CaptionWord, TrimRange } from '../../shared/types/project';
import { FfmpegService } from '../ffmpeg';
import { MediaService } from '../media';
import { validatePath } from '../media/contracts';
import { buildCaptionsFromSegments, buildCaptionsFromSpeechRegions, buildCaptionsFromWords, type CaptionBuildOptions, type CaptionDraft } from './caption-builder';
import type { AiProviderRegistry } from './provider-registry';
import type { ProviderTextItem, ProviderTranscribeResult } from './provider';
import { looksLikeSerbianCyrillic, requiresSerbianLatin, serbianCyrillicToLatin } from './serbian-script';
import { detectSpeechRegions } from './speech-regions';
import { buildSummaryTranscript } from './text-prompts';

export const TRANSLATION_BATCH_SIZE = 40;
/** Provider upload limit is 25 MB; keep a margin for multipart overhead. */
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

export type WorkflowProgress = {
  stage: JobStage;
  /** 0..1 when known. */
  progress?: number;
};

export type WorkflowContext = {
  signal?: AbortSignal;
  onProgress?: (event: WorkflowProgress) => void;
};

type TextStage = Extract<JobStage, 'translating' | 'polishing' | 'correcting'>;

/**
 * Clip transcription and caption translation. Dependencies are injected so
 * tests can use fakes. ffmpeg runs only through FfmpegService and MediaService.
 */
export class SubtitleWorkflowService {
  constructor(
    private readonly registry: Pick<AiProviderRegistry, 'transcribe' | 'translateTexts' | 'polishTexts' | 'summarizeText'>,
    private readonly mediaService: Pick<MediaService, 'extractAudio'> = new MediaService(),
    private readonly ffmpeg: Pick<FfmpegService, 'run'> = new FfmpegService()
  ) {}

  /**
   * Extracts the trimmed audio, transcribes it, and lays out captions. Timing
   * comes from words when available, then segments, then speech detection.
   * Returned times are source-absolute.
   */
  async transcribe(request: TranscribeClipRequest, context: WorkflowContext = {}): Promise<TranscribeClipResult> {
    validatePath(request.inputPath, 'inputPath');
    assertValidTrim(request.trim);
    throwIfCanceled(context.signal);

    const clipDurationMs = request.trim.endMs - request.trim.startMs;
    const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-ai-audio-'));

    try {
      const audioPath = join(tempDir, 'audio.mp3');
      await this.extractAudio(request, audioPath, clipDurationMs, context);

      const { size } = await stat(audioPath);
      if (size > MAX_AUDIO_BYTES) {
        throw new AppError('AUDIO_TOO_LARGE', `Extracted audio is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is 24 MB. Shorten the clip.`);
      }

      throwIfCanceled(context.signal);
      context.onProgress?.({ stage: 'transcribing' });
      const transcription = toRequestedScript(
        await this.registry.transcribe(request.providerId, {
          audioPath,
          audioFormat: 'mp3',
          modelId: request.modelId,
          language: request.language,
          prompt: transcriptionPrompt(request),
          signal: context.signal
        })
      );

      if (!transcription.text.trim()) {
        throw new AppError('NO_SPEECH');
      }

      const options: CaptionBuildOptions = {
        maxCharsPerLine: request.maxCharsPerLine,
        maxLinesPerCaption: request.maxLinesPerCaption,
        clipDurationMs
      };
      const layout = await this.layoutCaptions(transcription, audioPath, options, clipDurationMs, context);
      const language = transcription.language.trim() || 'und';
      const corrected = request.correction
        ? await this.correctDrafts(layout.drafts, request, language, context)
        : undefined;
      const captions = toSourceCaptions(corrected?.drafts ?? layout.drafts, request.trim);

      if (captions.length === 0) {
        throw new AppError('NO_SPEECH');
      }

      return {
        language,
        captions,
        timingSource: layout.timingSource,
        ...(corrected ? { correction: corrected.outcome } : {})
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Translates captions in batches. Ids missing from the response are retried
   * once. Anything still missing fails with TRANSLATION_INCOMPLETE. Source text
   * is never used as a fallback. Polish, if requested, runs on the translations.
   */
  async translate(request: TranslateCaptionsRequest, context: WorkflowContext = {}): Promise<TranslateCaptionsResult> {
    throwIfCanceled(context.signal);
    if (request.captions.length === 0) {
      return { translations: [] };
    }

    const translated = await this.runTextStage(request.captions, 'translating', context, (items) =>
      this.registry.translateTexts(request.providerId, {
        items,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        modelId: request.modelId,
        maxCharsPerLine: request.maxCharsPerLine,
        maxLinesPerCaption: request.maxLinesPerCaption,
        customInstructions: request.instructions,
        videoContext: request.videoContext,
        signal: context.signal
      })
    );

    if (request.polish === 'none') {
      return { translations: toScript(translated, request.targetLanguage) };
    }

    const mode = request.polish;
    const polished = await this.runTextStage(translated, 'polishing', context, (items) =>
      this.registry.polishTexts(request.providerId, {
        items,
        language: request.targetLanguage,
        mode,
        modelId: request.modelId,
        maxCharsPerLine: request.maxCharsPerLine,
        maxLinesPerCaption: request.maxLinesPerCaption,
        customInstructions: request.instructions,
        videoContext: request.videoContext,
        signal: context.signal
      })
    );

    return { translations: toScript(polished, request.targetLanguage) };
  }

  /**
   * AI correction of the transcript text. Caption timing and word timing stay
   * as they are; the word highlight matches the corrected words to the timed
   * ones. A failure keeps the raw transcript, because the transcription itself
   * already succeeded (and was paid for). Cancel still cancels the job.
   */
  private async correctDrafts(
    drafts: CaptionDraft[],
    request: TranscribeClipRequest,
    language: string,
    context: WorkflowContext
  ): Promise<{ drafts: CaptionDraft[]; outcome: TranscriptCorrectionOutcome }> {
    const correction = request.correction;
    const items = drafts.map((draft, index) => ({ id: String(index), text: draft.text })).filter((item) => item.text.trim() !== '');
    if (!correction || items.length === 0) {
      return { drafts, outcome: 'applied' };
    }

    try {
      const corrected = await this.runTextStage(items, 'correcting', context, (batch) =>
        this.registry.polishTexts(request.providerId, {
          items: batch,
          language,
          mode: 'transcript_correction',
          modelId: correction.modelId,
          maxCharsPerLine: request.maxCharsPerLine,
          maxLinesPerCaption: request.maxLinesPerCaption,
          customInstructions: correction.instructions,
          videoContext: request.videoContext,
          signal: context.signal
        })
      );
      const textById = new Map(toScript(corrected, language).map((item) => [item.id, item.text]));
      return {
        drafts: drafts.map((draft, index) => ({ ...draft, text: textById.get(String(index)) ?? draft.text })),
        outcome: 'applied'
      };
    } catch (error) {
      if (context.signal?.aborted || (error instanceof AppError && error.code === 'JOB_CANCELED')) {
        throw error;
      }
      return { drafts, outcome: 'failed' };
    }
  }

  /**
   * Sends the non-blank transcript lines with the user's system prompt. Text
   * only: no audio is extracted and no captions are changed.
   */
  async summarize(request: SummarizeTranscriptRequest, context: WorkflowContext = {}): Promise<SummarizeTranscriptResult> {
    throwIfCanceled(context.signal);

    const segments = request.segments.filter((segment) => segment.text.trim().length > 0);
    if (segments.length === 0) {
      throw new AppError('NO_SPEECH', 'There is no transcript to summarize.');
    }

    context.onProgress?.({ stage: 'summarizing' });
    let text: string;
    try {
      text = (
        await this.registry.summarizeText(request.providerId, {
          systemPrompt: request.systemPrompt,
          transcript: buildSummaryTranscript(segments, request.language),
          modelId: request.modelId,
          reasoningEffort: request.reasoningEffort,
          signal: context.signal
        })
      ).trim();
    } catch (error) {
      // Models without reasoning reject the effort parameter; name that instead of a generic failure.
      if (
        request.reasoningEffort &&
        error instanceof AppError &&
        error.code === 'PROVIDER_REQUEST_FAILED' &&
        /reasoning|effort/i.test(error.detail ?? '')
      ) {
        throw new AppError('REASONING_UNSUPPORTED', error.detail);
      }
      throw error;
    }

    if (!text) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'The AI provider returned an empty summary.');
    }

    return { text };
  }

  private async extractAudio(
    request: TranscribeClipRequest,
    audioPath: string,
    clipDurationMs: number,
    context: WorkflowContext
  ): Promise<void> {
    context.onProgress?.({ stage: 'extracting_audio', progress: 0 });
    try {
      await this.mediaService.extractAudio(
        {
          inputPath: request.inputPath,
          outputPath: audioPath,
          format: 'mp3',
          startMs: request.trim.startMs,
          endMs: request.trim.endMs
        },
        {
          signal: context.signal,
          onProgress: (outTimeMs) => {
            context.onProgress?.({ stage: 'extracting_audio', progress: Math.min(1, outTimeMs / clipDurationMs) });
          }
        }
      );
    } catch (error) {
      if (isNoAudioError(error)) {
        throw new AppError('NO_AUDIO');
      }
      throw error;
    }
  }

  private async layoutCaptions(
    transcription: ProviderTranscribeResult,
    audioPath: string,
    options: CaptionBuildOptions,
    clipDurationMs: number,
    context: WorkflowContext
  ): Promise<{ drafts: CaptionDraft[]; timingSource: CaptionTimingSource }> {
    if (transcription.words?.length) {
      return { drafts: buildCaptionsFromWords(transcription.words, options), timingSource: 'word' };
    }

    if (transcription.segments?.length) {
      return { drafts: buildCaptionsFromSegments(transcription.segments, options), timingSource: 'segment' };
    }

    throwIfCanceled(context.signal);
    context.onProgress?.({ stage: 'detecting_speech' });
    const regions = await detectSpeechRegions(audioPath, this.ffmpeg, { signal: context.signal, durationMs: clipDurationMs });
    if (regions.length === 0) {
      throw new AppError('NO_SPEECH');
    }

    return {
      drafts: buildCaptionsFromSpeechRegions(transcription.text, regions, options),
      timingSource: 'speech_detection'
    };
  }

  private async runTextStage(
    items: ProviderTextItem[],
    stage: TextStage,
    context: WorkflowContext,
    call: (batch: ProviderTextItem[]) => Promise<ProviderTextItem[]>
  ): Promise<ProviderTextItem[]> {
    const resolved = new Map<string, string>();
    context.onProgress?.({ stage, progress: 0 });

    const runPass = async (pending: ProviderTextItem[]): Promise<void> => {
      for (const batch of chunkArray(pending, TRANSLATION_BATCH_SIZE)) {
        throwIfCanceled(context.signal);
        const batchIds = new Set(batch.map((item) => item.id));

        for (const item of await call(batch)) {
          const text = item.text.trim();
          if (batchIds.has(item.id) && text && !resolved.has(item.id)) {
            resolved.set(item.id, text);
          }
        }

        context.onProgress?.({ stage, progress: resolved.size / items.length });
      }
    };

    await runPass(items);

    const missingAfterFirstPass = items.filter((item) => !resolved.has(item.id));
    if (missingAfterFirstPass.length > 0) {
      await runPass(missingAfterFirstPass);
    }

    const missing = items.filter((item) => !resolved.has(item.id));
    if (missing.length > 0) {
      throw new AppError('TRANSLATION_INCOMPLETE', `No text returned for caption ids: ${missing.map((item) => item.id).join(', ')}`);
    }

    return items.map((item) => ({ id: item.id, text: resolved.get(item.id) ?? '' }));
  }
}

/**
 * Whisper and some text models write Serbian in Cyrillic even when Latin was
 * asked for. Cyrillic to Latin is lossless, so sr-Latn output is converted here.
 */
function toRequestedScript(transcription: ProviderTranscribeResult): ProviderTranscribeResult {
  // Models that do not report the detected language return 'und'. Serbian found
  // that way is labeled sr-Latn, like whisper-1's detected "serbian".
  const detectedSerbian = isUnknownLanguage(transcription.language) && looksLikeSerbianCyrillic(transcription.text);
  const result = detectedSerbian ? { ...transcription, language: 'sr-Latn' } : transcription;
  if (!requiresSerbianLatin(result.language)) return result;

  const convert = <T extends { text: string }>(items: T[] | undefined): T[] | undefined =>
    items?.map((item) => ({ ...item, text: serbianCyrillicToLatin(item.text) }));

  return {
    ...result,
    text: serbianCyrillicToLatin(result.text),
    ...(result.words ? { words: convert(result.words) } : {}),
    ...(result.segments ? { segments: convert(result.segments) } : {})
  };
}

/**
 * The video context as a transcription prompt, only when the spoken language
 * is set. Whisper tends to switch its output to the language of the prompt, and
 * a fixed language prevents that. Cut to the length Whisper actually reads.
 */
function transcriptionPrompt(request: TranscribeClipRequest): string | undefined {
  const context = request.videoContext?.trim();
  if (!context || !request.language || isUnknownLanguage(request.language)) return undefined;
  return context.slice(0, MAX_TRANSCRIPTION_PROMPT_CHARS);
}

function isUnknownLanguage(language: string): boolean {
  const trimmed = language.trim();
  return trimmed === '' || trimmed === 'und';
}

function toScript(items: ProviderTextItem[], language: string): ProviderTextItem[] {
  if (!requiresSerbianLatin(language)) return items;
  return items.map((item) => ({ ...item, text: serbianCyrillicToLatin(item.text) }));
}

function toSourceCaptions(drafts: CaptionDraft[], trim: TrimRange): CaptionRow[] {
  const clamp = (value: number): number => Math.min(trim.endMs, Math.max(trim.startMs, value));

  return drafts.flatMap((draft) => {
    const startMs = clamp(draft.startMs + trim.startMs);
    const endMs = clamp(draft.endMs + trim.startMs);
    if (endMs <= startMs) return [];

    const words = draft.words ? toSourceWords(draft.words, trim.startMs, startMs, endMs) : [];
    return [
      {
        id: randomUUID(),
        startMs,
        endMs,
        original: draft.text,
        translation: '',
        ...(words.length > 0 ? { words } : {})
      }
    ];
  });
}

/** Offsets word times like the caption, then keeps them inside the caption's clamped range. */
function toSourceWords(words: NonNullable<CaptionDraft['words']>, offsetMs: number, startMs: number, endMs: number): CaptionWord[] {
  const clamp = (value: number): number => Math.min(endMs, Math.max(startMs, value));
  return words.map((word) => {
    const wordStart = clamp(word.startMs + offsetMs);
    return { text: word.text, startMs: wordStart, endMs: Math.max(wordStart, clamp(word.endMs + offsetMs)) };
  });
}

function assertValidTrim(trim: TrimRange): void {
  if (!Number.isFinite(trim.startMs) || trim.startMs < 0 || !Number.isFinite(trim.endMs) || trim.endMs <= trim.startMs) {
    throw new AppError('INVALID_TRIM', 'Trim end must be after trim start.');
  }
}

function throwIfCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AppError('JOB_CANCELED');
  }
}

/** ffmpeg fails with "does not contain any stream" or "matches no streams" when the input has no audio. */
function isNoAudioError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === 'FFMPEG_FAILED' &&
    /does not contain any stream|matches no streams/i.test(error.message)
  );
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
