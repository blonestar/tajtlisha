import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_CONTEXT_CHARS } from '../../../src/shared/ai-instructions';
import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_PRESETS } from '../../../src/shared/subtitle-geometry';
import type { CaptionRow, ProjectDocument, ProjectSource } from '../../../src/shared/types/project';
import {
  COALESCE_WINDOW_MS,
  HISTORY_LIMIT,
  clampShiftAll,
  createEmptyProject,
  createProjectState,
  projectReducer,
  type ProjectAction,
  type ProjectState
} from '../../../src/renderer/src/state/project-reducer';

const source: ProjectSource = {
  inputPath: '/clips/a.mp4',
  fileUrl: 'tajtlisha-media://a',
  durationMs: 10000,
  width: 1280,
  height: 720,
  hasAudio: true,
  fileSizeBytes: 1000,
  mtimeMs: 1700000000000
};

function caption(id: string, startMs: number, endMs: number, original = 'hello', translation = 'zdravo'): CaptionRow {
  return { id, startMs, endMs, original, translation };
}

/** A state whose history is empty, so undo tests start from a known point. */
function stateWith(captions: CaptionRow[] = [], overrides: Partial<ProjectDocument> = {}): ProjectState {
  const project: ProjectDocument = {
    ...createEmptyProject({ targetLanguage: 'sr-Latn' }),
    source,
    trim: { startMs: 0, endMs: 10000 },
    captions,
    ...overrides
  };
  return createProjectState(project);
}

function run(state: ProjectState, ...actions: ProjectAction[]): ProjectState {
  return actions.reduce((current, action) => projectReducer(current, action), state);
}

function ids(state: ProjectState): string[] {
  return state.project.captions.map((item) => item.id);
}

