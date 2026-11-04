'use client';
import { useEffect, useMemo, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoLogo } from '@/components/IpoLogo';
import { useTenant } from '@/components/TenantProvider';

/**
 * GMP Accuracy — "Did the grey market get it right?" Final GMP vs the ACTUAL
 * listing gain for recent debuts, with the gap in percentage points. Pure
 * facts, no scores or recommendations (our distribute-and-inform rule): the
 * grey market's claim renders neutral, only the real listing gain carries
 * semantic green/red, and the verdict is a measured word — on target / close /
 * wide — never advice. Hidden entirely for tenants with GMP disabled.
 */

interface Row {
  ipo: IpoFull;
  gmpPct: number;
  gainPct: number;
  delta: number; // gain − gmp, percentage points
}

function listedGainPct(ipo: IpoFull): number | null {
  if (ipo.listingGainPct != null) return ipo.listingGainPct;
  const ex: any = (ipo as any).extra ?? {};
  const issue = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  const listed = Number(String(ex.nseListingPrice || ex.bseListingPrice || '').replace(/[^\d.]/g, '')) || 0;
  return issue && listed ? Math.round(((listed - issue) / issue) * 1000) / 10 : null;
}

/**
 * THE THRESHOLDS ARE STATED ON THE PAGE (QC U4), because "on target" is a
 * JUDGEMENT rendered as a label and this site does not publish ratings — so the
 * reader has to be able to see the rule that produced it and disagree with it.
 * Named constants rather than literals inside the branches, so the footnote
 * cannot drift from the thresholds it describes.
 */
const ON_TARGET_PTS = 3;
const CLOSE_PTS = 8;

/**
 * How many debuts the table shows. Named so the footnote can say what the rows
 * are a selection OF: six most-recent is a SAMPLE, and a sample presented
 * without its selection rule reads as a track record over everything.
 */
const SHOWN = 6;

function verdict(delta: number): { label: string; cls: string } {
  const a = Math.abs(delta);
  if (a <= ON_TARGET_PTS) return { label: 'on target', cls: 'v-on' };
  if (a <= CLOSE_PTS) return { label: 'close', cls: 'v-near' };
  return { label: 'wide', cls: 'v-off' };
}

export function GmpAccuracy({ ipos: baked }: { ipos: IpoFull[] }) {
  const tenant = useTenant();
  const [ipos, setIpos] = useState<IpoFull[]>(baked);
  useEffect(() => { getIpos().then((live) => { if (live?.length) setIpos(live as IpoFull[]); }).catch(() => {}); }, []);

  const rows = useMemo<Row[]>(() => {
    return ipos
      .filter((i) => i.status === 'listed')
      .map((ipo) => {
        /* `gmpPct` ONLY, never `?? ipo.gmp`. gmpPct is a PERCENTAGE and gmp is
           RUPEES PER SHARE: the API derives the first as `gmp / upper band` and
           leaves it undefined when a record has no band, so the old fallback
           printed a rupee figure with a % sign, diffed it against a real
           listing-gain percentage and handed the result to `verdict()`. A GMP
           with no price band HAS no percentage — the honest answer is to leave
           the issue out, which the null below does. Latent today (every listed
           record holds a band) and wrong in units whenever it fires. */
        const gmpPct = ipo.gmpPct ?? null;
        const gainPct = listedGainPct(ipo);
        if (gmpPct == null || gainPct == null) return null;
        return { ipo, gmpPct, gainPct, delta: Math.round((gainPct - gmpPct) * 10) / 10 };
      })
      .filter(Boolean)
      .sort((a, b) => (String(b!.ipo.listingDate ?? '') < String(a!.ipo.listingDate ?? '') ? -1 : 1))
      .slice(0, SHOWN) as Row[];
  }, [ipos]);

  if (!tenant.flags.gmpEnabled || rows.length === 0) return null;

  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 10) / 10}%`;
  const fmtD = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

  return (
    <>
      <div className="section-head" style={{ marginTop: 42 }}>
        <h2>Did the grey market get it right?</h2>
      </div>
      <div className="panel ga">
        <div className="ga-row ga-head">
          <span />
          <span className="ga-col">GMP said</span>
          <span className="ga-col">Listing did</span>
          <span className="ga-col">Gap</span>
        </div>
        {rows.map((r) => {
          const v = verdict(r.delta);
          return (
            <a className="ga-row" key={r.ipo.id} href={`/ipos/${r.ipo.slug ?? r.ipo.symbol}`}>
              <span className="ga-ipo">
                <IpoLogo logo={(r.ipo as any).logo} name={r.ipo.name} size={30} />
                <span className="ga-name-wrap">
                  <span className="ga-name" title={r.ipo.name}>{r.ipo.name}</span>
                  <span className="ga-date">Listed {fmtD(r.ipo.listingDate)}</span>
                </span>
              </span>
              <span className="ga-col mono ga-gmp">{fmtPct(r.gmpPct)}</span>
              <span className={`ga-col mono ga-gain ${r.gainPct >= 0 ? 'gp' : 'gn'}`}>{fmtPct(r.gainPct)}</span>
              <span className="ga-col">
                <span className={`ga-verdict ${v.cls}`}>
                  <b className="mono">{r.delta >= 0 ? '+' : ''}{r.delta}</b> pts · {v.label}
                </span>
              </span>
            </a>
          );
        })}
        {/* THE METHODOLOGY IS ON THE PAGE, not in a policy document (QC U4).
            Three things a reader could not previously see: which issues these
            are, what the final GMP is a percentage OF, and what rule turns a
            gap into "on target". The thresholds read from the constants, so
            this sentence cannot drift from the code that produced the label. */}
        <p className="disclaimer" style={{ margin: '12px 2px 2px' }}>
          GMP is unofficial, unregulated grey-market data shown for information only — not investment advice.
          {' '}How this is worked out: the {rows.length === SHOWN ? `${SHOWN} most recent` : rows.length} debut{rows.length === 1 ? '' : 's'}{' '}
          for which we hold both a final GMP and a listing price — not every listing, and not a selection by outcome.
          {' '}GMP said is the final grey-market premium as a percentage of the upper band price; Listing did compares the issue price
          with the actual listing price. The gap is the difference in percentage points: within {ON_TARGET_PTS} is
          {' '}<i>on target</i>, within {CLOSE_PTS} is <i>close</i>, beyond that <i>wide</i>. Past gaps say nothing about the next issue.
        </p>
      </div>
    </>
  );
}
