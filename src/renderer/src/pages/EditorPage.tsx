import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import type { TajtlishaApi } from '../../../shared/types/ipc';
import { type CaptionRow, type PreviewTrack } from '../../../shared/types/project';
import type { SubtitlePresetId, SubtitleStyle } from '../../../shared/types/style';
import type { AppSettings } from '../../../shared/types/settings';
import { activeWordIndex as litWordIndex, resolveWordHighlight, timeCaptionWords } from '../../../shared/word-highlight';
import { CaptionShiftBar } from '../components/captions/CaptionShiftBar';
import { CaptionTable, type CaptionEdge, type CaptionPatch } from '../components/captions/CaptionTable';
import { GeneratePanel } from '../components/workflow/GeneratePanel';
import { FRAME_MS } from '../components/preview/playback';
import { StyleDrawer } from '../components/preview/StyleDrawer';
import { TrimBar, type TrimBarCaption } from '../components/preview/TrimBar';
import { VideoPreview, type ExactFrame, type VideoPreviewHandle } from '../components/preview/VideoPreview';
import { SplitHandle } from '../components/shell/SplitHandle';
import { SPLITTER_PX } from '../hooks/editorLayout';
import { useEditorLayout } from '../hooks/useEditorLayout';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePlayhead } from '../hooks/usePlayhead';
import type { Workspace } from '../hooks/useWorkspace';
import {
  captionIssuesFor,
  captionLineLimit,
  staleCaptionIds,
  summaryTranscript,
  UNKNOWN_LANGUAGE
} from '../hooks/workspaceModel';
import { findActiveCaption, isBlockingCaptionIssue, rowsNeedingTranslation } from '../state/selectors';
import { clampShiftAll, MIN_INSERT_ROOM_MS } from '../state/project-reducer';
import type { ProjectStore } from '../state/useProjectStore';

export type EditorPageProps = {
  store: ProjectStore;
  settings: AppSettings;
  workspace: Workspace;
  /** True while any job runs. Disables the AI actions. */
  busy: boolean;
  /** Whether the chosen export outputs read the translation (SRT or burned-in). */
  exportNeedsTranslation: boolean;
  onOpenSettings: () => void;
};

const noop = (): void => undefined;

/**
 * The clip workspace: AI steps and caption table on the left, preview, trim
 * and style on the right. Owns playback and the playhead, which the caption
 * actions read.
 */