describe('createEmptyProject', () => {
  it('creates a schema v1 project with no source and default style', () => {
    const project = createEmptyProject({ targetLanguage: 'sr-Latn' });

    expect(project.schemaVersion).toBe(1);
    expect(project.source).toBeNull();
    expect(project.trim).toEqual({ startMs: 0, endMs: 0 });
    expect(project.captions).toEqual([]);
    expect(project.targetLanguage).toBe('sr-Latn');
    expect(project.previewTrack).toBe('translation');
    expect(project.style).toEqual(DEFAULT_SUBTITLE_STYLE);
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('copies the style so later edits cannot mutate the default', () => {
    const project = createEmptyProject({ targetLanguage: 'en' });
    project.style.fontSizePercent = 9;

    expect(DEFAULT_SUBTITLE_STYLE.fontSizePercent).not.toBe(9);
  });
});

describe('source and trim', () => {
  it('source/set sets the whole duration as trim, clears captions and sourceLanguage', () => {
    const start = run(
      stateWith([caption('a', 0, 1000)], { sourceLanguage: 'en' }),
      { type: 'source/set', source: { ...source, durationMs: 5000.4 } }
    );

    expect(start.project.source?.durationMs).toBe(5000);
    expect(start.project.trim).toEqual({ startMs: 0, endMs: 5000 });
    expect(start.project.captions).toEqual([]);
    expect(start.project.sourceLanguage).toBeUndefined();
    expect('sourceLanguage' in start.project).toBe(false);
  });

  it('source/set is not undoable: it clears history, so undo cannot bring back the old video', () => {
    const before = run(stateWith([caption('a', 0, 1000)]), { type: 'caption/delete', id: 'a' });
    const after = run(before, { type: 'source/set', source: { ...source, inputPath: '/clips/b.mp4' } });

    expect(after.past).toHaveLength(0);
    expect(after.future).toHaveLength(0);
    expect(projectReducer(after, { type: 'history/undo' })).toBe(after);
  });

  it('source/set also clears translation language and transcription metadata', () => {
    const state = stateWith([caption('a', 0, 1000)], {
      translationLanguage: 'sr-Latn',
      transcription: { providerId: 'openai', timingSource: 'word' }
    });
    const next = run(state, { type: 'source/set', source });

    expect('translationLanguage' in next.project).toBe(false);
    expect('transcription' in next.project).toBe(false);
  });

  it('source/updateUrl changes the URL without bumping revision or history', () => {
    const state = stateWith();
    const next = run(state, { type: 'source/updateUrl', fileUrl: 'tajtlisha-media://fresh' });

    expect(next.project.source?.fileUrl).toBe('tajtlisha-media://fresh');
    expect(next.revision).toBe(state.revision);
    expect(next.past).toHaveLength(0);
  });

  it('source/updateUrl is a no-op without a source or with the same URL', () => {
    const empty = createProjectState(createEmptyProject({ targetLanguage: 'en' }));
    expect(projectReducer(empty, { type: 'source/updateUrl', fileUrl: 'x' })).toBe(empty);

    const state = stateWith();
    expect(projectReducer(state, { type: 'source/updateUrl', fileUrl: source.fileUrl })).toBe(state);
  });

  it('trim/set clamps to the source duration and rounds', () => {
    const next = run(stateWith(), { type: 'trim/set', startMs: -500, endMs: 12000.6 });

    expect(next.project.trim).toEqual({ startMs: 0, endMs: 10000 });
  });

  it('trim/set rejects ranges shorter than 100 ms and inverted ranges', () => {
    const state = stateWith();

    expect(projectReducer(state, { type: 'trim/set', startMs: 1000, endMs: 1050 })).toBe(state);
    expect(projectReducer(state, { type: 'trim/set', startMs: 2000, endMs: 1000 })).toBe(state);
  });

  it('trim/set is a no-op without a source or when unchanged', () => {
    const empty = createProjectState(createEmptyProject({ targetLanguage: 'en' }));
    expect(projectReducer(empty, { type: 'trim/set', startMs: 0, endMs: 500 })).toBe(empty);

    const state = stateWith();
    expect(projectReducer(state, { type: 'trim/set', startMs: 0, endMs: 10000 })).toBe(state);
  });

  it('trim/set is undoable and bumps revision', () => {
    const state = stateWith();
    const next = run(state, { type: 'trim/set', startMs: 1000, endMs: 4000 });

    expect(next.revision).toBe(state.revision + 1);
    expect(run(next, { type: 'history/undo' }).project.trim).toEqual({ startMs: 0, endMs: 10000 });
  });
});

describe('captions bulk operations', () => {
  it('captions/replaceAll sorts captions and normalizes timing', () => {
    const next = run(stateWith(), {
      type: 'captions/replaceAll',
      captions: [caption('b', 2000.4, 3000), caption('a', -10, 1000.6)],
      sourceLanguage: 'en'
    });

    expect(ids(next)).toEqual(['a', 'b']);
    expect(next.project.captions[0]).toMatchObject({ startMs: 0, endMs: 1001 });
    expect(next.project.captions[1].startMs).toBe(2000);
    expect(next.project.sourceLanguage).toBe('en');
  });

  it('captions/replaceAll keeps the existing sourceLanguage when none is given', () => {
    const state = stateWith([], { sourceLanguage: 'de' });
    const next = run(state, { type: 'captions/replaceAll', captions: [caption('a', 0, 500)] });

    expect(next.project.sourceLanguage).toBe('de');
  });

  it('captions/applyTranslations fills known ids and ignores unknown ones', () => {
    const state = stateWith([caption('a', 0, 1000, 'one', ''), caption('b', 1000, 2000, 'two', '')]);
    const next = run(state, {
      type: 'captions/applyTranslations',
      translations: [
        { id: 'a', text: 'jedan' },
        { id: 'missing', text: 'nope' }
      ]
    });

    expect(next.project.captions.map((item) => item.translation)).toEqual(['jedan', '']);
    expect(next.project.captions[0].original).toBe('one');
  });

  it('captions/applyTranslations is a no-op when nothing changes', () => {
    const state = stateWith([{ ...caption('a', 0, 1000, 'one', 'jedan'), translatedFrom: 'one' }], {
      translationLanguage: 'sr-Latn'
    });

    expect(projectReducer(state, { type: 'captions/applyTranslations', translations: [{ id: 'a', text: 'jedan' }] })).toBe(
      state
    );
  });
});

describe('caption/update', () => {
  it('changes timing and re-sorts captions', () => {
    const state = stateWith([caption('a', 0, 1000), caption('b', 2000, 3000)]);
    const next = run(state, { type: 'caption/update', id: 'a', patch: { startMs: 2500, endMs: 2600 } });

    expect(ids(next)).toEqual(['b', 'a']);
  });

  it('rounds and clamps timing values to non-negative integers', () => {
    const next = run(stateWith([caption('a', 0, 1000)]), {
      type: 'caption/update',
      id: 'a',
      patch: { startMs: -40, endMs: 1234.7 }
    });

    expect(next.project.captions[0]).toMatchObject({ startMs: 0, endMs: 1235 });
  });

  it('coalesces consecutive text edits on the same field within the window into one undo step', () => {
    const base = stateWith([caption('a', 0, 1000, 'hi', '')]);
    const typed = run(
      base,
      { type: 'caption/update', id: 'a', patch: { translation: 'z' }, now: 1000 },
      { type: 'caption/update', id: 'a', patch: { translation: 'zd' }, now: 1400 },
      { type: 'caption/update', id: 'a', patch: { translation: 'zdr' }, now: 1400 + COALESCE_WINDOW_MS }
    );

    expect(typed.past).toHaveLength(1);
    expect(typed.project.captions[0].translation).toBe('zdr');

    const undone = run(typed, { type: 'history/undo' });
    expect(undone.project.captions[0].translation).toBe('');
  });

  it('does not coalesce when the gap exceeds the window', () => {
    const base = stateWith([caption('a', 0, 1000, 'hi', '')]);
    const typed = run(
      base,
      { type: 'caption/update', id: 'a', patch: { translation: 'z' }, now: 1000 },
      { type: 'caption/update', id: 'a', patch: { translation: 'zd' }, now: 1000 + COALESCE_WINDOW_MS + 1 }
    );

    expect(typed.past).toHaveLength(2);
  });

  it('does not coalesce edits to different fields or to different captions', () => {
    const base = stateWith([caption('a', 0, 1000, 'hi', ''), caption('b', 1000, 2000, 'yo', '')]);
    const typed = run(
      base,
      { type: 'caption/update', id: 'a', patch: { translation: 'z' }, now: 1000 },
      { type: 'caption/update', id: 'a', patch: { original: 'ho' }, now: 1100 },
      { type: 'caption/update', id: 'b', patch: { original: 'yoyo' }, now: 1200 }
    );

    expect(typed.past).toHaveLength(3);
  });

  it('timing edits never coalesce', () => {
    const base = stateWith([caption('a', 0, 1000)]);
    const moved = run(
      base,
      { type: 'caption/update', id: 'a', patch: { startMs: 100 }, now: 1000 },
      { type: 'caption/update', id: 'a', patch: { startMs: 200 }, now: 1100 }
    );

    expect(moved.past).toHaveLength(2);
  });

  it('is a no-op for unknown ids or unchanged values', () => {
    const state = stateWith([caption('a', 0, 1000)]);

    expect(projectReducer(state, { type: 'caption/update', id: 'zzz', patch: { startMs: 5 } })).toBe(state);
    expect(projectReducer(state, { type: 'caption/update', id: 'a', patch: { startMs: 0 } })).toBe(state);
  });

  it('refreshes updatedAt from the provided now', () => {
    const next = run(stateWith([caption('a', 0, 1000)]), {
      type: 'caption/update',
      id: 'a',
      patch: { startMs: 10 },
      now: Date.UTC(2026, 0, 2, 3, 4, 5)
    });

    expect(next.project.updatedAt).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('caption/insert', () => {
  it('inserts a 2000 ms empty caption in the free gap', () => {
    const state = stateWith([caption('a', 0, 1000)]);
    const next = run(state, { type: 'caption/insert', atMs: 3000 });

    expect(next.project.captions).toHaveLength(2);
    const inserted = next.project.captions[1];
    expect(inserted).toMatchObject({ startMs: 3000, endMs: 5000, original: '', translation: '' });
    expect(inserted.id).not.toBe('a');
  });

  it('shortens the new caption to fit before the next caption', () => {
    const state = stateWith([caption('a', 3500, 4000)]);
    const next = run(state, { type: 'caption/insert', atMs: 2000 });

    expect(next.project.captions[0]).toMatchObject({ startMs: 2000, endMs: 3500 });
  });

  it('honours a custom duration', () => {
    const next = run(stateWith(), { type: 'caption/insert', atMs: 1000, durationMs: 750 });

    expect(next.project.captions[0]).toMatchObject({ startMs: 1000, endMs: 1750 });
  });

  it('is a no-op when atMs sits inside a caption', () => {
    const state = stateWith([caption('a', 0, 1000)]);

    expect(projectReducer(state, { type: 'caption/insert', atMs: 500 })).toBe(state);
  });

  it('is a no-op when the free room is shorter than 300 ms', () => {
    const state = stateWith([caption('a', 1100, 2000)]);

    expect(projectReducer(state, { type: 'caption/insert', atMs: 1000 })).toBe(state);
  });

  it('accepts room of exactly 300 ms', () => {
    const state = stateWith([caption('a', 1300, 2000)]);
    const next = run(state, { type: 'caption/insert', atMs: 1000 });

    expect(next.project.captions[0]).toMatchObject({ startMs: 1000, endMs: 1300 });
  });

  it('is a no-op outside the trim range', () => {
    const state = stateWith([], { trim: { startMs: 2000, endMs: 6000 } });

    expect(projectReducer(state, { type: 'caption/insert', atMs: 500 })).toBe(state);
    expect(projectReducer(state, { type: 'caption/insert', atMs: 6000 })).toBe(state);
  });

  it('is a no-op without a source', () => {
    const state = createProjectState(createEmptyProject({ targetLanguage: 'en' }));

    expect(projectReducer(state, { type: 'caption/insert', atMs: 0 })).toBe(state);
  });

  it('is undoable', () => {
    const state = stateWith();
    const next = run(state, { type: 'caption/insert', atMs: 1000 });

    expect(run(next, { type: 'history/undo' }).project.captions).toEqual([]);
  });
});

describe('caption/split', () => {
  it('splits timing at atMs and splits both texts at the nearest word boundary', () => {
    const state = stateWith([caption('a', 0, 4000, 'one two three four', 'jedan dva tri cetiri')]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 1000 });

    expect(next.project.captions).toHaveLength(2);
    const [first, second] = next.project.captions;
    expect(first).toMatchObject({ id: 'a', startMs: 0, endMs: 1000, original: 'one', translation: 'jedan' });
    expect(second).toMatchObject({
      startMs: 1000,
      endMs: 4000,
      original: 'two three four',
      translation: 'dva tri cetiri'
    });
    expect(second.id).not.toBe('a');
  });

  it('picks the boundary nearest to the same relative position in each text independently', () => {
    // At 25% of the time: original target is char 5.75 of 23 (after "alpha");
    // translation target is char 1.75 of 7 (after "x").
    const state = stateWith([caption('a', 0, 4000, 'alpha beta gamma delta', 'x y z w')]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 1000 });

    expect(next.project.captions[0]).toMatchObject({ original: 'alpha', translation: 'x' });
    expect(next.project.captions[1]).toMatchObject({ original: 'beta gamma delta', translation: 'y z w' });
  });

  it('splits when translation is empty, leaving both halves empty', () => {
    const state = stateWith([caption('a', 0, 4000, 'one two', '')]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 2000 });

    expect(next.project.captions.map((item) => item.translation)).toEqual(['', '']);
    expect(next.project.captions.map((item) => item.original)).toEqual(['one', 'two']);
  });

  it('collapses newlines so both halves are single-line', () => {
    const state = stateWith([caption('a', 0, 4000, 'one\ntwo\nthree', 'jedan\ndva')]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 2000 });

    for (const item of next.project.captions) {
      expect(item.original).not.toContain('\n');
      expect(item.translation).not.toContain('\n');
    }
    expect(next.project.captions[0].original).toBe('one two');
  });

  it('keeps a single word in the first half and leaves the second half text empty', () => {
    const state = stateWith([caption('a', 0, 4000, 'hello', 'zdravo')]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 2000 });

    expect(next.project.captions[0]).toMatchObject({ original: 'hello', translation: 'zdravo' });
    expect(next.project.captions[1]).toMatchObject({ original: '', translation: '' });
  });

  it('is a no-op when atMs is at or outside the caption boundaries', () => {
    const state = stateWith([caption('a', 1000, 2000)]);

    expect(projectReducer(state, { type: 'caption/split', id: 'a', atMs: 1000 })).toBe(state);
    expect(projectReducer(state, { type: 'caption/split', id: 'a', atMs: 2000 })).toBe(state);
    expect(projectReducer(state, { type: 'caption/split', id: 'a', atMs: 3000 })).toBe(state);
    expect(projectReducer(state, { type: 'caption/split', id: 'zzz', atMs: 1500 })).toBe(state);
  });

  it('keeps captions sorted after the split', () => {
    const state = stateWith([caption('a', 0, 1000), caption('b', 1000, 2000), caption('c', 2000, 3000)]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 500 });

    expect(next.project.captions.map((item) => item.startMs)).toEqual([0, 500, 1000, 2000]);
  });

  it('is undoable', () => {
    const state = stateWith([caption('a', 0, 4000, 'one two', 'jedan dva')]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 2000 });

    expect(run(next, { type: 'history/undo' }).project.captions).toEqual(state.project.captions);
  });
});

