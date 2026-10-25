import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useTranslation } from 'react-i18next';
import Frame from 'lucide-react/dist/esm/icons/frame.js';
import Pause from 'lucide-react/dist/esm/icons/pause.js';
import Play from 'lucide-react/dist/esm/icons/play.js';
import StepBack from 'lucide-react/dist/esm/icons/step-back.js';
import StepForward from 'lucide-react/dist/esm/icons/step-forward.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import type { ProjectSource, TrimRange } from '../../../../shared/types/project';
import type { SubtitleStyle } from '../../../../shared/types/style';
import { formatTimecode } from '../../utils/time';
import { SubtitleOverlay } from './SubtitleOverlay';
import { clampToTrim, fitFrame, nextTimeOnPlay, reachedTrimEnd, stepTime } from './playback';
import './preview.css';

export type VideoPreviewHandle = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Seeks to a source-absolute time. Clamped to the trim range. */
  seek: (ms: number) => void;
};

export type ExactFrame = {
  dataUrl: string;
  /** Source-absolute time the still was rendered at. */
  atMs: number;
};

export type VideoPreviewProps = {
  source: ProjectSource | null;
  trim: TrimRange;
  captionText: string | null;
  style: SubtitleStyle;
  /** Word lit at the playhead when word highlight is on. -1 or missing means none. */
  activeWordIndex?: number;
  /** Source-absolute time. Fires every animation frame while playing, and on seek and pause. */
  onTimeUpdate: (ms: number) => void;
  onPlayingChange: (playing: boolean) => void;
  /** Media error code from the video element, or 'unknown' when the element reports none. */
  onPlaybackError: (code: number | string) => void;
  exactFrame?: ExactFrame | null;
  onRequestExactFrame?: () => void;
  onCloseExactFrame?: () => void;
  exactFrameBusy?: boolean;
  /** Shown instead of the player while there is no source. */
  emptyState?: ReactNode;
};

type StageSize = { width: number; height: number };

/**
 * Video player with a subtitle layer over the displayed frame. Has no native
 * controls: transport lives in the bar below the frame, and a click on the
 * frame toggles playback. Playback stays inside the trim range.
 */
