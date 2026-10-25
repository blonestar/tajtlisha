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
  /**
   * The caption's full range on the exported timeline, set only when the trim
   * cut it (start may be negative). Word highlight timing uses it, so cutting a
   * caption does not move the highlight of the part that is left.
   */
  timingStartMs?: number;
  timingEndMs?: number;
};

export type ExportCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  /** Timed words of the text. Only the `original` field has them. */
  words?: CaptionWord[];
  /** See ExportCaption. */
  timingStartMs?: number;
  timingEndMs?: number;
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
    .map((caption) => {
      const clipped = caption.startMs < trim.startMs || caption.endMs > trim.endMs;
      return {
        id: caption.id,
        startMs: Math.max(caption.startMs, trim.startMs) - trim.startMs,
        endMs: Math.min(caption.endMs, trim.endMs) - trim.startMs,
        original: caption.original,
        translation: caption.translation,
        // Not clamped at 0: words before the trim start must keep their order and spacing.
        ...(caption.words
          ? {
              words: caption.words.map((word) => ({
                text: word.text,
                startMs: word.startMs - trim.startMs,
                endMs: word.endMs - trim.startMs
              }))
            }
          : {}),
        ...(clipped
          ? { timingStartMs: caption.startMs - trim.startMs, timingEndMs: caption.endMs - trim.startMs }
          : {})
      };
    })
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
      ...(field === 'original' && caption.words ? { words: caption.words } : {}),
      ...(caption.timingStartMs !== undefined && caption.timingEndMs !== undefined
        ? { timingStartMs: caption.timingStartMs, timingEndMs: caption.timingEndMs }
        : {})
    }));
}
