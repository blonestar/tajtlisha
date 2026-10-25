import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_PRESETS, clamp } from '../../../shared/subtitle-geometry';
import type { CaptionRow, CaptionWord, PreviewTrack, ProjectDocument, ProjectSource, TrimRange } from '../../../shared/types/project';
import type { SubtitlePresetId, SubtitleStyle } from '../../../shared/types/style';
import { matchedCaptionWords, shiftCaptionWords } from '../../../shared/word-highlight';

export const HISTORY_LIMIT = 100;
export const MIN_TRIM_MS = 100;
export const MIN_CAPTION_MS = 300;
export const DEFAULT_CAPTION_MS = 2000;
/** Minimum free room (ms) at the insert position for caption/insert to succeed. */
export const MIN_INSERT_ROOM_MS = 300;
/** Consecutive text edits on the same caption field within this window share one undo step. */
export const COALESCE_WINDOW_MS = 1000;

export type NudgeEdge = 'start' | 'end' | 'both';

export type CaptionTimingPatch = Partial<Pick<CaptionRow, 'startMs' | 'endMs' | 'original' | 'translation'>>;

export type TranscriptionMeta = NonNullable<ProjectDocument['transcription']>;

export type ProjectState = {
  project: ProjectDocument;
  past: ProjectDocument[];
  future: ProjectDocument[];
  /**
   * Increments on every content change. Always equal to `project.revision`, so
   * the persisted document and the in-memory state agree on the revision.
   */
  revision: number;
  lastCoalesceKey?: string;
  lastCoalesceAt?: number;
};

export type ProjectAction =
  /**
   * Not undoable. Clears history. Used when a saved project is loaded. The
   * revision continues from the loaded document and never goes backwards; the
   * load itself is not an edit, so it does not add one.
   */
  | { type: 'project/replace'; project: ProjectDocument }
  /** Not undoable. Clears history and captions, since the old captions belong to the old video. */
  | { type: 'source/set'; source: ProjectSource }
  /**
   * Not undoable. Replaces the video but keeps captions, translations and
   * metadata. Trim is clamped to the new duration. Used when the saved video was
   * missing or changed on disk.
   */
  | { type: 'source/relink'; source: ProjectSource }
  /** Not undoable, does not bump revision. Playback URL is ephemeral. */
  | { type: 'source/updateUrl'; fileUrl: string }
  | { type: 'trim/set'; startMs: number; endMs: number }
  | { type: 'captions/replaceAll'; captions: CaptionRow[]; sourceLanguage?: string; transcription?: TranscriptionMeta }
  /**
   * Stores translations and marks each touched row as made from its current
   * original. Ignored when `targetLanguage` is given and differs from the
   * project's current target: the result is stale (the user changed the target
   * while the AI call was running).
   */
  | { type: 'captions/applyTranslations'; translations: Array<{ id: string; text: string }>; targetLanguage?: string }
  /** A `translation` patch marks that row as up to date with its current original. */
  | { type: 'caption/update'; id: string; patch: CaptionTimingPatch; now?: number }
  | { type: 'caption/insert'; atMs: number; durationMs?: number }
  | { type: 'caption/split'; id: string; atMs: number }
  | { type: 'caption/mergeWithNext'; id: string }
  | { type: 'caption/delete'; id: string }
  | { type: 'caption/nudge'; id: string; deltaMs: number; edge: NudgeEdge }
  /**
   * Moves every caption by the same amount, keeping their durations and gaps.
   * An earlier shift stops when the first caption reaches 0.
   */
  | { type: 'captions/shiftAll'; deltaMs: number }
  | { type: 'style/set'; patch: Partial<Omit<SubtitleStyle, 'presetId'>> }
  | { type: 'style/applyPreset'; presetId: SubtitlePresetId }
  | { type: 'languages/set'; sourceLanguage?: string; targetLanguage?: string }
  | { type: 'previewTrack/set'; track: PreviewTrack }
  | { type: 'history/undo' }
  | { type: 'history/redo' };

export type CreateEmptyProjectOptions = {
  targetLanguage: string;
  style?: SubtitleStyle;
};

type EditOptions = {
  coalesceKey?: string;
  /** Epoch ms used for updatedAt and coalescing. Defaults to Date.now(). */
  at?: number;
};

