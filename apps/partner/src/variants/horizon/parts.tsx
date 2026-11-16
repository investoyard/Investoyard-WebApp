import type { ReactNode } from 'react';
import type { IpoCard, Tone } from '@/core/models';

/* Horizon's small pieces. No hooks, so a server component may call them; the live countdown lives in Countdown.tsx. */

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`h-chip ${tone}`}><i aria-hidden="true" />{children}</span>;
}

export function RLogo({ ipo }: { ipo: Pick<IpoCard, 'logo' | 'ini'> }) {
  return ipo.logo ? <img className="h-rlogo" src={ipo.logo} alt="" loading="lazy" /> : <span className="h-rini" aria-hidden="true">{ipo.ini}</span>;
}

export const Arrow = () => <span className="h-arrow" aria-hidden="true">→</span>;

const SH = [100, 72, 52, 38, 26, 17, 10];
/** Categorical shades of the partner colour, mixed toward white. */
export const shade = (i: number) => `color-mix(in srgb, var(--brand) ${SH[Math.min(i, SH.length - 1)]}%, #ffffff)`;
/** Text that reads on shade(i): the brand's own on-colour for the deep shades, ink for the pale ones. */
export const shadeInk = (i: number) => (i <= 1 ? 'var(--brand-on)' : 'var(--ink)');

/*
 * The moment a countdown points at. An Indian issue opens at 10:00 IST and
 * closes at 17:00 IST by SEBI convention — stated as such on the page, so the
 * clock never claims an hour the record does not carry.
 */
export function targetOf(c: Pick<IpoCard, 'tone' | 'open' | 'close'>): { at: number; label: string } | null {
  if (c.tone === 'upcoming' && c.open) return { at: Date.parse(`${c.open}T10:00:00+05:30`), label: 'Bidding opens 10:00 IST in' };
  if (c.tone === 'open' && c.close) return { at: Date.parse(`${c.close}T17:00:00+05:30`), label: 'Bidding closes 17:00 IST in' };
  return null;
}

export const ExtIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
);
