'use client';
import { useEffect, useState } from 'react';
import type { IpoFull } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { stageOf, toneOf } from '@investoyard/shared-types';

/**
 * Animated countdown dial (client-only). Shared by the listing card and the
 * detail hero.
 *
 * The dial answers ONE question at every stage: what happens next, and when.
 *
 * It used to branch on `ipo.status` alone, which knows only listed / open /
 * everything-else. Everything-else counted down to the OPEN date — so an issue
 * that had already closed sat past its target and rendered the
 * "opens imminently" state: a card whose own chip read **Allotment Out**
 * displayed **SOON · OPENS** beside it. Awaiting Allotment had the same fault.
 *
 * Branching on the stage instead gives each one its own next event:
 *
 *   upcoming · pre-apply    → the open date
 *   open · live · closing   → the close date, with the urgency colours
 *   awaiting allotment      → the allotment date
 *   allotment out           → the listing date
 *   listed · withdrawn      → nothing to count; a settled state
 *
 * And when a stage has no date to count to, it shows that stage's state rather
 * than falling through to somebody else's — which is what produced the bug.
 */
export function CountdownDial({ ipo }: { ipo: IpoFull }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stage = stageOf(ipo as any);
  // colour comes from the ONE status→tone map, never written next to a status
  // name here; `.t-*` exposes it as --tone (see the colour-code rule in CLAUDE.md)
  const tone = `t-${toneOf(ipo as any)}`;
  const C = 2 * Math.PI * 23;

  /** Long words drop a size rather than running through the arc — see .rc span.long */
  const fit = (t: string) => (t.length > 7 ? 'long' : undefined);

  /** A settled state: full ring in the stage's own colour, no countdown. */
  const state = (big: React.ReactNode, small: string) => (
    <div className={`ic-ring ${tone}`}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="23" fill="none" stroke="var(--tone-soft)" strokeWidth="5" />
      </svg>
      <div className="rc"><b style={{ color: 'var(--tone)' }}>{big}</b><span className={fit(small)}>{small}</span></div>
    </div>
  );

  const ring = (frac: number, color: string, big: string, small: string) => (
    <div className={`ic-ring ${tone}`}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="23" fill="none" stroke="var(--bg-2)" strokeWidth="5" />
        <circle cx="28" cy="28" r="23" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.04, Math.min(1, frac)))} transform="rotate(-90 28 28)" className="arc" />
      </svg>
      <div className="rc"><b style={{ color }}>{big}</b><span className={fit(small)}>{small}</span></div>
    </div>
  );

  /* ── settled stages: the answer is a state, not a number ─────────────── */
  if (stage === 'listed') return state(<Icon name="check" size={16} strokeWidth={3} />, 'LISTED');
  if (stage === 'withdrawn') return state('—', 'WITHDRAWN');

  /* ── what this stage is counting towards ─────────────────────────────── */
  const isOpen = stage === 'live' || stage === 'opentoday' || stage === 'closingtoday';
  const plan =
      stage === 'awaiting' ? { target: ipo.allotmentDate, unit: 'ALLOTMENT', idleBig: '—', idleSmall: 'AWAITING' }
    : stage === 'allotmentout' ? { target: ipo.listingDate, unit: 'LISTING', idleBig: 'OUT', idleSmall: 'ALLOTMENT' }
    : isOpen ? { target: ipo.closeDate, unit: 'LEFT', idleBig: 'LIVE', idleSmall: 'BIDDING' }
    : { target: ipo.openDate, unit: 'TO OPEN', idleBig: 'SOON', idleSmall: 'OPENS' };

  // no date to count to → say where the issue stands, never somebody else's state
  if (!plan.target) return state(plan.idleBig, plan.idleSmall);

  const end = new Date(plan.target + 'T17:00:00').getTime();
  // first paint is server-rendered: no clock, so no countdown yet
  if (now === null) return ring(1, 'var(--brand)', '—', plan.unit);

  const diff = end - now;
  // the date has passed for THIS stage — the settled reading, not a countdown
  if (diff <= 0) return state(plan.idleBig, plan.idleSmall);

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  // urgency colouring belongs to the bidding window only — elsewhere the dial
  // wears the stage's own colour so it agrees with the chip beside it
  const days = isOpen ? diff / 86400000 : 99;
  const color = isOpen
    ? (days < 1 ? 'var(--neg)' : days < 2 ? 'var(--gold-600)' : 'var(--brand)')
    : 'var(--tone)';
  const frac = diff / (7 * 86400000);
  const [big, small] = d > 0 ? [`${d}d`, isOpen ? `${h}h left` : plan.unit]
    : h > 0 ? [`${h}h`, `${String(m).padStart(2, '0')}m`]
      : [`${m}m`, `${String(s).padStart(2, '0')}s`];
  return ring(frac, color, big, small);
}
