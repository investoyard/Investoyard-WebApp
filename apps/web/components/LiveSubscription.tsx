'use client';
import { useEffect, useState } from 'react';
import { catColor, segTextColor, shC } from '@/lib/catColor';
import { Icon } from '@/components/Icon';

type Row = { cat: string; bookSize: number; subscribed: number; times: number };

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
        {rows.map((r) => (
          <div className="subx-row" key={r.cat} style={{ ['--cc' as string]: catColor(r.cat) } as React.CSSProperties}>
            <div><span className="cat-chip">{r.cat}</span></div>
            <div className="subx-num" data-k="Book size">{n(r.bookSize)}<small>{cr(r.bookSize)}</small></div>
            <div className="subx-num" data-k="Subscription">{n(r.subscribed * f)}<small>{cr(r.subscribed * f)}</small></div>
            <div className="r"><span className="x-badge" style={{ color: segTextColor(r.cat) }}>{(r.times * f).toFixed(2)}×</span></div>
          </div>
        ))}
      </div>
      <p className="note-line">*Excluding anchor{totalApps ? ` · ~${totalApps.toLocaleString('en-IN')} total applications` : ''}.{hasBand ? ` Amounts at the ${band} band (₹${band === 'lower' ? priceMin : priceMax}).` : ''}{live ? ' Live figures are simulated for the demo.' : ''}</p>
    </div>
  );
}
