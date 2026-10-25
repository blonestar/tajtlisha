import { effectiveMaxCharsPerLine } from '../../../shared/subtitle-geometry';
import type { ExportOutputs, PolishMode, SummarizeTranscriptRequest } from '../../../shared/types/jobs';
import type { CaptionRow, ProjectDocument } from '../../../shared/types/project';
import type { AppSettings } from '../../../shared/types/settings';
import {
  captionsInTrim,
  validateCaptions,
  type CaptionIssueMap,
  type CaptionValidationOptions
} from '../state/selectors';

/**
 * Model id from settings for an AI request. The settings store keeps '' for
 * "Default" (a patch cannot delete a map key), so blank ids are sent as absent.
 */
export function optionalModelId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Language code used when the spoken language is unknown or should be detected. */
export const UNKNOWN_LANGUAGE = 'und';

/** Line limit for AI requests and validation: the user's setting, capped by what fits the frame. */
export function captionLineLimit(project: ProjectDocument, settings: AppSettings): number {
  const source = project.source;
  if (!source) return settings.aiConnector.maxCharsPerLine;
  return effectiveMaxCharsPerLine(settings.aiConnector.maxCharsPerLine, project.style, source.width, source.height);
}

/** Spoken language to send to providers, or undefined when it should be detected. */
export function spokenLanguageOf(project: ProjectDocument): string | undefined {
  const language = project.sourceLanguage;
  return language && language !== UNKNOWN_LANGUAGE ? language : undefined;
}

/** Original text language for export and translation requests. 'und' when unknown. */
export function sourceLanguageCode(project: ProjectDocument): string {
  return project.sourceLanguage ?? UNKNOWN_LANGUAGE;
}

/** How translations are polished, from the AI connector settings. */
export function polishFor(settings: AppSettings): PolishMode {
  if (settings.aiConnector.socialCaptionPolish) return 'social_caption';
  if (settings.aiConnector.conservativePolish) return 'conservative';
  return 'none';
}

/** Whether the chosen outputs read the translation (SRT or burned-in video). */
export function outputsNeedTranslation(outputs: ExportOutputs): boolean {
  return outputs.translationSrt || outputs.video === 'translation';
}

/** Export defaults from settings. The burned-in track follows the default track setting. */
export function defaultExportOutputs(settings: AppSettings): ExportOutputs {
  return {
    originalSrt: settings.exportDefaults.exportOriginalSrt,
    translationSrt: settings.exportDefaults.exportTranslatedSrt,
    video: settings.exportDefaults.defaultBurnedInTrack
  };
}

/**
 * Validation for the caption table and export. `requireTranslation` makes
 * empty translations blocking; export counts them separately, so it passes false.
 */
/**
 * The captions the export writes: those overlapping the trim range, clipped to
 * it, as the main process does before rendering. Captions outside the trim are dropped.
 */
export function captionsForExport(project: ProjectDocument): CaptionRow[] {
  const { trim } = project;
  return captionsInTrim(project.captions, trim).map((caption) => ({
    ...caption,
    startMs: Math.max(caption.startMs, trim.startMs),
    endMs: Math.min(caption.endMs, trim.endMs)
  }));
}

/**
 * Transcript rows for the summary request. Only captions inside the trim range
 * with text are sent. Times are relative to the trim start and clipped to the
 * clip, so the model sees the same timeline the final export has.
 */
export function summaryTranscript(project: ProjectDocument): SummarizeTranscriptRequest['segments'] {
  const { trim } = project;
  const clipLength = trim.endMs - trim.startMs;

  return captionsInTrim(project.captions, trim).flatMap((caption) => {
    const text = caption.original.trim();
    if (text === '') return [];

    return [
      {
        startMs: Math.max(caption.startMs - trim.startMs, 0),
        endMs: Math.min(caption.endMs - trim.startMs, clipLength),
        text
      }
    ];
  });
}

export function captionIssuesFor(
  project: ProjectDocument,
  settings: AppSettings,
  requireTranslation: boolean
): CaptionIssueMap {
  const options: CaptionValidationOptions = {
    requireTranslation,
    maxCharsPerLine: captionLineLimit(project, settings),
    translationLanguage: project.translationLanguage,
    targetLanguage: project.targetLanguage
  };
  return validateCaptions(project.captions, project.trim, options);
}

/** File name stem from the video file name: no extension, no characters that break file names. */
export function sanitizeBaseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.\\/]+$/, '');
  const cleaned = withoutExtension
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? 'subtitles' : cleaned;
}

/** Folder that contains the file at `path`. Falls back to the root for bare names. */
export function folderOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (index <= 0) return index === 0 ? path.slice(0, 1) : '';
  return path.slice(0, index);
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Ids of captions whose translation was made from older text or another language. */
export function staleCaptionIds(issues: CaptionIssueMap): Set<string> {
  const ids = new Set<string>();
  for (const [id, list] of Object.entries(issues)) {
    if (list.some((issue) => issue.code === 'stale_translation')) ids.add(id);
  }
  return ids;
}