export const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>(function VideoPreview(props, ref) {
  const { t } = useTranslation();
  const {
    source,
    trim,
    captionText,
    style,
    activeWordIndex,
    exactFrame = null,
    onRequestExactFrame,
    onCloseExactFrame,
    exactFrameBusy = false,
    emptyState
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(trim.startMs);

  // Callbacks read the latest props so the rAF loop and the imperative handle stay stable.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const report = useCallback((ms: number) => {
    setCurrentMs(ms);
    latest.current.onTimeUpdate(ms);
  }, []);

  const setPlayingState = useCallback((value: boolean) => {
    setPlaying(value);
    latest.current.onPlayingChange(value);
  }, []);

  const seekTo = useCallback(
    (ms: number) => {
      const target = clampToTrim(ms, latest.current.trim);
      const video = videoRef.current;
      if (video) video.currentTime = target / 1000;
      report(target);
    },
    [report]
  );

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    seekTo(nextTimeOnPlay(video.currentTime * 1000, latest.current.trim));
    // Autoplay rejections are not actionable here; real media failures arrive through onError.
    void Promise.resolve(video.play()).catch(() => undefined);
  }, [seekTo]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      play();
    } else {
      pause();
    }
  }, [play, pause]);

  const stepFrames = (frames: number) => {
    const video = videoRef.current;
    const from = video ? video.currentTime * 1000 : currentMs;
    pause();
    seekTo(stepTime(from, frames, trim));
  };

  useImperativeHandle(ref, () => ({ play, pause, toggle, seek: seekTo }), [play, pause, toggle, seekTo]);

  // Time reporting while playing, and the trim end/start guard.
  useEffect(() => {
    if (!playing) return undefined;

    let frameId = 0;
    const tick = () => {
      const video = videoRef.current;
      if (!video) return;

      const range = latest.current.trim;
      let ms = video.currentTime * 1000;

      if (reachedTrimEnd(ms, range)) {
        video.currentTime = range.endMs / 1000;
        video.pause();
        report(range.endMs);
        return;
      }

      if (ms < range.startMs) {
        ms = range.startMs;
        video.currentTime = ms / 1000;
      }

      report(ms);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, report]);

  // Keep the paused playhead inside the trim when the trim changes.
  useEffect(() => {
    if (!source) return;

    const clamped = clampToTrim(currentMs, trim);
    if (clamped !== currentMs) seekTo(clamped);
  }, [source, trim.startMs, trim.endMs, currentMs, seekTo]);

  // A new file starts paused; the playhead moves to the trim start once metadata loads.
  const sourceUrl = source?.fileUrl;
  useEffect(() => {
    setPlaying(false);
  }, [sourceUrl]);

  // An exact frame is a still image, so the video must not keep playing under it.
  useEffect(() => {
    if (exactFrame) pause();
  }, [exactFrame, pause]);

  const hasSource = source !== null;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;

      setStageSize((previous) =>
        previous.width === box.width && previous.height === box.height
          ? previous
          : { width: box.width, height: box.height }
      );
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [hasSource]);

  if (!source) {
    return (
      <div className="video-preview video-preview-empty">
        {emptyState ?? <p className="muted">{t('preview.noSource')}</p>}
      </div>
    );
  }

  const aspectRatio = source.height > 0 ? source.width / source.height : 16 / 9;
  const frame = fitFrame(stageSize.width, stageSize.height, aspectRatio);
  const trimLengthMs = Math.max(0, trim.endMs - trim.startMs);
  const relativeMs = Math.min(trimLengthMs, Math.max(0, currentMs - trim.startMs));

  return (
    <div className="video-preview">
      <div className="video-preview-stage" ref={stageRef}>
        <div className="video-preview-frame" style={{ width: frame.width, height: frame.height }}>
          <video
            ref={videoRef}
            className="video-preview-video"
            src={source.fileUrl}
            preload="auto"
            playsInline
            onClick={toggle}
            onPlay={() => setPlayingState(true)}
            onPause={() => {
              setPlayingState(false);
              report((videoRef.current?.currentTime ?? 0) * 1000);
            }}
            onEnded={() => setPlayingState(false)}
            onLoadedMetadata={() => seekTo(latest.current.trim.startMs)}
            onError={() => latest.current.onPlaybackError(videoRef.current?.error?.code ?? 'unknown')}
          />
          {exactFrame ? (
            <>
              <img className="exact-frame-image" src={exactFrame.dataUrl} alt={t('preview.exactFrameAlt')} />
              <div className="exact-frame-bar">
                <span className="badge badge-accent">{t('preview.exactPreviewBadge')}</span>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  aria-label={t('preview.closeExactFrame')}
                  title={t('preview.closeExactFrame')}
                  disabled={!onCloseExactFrame}
                  onClick={() => onCloseExactFrame?.()}
                >
                  <X size={14} />
                </button>
              </div>
            </>
          ) : (
            <SubtitleOverlay
              text={captionText ?? ''}
              style={style}
              frameWidth={frame.width}
              frameHeight={frame.height}
              activeWordIndex={activeWordIndex}
            />
          )}
        </div>
      </div>

      <div className="video-preview-transport">
        <button
          type="button"
          className="btn btn-icon"
          aria-label={playing ? t('preview.pause') : t('preview.play')}
          title={playing ? t('preview.pause') : t('preview.play')}
          onClick={toggle}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label={t('preview.stepBack')}
          title={t('preview.stepBack')}
          onClick={() => stepFrames(-1)}
        >
          <StepBack size={16} />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label={t('preview.stepForward')}
          title={t('preview.stepForward')}
          onClick={() => stepFrames(1)}
        >
          <StepForward size={16} />
        </button>
        <div className="video-preview-time">
          <span className="mono">
            {formatTimecode(relativeMs)} / {formatTimecode(trimLengthMs)}
          </span>
          <span className="video-preview-source muted">
            {t('preview.sourceTime', { time: formatTimecode(currentMs) })}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          title={t('preview.exactFrameTooltip')}
          disabled={!onRequestExactFrame || exactFrameBusy}
          onClick={() => onRequestExactFrame?.()}
        >
          <Frame size={14} />
          {exactFrameBusy ? t('preview.exactFrameBusy') : t('preview.exactFrame')}
        </button>
      </div>
    </div>
  );
});
