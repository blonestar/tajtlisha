import type { ReactNode } from 'react';
import { computeSubtitleGeometry } from '../../../../shared/subtitle-geometry';
import type { SubtitleStyle } from '../../../../shared/types/style';
import { isWordHighlighted, resolveWordHighlight, splitCaptionText } from '../../../../shared/word-highlight';
import { buildSubtitleBlockStyle, buildSubtitleBoxStyle } from './subtitleStyles';
import './preview.css';

export type SubtitleOverlayProps = {
  text: string;
  style: SubtitleStyle;
  /** Displayed frame size in CSS pixels (not the source resolution). */
  frameWidth: number;
  frameHeight: number;
  /** Word lit at the current time, from activeWordIndex(). -1 or missing means none. */
  activeWordIndex?: number;
};

/**
 * Subtitle text laid over the displayed video frame. Render it inside a
 * positioned element that has exactly the frame's size; the layer clips
 * anything that would run past the frame edges.
 */
export function SubtitleOverlay({ text, style, frameWidth, frameHeight, activeWordIndex = -1 }: SubtitleOverlayProps) {
  if (!text.trim()) return null;

  const geometry = computeSubtitleGeometry(style, frameWidth, frameHeight);

  return (
    <div className="subtitle-overlay">
      <div className="subtitle-block" style={buildSubtitleBlockStyle(style, geometry)}>
        <span className="subtitle-text" style={buildSubtitleBoxStyle(style, geometry)}>
          {renderCaptionText(text, style, activeWordIndex)}
        </span>
      </div>
    </div>
  );
}

/**
 * Plain text when word highlight is off. Otherwise each word is its own span,
 * and the highlighted ones take the highlight color. Separators stay plain
 * text, so line breaks and spacing are unchanged.
 */
function renderCaptionText(text: string, style: SubtitleStyle, activeIndex: number): ReactNode {
  const { mode, color } = resolveWordHighlight(style);
  if (mode === 'off') return text;

  return splitCaptionText(text).map((part, index) => {
    if (part.wordIndex === null) return <span key={index}>{part.text}</span>;

    const highlighted = isWordHighlighted(mode, part.wordIndex, activeIndex);
    return (
      <span
        key={index}
        className={highlighted ? 'subtitle-word is-highlighted' : 'subtitle-word'}
        style={highlighted ? { color } : undefined}
      >
        {part.text}
      </span>
    );
  });
}