describe('caption/mergeWithNext', () => {
  it('joins texts with a space and spans from the first start to the second end', () => {
    const state = stateWith([caption('a', 0, 1000, 'one', 'jedan'), caption('b', 1200, 2500, 'two', 'dva')]);
    const next = run(state, { type: 'caption/mergeWithNext', id: 'a' });

    expect(next.project.captions).toEqual([
      { id: 'a', startMs: 0, endMs: 2500, original: 'one two', translation: 'jedan dva' }
    ]);
  });

  it('skips empty sides so no leading or trailing space appears', () => {
    const state = stateWith([caption('a', 0, 1000, 'one', ''), caption('b', 1000, 2000, '', 'dva')]);
    const next = run(state, { type: 'caption/mergeWithNext', id: 'a' });

    expect(next.project.captions[0]).toMatchObject({ original: 'one', translation: 'dva' });
  });

  it('is a no-op on the last row', () => {
    const state = stateWith([caption('a', 0, 1000), caption('b', 1000, 2000)]);

    expect(projectReducer(state, { type: 'caption/mergeWithNext', id: 'b' })).toBe(state);
  });

  it('is a no-op for unknown ids', () => {
    const state = stateWith([caption('a', 0, 1000), caption('b', 1000, 2000)]);

    expect(projectReducer(state, { type: 'caption/mergeWithNext', id: 'zzz' })).toBe(state);
  });
});

describe('caption/delete', () => {
  it('removes the caption and is undoable', () => {
    const state = stateWith([caption('a', 0, 1000), caption('b', 1000, 2000)]);
    const next = run(state, { type: 'caption/delete', id: 'a' });

    expect(ids(next)).toEqual(['b']);
    expect(ids(run(next, { type: 'history/undo' }))).toEqual(['a', 'b']);
  });

  it('is a no-op for unknown ids', () => {
    const state = stateWith([caption('a', 0, 1000)]);

    expect(projectReducer(state, { type: 'caption/delete', id: 'zzz' })).toBe(state);
  });
});