export function createEmptyProject({ targetLanguage, style }: CreateEmptyProjectOptions): ProjectDocument {
  return {
    schemaVersion: 1,
    id: createId(),
    revision: 0,
    source: null,
    trim: { startMs: 0, endMs: 0 },
    targetLanguage,
    captions: [],
    style: { ...(style ?? DEFAULT_SUBTITLE_STYLE) },
    previewTrack: 'translation',
    updatedAt: new Date().toISOString()
  };
}

export function createProjectState(project: ProjectDocument): ProjectState {
  return { project, past: [], future: [], revision: project.revision };
}

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  const project = state.project;

  switch (action.type) {
    case 'project/replace': {
      const revision = Math.max(state.revision, action.project.revision);
      return { project: { ...action.project, revision }, past: [], future: [], revision };
    }

    case 'source/updateUrl': {
      if (!project.source || project.source.fileUrl === action.fileUrl) return state;
      return { ...state, project: { ...project, source: { ...project.source, fileUrl: action.fileUrl } } };
    }

    case 'source/set': {
      const source = { ...action.source, durationMs: toMs(action.source.durationMs) };
      const next: ProjectDocument = {
        ...project,
        source,
        trim: { startMs: 0, endMs: source.durationMs },
        captions: []
      };
      delete next.sourceLanguage;
      delete next.translationLanguage;
      delete next.transcription;
      return resetHistory(state, next);
    }

    case 'source/relink': {
      const source = { ...action.source, durationMs: toMs(action.source.durationMs) };
      const trim = normalizeTrim(project.trim.startMs, project.trim.endMs, source.durationMs) ?? {
        startMs: 0,
        endMs: source.durationMs
      };
      return resetHistory(state, { ...project, source, trim });
    }

    case 'trim/set': {
      if (!project.source) return state;
      const trim = normalizeTrim(action.startMs, action.endMs, project.source.durationMs);
      if (!trim || isShallowEqual(trim, project.trim)) return state;
      return applyEdit(state, { ...project, trim });
    }

    case 'captions/replaceAll': {
      const next: ProjectDocument = { ...project, captions: sortCaptions(action.captions.map(normalizeCaptionTiming)) };
      if (action.sourceLanguage !== undefined) next.sourceLanguage = action.sourceLanguage;
      if (action.transcription !== undefined) next.transcription = action.transcription;
      // The new captions were not produced by the last translation run.
      delete next.translationLanguage;
      return applyEdit(state, next);
    }

    case 'captions/applyTranslations': {
      if (action.targetLanguage !== undefined && action.targetLanguage !== project.targetLanguage) return state;

      const translations = new Map(action.translations.map((item): [string, string] => [item.id, item.text]));
      let changed = false;
      const captions = project.captions.map((caption) => {
        const text = translations.get(caption.id);
        if (text === undefined) return caption;
        if (text === caption.translation && caption.translatedFrom === caption.original) return caption;
        changed = true;
        return withTranslatedFrom({ ...caption, translation: text }, caption.original);
      });

      // Flip the project-level language only when no row keeps an older-language
      // translation. Otherwise an untouched row would turn fresh without being
      // translated again.
      const hasUntouchedTranslation = captions.some(
        (caption) => !translations.has(caption.id) && caption.translation.trim() !== ''
      );
      const keepOldLanguage = hasUntouchedTranslation && project.translationLanguage !== project.targetLanguage;
      const translationLanguage = keepOldLanguage ? project.translationLanguage : project.targetLanguage;
      const languageChanged = translationLanguage !== project.translationLanguage;

      if (!changed && !languageChanged) return state;
      const next: ProjectDocument = { ...project, captions };
      if (translationLanguage === undefined) delete next.translationLanguage;
      else next.translationLanguage = translationLanguage;
      return applyEdit(state, next);
    }

    case 'caption/update': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0) return state;
      const current = project.captions[index];
      const updated = applyCaptionPatch(current, action.patch);
      // Word times are source-absolute: they follow the caption only when it moved as a whole.
      const startDelta = updated.startMs - current.startMs;
      const movedAsWhole = startDelta !== 0 && startDelta === updated.endMs - current.endMs;
      const moved = movedAsWhole && current.words ? withWords(updated, shiftCaptionWords(current.words, startDelta)) : updated;
      // A manual translation counts as up to date with the current original.
      const next = action.patch.translation !== undefined ? withTranslatedFrom(moved, moved.original) : moved;
      if (isShallowEqual(current, next)) return state;

      const timingChanged = action.patch.startMs !== undefined || action.patch.endMs !== undefined;
      const textFields = (['original', 'translation'] as const).filter((field) => action.patch[field] !== undefined);
      const coalesceKey =
        !timingChanged && textFields.length > 0 ? `caption-text:${action.id}:${textFields.join(',')}` : undefined;

      const captions = sortCaptions(replaceAt(project.captions, index, next));
      const edited: ProjectDocument = { ...project, captions };
      // The first translation typed by hand defines the translation language, so
      // manual work in a project that never had AI translations is not "stale".
      if (action.patch.translation !== undefined && project.translationLanguage === undefined) {
        edited.translationLanguage = project.targetLanguage;
      }
      return applyEdit(state, edited, { coalesceKey, at: action.now ?? Date.now() });
    }

    case 'caption/insert': {
      const atMs = toMs(action.atMs);
      const gap = findFreeGap(project, atMs);
      if (!gap || gap.end - atMs < MIN_INSERT_ROOM_MS) return state;
      const durationMs = Math.max(1, toMs(action.durationMs ?? DEFAULT_CAPTION_MS));
      const caption: CaptionRow = {
        id: createId(),
        startMs: atMs,
        endMs: Math.min(atMs + durationMs, gap.end),
        original: '',
        translation: ''
      };
      return applyEdit(state, { ...project, captions: sortCaptions([...project.captions, caption]) });
    }

    case 'caption/split': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0) return state;
      const caption = project.captions[index];
      const atMs = toMs(action.atMs);
      if (atMs <= caption.startMs || atMs >= caption.endMs) return state;

      const ratio = (atMs - caption.startMs) / (caption.endMs - caption.startMs);
      const [originalFirst, originalSecond] = splitTextAtRatio(caption.original, ratio);
      const [translationFirst, translationSecond] = splitTextAtRatio(caption.translation, ratio);
      const upToDate = isUpToDate(caption);
      const first: CaptionRow = withWords(
        withTranslatedFrom(
          {
            ...caption,
            endMs: atMs,
            original: originalFirst,
            translation: translationFirst
          },
          upToDate ? originalFirst : undefined
        ),
        caption.words?.filter((word) => word.startMs < atMs)
      );
      const second: CaptionRow = withWords(
        withTranslatedFrom(
          {
            id: createId(),
            startMs: atMs,
            endMs: caption.endMs,
            original: originalSecond,
            translation: translationSecond
          },
          upToDate ? originalSecond : undefined
        ),
        caption.words?.filter((word) => word.startMs >= atMs)
      );
      const captions = sortCaptions([...project.captions.slice(0, index), first, second, ...project.captions.slice(index + 1)]);
      return applyEdit(state, { ...project, captions });
    }

    case 'caption/mergeWithNext': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0 || index >= project.captions.length - 1) return state;
      const current = project.captions[index];
      const next = project.captions[index + 1];
      const original = joinText(current.original, next.original);
      const merged = withWords(
        withTranslatedFrom(
          {
            ...current,
            endMs: next.endMs,
            original,
            translation: joinText(current.translation, next.translation)
          },
          isUpToDate(current) && isUpToDate(next) ? original : undefined
        ),
        // Words deleted from either text are dropped first, so the merged text cannot match them.
        current.words || next.words
          ? [
              ...matchedCaptionWords(current.original, current.words ?? []),
              ...matchedCaptionWords(next.original, next.words ?? [])
            ]
          : undefined
      );
      const captions = [...project.captions.slice(0, index), merged, ...project.captions.slice(index + 2)];
      return applyEdit(state, { ...project, captions });
    }

    case 'caption/delete': {
      const captions = project.captions.filter((caption) => caption.id !== action.id);
      if (captions.length === project.captions.length) return state;
      return applyEdit(state, { ...project, captions });
    }

    case 'caption/nudge': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0) return state;
      const delta = Number.isFinite(action.deltaMs) ? Math.round(action.deltaMs) : 0;
      if (delta === 0) return state;

      const current = project.captions[index];
      let startMs = current.startMs;
      let endMs = current.endMs;
      if (action.edge === 'start') {
        startMs = Math.max(0, startMs + delta);
      } else if (action.edge === 'end') {
        endMs = Math.max(0, endMs + delta);
      } else {
        const shift = Math.max(delta, -current.startMs);
        startMs += shift;
        endMs = Math.max(0, endMs + shift);
      }

      // Only a whole-caption move carries the words along; trimming an edge leaves them where they are.
      const moved = action.edge === 'both' ? startMs - current.startMs : 0;
      const shiftedCaption: CaptionRow = { ...current, startMs, endMs };
      const updated =
        moved !== 0 && current.words ? withWords(shiftedCaption, shiftCaptionWords(current.words, moved)) : shiftedCaption;
      if (isShallowEqual(current, updated)) return state;
      const captions = sortCaptions(replaceAt(project.captions, index, updated));
      return applyEdit(state, { ...project, captions });
    }

    case 'captions/shiftAll': {
      const shift = clampShiftAll(project.captions, action.deltaMs);
      if (shift === 0) return state;
      const captions = project.captions.map((caption) => {
        const moved: CaptionRow = {
          ...caption,
          startMs: caption.startMs + shift,
          endMs: Math.max(0, caption.endMs + shift)
        };
        return caption.words ? withWords(moved, shiftCaptionWords(caption.words, shift)) : moved;
      });
      return applyEdit(state, { ...project, captions });
    }

    case 'style/set': {
      const changes = withoutUndefined(action.patch) as Partial<SubtitleStyle>;
      const keys = Object.keys(changes) as Array<keyof SubtitleStyle>;
      const changed = keys.some((key) => project.style[key] !== changes[key]);
      if (!changed) return state;
      const style: SubtitleStyle = { ...project.style, ...changes };
      // Any real change means the style no longer matches the named preset.
      delete style.presetId;
      return applyEdit(state, { ...project, style });
    }

    case 'style/applyPreset': {
      const style: SubtitleStyle = { ...SUBTITLE_PRESETS[action.presetId] };
      if (isShallowEqual(style, project.style)) return state;
      return applyEdit(state, { ...project, style });
    }

    case 'languages/set': {
      const next: ProjectDocument = { ...project };
      if (action.sourceLanguage !== undefined) next.sourceLanguage = action.sourceLanguage;
      if (action.targetLanguage !== undefined) next.targetLanguage = action.targetLanguage;
      if (next.sourceLanguage === project.sourceLanguage && next.targetLanguage === project.targetLanguage) return state;
      return applyEdit(state, next);
    }

    case 'previewTrack/set': {
      if (project.previewTrack === action.track) return state;
      return applyEdit(state, { ...project, previewTrack: action.track });
    }

    case 'history/undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      const revision = state.revision + 1;
      return {
        project: { ...restoreFileUrl(previous, project), updatedAt: new Date().toISOString(), revision },
        past: state.past.slice(0, -1),
        future: [project, ...state.future].slice(0, HISTORY_LIMIT),
        revision
      };
    }

    case 'history/redo': {
      const next = state.future[0];
      if (!next) return state;
      const revision = state.revision + 1;
      return {
        project: { ...restoreFileUrl(next, project), updatedAt: new Date().toISOString(), revision },
        past: [...state.past, project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        revision
      };
    }
  }

  // Unreachable while the union is exhaustive; keeps the reducer total at runtime.
  const exhaustive: never = action;
  void exhaustive;
  return state;
}

