'use client';
import { useEffect, useState } from 'react';
import { catColor, segTextColor, shC } from '@/lib/catColor';
import { Icon } from '@/components/Icon';

type Row = {
  /** Bucket key from the API (qib / hni / hni2 / retail / employee / shareholder / total). */
  key?: string;
  cat: string;
  bookSize: number;
  subscribed: number;
  times: number;
  /** Application-wise times (bids ÷ max allottees). Drives the second breakup
   * table under the shares grid. */
  applicationsTimes?: number;
  bidCount?: number;
  // Per-exchange breakdown from the poller. Both may be absent on legacy rows;
  // the footnote hides itself when neither side has demand yet.
  nseShares?: number;
  bseShares?: number;
  nseBids?: number;
  bseBids?: number;
};

/** Numbers-first subscription: toolbar (live · band toggle · refresh) → total
    banner → per-category card-rows. Upper/Lower recomputes the ₹ amounts; live
    figures gently auto-refresh while the IPO is open. */
export function LiveSubscription({ rows, total, status, asOf, priceMin, priceMax, totalApps }: {
  rows: Row[]; total: Row; status: string; asOf?: string; priceMin?: number; priceMax?: number; totalApps?: number;
}) {
  const live = status === 'open';
  const [drift, setDrift] = useState(0);
  const [band, setBand] = useState<'upper' | 'lower'>('upper');
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setDrift((d) => Math.min(20, d + 1)), 7000);
    return () => clearInterval(id);
  }, [live]);
  const f = live ? 1 + drift * 0.004 : 1;
  const totalX = total.times * f;
  const price = (band === 'lower' ? (priceMin ?? priceMax) : (priceMax ?? priceMin)) ?? 0;
  const hasBand = !!priceMin && !!priceMax && priceMin !== priceMax;

  const n = (v: number) => Math.round(v).toLocaleString('en-IN');
  const cr = (sh: number) => (price ? `₹${((sh * price) / 1e7).toFixed(2)} Cr` : '');
  // "NSE 62% · BSE 38%" split label. Shown under a row's Subscription cell
  // (and once at the total) when the poller has recorded per-exchange demand.
  // Falls silent while either side is still absent — a legacy row (both
  // undefined) reads identically to a fresh row with no demand yet, so we
  // gate on having ANY non-zero exchange figure.
  const split = (r: Pick<Row, 'nseShares' | 'bseShares'>) => {
    const nse = r.nseShares ?? 0;
    const bse = r.bseShares ?? 0;
    if (nse + bse <= 0) return null;
    const total = nse + bse;
    return `NSE ${Math.round((nse / total) * 100)}% · BSE ${Math.round((bse / total) * 100)}%`;
  };

  // Application-wise rows — ipopremium's second table shows only the buckets
  // where a per-application ratio is meaningful (HNI-10L+, HNI-2-10L, Retail,
  // Employee). QIB is off-book (institutional); shareholder/other stay hidden
  // when the field isn't populated.
  const APP_ORDER = ['hni', 'hni2', 'retail', 'employee'];
  const appRows = rows
    .filter((r) => r.applicationsTimes != null && r.bidCount != null && APP_ORDER.includes(r.key ?? ''))
    .sort((a, b) => APP_ORDER.indexOf(a.key ?? '') - APP_ORDER.indexOf(b.key ?? ''));
  const appTotalBids = appRows.reduce((s, r) => s + (r.bidCount ?? 0), 0);

  return (
    <div className="panel subx-panel">
      <div className="subx-bar">
        <div className="subx-title">
          {live && <span className="live-dot" />}
          <b>{live ? 'Live now' : 'Final'}</b>
          {asOf && <span className="subx-asof">as on {asOf}</span>}
        </div>
        <div className="subx-tools">
          {hasBand && (
            <div className="seg" role="tablist" aria-label="Price band">
              <button className={band === 'upper' ? 'on' : ''} onClick={() => setBand('upper')}>Upper</button>
              <button className={band === 'lower' ? 'on' : ''} onClick={() => setBand('lower')}>Lower</button>
            </div>
          )}
          {live && <button className="subx-ref" onClick={() => setDrift((d) => d + 1)} aria-label="Refresh figures"><Icon name="refresh" size={16} strokeWidth={2} /></button>}
        </div>
      </div>

      <div className="subx-total">
        <div className="l"><div className="big mono">{totalX.toFixed(2)}<span>×</span></div><div className="cap">Total subscription</div></div>
        <div className="r">
          <div className="row2"><span>Applied</span><b>{shC(total.subscribed * f)} sh</b></div>
          <div className="row2"><span>Book size</span><b>{shC(total.bookSize)} sh</b></div>
        </div>
      </div>

      <div className="subx">
        <div className="subx-h"><span>Category</span><span>Book size</span><span>Subscription</span><span className="r">No. of times</span></div>
        {rows.map((r) => {
          const s = split(r);
          // Colour key must be the bucket KEY (hni vs hni2 both contain "hni"
          // in the display label, so passing r.cat would collapse both to the
          // same colour). r.key is the API's lowercase bucket id.
          const colourKey = r.key ?? r.cat;
          return (
            <div className="subx-row" key={r.key ?? r.cat} style={{ ['--cc' as string]: catColor(colourKey) } as React.CSSProperties}>
              <div><span className="cat-chip">{r.cat}</span></div>
              <div className="subx-num" data-k="Book size">{n(r.bookSize)}<small>{cr(r.bookSize)}</small></div>
              <div className="subx-num" data-k="Subscription">
                {n(r.subscribed * f)}
                <small>{cr(r.subscribed * f)}</small>
                {s && <small className="muted" style={{ marginTop: 2 }}>{s}</small>}
              </div>
              <div className="r"><span className="x-badge" style={{ color: segTextColor(colourKey) }}>{(r.times * f).toFixed(2)}×</span></div>
            </div>
          );
        })}
      </div>

      {/* Application-wise breakup — mirrors ipopremium's second table. Hidden
          until the poll has populated `applicationsSubscribed` on at least one
          non-QIB bucket. Uses the same row shell as the shares grid but a
          different header, so the connection reads at a glance. */}
      {appRows.length > 0 && (
        <div className="subx" style={{ marginTop: 12 }}>
          <div className="subx-h">
            <span>Application-wise</span><span>Reserved apps</span><span>Applied</span><span className="r">No. of times</span>
          </div>
          {appRows.map((r) => {
            const reserved = r.applicationsTimes && r.applicationsTimes > 0 && r.bidCount
              ? Math.round(r.bidCount / r.applicationsTimes) : 0;
            const colourKey = r.key ?? r.cat;
            return (
              <div className="subx-row" key={'app-' + (r.key ?? r.cat)} style={{ ['--cc' as string]: catColor(colourKey) } as React.CSSProperties}>
                <div><span className="cat-chip">{r.cat}</span></div>
                <div className="subx-num" data-k="Reserved apps">{reserved > 0 ? n(reserved) : '—'}</div>
                <div className="subx-num" data-k="Applied apps">{r.bidCount != null ? n(r.bidCount) : '—'}</div>
                <div className="r"><span className="x-badge" style={{ color: segTextColor(colourKey) }}>{(r.applicationsTimes ?? 0).toFixed(2)}×</span></div>
              </div>
            );
          })}
          {appTotalBids > 0 && (
            <p className="note-line" style={{ marginTop: 6 }}>Total applications: <b>{n(appTotalBids)}</b></p>
          )}
        </div>
      )}

      <p className="note-line">*Excluding anchor{totalApps ? ` · ~${totalApps.toLocaleString('en-IN')} total applications` : ''}.{hasBand ? ` Amounts at the ${band} band (₹${band === 'lower' ? priceMin : priceMax}).` : ''}{split(total) ? ` Overall split: ${split(total)}.` : ''}{live ? ' Live figures are simulated for the demo.' : ''}</p>
    </div>
  );
}