describe('captions/shiftAll', () => {
  it('moves every caption by the same amount and keeps durations and gaps', () => {
    const state = stateWith([caption('a', 1000, 2000), caption('b', 2500, 4000)]);
    const later = run(state, { type: 'captions/shiftAll', deltaMs: 500 });
    const earlier = run(state, { type: 'captions/shiftAll', deltaMs: -800 });

    expect(later.project.captions.map((item) => [item.startMs, item.endMs])).toEqual([
      [1500, 2500],
      [3000, 4500]
    ]);
    expect(earlier.project.captions.map((item) => [item.startMs, item.endMs])).toEqual([
      [200, 1200],
      [1700, 3200]
    ]);
  });

  it('stops an earlier shift when the first caption reaches 0', () => {
    const state = stateWith([caption('a', 400, 1400), caption('b', 2000, 3000)]);
    const next = run(state, { type: 'captions/shiftAll', deltaMs: -1500 });

    expect(next.project.captions.map((item) => [item.startMs, item.endMs])).toEqual([
      [0, 1000],
      [1600, 2600]
    ]);
    expect(clampShiftAll(state.project.captions, -1500)).toBe(-400);
  });

  it('is a no-op when nothing would move', () => {
    const atZero = stateWith([caption('a', 0, 1000)]);
    expect(run(atZero, { type: 'captions/shiftAll', deltaMs: -500 })).toBe(atZero);
    expect(run(atZero, { type: 'captions/shiftAll', deltaMs: Number.NaN })).toBe(atZero);
    const empty = stateWith([]);
    expect(run(empty, { type: 'captions/shiftAll', deltaMs: 500 })).toBe(empty);
  });

  it('is one undo step', () => {
    const state = stateWith([caption('a', 1000, 2000), caption('b', 2500, 4000)]);
    const shifted = run(state, { type: 'captions/shiftAll', deltaMs: 700 });
    const undone = run(shifted, { type: 'history/undo' });

    expect(shifted.revision).toBe(state.revision + 1);
    expect(undone.project.captions).toEqual(state.project.captions);
  });
});

describe('caption/nudge', () => {
  it('moves only the start edge', () => {
    const next = run(stateWith([caption('a', 1000, 2000)]), {
      type: 'caption/nudge',
      id: 'a',
      deltaMs: -300,
      edge: 'start'
    });

    expect(next.project.captions[0]).toMatchObject({ startMs: 700, endMs: 2000 });
  });

  it('moves only the end edge', () => {
    const next = run(stateWith([caption('a', 1000, 2000)]), {
      type: 'caption/nudge',
      id: 'a',
      deltaMs: 250,
      edge: 'end'
    });

    expect(next.project.captions[0]).toMatchObject({ startMs: 1000, endMs: 2250 });
  });

  it('moves both edges together', () => {
    const next = run(stateWith([caption('a', 1000, 2000)]), {
      type: 'caption/nudge',
      id: 'a',
      deltaMs: 100,
      edge: 'both'
    });

    expect(next.project.captions[0]).toMatchObject({ startMs: 1100, endMs: 2100 });
  });

  it('clamps start at zero without changing the duration when moving both edges left', () => {
    const next = run(stateWith([caption('a', 500, 1500)]), {
      type: 'caption/nudge',
      id: 'a',
      deltaMs: -2000,
      edge: 'both'
    });

    expect(next.project.captions[0]).toMatchObject({ startMs: 0, endMs: 1000 });
  });

  it('clamps start and end at zero for single-edge moves', () => {
    const state = stateWith([caption('a', 500, 1500)]);
    const startClamped = run(state, { type: 'caption/nudge', id: 'a', deltaMs: -9000, edge: 'start' });
    const endClamped = run(state, { type: 'caption/nudge', id: 'a', deltaMs: -9000, edge: 'end' });

    expect(startClamped.project.captions[0].startMs).toBe(0);
    expect(endClamped.project.captions[0].endMs).toBe(0);
  });

  it('re-sorts when a nudge crosses another caption', () => {
    const state = stateWith([caption('a', 0, 1000), caption('b', 1500, 2500)]);
    const next = run(state, { type: 'caption/nudge', id: 'a', deltaMs: 2000, edge: 'both' });

    expect(ids(next)).toEqual(['b', 'a']);
  });

  it('is a no-op for zero delta or unknown ids', () => {
    const state = stateWith([caption('a', 0, 1000)]);

    expect(projectReducer(state, { type: 'caption/nudge', id: 'a', deltaMs: 0, edge: 'both' })).toBe(state);
    expect(projectReducer(state, { type: 'caption/nudge', id: 'zzz', deltaMs: 10, edge: 'both' })).toBe(state);
  });
});

describe('style', () => {
  it('style/set merges the patch and clears presetId when a value really changes', () => {
    const state = run(stateWith(), { type: 'style/applyPreset', presetId: 'box' });
    const next = run(state, { type: 'style/set', patch: { position: 'top' } });

    expect(next.project.style.position).toBe('top');
    expect(next.project.style.presetId).toBeUndefined();
    expect(next.project.style.backgroundEnabled).toBe(true);
  });

  it('style/set keeps presetId when the patch matches current values', () => {
    const state = run(stateWith(), { type: 'style/applyPreset', presetId: 'box' });

    expect(projectReducer(state, { type: 'style/set', patch: { backgroundEnabled: true } })).toBe(state);
  });

  it('style/applyPreset replaces the style with the preset', () => {
    const next = run(stateWith(), { type: 'style/applyPreset', presetId: 'bold_yellow' });

    expect(next.project.style).toEqual(SUBTITLE_PRESETS.bold_yellow);
  });

  it('style/applyPreset is a no-op when the preset is already applied', () => {
    const state = run(stateWith(), { type: 'style/applyPreset', presetId: 'clean' });

    expect(projectReducer(state, { type: 'style/applyPreset', presetId: 'clean' })).toBe(state);
  });

  it('style edits are undoable', () => {
    const state = stateWith();
    const next = run(state, { type: 'style/set', patch: { fontSizePercent: 7 } });

    expect(run(next, { type: 'history/undo' }).project.style).toEqual(DEFAULT_SUBTITLE_STYLE);
  });
});

