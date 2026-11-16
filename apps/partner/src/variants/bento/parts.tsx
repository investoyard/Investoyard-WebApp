import type { ReactNode } from 'react';
import type { IpoCard, Tone } from '@/core/models';

/* Bento's small pieces. No hooks, so server and client components share them. */

export function Logo({ ipo, size = 'md' }: { ipo: Pick<IpoCard, 'logo' | 'ini'>; size?: 'sm' | 'md' | 'xl' }) {
  const cls = `b-logo${size === 'sm' ? ' b-logo-sm' : size === 'xl' ? ' b-logo-xl' : ''}`;
  if (ipo.logo) return <img className={cls} src={ipo.logo} alt="" loading="lazy" />;
  return <span className={`${cls} b-ini`} aria-hidden="true">{ipo.ini}</span>;
}

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`b-chip b-chip-${tone}`}><i aria-hidden="true" />{children}</span>;
}

export function Meter({ width }: { width: number }) {
  return <span className="b-meter" aria-hidden="true" style={{ display: 'block' }}><span style={{ width: `${width}%` }} /></span>;
}

/* Categorical shades: the partner colour mixed toward white, darkest first,
   so a donut or split reads in any brand. */
const SH = [100, 72, 50, 34, 22, 14, 9, 6];
export const shade = (i: number) => `color-mix(in srgb, var(--brand) ${SH[Math.min(i, SH.length - 1)]}%, #ffffff)`;

export const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const Doc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
);