export function EditorPage({
  store,
  settings,
  workspace,
  busy,
  exportNeedsTranslation,
  onOpenSettings
}: EditorPageProps): ReactElement {
  const { t } = useTranslation();
  const { state, dispatch, sourceStatus } = store;
  const project = state.project;
  const source = project.source;

  const videoRef = useRef<VideoPreviewHandle>(null);
  const playhead = usePlayhead(project.trim.startMs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exact, setExact] = useState<ExactFrame | null>(null);
  const [exactBusy, setExactBusy] = useState(false);
  const exactRequestRef = useRef(0);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const layout = useEditorLayout();

  const inputPath = source?.inputPath ?? null;
  // A missing file has no playable URL. The banner above the page asks for it.
  const visibleSource = sourceStatus === 'missing' ? null : source;
  const captionLimit = captionLineLimit(project, settings);
  const requireTranslation = project.previewTrack === 'translation' || exportNeedsTranslation;

  const issues = useMemo(
    () => captionIssuesFor(project, settings, requireTranslation),
    [project, settings, requireTranslation]
  );
  const staleIds = useMemo(() => staleCaptionIds(issues), [issues]);
  const activeCaption = findActiveCaption(project.captions, playhead.timeMs) ?? null;
  const captionText = activeCaption
    ? project.previewTrack === 'translation'
      ? activeCaption.translation
      : activeCaption.original
    : null;
  const wordHighlightMode = resolveWordHighlight(project.style).mode;
  // Word spans depend on the caption and style, not on the playhead, so they are memoized per caption.
  const wordSpans = useMemo(() => {
    if (wordHighlightMode === 'off' || !activeCaption || captionText === null) return [];
    // Only the original text has word timing; the translation is spread by characters.
    const words = project.previewTrack === 'original' ? activeCaption.words : undefined;
    return timeCaptionWords(captionText, activeCaption.startMs, activeCaption.endMs, words).spans;
  }, [wordHighlightMode, activeCaption, captionText, project.previewTrack]);
  const activeWordIndex = litWordIndex(wordSpans, playhead.timeMs);

  // An exact frame belongs to one file and one logo setup (the logo is burned
  // into it). Drop it, and any render in flight, when either changes.
  const watermarkKey = JSON.stringify(settings.watermark);
  useEffect(() => {
    exactRequestRef.current += 1;
    setExact(null);
    setExactBusy(false);
  }, [inputPath, watermarkKey]);

  const { transcriptionProvider, textProvider, summaryProvider } = workspace;
  const pendingTranslations = rowsNeedingTranslation(project).filter(
    (id) => project.captions.find((caption) => caption.id === id)?.original.trim() !== ''
  ).length;

  // Playback and frame keys. Space pauses or plays; arrows step frames; J/K/L are the common editor keys.
  const seekBy = useCallback(
    (deltaMs: number) => {
      const handle = videoRef.current;
      if (!handle) return;
      handle.pause();
      handle.seek(playhead.timeRef.current + deltaMs);
    },
    [playhead.timeRef]
  );

  useKeyboardShortcuts([
    { key: ' ', handler: () => videoRef.current?.toggle() },
    { key: 'k', handler: () => videoRef.current?.pause() },
    { key: 'ArrowLeft', handler: () => seekBy(-FRAME_MS) },
    { key: 'ArrowRight', handler: () => seekBy(FRAME_MS) },
    { key: 'ArrowLeft', shift: true, handler: () => seekBy(-1000) },
    { key: 'ArrowRight', shift: true, handler: () => seekBy(1000) },
    { key: 'j', handler: () => seekBy(-1000) },
    { key: 'l', handler: () => seekBy(1000) }
  ]);

  function seekTo(ms: number): void {
    videoRef.current?.seek(ms);
  }

  function updateCaption(id: string, patch: CaptionPatch): void {
    dispatch({ type: 'caption/update', id, patch });
  }

  function insertAfter(id: string): void {
    const index = project.captions.findIndex((caption) => caption.id === id);
    const caption = project.captions[index];
    if (!caption) return;
    const next = project.captions[index + 1];
    const room = (next ? next.startMs : project.trim.endMs) - caption.endMs;
    if (room < MIN_INSERT_ROOM_MS) {
      setLocalNotice(t('shell.captions.noRoom'));
      return;
    }
    dispatch({ type: 'caption/insert', atMs: caption.endMs });
  }

  function splitCaption(id: string): void {
    const caption: CaptionRow | undefined = project.captions.find((item) => item.id === id);
    if (!caption) return;
    // Split at the playhead when it is inside the caption, otherwise at the middle.
    const playheadMs = playhead.timeRef.current;
    const inside = playheadMs > caption.startMs && playheadMs < caption.endMs;
    const atMs = inside ? playheadMs : Math.round((caption.startMs + caption.endMs) / 2);
    dispatch({ type: 'caption/split', id, atMs });
  }

  function shiftAllCaptions(deltaMs: number): void {
    const applied = clampShiftAll(project.captions, deltaMs);
    if (applied === 0) {
      setLocalNotice(t('shell.captions.shiftAtStart'));
      return;
    }
    dispatch({ type: 'captions/shiftAll', deltaMs });
    if (applied !== deltaMs) {
      setLocalNotice(t('shell.captions.shiftLimited', { seconds: String(-applied / 1000) }));
    }
  }

  function deleteCaption(id: string): void {
    dispatch({ type: 'caption/delete', id });
    setSelectedId((current) => (current === id ? null : current));
  }

  async function requestExactFrame(): Promise<void> {
    const api = typeof window === 'undefined' ? undefined : (window.tajtlisha as TajtlishaApi | undefined);
    if (!api || !source) return;

    const requestId = exactRequestRef.current + 1;
    exactRequestRef.current = requestId;
    setExactBusy(true);
    try {
      const atMs = playhead.timeRef.current;
      const { dataUrl } = await api.project.renderPreviewFrame({
        inputPath: source.inputPath,
        atMs,
        videoWidth: source.width,
        videoHeight: source.height,
        text: captionText ?? '',
        style: project.style,
        activeWordIndex: litWordIndex(wordSpans, atMs),
        watermark: settings.watermark
      });
      if (requestId === exactRequestRef.current) setExact({ dataUrl, atMs });
    } catch {
      if (requestId === exactRequestRef.current) setLocalNotice(t('shell.captions.exactFrameFailed'));
    } finally {
      if (requestId === exactRequestRef.current) setExactBusy(false);
    }
  }

  function closeExactFrame(): void {
    exactRequestRef.current += 1;
    setExact(null);
    setExactBusy(false);
  }

  const trimCaptions: TrimBarCaption[] = project.captions.map((caption) => ({
    id: caption.id,
    startMs: caption.startMs,
    endMs: caption.endMs,
    hasIssue: (issues[caption.id] ?? []).some((issue) => isBlockingCaptionIssue(issue.code))
  }));

  // A detected language outside PROJECT_LANGUAGES is kept; the panel shows it as an extra option.
  const languageValue = (code: string | undefined): string => (!code || code === UNKNOWN_LANGUAGE ? 'auto' : code);

  // Until the workspace is measured, the CSS fallback template applies.
  const workspaceColumns = layout.measured
    ? `${layout.captions.value}px ${SPLITTER_PX}px minmax(0, 1fr)`
    : undefined;

  return (
    <div className="editor-workspace" ref={layout.workspaceRef} style={{ gridTemplateColumns: workspaceColumns }}>
      <section className="editor-column editor-column-main" aria-label={t('shell.areas.captions')}>
        <div className="editor-generate" data-step-target="generate" tabIndex={-1}>
          <GeneratePanel
            hasSource={source !== null}
            hasAudio={source?.hasAudio ?? false}
            transcriptionProvider={transcriptionProvider}
            textProvider={textProvider}
            summaryProvider={summaryProvider}
            sourceLanguage={languageValue(project.sourceLanguage)}
            targetLanguage={project.targetLanguage}
            captionCount={project.captions.length}
            rowsNeedingTranslation={pendingTranslations}
            timingSource={project.transcription?.timingSource}
            busy={busy}
            onSourceLanguageChange={(code) =>
              dispatch({ type: 'languages/set', sourceLanguage: code === 'auto' ? UNKNOWN_LANGUAGE : code })
            }
            onTargetLanguageChange={(code) => dispatch({ type: 'languages/set', targetLanguage: code })}
            onTranscribe={workspace.requestTranscribe}
            onTranslate={workspace.requestTranslate}
            summaryEnabled={settings.summary.enabled}
            summarizableRows={summaryTranscript(project).length}
            hasSummary={workspace.summary !== null}
            videoContext={project.videoContext ?? ''}
            onVideoContextChange={(videoContext) => dispatch({ type: 'project/setVideoContext', videoContext })}
            onSummarize={workspace.summarize}
            onShowSummary={workspace.openSummary}
            onOpenSettings={onOpenSettings}
          />
        </div>

        {localNotice && (
          <div className="message message-warning editor-notice" role="status">
            <CircleAlert aria-hidden="true" size={14} />
            <span>{localNotice}</span>
            <button
              type="button"
              className="btn btn-icon btn-sm btn-ghost"
              aria-label={t('shell.dismiss')}
              title={t('shell.dismiss')}
              onClick={() => setLocalNotice(null)}
            >
              <X aria-hidden="true" size={12} />
            </button>
          </div>
        )}

        <div className="editor-captions" data-step-target="captions" tabIndex={-1}>
          {project.captions.length > 0 && <CaptionShiftBar onShift={shiftAllCaptions} />}
          <CaptionTable
            captions={project.captions}
            issues={issues}
            staleIds={staleIds}
            activeCaptionId={activeCaption?.id ?? null}
            selectedCaptionId={selectedId}
            maxCharsPerLine={captionLimit}
            trimStartMs={project.trim.startMs}
            showTranslation
            originalLabel={t('shell.track.original')}
            translationLabel={t('shell.track.translation')}
            onSelect={setSelectedId}
            onSeek={seekTo}
            onUpdate={updateCaption}
            onInsertAfter={insertAfter}
            onSplit={splitCaption}
            onMerge={(id) => dispatch({ type: 'caption/mergeWithNext', id })}
            onDelete={deleteCaption}
            onNudge={(id: string, deltaMs: number, edge: CaptionEdge) =>
              dispatch({ type: 'caption/nudge', id, deltaMs, edge })
            }
          />
        </div>
      </section>

      <SplitHandle
        orientation="vertical"
        label={t('shell.layout.resizeColumns')}
        value={layout.captions.value}
        min={layout.captions.min}
        max={layout.captions.max}
        onValueChange={layout.captions.set}
        onValueCommit={layout.captions.commit}
        onReset={layout.captions.reset}
      />

      <section
        className={styleOpen ? 'editor-column editor-column-side has-style-drawer' : 'editor-column editor-column-side'}
        ref={layout.sideRef}
        aria-label={t('shell.areas.preview')}
      >
        <div className="editor-preview-head">
          <div className="segmented" role="group" aria-label={t('shell.track.label')}>
            {(['original', 'translation'] as const satisfies readonly PreviewTrack[]).map((track) => (
              <button
                key={track}
                type="button"
                aria-pressed={project.previewTrack === track}
                onClick={() => dispatch({ type: 'previewTrack/set', track })}
              >
                {track === 'original' ? t('shell.track.original') : t('shell.track.translation')}
              </button>
            ))}
          </div>
        </div>

        <div className="editor-preview" data-step-target="preview" tabIndex={-1}>
          <VideoPreview
            ref={videoRef}
            source={visibleSource}
            trim={project.trim}
            captionText={captionText}
            style={project.style}
            activeWordIndex={activeWordIndex}
            watermark={settings.watermark}
            onTimeUpdate={playhead.report}
            onPlayingChange={noop}
            onPlaybackError={workspace.reportPlaybackError}
            exactFrame={exact}
            onRequestExactFrame={() => void requestExactFrame()}
            onCloseExactFrame={closeExactFrame}
            exactFrameBusy={exactBusy}
            emptyState={visibleSource ? undefined : <p className="muted">{t('shell.source.missingPreview')}</p>}
          />
        </div>

        <div className="editor-trim" data-step-target="trim" tabIndex={-1}>
          {source && (
            <TrimBar
              durationMs={source.durationMs}
              trim={project.trim}
              currentTimeMs={playhead.timeMs}
              captions={trimCaptions}
              selectedCaptionId={selectedId}
              onTrimChange={(range) => dispatch({ type: 'trim/set', startMs: range.startMs, endMs: range.endMs })}
              onSeek={seekTo}
              onSelectCaption={setSelectedId}
            />
          )}
        </div>

        {styleOpen && (
          <SplitHandle
            orientation="horizontal"
            reverse
            label={t('shell.layout.resizeStyle')}
            value={layout.styleDrawer.value}
            min={layout.styleDrawer.min}
            max={layout.styleDrawer.max}
            onValueChange={layout.styleDrawer.set}
            onValueCommit={layout.styleDrawer.commit}
            onReset={layout.styleDrawer.reset}
          />
        )}

        <StyleDrawer
          open={styleOpen}
          onOpenChange={setStyleOpen}
          height={styleOpen ? layout.styleDrawer.value : undefined}
          style={project.style}
          onChange={(patch: Partial<SubtitleStyle>) => dispatch({ type: 'style/set', patch })}
          onApplyPreset={(presetId: SubtitlePresetId) => dispatch({ type: 'style/applyPreset', presetId })}
        />
      </section>
    </div>
  );
}
