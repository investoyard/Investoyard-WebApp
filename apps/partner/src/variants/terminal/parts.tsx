import type { CSSProperties, ReactNode } from 'react';
import type { IpoCard, Tone } from '@/core/models';

/* Terminal's small pieces. No hooks. */

/** A heat cell: the partner colour at an intensity that rises with demand (log width 0-100). */
export const heat = (width: number): CSSProperties =>
  width > 0 ? { background: `rgba(var(--brand-rgb), ${(0.07 + 0.43 * (width / 100)).toFixed(3)})` } : {};

export function St({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`t-st ${tone}`}><i aria-hidden="true" />{children}</span>;
}

export function DLogo({ ipo }: { ipo: Pick<IpoCard, 'logo' | 'ini'> }) {
  return ipo.logo ? <img className="t-dlogo" src={ipo.logo} alt="" /> : <span className="t-dini" aria-hidden="true">{ipo.ini}</span>;
}

/** "22.19×" with the × dimmed, or a dash. */
export function X({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(v)) return <span className="t-dash">—</span>;
  return <>{v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="t-muted">×</span></>;
}

const SH = [100, 72, 52, 36, 24, 15, 9];
/** Categorical shades: the partner's light colour mixed toward the panel. */
export const tshade = (i: number) => `color-mix(in srgb, var(--brand-lite) ${SH[Math.min(i, SH.length - 1)]}%, #10151c)`;

export const ExtIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
);
