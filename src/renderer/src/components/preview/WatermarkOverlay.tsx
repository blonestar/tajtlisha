import { computeWatermarkLayout } from '../../../../shared/watermark-geometry';
import { WORDMARK } from '../../../../shared/watermark-wordmark.generated';
import type { WatermarkSettings } from '../../../../shared/types/watermark';
import './preview.css';

export type WatermarkOverlayProps = {
  watermark: WatermarkSettings;
  /** Displayed frame size in CSS pixels (not the source resolution). */
  frameWidth: number;
  frameHeight: number;
};

/**
 * Logo laid over the displayed video frame, with the same layout the export
 * burns in. Renders nothing when the logo is off. Opacity is applied per shape,
 * as the ASS export does, so overlapping shapes blend the same way.
 */
export function WatermarkOverlay({ watermark, frameWidth, frameHeight }: WatermarkOverlayProps) {
  if (frameWidth <= 0 || frameHeight <= 0) return null;

  const logo = computeWatermarkLayout(watermark, frameWidth, frameHeight);
  if (!logo) return null;

  const { origin, width, height, radius, tRects, wordmark, colors, opacity } = logo;

  return (
    <svg className="watermark-overlay" viewBox={`0 0 ${frameWidth} ${frameHeight}`} aria-hidden="true" focusable="false">
      <rect x={origin.x} y={origin.y} width={width} height={height} rx={radius} fill={colors.background} opacity={opacity} />
      {tRects.map((rect, index) => (
        <rect
          key={index}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={colors.tMark}
          opacity={opacity}
        />
      ))}
      {wordmark ? (
        <path
          d={WORDMARK.path}
          transform={`translate(${wordmark.offsetX} ${wordmark.baselineY}) scale(${wordmark.scale})`}
          fill={colors.wordmark}
          opacity={opacity}
        />
      ) : null}
    </svg>
  );
}
