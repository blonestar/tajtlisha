import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoPreview } from '../../../src/renderer/src/components/preview';
import { WatermarkOverlay } from '../../../src/renderer/src/components/preview/WatermarkOverlay';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import { DEFAULT_WATERMARK } from '../../../src/shared/watermark-geometry';
import type { ProjectSource } from '../../../src/shared/types/project';
import { renderWithI18n } from '../renderWithI18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WatermarkOverlay', () => {
  it('renders nothing when the logo is off', () => {
    const { container } = renderWithI18n(
      <WatermarkOverlay watermark={{ ...DEFAULT_WATERMARK, enabled: false }} frameWidth={360} frameHeight={640} />
    );

    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders nothing before the frame has a size', () => {
    const { container } = renderWithI18n(<WatermarkOverlay watermark={DEFAULT_WATERMARK} frameWidth={0} frameHeight={0} />);

    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws the background, the T and the wordmark for icon_text, in frame pixels', () => {
    const { container } = renderWithI18n(<WatermarkOverlay watermark={DEFAULT_WATERMARK} frameWidth={360} frameHeight={640} />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 360 640');
    expect(svg).toHaveAttribute('aria-hidden', 'true');

    const [background, crossbar, stem] = Array.from(container.querySelectorAll('rect'));
    // Frame 360x640: shorter side 360, S = 25.2 px, M = 10.8 px.
    expect(background).toHaveAttribute('fill', '#1D2025');
    expect(background.getAttribute('x')).toBe('10.8');
    expect(Number(background.getAttribute('height'))).toBeCloseTo(25.2);
    expect(Number(background.getAttribute('rx'))).toBeCloseTo(0.1875 * 25.2);
    expect(background).toHaveAttribute('opacity', '0.9');
    expect(crossbar).toHaveAttribute('fill', '#F2A93B');
    expect(stem).toHaveAttribute('fill', '#F2A93B');

    const wordmark = container.querySelector('path');
    expect(wordmark).toHaveAttribute('fill', '#F2F2F2');
    expect(wordmark?.getAttribute('transform')).toMatch(/^translate\(/);
    expect(wordmark?.getAttribute('d')).toMatch(/^M/);
  });

  it('draws only the badge for the icon variant', () => {
    const { container } = renderWithI18n(
      <WatermarkOverlay watermark={{ ...DEFAULT_WATERMARK, variant: 'icon' }} frameWidth={360} frameHeight={640} />
    );

    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(container.querySelector('path')).toBeNull();
  });
});

describe('VideoPreview logo layer', () => {
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

  /** Reports a 360x640 stage so the frame has a size, as in the running app. */
  function stageWithSize(): void {
    class SizedObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element): void {
        this.callback([{ target, contentRect: { width: 360, height: 640 } } as unknown as ResizeObserverEntry], this as never);
      }
      disconnect(): void {}
      unobserve(): void {}
    }
    vi.stubGlobal('ResizeObserver', SizedObserver);
  }

  function renderPreview(overrides: Partial<Parameters<typeof VideoPreview>[0]> = {}) {
    return renderWithI18n(
      <VideoPreview
        source={source}
        trim={{ startMs: 0, endMs: 5000 }}
        captionText="Hello"
        style={DEFAULT_SUBTITLE_STYLE}
        watermark={DEFAULT_WATERMARK}
        onTimeUpdate={vi.fn()}
        onPlayingChange={vi.fn()}
        onPlaybackError={vi.fn()}
        {...overrides}
      />
    );
  }

  it('draws the logo over the frame with the subtitles', () => {
    stageWithSize();
    const { container } = renderPreview();

    expect(container.querySelector('.subtitle-overlay')).not.toBeNull();
    expect(container.querySelector('.watermark-overlay')).not.toBeNull();
  });

  it('draws no logo when none is passed, or when the logo is off', () => {
    stageWithSize();
    const { container: none } = renderPreview({ watermark: undefined });
    expect(none.querySelector('.watermark-overlay')).toBeNull();
    cleanup();

    const { container: off } = renderPreview({ watermark: { ...DEFAULT_WATERMARK, enabled: false } });
    expect(off.querySelector('.watermark-overlay')).toBeNull();
  });

  it('does not draw the logo over an exact frame, which already contains it', () => {
    stageWithSize();
    const { container } = renderPreview({ exactFrame: { dataUrl: 'data:image/png;base64,AAAA', atMs: 0 } });

    expect(container.querySelector('.exact-frame-image')).not.toBeNull();
    expect(container.querySelector('.watermark-overlay')).toBeNull();
  });
});