/**
 * The shift captions/shiftAll actually applies: rounded to whole ms and, when
 * moving earlier, limited so the first caption does not start before 0.
 */
export function clampShiftAll(captions: readonly CaptionRow[], deltaMs: number): number {
  if (captions.length === 0 || !Number.isFinite(deltaMs)) return 0;
  const delta = Math.round(deltaMs);
  const firstStart = Math.min(...captions.map((caption) => caption.startMs));
  return Math.max(delta, -firstStart);
}

function applyEdit(state: ProjectState, next: ProjectDocument, options: EditOptions = {}): ProjectState {
  const at = options.at ?? Date.now();
  const coalesced =
    options.coalesceKey !== undefined &&
    state.lastCoalesceKey === options.coalesceKey &&
    state.lastCoalesceAt !== undefined &&
    at - state.lastCoalesceAt <= COALESCE_WINDOW_MS;
  const revision = state.revision + 1;

  return {
    project: { ...next, revision, updatedAt: new Date(at).toISOString() },
    past: coalesced ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT),
    future: [],
    revision,
    lastCoalesceKey: options.coalesceKey,
    lastCoalesceAt: options.coalesceKey === undefined ? undefined : at
  };
}

/**
 * Replaces the document as a content change that cannot be undone. Undo would
 * otherwise bring back captions or a source that no longer match the file.
 */