describe('languages and preview track', () => {
  it('languages/set updates only the given fields', () => {
    const next = run(stateWith(), { type: 'languages/set', sourceLanguage: 'en' });

    expect(next.project.sourceLanguage).toBe('en');
    expect(next.project.targetLanguage).toBe('sr-Latn');
  });

  it('languages/set is a no-op when nothing changes', () => {
    const state = stateWith();

    expect(projectReducer(state, { type: 'languages/set', targetLanguage: 'sr-Latn' })).toBe(state);
  });

  it('previewTrack/set changes the track and is undoable', () => {
    const state = stateWith();
    const next = run(state, { type: 'previewTrack/set', track: 'original' });

    expect(next.project.previewTrack).toBe('original');
    expect(run(next, { type: 'history/undo' }).project.previewTrack).toBe('translation');
    expect(projectReducer(state, { type: 'previewTrack/set', track: 'translation' })).toBe(state);
  });
});

describe('history', () => {
  it('undo and redo walk back and forth through edits', () => {
    const state = stateWith();
    const one = run(state, { type: 'caption/insert', atMs: 0 });
    const two = run(one, { type: 'caption/insert', atMs: 5000 });

    const undoneOnce = run(two, { type: 'history/undo' });
    expect(undoneOnce.project.captions).toHaveLength(1);

    const undoneTwice = run(undoneOnce, { type: 'history/undo' });
    expect(undoneTwice.project.captions).toHaveLength(0);

    const redone = run(undoneTwice, { type: 'history/redo' }, { type: 'history/redo' });
    expect(redone.project.captions).toHaveLength(2);
  });

  it('undo and redo on empty stacks return the same state', () => {
    const state = stateWith();

    expect(projectReducer(state, { type: 'history/undo' })).toBe(state);
    expect(projectReducer(state, { type: 'history/redo' })).toBe(state);
  });

  it('a new edit clears the redo stack', () => {
    const state = stateWith();
    const edited = run(state, { type: 'caption/insert', atMs: 0 });
    const undone = run(edited, { type: 'history/undo' });
    const branched = run(undone, { type: 'caption/insert', atMs: 4000 });

    expect(branched.future).toHaveLength(0);
  });

  it('caps past history at HISTORY_LIMIT', () => {
    let state = stateWith();
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      state = run(state, { type: 'trim/set', startMs: 0, endMs: 9000 + index });
    }

    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it('undo keeps the live fileUrl when the snapshot is the same file', () => {
    const state = stateWith([caption('a', 0, 1000)]);
    const edited = run(
      state,
      { type: 'caption/delete', id: 'a' },
      { type: 'source/updateUrl', fileUrl: 'tajtlisha-media://fresh' }
    );
    const undone = run(edited, { type: 'history/undo' });

    expect(undone.project.captions).toHaveLength(1);
    expect(undone.project.source?.fileUrl).toBe('tajtlisha-media://fresh');
  });

  it('project/replace is not undoable and clears history', () => {
    const edited = run(stateWith(), { type: 'caption/insert', atMs: 0 });
    const replaced = run(edited, { type: 'project/replace', project: stateWith().project });

    expect(replaced.past).toHaveLength(0);
    expect(replaced.future).toHaveLength(0);
    expect(replaced.project.captions).toEqual([]);
  });

  it('project/replace continues from the loaded revision and never goes backwards', () => {
    const fromDisk = { ...stateWith().project, revision: 7 };
    const loaded = run(stateWith(), { type: 'project/replace', project: fromDisk });

    expect(loaded.revision).toBe(7);
    expect(loaded.project.revision).toBe(7);

    const older = { ...stateWith().project, revision: 3 };
    const kept = run(loaded, { type: 'project/replace', project: older });
    expect(kept.revision).toBe(7);
    expect(kept.project.revision).toBe(7);
  });
});

describe('revision and updatedAt', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-04T05:06:07.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments on every change and not on no-ops', () => {
    const state = stateWith([caption('a', 0, 1000)]);
    const changed = run(state, { type: 'caption/delete', id: 'a' });
    const noop = projectReducer(changed, { type: 'caption/delete', id: 'zzz' });

    expect(changed.revision).toBe(state.revision + 1);
    expect(noop).toBe(changed);
    expect(noop.revision).toBe(changed.revision);
  });

  it('refreshes updatedAt on change', () => {
    const next = run(stateWith(), { type: 'caption/insert', atMs: 0 });

    expect(next.project.updatedAt).toBe('2026-03-04T05:06:07.000Z');
  });
});

/** A caption whose translation was made from its current original (up to date). */
function upToDate(id: string, startMs: number, endMs: number, original = 'hello', translation = 'zdravo'): CaptionRow {
  return { ...caption(id, startMs, endMs, original, translation), translatedFrom: original };
}

describe('source/relink', () => {
  const relinked: ProjectSource = { ...source, inputPath: '/clips/moved.mp4', fileUrl: 'tajtlisha-media://moved', durationMs: 8000 };

  it('replaces the video but keeps captions, languages and transcription metadata', () => {
    const state = stateWith([upToDate('a', 0, 1000)], {
      sourceLanguage: 'en',
      translationLanguage: 'sr-Latn',
      transcription: { providerId: 'openai', modelId: 'whisper-1', timingSource: 'segment' }
    });
    const next = run(state, { type: 'source/relink', source: relinked });

    expect(next.project.source).toEqual(relinked);
    expect(next.project.captions).toEqual(state.project.captions);
    expect(next.project.sourceLanguage).toBe('en');
    expect(next.project.translationLanguage).toBe('sr-Latn');
    expect(next.project.transcription).toEqual(state.project.transcription);
  });

  it('clamps the trim to the new duration', () => {
    const next = run(stateWith([], { trim: { startMs: 1000, endMs: 9000 } }), { type: 'source/relink', source: relinked });

    expect(next.project.trim).toEqual({ startMs: 1000, endMs: 8000 });
  });

  it('falls back to the whole new duration when the clamped trim is too short', () => {
    const next = run(stateWith([], { trim: { startMs: 9000, endMs: 10000 } }), { type: 'source/relink', source: relinked });

    expect(next.project.trim).toEqual({ startMs: 0, endMs: 8000 });
  });

  it('is not undoable: it clears history and bumps revision', () => {
    const edited = run(stateWith([upToDate('a', 0, 1000)]), { type: 'caption/delete', id: 'a' });
    const next = run(edited, { type: 'source/relink', source: relinked });

    expect(next.past).toHaveLength(0);
    expect(next.future).toHaveLength(0);
    expect(next.revision).toBe(edited.revision + 1);
  });
});

