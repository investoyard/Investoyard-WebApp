'use client';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ShareWisePanel, AppWisePanel } from '@/components/SubscriptionHub';
import type { SubRowT } from '@/lib/ipoCalc';

/**
 * Live Subscription — detail-page section.
 *
 * Reuses the `/subscription/v2` hub's ShareWisePanel + AppWisePanel so
 * the vocabulary, math and visual language are identical across every
 * subscription surface (operator ask, 2026-09-22: "make proper UI as per
 * our"). The 2026-09-05 mock-drift animation (`(1 + drift * 0.004)` on
 * real times) was removed at the same time — it was inflating the poller's
 * real numbers by up to 8 % over two minutes on a live IPO. Numbers now
 * display exactly what the poller wrote.
 *
 * Layout (matches the operator's reference):
 *   1. Status pill  — Live / Final + asOf timestamp + Upper/Lower band toggle
 *   2. Hero        — big Times number, meter, Book / Subscribed / Apps tiles
 *   3. ShareWisePanel — 4-col category table, exact copy of the hub's
 *   4. AppWisePanel   — Req 1x / Applied / Times per HNI/Retail/Employee row
 */
export function LiveSubscription({
  rows, total, status, asOf, priceMin, priceMax, totalApps,
}: {
  rows: SubRowT[];
  total: SubRowT;
  status: string;
  asOf?: string;
  priceMin?: number;
  priceMax?: number;
  totalApps?: number;
}) {
  const live = status === 'open';
  const hasBand = !!priceMin && !!priceMax && priceMin !== priceMax;
  const [band, setBand] = useState<'upper' | 'lower'>('upper');
  const price = (band === 'lower' ? (priceMin ?? priceMax) : (priceMax ?? priceMin)) ?? 0;

  const t = total.times ?? 0;
  const meterPct = Math.min(100, (t / 3) * 100);
  const tc = t >= 3 ? 'hot' : t >= 1 ? 'warm' : t >= 0.5 ? 'cool' : 'cold';

  const fmtIn = (n: number) => Math.round(n).toLocaleString('en-IN');
  const fmtCr = (n: number) => (n >= 1000 ? `₹${Math.round(n).toLocaleString('en-IN')} Cr` : `₹${n.toFixed(2)} Cr`);

  const bookCr = total.bookSize > 0 && price > 0 ? (total.bookSize * price) / 1e7 : 0;
  const subCr = total.subscribed > 0 && price > 0 ? (total.subscribed * price) / 1e7 : 0;
  const apps = totalApps ?? total.bidCount ?? 0;

  return (
    <div className="subv2 subv2-detail">
      <article className={`subv2-ln subv2-t-${tc}`}>
        <div className="subv2-ln-l">
          <div className="subv2-ln-name" style={{ minWidth: 0 }}>
            <div className="subv2-ln-meta">
              <span className={`ic-status ${live ? 'live' : 'closed'}`}>
                {live && <span className="pd" />}
                {live ? 'Live now' : 'Final'}
              </span>
              {asOf && <span className="muted" style={{ fontSize: 12 }}>Updated {asOf}</span>}
            </div>
            <div className="subv2-ln-info" style={{ marginTop: 6 }}>
              {hasBand && (
                <div className="seg" role="tablist" aria-label="Price band">
                  <button className={band === 'upper' ? 'on' : ''} onClick={() => setBand('upper')} type="button">Upper ₹{priceMax}</button>
                  <button className={band === 'lower' ? 'on' : ''} onClick={() => setBand('lower')} type="button">Lower ₹{priceMin}</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="subv2-ln-m">
          <div className="subv2-ln-times">
            <span className="tx-n">{t.toFixed(2)}</span><span className="tx-x">×</span>
          </div>
          <div className="subv2-ln-meter">
            <div className="subv2-ln-track"><span style={{ width: `${meterPct}%` }} /></div>
            <div className="subv2-ln-tk"><span>0×</span><span>1×</span><span>2×</span><span>3×+</span></div>
          </div>
          <div className="subv2-ln-status">
            {t >= 3 ? 'Heavily subscribed' : t >= 1 ? 'Fully subscribed' : t >= 0.5 ? 'Picking up' : 'In progress'}
          </div>
        </div>
        <div className="subv2-ln-r">
          <div><span className="k">Book</span><span className="v">{bookCr > 0 ? fmtCr(bookCr) : '—'}</span></div>
          <div><span className="k">Subscribed</span><span className={`v tone-${tc}`}>{subCr > 0 ? fmtCr(subCr) : '—'}</span></div>
          <div><span className="k">Applications</span><span className="v">{apps > 0 ? fmtIn(apps) : '—'}</span></div>
        </div>
      </article>

      {/* Share-wise + Application-wise — same components /subscription/v2 uses.
          Passing price = the operator-selected band, so the ₹ Cr subtitles under
          each shares cell recompute when the user toggles Upper/Lower. */}
      <div className="subv2-ln-detail" style={{ marginTop: 12 }}>
        <div className="subv2-det-in">
          <ShareWisePanel rows={rows} total={total} price={price} />
          <AppWisePanel rows={rows} />
        </div>
      </div>

      <p className="note-line" style={{ marginTop: 10 }}>
        *QIB Book Size is Net (post anchor).
        {hasBand && ` Amounts at the ${band} band (₹${price}).`}
        {' '}Times figures are computed from the shares this page shows so Book × Times = Subscribed always cross-checks.
      </p>
    </div>
  );
}