function resetHistory(state: ProjectState, next: ProjectDocument): ProjectState {
  const revision = state.revision + 1;
  return {
    project: { ...next, revision, updatedAt: new Date().toISOString() },
    past: [],
    future: [],
    revision
  };
}

/** Undo/redo snapshots store the fileUrl that was current at the time. Keep the live URL when it is the same file. */
function restoreFileUrl(snapshot: ProjectDocument, current: ProjectDocument): ProjectDocument {
  if (!snapshot.source || !current.source || snapshot.source.inputPath !== current.source.inputPath) return snapshot;
  return { ...snapshot, source: { ...snapshot.source, fileUrl: current.source.fileUrl } };
}

function normalizeTrim(startMs: number, endMs: number, durationMs: number): TrimRange | null {
  const duration = toMs(durationMs);
  const start = clamp(toMs(startMs), 0, duration);
  const end = clamp(toMs(endMs), 0, duration);
  // Too-short or inverted ranges are rejected (no-op) rather than adjusted.
  if (end - start < MIN_TRIM_MS) return null;
  return { startMs: start, endMs: end };
}

/**
 * Free range around atMs, bounded by the trim range and neighbouring captions.
 * Returns null when atMs sits inside a caption or outside the trim.
 */
function findFreeGap(project: ProjectDocument, atMs: number): { start: number; end: number } | null {
  let start = project.trim.startMs;
  let end = project.trim.endMs;
  for (const caption of project.captions) {
    if (caption.startMs <= atMs) {
      start = Math.max(start, caption.endMs);
    } else {
      end = Math.min(end, caption.startMs);
    }
  }
  if (atMs < start || atMs >= end) return null;
  return { start, end };
}