describe('translation freshness', () => {
  it('captions/applyTranslations marks each touched row as made from its current original', () => {
    const state = stateWith([caption('a', 0, 1000, 'one', ''), caption('b', 1000, 2000, 'two', '')]);
    const next = run(state, {
      type: 'captions/applyTranslations',
      translations: [
        { id: 'a', text: 'jedan' },
        { id: 'b', text: 'dva' }
      ]
    });

    expect(next.project.captions.map((item) => item.translatedFrom)).toEqual(['one', 'two']);
    expect(next.project.translationLanguage).toBe('sr-Latn');
  });

  it('captions/applyTranslations refreshes a row whose translation text is unchanged but was stale', () => {
    const state = stateWith([{ ...caption('a', 0, 1000, 'two', 'jedan'), translatedFrom: 'one' }]);
    const next = run(state, { type: 'captions/applyTranslations', translations: [{ id: 'a', text: 'jedan' }] });

    expect(next.project.captions[0]).toMatchObject({ translation: 'jedan', translatedFrom: 'two' });
  });

  it('captions/applyTranslations ignores a result for another target language', () => {
    const state = stateWith([caption('a', 0, 1000, 'one', '')]);
    const stale = projectReducer(state, {
      type: 'captions/applyTranslations',
      translations: [{ id: 'a', text: 'jedan' }],
      targetLanguage: 'de'
    });

    expect(stale).toBe(state);
  });

  it('captions/applyTranslations applies a result that matches the current target language', () => {
    const state = stateWith([caption('a', 0, 1000, 'one', '')]);
    const next = run(state, {
      type: 'captions/applyTranslations',
      translations: [{ id: 'a', text: 'jedan' }],
      targetLanguage: 'sr-Latn'
    });

    expect(next.project.captions[0].translation).toBe('jedan');
  });

  it('does not flip translationLanguage while an untouched row still holds an older-language translation', () => {
    const state = stateWith(
      [{ ...caption('a', 0, 1000, 'one', ''), translatedFrom: undefined }, caption('b', 1000, 2000, 'two', 'dva')],
      { translationLanguage: 'de' }
    );
    const next = run(state, { type: 'captions/applyTranslations', translations: [{ id: 'a', text: 'jedan' }] });

    expect(next.project.translationLanguage).toBe('de');
    expect(next.project.captions[0].translatedFrom).toBe('one');
    expect(next.project.captions[1].translation).toBe('dva');
  });

  it('flips translationLanguage once no untouched row holds an older-language translation', () => {
    const state = stateWith([caption('a', 0, 1000, 'one', 'eins'), caption('b', 1000, 2000, 'two', '')], {
      translationLanguage: 'de'
    });
    const next = run(state, {
      type: 'captions/applyTranslations',
      translations: [{ id: 'a', text: 'jedan' }]
    });

    expect(next.project.translationLanguage).toBe('sr-Latn');
  });

  it('caption/update with a translation patch marks the row as up to date with its original', () => {
    const state = stateWith([{ ...caption('a', 0, 1000, 'hello', 'zdravo'), translatedFrom: 'hi' }]);
    const next = run(state, { type: 'caption/update', id: 'a', patch: { translation: 'zdravo!' } });

    expect(next.project.captions[0]).toMatchObject({ translation: 'zdravo!', translatedFrom: 'hello' });
  });

  it('caption/update with an original patch leaves translation and translatedFrom alone', () => {
    const state = stateWith([{ ...caption('a', 0, 1000, 'hello', 'zdravo'), translatedFrom: 'hello' }]);
    const next = run(state, { type: 'caption/update', id: 'a', patch: { original: 'hi there' } });

    expect(next.project.captions[0]).toMatchObject({ original: 'hi there', translation: 'zdravo', translatedFrom: 'hello' });
  });

  it('caption/update with both original and translation uses the new original for translatedFrom', () => {
    const state = stateWith([{ ...caption('a', 0, 1000, 'hello', 'zdravo'), translatedFrom: 'hello' }]);
    const next = run(state, { type: 'caption/update', id: 'a', patch: { original: 'hi', translation: 'zdravo' } });

    expect(next.project.captions[0].translatedFrom).toBe('hi');
  });

  it('caption/nudge keeps translatedFrom', () => {
    const state = stateWith([upToDate('a', 0, 1000)]);
    const next = run(state, { type: 'caption/nudge', id: 'a', deltaMs: 200, edge: 'both' });

    expect(next.project.captions[0].translatedFrom).toBe('hello');
  });

  it('caption/split gives each half its own original when the row was up to date', () => {
    const state = stateWith([upToDate('a', 0, 2000, 'one two', 'jedan dva')]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 1000 });

    expect(next.project.captions.map((item) => item.translatedFrom)).toEqual(['one', 'two']);
  });

  it('caption/split leaves translatedFrom undefined when the row was stale', () => {
    const state = stateWith([{ ...caption('a', 0, 2000, 'one two', 'jedan dva'), translatedFrom: 'old' }]);
    const next = run(state, { type: 'caption/split', id: 'a', atMs: 1000 });

    expect(next.project.captions.map((item) => item.translatedFrom)).toEqual([undefined, undefined]);
    expect(next.project.captions.every((item) => !('translatedFrom' in item))).toBe(true);
  });

  it('caption/mergeWithNext is up to date only when both rows were', () => {
    const bothFresh = stateWith([upToDate('a', 0, 1000, 'one', 'jedan'), upToDate('b', 1000, 2000, 'two', 'dva')]);
    const merged = run(bothFresh, { type: 'caption/mergeWithNext', id: 'a' });
    expect(merged.project.captions[0]).toMatchObject({ original: 'one two', translatedFrom: 'one two' });

    const oneStale = stateWith([
      upToDate('a', 0, 1000, 'one', 'jedan'),
      { ...caption('b', 1000, 2000, 'two', 'dva'), translatedFrom: 'old' }
    ]);
    const mergedStale = run(oneStale, { type: 'caption/mergeWithNext', id: 'a' });
    expect(mergedStale.project.captions[0].translatedFrom).toBeUndefined();
  });

  it('captions/replaceAll stores transcription metadata and clears translationLanguage', () => {
    const state = stateWith([], { translationLanguage: 'sr-Latn' });
    const next = run(state, {
      type: 'captions/replaceAll',
      captions: [caption('a', 0, 1000, 'hi', '')],
      transcription: { providerId: 'openai', modelId: 'whisper-1', timingSource: 'word' }
    });

    expect(next.project.transcription).toEqual({ providerId: 'openai', modelId: 'whisper-1', timingSource: 'word' });
    expect('translationLanguage' in next.project).toBe(false);
  });

  it('captions/replaceAll keeps existing transcription metadata when none is given', () => {
    const transcription = { providerId: 'openai', timingSource: 'segment' as const };
    const state = stateWith([], { transcription });
    const next = run(state, { type: 'captions/replaceAll', captions: [caption('a', 0, 1000, 'hi', '')] });

    expect(next.project.transcription).toEqual(transcription);
  });

  it('languages/set changes the target without touching translationLanguage', () => {
    const state = stateWith([upToDate('a', 0, 1000)], { translationLanguage: 'sr-Latn' });
    const next = run(state, { type: 'languages/set', targetLanguage: 'de' });

    expect(next.project.translationLanguage).toBe('sr-Latn');
    expect(next.project.targetLanguage).toBe('de');
  });
});

