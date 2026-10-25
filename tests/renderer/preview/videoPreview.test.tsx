import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoPreview } from '../../../src/renderer/src/components/preview';
import type { ProjectSource } from '../../../src/shared/types/project';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import { renderWithI18n } from '../renderWithI18n';

afterEach(() => cleanup());

const source: ProjectSource = {
  inputPath: '/clips/clip.mp4',
  fileUrl: 'tajtlisha-media://clip.mp4',
  durationMs: 12000,
  width: 1080,
  height: 1920,
  hasAudio: true,
  fileSizeBytes: 1024,
  mtimeMs: 1
};

function renderPreview(overrides: Partial<Parameters<typeof VideoPreview>[0]> = {}) {
  const props = {
    source,
    trim: { startMs: 1000, endMs: 5000 },
    captionText: 'Hello there',
    style: DEFAULT_SUBTITLE_STYLE,
    onTimeUpdate: vi.fn(),
    onPlayingChange: vi.fn(),
    onPlaybackError: vi.fn(),
    ...overrides
  };

  return { props, ...renderWithI18n(<VideoPreview {...props} />) };
}

describe('VideoPreview', () => {
  it('renders the empty state when there is no source', () => {
    const { container } = renderWithI18n(
      <VideoPreview
        source={null}
        trim={{ startMs: 0, endMs: 1000 }}
        captionText={null}
        style={DEFAULT_SUBTITLE_STYLE}
        onTimeUpdate={vi.fn()}
        onPlayingChange={vi.fn()}
        onPlaybackError={vi.fn()}
        emptyState={<p>Nothing imported</p>}
      />
    );

    expect(screen.getByText('Nothing imported')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });

  it('falls back to a translated empty message when no empty state is given', () => {
    renderWithI18n(
      <VideoPreview
        source={null}
        trim={{ startMs: 0, endMs: 1000 }}
        captionText={null}
        style={DEFAULT_SUBTITLE_STYLE}
        onTimeUpdate={vi.fn()}
        onPlayingChange={vi.fn()}
        onPlaybackError={vi.fn()}
      />
    );

    expect(screen.getByText('Import a clip to preview subtitles here.')).toBeInTheDocument();
  });

  it('renders a video without native controls and shows the subtitle over it', () => {
    const { container } = renderPreview();

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.hasAttribute('controls')).toBe(false);
    expect(video?.getAttribute('src')).toBe(source.fileUrl);
    expect(container.querySelector('.subtitle-overlay')?.textContent).toBe('Hello there');
  });

  it('shows the exact frame image and hides the CSS subtitle overlay while it is set', () => {
    const { container } = renderPreview({
      exactFrame: { dataUrl: 'data:image/png;base64,AAAA', atMs: 2000 }
    });

    const image = container.querySelector<HTMLImageElement>('img.exact-frame-image');
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(container.querySelector('.subtitle-overlay')).toBeNull();
    expect(screen.getByText('Exact preview')).toBeInTheDocument();
  });

  it('requests and closes the exact frame through callbacks', () => {
    const onRequestExactFrame = vi.fn();
    const onCloseExactFrame = vi.fn();
    renderPreview({
      onRequestExactFrame,
      onCloseExactFrame,
      exactFrame: { dataUrl: 'data:image/png;base64,AAAA', atMs: 2000 }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Exact frame' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close exact preview' }));

    expect(onRequestExactFrame).toHaveBeenCalledTimes(1);
    expect(onCloseExactFrame).toHaveBeenCalledTimes(1);
  });

  it('shows the trim-relative time and the source position in the transport bar', () => {
    renderPreview();

    expect(screen.getByText('0:00.0 / 0:04.0')).toBeInTheDocument();
    expect(screen.getByText('Source 0:01.0')).toBeInTheDocument();
  });

  it('toggles playback when the video frame is clicked', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const paused = vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get');
    try {
      const { container } = renderPreview();
      const video = container.querySelector('video');
      if (!video) throw new Error('no video');

      paused.mockReturnValue(true);
      fireEvent.click(video);
      expect(play).toHaveBeenCalledTimes(1);
      expect(pause).not.toHaveBeenCalled();

      paused.mockReturnValue(false);
      fireEvent.click(video);
      expect(pause).toHaveBeenCalledTimes(1);
    } finally {
      play.mockRestore();
      pause.mockRestore();
      paused.mockRestore();
    }
  });
});
