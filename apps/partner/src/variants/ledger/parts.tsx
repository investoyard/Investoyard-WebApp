import type { ReactNode } from 'react';
import type { IpoCard, Tone } from '@/core/models';

/* Ledger's small pieces. No hooks, so server and client components alike can use them. */

/** One figure on a dotted leader: label · · · · · value. A long value (wrap) drops under its label instead. */
export function Row({ k, v, wrap = false }: { k: ReactNode; v: ReactNode; wrap?: boolean }) {
  return (
    <div className={wrap ? 'is-wrap' : undefined}>
      <dt>{k}</dt>
      <span className="l-lead" aria-hidden="true" />
      <dd>{v}</dd>
    </div>
  );
}

/** A state marker that does not rely on colour alone: a filled ring for open, an empty ring otherwise, plus the words. */
export function State({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`l-state ${tone}`}><i aria-hidden="true" />{children}</span>;
}

export function Bar({ width }: { width: number }) {
  return <span className="l-bar" aria-hidden="true"><span style={{ width: `${Math.max(width, width > 0 ? 3 : 0)}%` }} /></span>;
}

/*
 * The date an issue is filed under on the calendar: the next thing that
 * happens to it. Upcoming → opens; open → closes; closed → allotment, then
 * listing; listed → listed. Compared against the build date so the server
 * render and the browser agree.
 */
export function keyDate(c: IpoCard, asOf: string): { d: string; label: string } | null {
  if (c.tone === 'upcoming' && c.open) return { d: c.open, label: 'Opens' };
  if (c.tone === 'open' && c.close) return { d: c.close, label: 'Closes' };
  if (c.listing && c.listing <= asOf) return { d: c.listing, label: 'Listed' };
  if (c.allotment && c.allotment >= asOf) return { d: c.allotment, label: 'Allotment' };
  if (c.listing) return { d: c.listing, label: 'Lists' };
  if (c.close) return { d: c.close, label: 'Closed' };
  return null;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayParts = (iso: string) => ({ day: String(Number(iso.slice(8, 10))), mon: MON[Number(iso.slice(5, 7)) - 1] || '' });

const ICON: Record<string, string> = {
  home: 'M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  subs: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  allot: 'M9 12l2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  archive: 'M3 7h18M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M9 11h6M4 3h16v4H4z',
};
export const NavIcon = ({ name }: { name: keyof typeof ICON }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[name]} /></svg>
);

export const ExtIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
);
