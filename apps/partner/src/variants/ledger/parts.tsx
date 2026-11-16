import type { ReactNode } from 'react';
import type { Tone } from '@/core/models';

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

const STATE: Record<Tone, string> = { open: 'Open', upcoming: 'Upcoming', closed: 'Closed' };

/** A state marker that does not rely on colour: a filled ring for open, an empty ring otherwise, plus the word. */
export function State({ tone, children }: { tone: Tone; children?: ReactNode }) {
  return <span className={`l-state ${tone}`}>{children || STATE[tone]}</span>;
}

export function Mini({ width }: { width: number }) {
  return <span className="l-mini" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>;
}
