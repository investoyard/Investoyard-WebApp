/**
 * @investoyard/design-tokens — single source of truth for the Investoyard brand.
 * Palette extracted from the official logo (investoyard.com / InvestoYard-Logo.svg):
 *   brand indigo #3c2e7e  +  brand gold #ffcb32
 * Consumed by web (CSS vars, tokens.css) and mobile (this object).
 */

// Minimal / Apple-like system: neutral foundation, color used sparingly.
// Brand indigo/gold are ACCENTS (primary CTA, links, focus) — not large fills.
export const colors = {
  brand: {
    primary: '#3c2e7e',      // indigo — primary CTA + links/active only
    primaryInk: '#ffffff',
    accent: '#ffcb32',       // gold — rare highlight (avoid large areas)
    accentInk: '#3c2e7e',
    primarySoft: '#f1eff8',
  },
  bg: '#ffffff',             // predominantly white
  bgSubtle: '#f5f5f7',       // Apple-style light gray section bg
  surface: '#ffffff',
  text: '#1d1d1f',           // near-black
  textMuted: '#6e6e73',      // secondary gray
  border: '#d2d2d7',         // hairline
  state: {
    success: '#1a7f43',
    warn: '#9a6700',
    danger: '#c0392b',
    info: '#3c2e7e',
  },
} as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 980 } as const;

/** 4-pt spacing scale */
export const space = (n: number): number => n * 4;

export const typography = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  // Apple-ish: large semibold headings with tight tracking, generous body.
  size: { caption: 12, body: 15, bodyLg: 17, h3: 19, h2: 24, h1: 32, display: 44 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  tracking: { tight: '-0.02em', normal: '0' },
} as const;

export const tokens = { colors, radius, space, typography } as const;
export type Tokens = typeof tokens;
export default tokens;
