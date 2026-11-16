import type { ReactNode } from 'react';
import type { IpoCard, Tone } from '@/core/models';

/* Terminal's small pieces. No hooks, so server and client components alike can use them. */

export function St({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`t-st ${tone}`}><i aria-hidden="true" />{children}</span>;
}

export function Logo({ ipo }: { ipo: Pick<IpoCard, 'logo' | 'ini'> }) {
  return ipo.logo ? <img className="t-logo" src={ipo.logo} alt="" loading="lazy" /> : <span className="t-ini" aria-hidden="true">{ipo.ini}</span>;
}

export function Bar({ width }: { width: number }) {
  return <span className="t-bar" aria-hidden="true"><span style={{ width: `${Math.max(width, width > 0 ? 3 : 0)}%` }} /></span>;
}

/** "22.19×" with the × dimmed, or a dash. */
export function X({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(v)) return <span className="t-dash">—</span>;
  return <>{v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="t-muted">×</span></>;
}

/** Log width of one multiple against a set's maximum, matching the models' own scale. */
export const logW = (t: number | null | undefined, max: number): number => {
  if (t == null || !(t > 0) || !(max > 0)) return 0;
  return Math.round((Math.log10(1 + t) / Math.log10(1 + max)) * 100);
};

const SH = [100, 76, 58, 44, 32, 22, 14];
/** Categorical shades: the partner's colour mixed toward white. */
export const tshade = (i: number) => `color-mix(in srgb, var(--brand) ${SH[Math.min(i, SH.length - 1)]}%, #ffffff)`;

export const ExtIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
);
