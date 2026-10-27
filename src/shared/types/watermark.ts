/** What the logo shows: the badge letters, the text, or both. */
export type WatermarkContent = 'mark_text' | 'mark' | 'text';
/** Which parts sit on a background: all of the logo, only the badge, or nothing. */
export type WatermarkBackground = 'all' | 'mark' | 'none';
export type WatermarkPosition = 'top_left' | 'top_center' | 'top_right' | 'bottom_left' | 'bottom_center' | 'bottom_right';

export const WATERMARK_CONTENTS: readonly WatermarkContent[] = ['mark_text', 'mark', 'text'];
export const WATERMARK_BACKGROUNDS: readonly WatermarkBackground[] = ['all', 'mark', 'none'];
export const WATERMARK_POSITIONS: readonly WatermarkPosition[] = [
  'top_left',
  'top_center',
  'top_right',
  'bottom_left',
  'bottom_center',
  'bottom_right'
];

export type WatermarkSettings = {
  enabled: boolean;
  content: WatermarkContent;
  /** Letters in the badge. Trimmed, at most 3 code points. Empty hides the badge. */
  markText: string;
  /** Text next to the badge. Trimmed, at most 30 code points. Empty hides the text. */
  text: string;
  background: WatermarkBackground;
  /** '#rrggbb' */
  backgroundColor: string;
  /** '#rrggbb' colour of the badge letters. */
  markColor: string;
  /** '#rrggbb' colour of the text. */
  textColor: string;
  /** Corner radius as % of the logo height. Range 0..50. */
  cornerRadiusPercent: number;
  position: WatermarkPosition;
  /** Logo height as % of the video's shorter side. Range 3..15. */
  sizePercent: number;
  /** Distance from both nearest edges as % of the shorter side. Range 0..10. */
  marginPercent: number;
  /** 0.2..1 */
  opacity: number;
};
