import { computeWatermarkLayout, type WatermarkTextPart } from '../../../../shared/watermark-geometry';
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
 * as the ASS export does, so overlapping shapes blend the same way. Text uses
 * the bundled Noto Sans Bold with kerning off, as libass lays it out.
 */
export function WatermarkOverlay({ watermark, frameWidth, frameHeight }: WatermarkOverlayProps) {
  if (frameWidth <= 0 || frameHeight <= 0) return null;

  const logo = computeWatermarkLayout(watermark, frameWidth, frameHeight);
  if (!logo) return null;

  const { background, backgroundColor, opacity } = logo;

  return (
    <svg className="watermark-overlay" viewBox={`0 0 ${frameWidth} ${frameHeight}`} aria-hidden="true" focusable="false">
      {background ? (
        <rect
          x={background.x}
          y={background.y}
          width={background.width}
          height={background.height}
          rx={background.radius}
          fill={backgroundColor}
          opacity={opacity}
        />
      ) : null}
      {logo.mark ? <LogoText part={logo.mark} opacity={opacity} /> : null}
      {logo.text ? <LogoText part={logo.text} opacity={opacity} /> : null}
    </svg>
  );
}

function LogoText({ part, opacity }: { part: WatermarkTextPart; opacity: number }) {
  return (
    <text
      x={part.x}
      y={part.baseline}
      fill={part.color}
      opacity={opacity}
      fontFamily="Noto Sans"
      fontWeight={700}
      fontSize={part.em}
      style={{ fontKerning: 'none', whiteSpace: 'pre' }}
    >
      {part.text}
    </text>
  );
}
