import { MAX_VIDEO_CONTEXT_CHARS } from '../../shared/ai-instructions';
import { AppError } from '../../shared/errors';
import { SUBTITLE_FONT_FAMILIES, WORD_HIGHLIGHT_MODES, type SubtitlePresetId, type SubtitleStyle } from '../../shared/types/style';
import type { CaptionRow, CaptionWord, ProjectDocument, ProjectSource } from '../../shared/types/project';

/** Project ids double as file names, so only this alphabet is allowed. */
export const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const MAX_CAPTIONS = 5000;
export const MAX_CAPTION_TEXT = 2000;
const MAX_CAPTION_WORDS = 1000;
const MAX_WORD_TEXT = 200;
const MAX_ID = 128;
const MAX_PATH = 4096;
const MAX_URL = 2048;
const MAX_LANGUAGE = 32;
const MAX_TIMESTAMP = 64;
const MAX_PROVIDER = 64;
const MAX_MODEL = 200;
const MAX_DIMENSION = 32768;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const PRESET_IDS: readonly SubtitlePresetId[] = ['clean', 'box', 'bold_yellow', 'karaoke'];
const PREVIEW_TRACKS = ['original', 'translation'] as const;
const TIMING_SOURCES = ['word', 'segment', 'speech_detection'] as const;
const POSITIONS = ['top', 'middle', 'bottom'] as const;
const ALIGNMENTS = ['left', 'center', 'right'] as const;

/**
 * Checks a project document read from disk or sent by the renderer, and returns
 * a NEW object that holds only the known fields. Anything else is dropped, so
 * extra data never reaches the file. Error messages name the field path only.
 */
export function validateProjectDocument(value: unknown): ProjectDocument {
  const doc = new Reader();
  const input = doc.object(value, 'project');

  const id = doc.string(input.id, 'project.id', MAX_ID);
  if (!PROJECT_ID_PATTERN.test(id)) {
    throw invalid('project.id');
  }
  if (input.schemaVersion !== 1) {
    throw invalid('project.schemaVersion');
  }

  const result: ProjectDocument = {
    schemaVersion: 1,
    id,
    revision: doc.integer(input.revision, 'project.revision', 0, Number.MAX_SAFE_INTEGER),
    source: input.source === null ? null : readSource(doc, input.source),
    trim: readRange(doc, input.trim, 'project.trim'),
    targetLanguage: doc.string(input.targetLanguage, 'project.targetLanguage', MAX_LANGUAGE),
    captions: readCaptions(doc, input.captions),
    style: readStyle(doc, input.style),
    previewTrack: doc.oneOf(input.previewTrack, PREVIEW_TRACKS, 'project.previewTrack'),
    updatedAt: doc.string(input.updatedAt, 'project.updatedAt', MAX_TIMESTAMP)
  };

  if (input.sourceLanguage !== undefined) {
    result.sourceLanguage = doc.string(input.sourceLanguage, 'project.sourceLanguage', MAX_LANGUAGE);
  }
  if (input.translationLanguage !== undefined) {
    result.translationLanguage = doc.string(input.translationLanguage, 'project.translationLanguage', MAX_LANGUAGE);
  }
  if (input.transcription !== undefined) {
    result.transcription = readTranscription(doc, input.transcription);
  }
  if (input.videoContext !== undefined) {
    const videoContext = doc.string(input.videoContext, 'project.videoContext', MAX_VIDEO_CONTEXT_CHARS, true);
    if (videoContext.trim() !== '') result.videoContext = videoContext;
  }

  return result;
}

function readSource(doc: Reader, value: unknown): ProjectSource {
  const input = doc.object(value, 'project.source');
  // fileUrl is never persisted; the store mints it on load. Accept it so a save
  // from the renderer (which holds one) validates, and leave it empty otherwise.
  const fileUrl = input.fileUrl === undefined ? '' : doc.string(input.fileUrl, 'project.source.fileUrl', MAX_URL, true);

  return {
    inputPath: doc.string(input.inputPath, 'project.source.inputPath', MAX_PATH),
    fileUrl,
    durationMs: doc.number(input.durationMs, 'project.source.durationMs', { min: 0, exclusiveMin: true }),
    width: doc.integer(input.width, 'project.source.width', 1, MAX_DIMENSION),
    height: doc.integer(input.height, 'project.source.height', 1, MAX_DIMENSION),
    hasAudio: doc.boolean(input.hasAudio, 'project.source.hasAudio'),
    fileSizeBytes: doc.number(input.fileSizeBytes, 'project.source.fileSizeBytes', { min: 0 }),
    mtimeMs: doc.number(input.mtimeMs, 'project.source.mtimeMs', { min: 0 })
  };
}

function readRange(doc: Reader, value: unknown, path: string): { startMs: number; endMs: number } {
  const input = doc.object(value, path);
  const startMs = doc.number(input.startMs, `${path}.startMs`, { min: 0 });
  const endMs = doc.number(input.endMs, `${path}.endMs`, { min: 0, exclusiveMin: true });
  if (endMs <= startMs) throw invalid(path);
  return { startMs, endMs };
}

