/**
 * Resolution-independent subtitle style.
 *
 * All sizes are relative to the video frame so the editor preview (any display
 * size) and the burned-in export (native video resolution) render the same
 * layout. Convert to pixels only through `computeSubtitleGeometry` in
 * `src/shared/subtitle-geometry.ts`.
 */
export type SubtitleStyle = {
  presetId?: SubtitlePresetId;
  /** Font family name. Must be one of SUBTITLE_FONT_FAMILIES (bundled fonts). */
  fontFamily: string;
  /** Font size as a percentage of the video's shorter side (width on vertical clips). Range 2..12. */
  fontSizePercent: number;
  bold: boolean;
  italic: boolean;
  /** #rrggbb */
  textColor: string;
  outlineEnabled: boolean;
  /** #rrggbb */
  outlineColor: string;
  /** Outline thickness as a percentage of the font size. Range 0..20. */
  outlineWidthPercent: number;
  shadowEnabled: boolean;
  /** #rrggbb */
  shadowColor: string;
  /**
   * Opaque box behind the text. When enabled the text outline is not drawn
   * (ASS BorderStyle=3 uses the outline for the box), in preview and export.
   */
  backgroundEnabled: boolean;
  /** #rrggbb */
  backgroundColor: string;
  /** 0..1 */
  backgroundOpacity: number;
  position: 'top' | 'middle' | 'bottom';
  align: 'left' | 'center' | 'right';
  /** Distance from the top/bottom edge as a percentage of video height. Range 0..30. */
  marginVerticalPercent: number;
  /** Maximum text block width as a percentage of video width. Range 40..100. */
  maxWidthPercent: number;
  /**
   * Word-by-word highlight (karaoke). 'word' colors only the word being spoken,
   * 'progressive' colors every word spoken so far. Missing means 'off'.
   */
  wordHighlight?: WordHighlightMode;
  /** #rrggbb color of highlighted words. Missing means DEFAULT_HIGHLIGHT_COLOR. */
  highlightColor?: string;
};

export type WordHighlightMode = 'off' | 'word' | 'progressive';

export const WORD_HIGHLIGHT_MODES: readonly WordHighlightMode[] = ['off', 'word', 'progressive'];

export type SubtitlePresetId = 'clean' | 'box' | 'bold_yellow' | 'karaoke';

export const SUBTITLE_FONT_FAMILIES = ['Noto Sans'] as const;
