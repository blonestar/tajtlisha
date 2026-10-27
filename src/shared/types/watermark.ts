export type WatermarkVariant = 'icon' | 'icon_text';
export type WatermarkPosition = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

export const WATERMARK_VARIANTS: readonly WatermarkVariant[] = ['icon', 'icon_text'];
export const WATERMARK_POSITIONS: readonly WatermarkPosition[] = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];

export type WatermarkSettings = {
  enabled: boolean;
  variant: WatermarkVariant;
  position: WatermarkPosition;
  /** Logo height as % of the video's shorter side. Range 3..15. */
  sizePercent: number;
  /** Distance from both nearest edges as % of the shorter side. Range 0..10. */
  marginPercent: number;
  /** 0.2..1 */
  opacity: number;
};
