import { LOGO_FONT_METRICS } from './logo-font-metrics.generated';

/** Advance widths by code point for every character of the bundled font, parsed once. */
const ADVANCES = parseAdvances(LOGO_FONT_METRICS.advances);

function parseAdvances(packed: string): Map<number, number> {
  const advances = new Map<number, number>();
  for (const run of packed.split(';')) {
    if (!run) continue;
    const [start, list] = run.split(':');
    list.split(',').forEach((advance, offset) => advances.set(Number(start) + offset, Number(advance)));
  }
  return advances;
}

/**
 * True when the bundled Noto Sans Bold has the character. Other characters
 * would be drawn with a fallback font of unknown width (and a different one in
 * the preview and in libass), so logo text drops them.
 */
export function isLogoCharSupported(char: string): boolean {
  return ADVANCES.has(char.codePointAt(0) ?? -1);
}

/**
 * Width of `text` in CSS pixels at `emPx`, as plain advance widths. libass does
 * not kern unless the script asks for it, and the preview sets font-kerning: none,
 * so both sides lay out the text the same way. Combining marks have zero advance.
 */
export function measureLogoText(text: string, emPx: number): number {
  let units = 0;
  for (const char of text) {
    units += ADVANCES.get(char.codePointAt(0) ?? 0) ?? LOGO_FONT_METRICS.fallbackAdvance;
  }
  return (units * emPx) / LOGO_FONT_METRICS.unitsPerEm;
}
