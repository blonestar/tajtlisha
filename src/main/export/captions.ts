import { shiftCaptionWords } from '../../shared/word-highlight';
import type { CaptionRow, CaptionWord, TrimRange } from '../../shared/types/project';

export type CaptionTextField = 'original' | 'translation';

/** A caption placed on the exported timeline (starts at 00:00:00). */
export type ExportCaption = {
  id: string;
  startMs: number;
  endMs: number;
  original: string;
  translation: string;
  /** Timed words of `original`, on the exported timeline. Absent without word timing. */
  words?: CaptionWord[];
};

export type ExportCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  /** Timed words of the text. Only the `original` field has them. */
  words?: CaptionWord[];
};

export function hasText(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Keeps captions that overlap the trim range, clips them to it and shifts them
 * by the trim start so the output timeline begins at 00:00:00.
 */
export function toExportCaptions(captions: readonly CaptionRow[], trim: TrimRange): ExportCaption[] {
  return captions
    .filter((caption) => caption.endMs > trim.startMs && caption.startMs < trim.endMs)
    .map((caption) => ({
      id: caption.id,
      startMs: Math.max(caption.startMs, trim.startMs) - trim.startMs,
      endMs: Math.min(caption.endMs, trim.endMs) - trim.startMs,
      original: caption.original,
      translation: caption.translation,
      ...(caption.words ? { words: shiftCaptionWords(caption.words, -trim.startMs) } : {})
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * Captions whose text in the given field is not blank, as cues ready for SRT or ASS.
 * Word timing only exists for the original text, so translations never get words.
 */
export function captionCuesFor(captions: readonly ExportCaption[], field: CaptionTextField): ExportCue[] {
  return captions
    .filter((caption) => hasText(caption[field]))
    .map((caption) => ({
      id: caption.id,
      startMs: caption.startMs,
      endMs: caption.endMs,
      text: caption[field],
      ...(field === 'original' && caption.words ? { words: caption.words } : {})
    }));
}