describe('revision mirror', () => {
  it('keeps project.revision equal to state.revision through every kind of action', () => {
    const actions: ProjectAction[] = [
      { type: 'source/set', source },
      { type: 'trim/set', startMs: 0, endMs: 5000 },
      { type: 'caption/insert', atMs: 0 },
      { type: 'source/updateUrl', fileUrl: 'tajtlisha-media://x' },
      { type: 'languages/set', targetLanguage: 'de' },
      { type: 'project/setVideoContext', videoContext: 'Parking attendants in Jakarta' },
      { type: 'style/set', patch: { fontSizePercent: 6 } },
      { type: 'history/undo' },
      { type: 'history/redo' },
      { type: 'source/relink', source: { ...source, fileUrl: 'tajtlisha-media://y' } },
      { type: 'project/replace', project: { ...stateWith().project, revision: 40 } }
    ];
    let state = stateWith();
    for (const action of actions) {
      state = projectReducer(state, action);
      expect(state.project.revision).toBe(state.revision);
    }
    expect(state.revision).toBe(40);
  });

  it('createEmptyProject starts at revision 0', () => {
    expect(createEmptyProject({ targetLanguage: 'en' }).revision).toBe(0);
  });

  it('sets the translation language on the first manual translation', () => {
    let state = createProjectState(createEmptyProject({ targetLanguage: 'sr-Latn' }));
    state = projectReducer(state, {
      type: 'captions/replaceAll',
      captions: [{ id: 'a', startMs: 0, endMs: 1000, original: 'Hello', translation: '' }]
    });
    expect(state.project.translationLanguage).toBeUndefined();
    state = projectReducer(state, { type: 'caption/update', id: 'a', patch: { translation: 'Zdravo' }, now: 1 });
    expect(state.project.translationLanguage).toBe('sr-Latn');
    expect(state.project.captions[0].translatedFrom).toBe('Hello');
  });
});

describe('caption word timing', () => {
  // Source-absolute word times for a caption that starts at 0 and spans 2000 ms.
  const timedWords = [
    { text: 'one', startMs: 100, endMs: 500 },
    { text: 'two', startMs: 600, endMs: 900 },
    { text: 'three', startMs: 1000, endMs: 1500 }
  ];

  function timed(id: string, startMs: number, endMs: number, words = timedWords): CaptionRow {
    return { ...caption(id, startMs, endMs, 'one two three', ''), words };
  }

  it('caption/update moving both edges by the same delta shifts the words', () => {
    const state = run(stateWith([timed('a', 0, 2000)]), {
      type: 'caption/update',
      id: 'a',
      patch: { startMs: 200, endMs: 2200 }
    });

    expect(state.project.captions[0].words).toEqual([
      { text: 'one', startMs: 300, endMs: 700 },
      { text: 'two', startMs: 800, endMs: 1100 },
      { text: 'three', startMs: 1200, endMs: 1700 }
    ]);
  });

  it('caption/update changing only one edge keeps the words where they were', () => {
    const state = run(stateWith([timed('a', 0, 2000)]), {
      type: 'caption/update',
      id: 'a',
      patch: { endMs: 1800 }
    });

    expect(state.project.captions[0].words).toEqual(timedWords);
  });

  it('caption/update text edits keep the words', () => {
    const state = run(stateWith([timed('a', 0, 2000)]), {
      type: 'caption/update',
      id: 'a',
      patch: { original: 'one two three four' }
    });

    expect(state.project.captions[0].words).toEqual(timedWords);
  });

  it('caption/nudge moving the whole caption shifts the words by the applied shift', () => {
    const state = run(stateWith([timed('a', 0, 2000)]), { type: 'caption/nudge', id: 'a', deltaMs: 300, edge: 'both' });

    expect(state.project.captions[0].words?.map((word) => word.startMs)).toEqual([400, 900, 1300]);
  });

  it('caption/nudge clamped at zero shifts the words by the clamped amount only', () => {
    const state = run(stateWith([timed('a', 100, 2100)]), { type: 'caption/nudge', id: 'a', deltaMs: -500, edge: 'both' });

    expect(state.project.captions[0].startMs).toBe(0);
    expect(state.project.captions[0].words?.map((word) => word.startMs)).toEqual([0, 500, 900]);
  });

  it('caption/nudge on a single edge keeps the words', () => {
    const start = run(stateWith([timed('a', 0, 2000)]), { type: 'caption/nudge', id: 'a', deltaMs: 300, edge: 'start' });
    const end = run(stateWith([timed('a', 0, 2000)]), { type: 'caption/nudge', id: 'a', deltaMs: 300, edge: 'end' });

    expect(start.project.captions[0].words).toEqual(timedWords);
    expect(end.project.captions[0].words).toEqual(timedWords);
  });

  it('captions/shiftAll shifts the words of every caption by the applied shift', () => {
    const state = run(stateWith([timed('a', 300, 2300), caption('b', 3000, 4000)]), {
      type: 'captions/shiftAll',
      deltaMs: -1000
    });

    // The first caption starts at 300, so the shift stops at -300.
    expect(state.project.captions[0].startMs).toBe(0);
    expect(state.project.captions[0].words?.map((word) => word.startMs)).toEqual([0, 300, 700]);
    expect(state.project.captions[1]).not.toHaveProperty('words');
    expect(state.project.captions[1].startMs).toBe(2700);
  });

  it('caption/split gives each part the words that start in it', () => {
    const state = run(stateWith([timed('a', 0, 2000)]), { type: 'caption/split', id: 'a', atMs: 800 });
    const [first, second] = state.project.captions;

    expect(first.words).toEqual(timedWords.slice(0, 2));
    expect(second.words).toEqual([timedWords[2]]);
  });

  it('caption/split omits the words key on a part that has none', () => {
    const state = run(stateWith([timed('a', 0, 2000)]), { type: 'caption/split', id: 'a', atMs: 50 });
    const [first, second] = state.project.captions;

    expect(first).not.toHaveProperty('words');
    expect(second.words).toEqual(timedWords);
  });

  it('caption/split leaves captions without words without a words key', () => {
    const state = run(stateWith([caption('a', 0, 2000)]), { type: 'caption/split', id: 'a', atMs: 800 });

    expect(state.project.captions[0]).not.toHaveProperty('words');
    expect(state.project.captions[1]).not.toHaveProperty('words');
  });

  it('caption/mergeWithNext concatenates the word lists in order', () => {
    const later: CaptionRow = { ...caption('b', 2000, 3000, 'four', ''), words: [{ text: 'four', startMs: 2100, endMs: 2500 }] };
    const state = run(stateWith([timed('a', 0, 2000), later]), { type: 'caption/mergeWithNext', id: 'a' });

    expect(state.project.captions).toHaveLength(1);
    expect(state.project.captions[0].words).toEqual([...timedWords, { text: 'four', startMs: 2100, endMs: 2500 }]);
  });

  it('caption/mergeWithNext drops words deleted from a text, so the merged text cannot reuse them', () => {
    const first: CaptionRow = {
      ...caption('a', 0, 1000, 'one', ''),
      words: [
        { text: 'one', startMs: 0, endMs: 300 },
        { text: 'two', startMs: 300, endMs: 600 }
      ]
    };
    const second: CaptionRow = { ...caption('b', 1000, 2000, 'two', ''), words: [{ text: 'two', startMs: 1200, endMs: 1500 }] };
    const state = run(stateWith([first, second]), { type: 'caption/mergeWithNext', id: 'a' });

    expect(state.project.captions[0].words).toEqual([
      { text: 'one', startMs: 0, endMs: 300 },
      { text: 'two', startMs: 1200, endMs: 1500 }
    ]);
  });

  it('caption/mergeWithNext omits the words key when neither caption has words', () => {
    const state = run(stateWith([caption('a', 0, 1000), caption('b', 1000, 2000)]), {
      type: 'caption/mergeWithNext',
      id: 'a'
    });

    expect(state.project.captions[0]).not.toHaveProperty('words');
  });

  it('caption/insert creates a caption without words', () => {
    const state = run(stateWith([]), { type: 'caption/insert', atMs: 1000 });

    expect(state.project.captions[0]).not.toHaveProperty('words');
  });

  it('captions/replaceAll keeps the words it receives', () => {
    const state = run(stateWith([]), { type: 'captions/replaceAll', captions: [timed('a', 0, 2000)] });

    expect(state.project.captions[0].words).toEqual(timedWords);
  });
});