function readCaptions(doc: Reader, value: unknown): CaptionRow[] {
  const rows = doc.array(value, 'project.captions', MAX_CAPTIONS);
  return rows.map((row, index) => {
    const path = `project.captions[${index}]`;
    const input = doc.object(row, path);
    const startMs = doc.number(input.startMs, `${path}.startMs`, { min: 0 });
    const endMs = doc.number(input.endMs, `${path}.endMs`, { min: 0 });
    if (endMs < startMs) throw invalid(`${path}.endMs`);

    const caption: CaptionRow = {
      id: doc.string(input.id, `${path}.id`, MAX_ID),
      startMs,
      endMs,
      original: doc.string(input.original, `${path}.original`, MAX_CAPTION_TEXT, true),
      translation: doc.string(input.translation, `${path}.translation`, MAX_CAPTION_TEXT, true)
    };
    if (input.translatedFrom !== undefined) {
      caption.translatedFrom = doc.string(input.translatedFrom, `${path}.translatedFrom`, MAX_CAPTION_TEXT, true);
    }
    if (input.words !== undefined) {
      caption.words = readWords(doc, input.words, `${path}.words`);
    }
    return caption;
  });
}

function readWords(doc: Reader, value: unknown, path: string): CaptionWord[] {
  const rows = doc.array(value, path, MAX_CAPTION_WORDS);
  return rows.map((row, index) => {
    const wordPath = `${path}[${index}]`;
    const input = doc.object(row, wordPath);
    const startMs = doc.number(input.startMs, `${wordPath}.startMs`, { min: 0 });
    const endMs = doc.number(input.endMs, `${wordPath}.endMs`, { min: startMs });
    return {
      text: doc.string(input.text, `${wordPath}.text`, MAX_WORD_TEXT),
      startMs,
      endMs
    };
  });
}

function readStyle(doc: Reader, value: unknown): SubtitleStyle {
  const input = doc.object(value, 'project.style');
  const style: SubtitleStyle = {
    fontFamily: doc.oneOf(input.fontFamily, SUBTITLE_FONT_FAMILIES, 'project.style.fontFamily'),
    fontSizePercent: doc.number(input.fontSizePercent, 'project.style.fontSizePercent', { min: 2, max: 12 }),
    bold: doc.boolean(input.bold, 'project.style.bold'),
    italic: doc.boolean(input.italic, 'project.style.italic'),
    textColor: doc.color(input.textColor, 'project.style.textColor'),
    outlineEnabled: doc.boolean(input.outlineEnabled, 'project.style.outlineEnabled'),
    outlineColor: doc.color(input.outlineColor, 'project.style.outlineColor'),
    outlineWidthPercent: doc.number(input.outlineWidthPercent, 'project.style.outlineWidthPercent', { min: 0, max: 20 }),
    shadowEnabled: doc.boolean(input.shadowEnabled, 'project.style.shadowEnabled'),
    shadowColor: doc.color(input.shadowColor, 'project.style.shadowColor'),
    backgroundEnabled: doc.boolean(input.backgroundEnabled, 'project.style.backgroundEnabled'),
    backgroundColor: doc.color(input.backgroundColor, 'project.style.backgroundColor'),
    backgroundOpacity: doc.number(input.backgroundOpacity, 'project.style.backgroundOpacity', { min: 0, max: 1 }),
    position: doc.oneOf(input.position, POSITIONS, 'project.style.position'),
    align: doc.oneOf(input.align, ALIGNMENTS, 'project.style.align'),
    marginVerticalPercent: doc.number(input.marginVerticalPercent, 'project.style.marginVerticalPercent', { min: 0, max: 30 }),
    maxWidthPercent: doc.number(input.maxWidthPercent, 'project.style.maxWidthPercent', { min: 40, max: 100 })
  };
  if (input.presetId !== undefined) {
    style.presetId = doc.oneOf(input.presetId, PRESET_IDS, 'project.style.presetId');
  }
  if (input.wordHighlight !== undefined) {
    style.wordHighlight = doc.oneOf(input.wordHighlight, WORD_HIGHLIGHT_MODES, 'project.style.wordHighlight');
  }
  if (input.highlightColor !== undefined) {
    style.highlightColor = doc.color(input.highlightColor, 'project.style.highlightColor');
  }
  return style;
}

function readTranscription(doc: Reader, value: unknown): NonNullable<ProjectDocument['transcription']> {
  const input = doc.object(value, 'project.transcription');
  const transcription: NonNullable<ProjectDocument['transcription']> = {
    providerId: doc.string(input.providerId, 'project.transcription.providerId', MAX_PROVIDER),
    timingSource: doc.oneOf(input.timingSource, TIMING_SOURCES, 'project.transcription.timingSource')
  };
  if (input.modelId !== undefined) {
    transcription.modelId = doc.string(input.modelId, 'project.transcription.modelId', MAX_MODEL);
  }
  return transcription;
}

/** Each check throws with the field path, so the caller can name what was wrong. */
class Reader {
  object(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalid(path);
    }
    return value as Record<string, unknown>;
  }

  array(value: unknown, path: string, maxLength: number): unknown[] {
    if (!Array.isArray(value) || value.length > maxLength) {
      throw invalid(path);
    }
    return value;
  }

  /** Empty strings are allowed when `allowEmpty` is set (caption text, fileUrl). */
  string(value: unknown, path: string, maxLength: number, allowEmpty = false): string {
    if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && value.trim().length === 0)) {
      throw invalid(path);
    }
    return value;
  }

  number(value: unknown, path: string, bounds: { min?: number; max?: number; exclusiveMin?: boolean }): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(path);
    if (bounds.min !== undefined && (bounds.exclusiveMin ? value <= bounds.min : value < bounds.min)) throw invalid(path);
    if (bounds.max !== undefined && value > bounds.max) throw invalid(path);
    return value;
  }

  integer(value: unknown, path: string, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw invalid(path);
    return value as number;
  }

  boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw invalid(path);
    return value;
  }

  color(value: unknown, path: string): string {
    if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) throw invalid(path);
    return value;
  }

  oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw invalid(path);
    return value as T;
  }
}

function invalid(path: string): AppError {
  return new AppError('UNKNOWN', `invalid project: ${path}`);
}
