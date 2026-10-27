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

  it('draws the background rectangle and the badge and text as text, in frame pixels', () => {
    const { container } = renderWithI18n(<WatermarkOverlay watermark={DEFAULT_WATERMARK} frameWidth={360} frameHeight={640} />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 360 640');
    expect(svg).toHaveAttribute('aria-hidden', 'true');

    // Frame 360x640: shorter side 360, S = 25.2 px, M = 10.8 px.
    const background = container.querySelector('rect');
    expect(background).toHaveAttribute('fill', '#1D2025');
    expect(Number(background?.getAttribute('x'))).toBeCloseTo(10.8);
    expect(Number(background?.getAttribute('height'))).toBeCloseTo(25.2);
    expect(Number(background?.getAttribute('rx'))).toBeCloseTo(0.19 * 25.2);
    expect(background).toHaveAttribute('opacity', '0.9');

    const [mark, text] = Array.from(container.querySelectorAll('text'));
    expect(mark).toHaveTextContent('T');
    expect(mark).toHaveAttribute('fill', '#F2A93B');
    expect(mark).toHaveAttribute('font-size', String(0.7 * 25.2));
    expect(text).toHaveTextContent('tajtliša');
    expect(text).toHaveAttribute('fill', '#F2F2F2');
    expect(text).toHaveAttribute('font-size', String(0.62 * 25.2));
    expect(text).toHaveAttribute('font-family', 'Noto Sans');
    expect(text).toHaveAttribute('font-weight', '700');
  });

  it('turns kerning off and keeps spaces in the text, as the export does', () => {
    const { container } = renderWithI18n(
      <WatermarkOverlay watermark={{ ...DEFAULT_WATERMARK, text: 'Moj  kanal' }} frameWidth={360} frameHeight={640} />
    );

    const text = container.querySelectorAll('text')[1];
    expect(text).toHaveAttribute('style', expect.stringContaining('font-kerning: none'));
    expect(text).toHaveAttribute('style', expect.stringContaining('white-space: pre'));
    expect(text?.textContent).toBe('Moj  kanal');
  });

  it('draws only the text for the text content, with no background for the none option', () => {
    const { container } = renderWithI18n(
      <WatermarkOverlay watermark={{ ...DEFAULT_WATERMARK, content: 'text', background: 'none' }} frameWidth={360} frameHeight={640} />
    );

    expect(container.querySelector('rect')).toBeNull();
    expect(container.querySelectorAll('text')).toHaveLength(1);
    expect(container.querySelector('text')).toHaveTextContent('tajtliša');
  });

  it('draws only the badge for the mark content, on a background behind the badge only', () => {
    const { container } = renderWithI18n(
      <WatermarkOverlay watermark={{ ...DEFAULT_WATERMARK, content: 'mark', background: 'mark' }} frameWidth={360} frameHeight={640} />
    );

    expect(container.querySelectorAll('text')).toHaveLength(1);
    expect(container.querySelector('text')).toHaveTextContent('T');
    // The badge cell is one logo height wide.
    expect(Number(container.querySelector('rect')?.getAttribute('width'))).toBeCloseTo(25.2);
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