describe('video context', () => {
  it('sets the context, trimmed, and bumps the revision', () => {
    const state = stateWith();
    const next = run(state, { type: 'project/setVideoContext', videoContext: '  Parking in Jakarta \n' });

    expect(next.project.videoContext).toBe('Parking in Jakarta');
    expect(next.revision).toBe(state.revision + 1);
    expect(next.project.revision).toBe(next.revision);
  });

  it('removes the key for blank or whitespace-only text', () => {
    const state = stateWith([], { videoContext: 'Parking in Jakarta' });
    const next = run(state, { type: 'project/setVideoContext', videoContext: ' \n\t ' });

    expect(next.project).not.toHaveProperty('videoContext');
    expect(next.revision).toBe(state.revision + 1);
  });

  it('is a no-op when the value is unchanged, with no revision bump', () => {
    const state = stateWith([], { videoContext: 'Parking in Jakarta' });

    expect(projectReducer(state, { type: 'project/setVideoContext', videoContext: 'Parking in Jakarta ' })).toBe(state);
  });

  it('is a no-op when blank text is saved over no context', () => {
    const state = stateWith();

    expect(projectReducer(state, { type: 'project/setVideoContext', videoContext: '  ' })).toBe(state);
  });

  it('caps the stored text at the shared limit', () => {
    const next = run(stateWith(), {
      type: 'project/setVideoContext',
      videoContext: 'a'.repeat(MAX_VIDEO_CONTEXT_CHARS + 500)
    });

    expect(next.project.videoContext).toHaveLength(MAX_VIDEO_CONTEXT_CHARS);
  });

  it('is undoable and redoable like other document edits', () => {
    const state = stateWith();
    const first = run(state, { type: 'project/setVideoContext', videoContext: 'Parking' });
    const second = run(first, { type: 'project/setVideoContext', videoContext: 'Parking attendants' });

    const undone = run(second, { type: 'history/undo' });
    expect(undone.project.videoContext).toBe('Parking');
    expect(run(undone, { type: 'history/undo' }).project.videoContext).toBeUndefined();

    const redone = run(undone, { type: 'history/redo' });
    expect(redone.project.videoContext).toBe('Parking attendants');
  });

  it('leaves captions and languages alone', () => {
    const state = stateWith([caption('a', 0, 1000)], { sourceLanguage: 'id' });
    const next = run(state, { type: 'project/setVideoContext', videoContext: 'Parking' });

    expect(next.project.captions).toEqual(state.project.captions);
    expect(next.project.sourceLanguage).toBe('id');
  });

  it('is cleared by a new video, like the languages and captions', () => {
    const state = stateWith([caption('a', 0, 1000)], { videoContext: 'Parking', sourceLanguage: 'id' });
    const next = run(state, { type: 'source/set', source: { ...source, inputPath: '/clips/b.mp4' } });

    expect(next.project).not.toHaveProperty('videoContext');
    expect(next.project).not.toHaveProperty('sourceLanguage');
  });

  it('is kept when the video is relinked', () => {
    const state = stateWith([caption('a', 0, 1000)], { videoContext: 'Parking' });
    const next = run(state, { type: 'source/relink', source: { ...source, fileUrl: 'tajtlisha-media://moved' } });

    expect(next.project.videoContext).toBe('Parking');
  });

  it('is kept when a saved project is loaded', () => {
    const loaded = { ...stateWith().project, videoContext: 'Parking', revision: 4 };
    const next = run(stateWith(), { type: 'project/replace', project: loaded });

    expect(next.project.videoContext).toBe('Parking');
  });
});