/**
 * Splits text at the word boundary whose character position is nearest to
 * `ratio` of the text length. Newlines are collapsed to spaces first, so both
 * halves are single-line. Text without a boundary stays in the first half.
 */
function splitTextAtRatio(text: string, ratio: number): [string, string] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized === '') return ['', ''];

  const boundaries: number[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === ' ') boundaries.push(index);
  }
  if (boundaries.length === 0) return [normalized, ''];

  const target = clamp(ratio, 0, 1) * normalized.length;
  let best = boundaries[0];
  for (const position of boundaries) {
    if (Math.abs(position - target) < Math.abs(best - target)) best = position;
  }
  return [normalized.slice(0, best), normalized.slice(best + 1)];
}

function joinText(first: string, second: string): string {
  return [first.trim(), second.trim()].filter((part) => part !== '').join(' ');
}

/** A row's translation is up to date when it was made from the row's current original. */
function isUpToDate(caption: CaptionRow): boolean {
  return caption.translatedFrom === caption.original;
}

/** Sets words, or removes the key when there are none, so rows never carry an undefined or empty words list. */
function withWords(caption: CaptionRow, words: CaptionWord[] | undefined): CaptionRow {
  const next: CaptionRow = { ...caption };
  delete next.words;
  if (words !== undefined && words.length > 0) next.words = words;
  return next;
}

/** Sets translatedFrom, or removes it when undefined, so rows never carry an undefined key. */
function withTranslatedFrom(caption: CaptionRow, translatedFrom: string | undefined): CaptionRow {
  const next: CaptionRow = { ...caption };
  delete next.translatedFrom;
  if (translatedFrom !== undefined) next.translatedFrom = translatedFrom;
  return next;
}

function applyCaptionPatch(caption: CaptionRow, patch: CaptionTimingPatch): CaptionRow {
  return {
    ...caption,
    startMs: patch.startMs === undefined ? caption.startMs : toMs(patch.startMs),
    endMs: patch.endMs === undefined ? caption.endMs : toMs(patch.endMs),
    original: patch.original ?? caption.original,
    translation: patch.translation ?? caption.translation
  };
}

function normalizeCaptionTiming(caption: CaptionRow): CaptionRow {
  return { ...caption, startMs: toMs(caption.startMs), endMs: toMs(caption.endMs) };
}

function sortCaptions(captions: CaptionRow[]): CaptionRow[] {
  return [...captions].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function findCaptionIndex(captions: CaptionRow[], id: string): number {
  return captions.findIndex((caption) => caption.id === id);
}

function replaceAt<T>(items: T[], index: number, item: T): T[] {
  return items.map((current, currentIndex) => (currentIndex === index ? item : current));
}

function toMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isShallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return aKeys.every((key) => left[key] === right[key]);
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function createId(): string {
  return crypto.randomUUID();
}
