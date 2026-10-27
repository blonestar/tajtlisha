import { LOGO_FONT_METRICS } from './logo-font-metrics.generated';

/** Advance widths by code point, parsed once. */
const ADVANCES = new Map<number, number>(
  LOGO_FONT_METRICS.advances
    .split(' ')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [code, advance] = pair.split(':');
      return [Number(code), Number(advance)] as const;
    })
);

/**
 * Width of `text` in CSS pixels at `emPx`, as plain advance widths. libass does
 * not kern unless the script asks for it, and the preview sets font-kerning: none,
 * so both sides lay out the text the same way.
 */
export function measureLogoText(text: string, emPx: number): number {
  let units = 0;
  for (const char of text) {
    units += ADVANCES.get(char.codePointAt(0) ?? 0) ?? LOGO_FONT_METRICS.fallbackAdvance;
  }
  return (units * emPx) / LOGO_FONT_METRICS.unitsPerEm;
}
