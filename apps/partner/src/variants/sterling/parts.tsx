import type { ReactNode } from 'react';
import type { IpoCard, Tone } from '@/core/models';

/* Small presentational pieces shared by Sterling's pages. No hooks, so they
   render in server and client components alike. */

export function Logo({ ipo, size = 'md' }: { ipo: Pick<IpoCard, 'logo' | 'ini'>; size?: 'md' | 'lg' | 'xl' }) {
  const cls = `s-logo${size === 'lg' ? ' s-logo-lg' : size === 'xl' ? ' s-logo-xl' : ''}`;
  if (ipo.logo) return <img className={cls} src={ipo.logo} alt="" loading="lazy" />;
  return <span className={`${cls} s-ini`} aria-hidden="true">{ipo.ini}</span>;
}

export function Status({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`s-status s-status-${tone} ${className}`}>
      <span className={`s-dot s-dot-${tone}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Bar({ width, empty = false }: { width: number; empty?: boolean }) {
  return (
    <span className={`s-bar${empty ? ' is-empty' : ''}`} aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </span>
  );
}

export const Check = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export const Chevron = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);

export const External = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
);

export const DocIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
);

/* Categorical shades come from the partner's colour mixed toward white, so a
   reservation or investor-type chart is coherent in any brand. */
const SHADES = [100, 74, 55, 40, 28, 18, 12, 8];
export const shade = (i: number) => `color-mix(in srgb, var(--brand) ${SHADES[Math.min(i, SHADES.length - 1)]}%, #ffffff)`;
