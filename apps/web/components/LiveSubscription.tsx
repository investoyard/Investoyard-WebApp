'use client';
import { useState } from 'react';
import { ShareWisePanel, AppWisePanel } from '@/components/SubscriptionHub';
import type { SubRowT } from '@/lib/ipoCalc';

/**
 * Live Subscription — detail-page section.
 *
 * Reuses the `/subscription/v2` hub's ShareWisePanel + AppWisePanel so
 * the vocabulary, math and visual language are identical across every
 * subscription surface.
 *
 * Header layout (2026-09-22 v2 — operator revision):
 *   Row 1 (compact top-strip): status pill + Updated timestamp on the left,
 *                              Upper/Lower band toggle on the right.
 *   Row 2 (hero panel): big Times number + meter + tone label CENTERED,
 *                       flanked by the three Book / Subscribed / Applications
 *                       stat tiles across a full-width grid.
 *
 * The v1 attempt (2026-09-22) borrowed IpoRow's split three-column shell
 * from the hub which relies on a fourth column (logo + IPO name + status
 * chips) that the detail page doesn't need — so the left column looked
 * empty and the whole row felt cramped when the operator screenshotted
 * it. This version separates status+toggle from the hero so each row
 * gets full width to breathe.
 *
 * Below the hero: Share-Wise + Application-Wise panels (unchanged).
 */
export function LiveSubscription({
  rows, total, status, asOf, priceMin, priceMax, totalApps, ipoType,
}: {
  rows: SubRowT[];
  total: SubRowT;
  status: string;
  asOf?: string;
  priceMin?: number;
  priceMax?: number;
  totalApps?: number;
  ipoType?: string;
}) {
  const live = status === 'open';
  const hasBand = !!priceMin && !!priceMax && priceMin !== priceMax;
  const [band, setBand] = useState<'upper' | 'lower'>('upper');
  const price = (band === 'lower' ? (priceMin ?? priceMax) : (priceMax ?? priceMin)) ?? 0;

  const t = total.times ?? 0;
  const meterPct = Math.min(100, (t / 3) * 100);
  const tc = t >= 3 ? 'hot' : t >= 1 ? 'warm' : t >= 0.5 ? 'cool' : 'cold';
  const toneLabel = t >= 3 ? 'Heavily subscribed' : t >= 1 ? 'Fully subscribed' : t >= 0.5 ? 'Picking up' : 'In progress';

  const fmtIn = (n: number) => Math.round(n).toLocaleString('en-IN');
  const fmtCr = (n: number) => (n >= 1000 ? `₹${Math.round(n).toLocaleString('en-IN')} Cr` : `₹${n.toFixed(2)} Cr`);

  const bookCr = total.bookSize > 0 && price > 0 ? (total.bookSize * price) / 1e7 : 0;
  const subCr = total.subscribed > 0 && price > 0 ? (total.subscribed * price) / 1e7 : 0;
  const apps = totalApps ?? total.bidCount ?? 0;

  return (
    <div className="subv2 subv2-detail">
      {/* Compact top strip — status + timestamp on left, band toggle on right.
          Keeps the busy status controls OFF the hero, so the hero can breathe. */}
      <div className="lsx-top">
        <div className="lsx-status-line">
          <span className={`ic-status ${live ? 'live' : 'closed'}`}>
            {live && <span className="pd" />}
            {live ? 'Live now' : 'Final'}
          </span>
          {asOf && <span className="lsx-asof">Updated {asOf}</span>}
        </div>
        {hasBand && (
          <div className="seg lsx-band" role="tablist" aria-label="Price band">
            <button className={band === 'upper' ? 'on' : ''} onClick={() => setBand('upper')} type="button">Upper ₹{priceMax}</button>
            <button className={band === 'lower' ? 'on' : ''} onClick={() => setBand('lower')} type="button">Lower ₹{priceMin}</button>
          </div>
        )}
      </div>

      {/* Hero — big times centered, three tiles across the row */}
      <div className={`lsx-hero lsx-hero-${tc}`}>
        <div className="lsx-hero-l">
          <div className="lsx-times">
            <span className="lsx-times-n">{t.toFixed(2)}</span><span className="lsx-times-x">×</span>
          </div>
          <div className="lsx-meter">
            <div className="lsx-meter-track"><span style={{ width: `${meterPct}%` }} /></div>
            <div className="lsx-meter-tk"><span>0×</span><span>1×</span><span>2×</span><span>3×+</span></div>
          </div>
          <div className={`lsx-tone lsx-tone-${tc}`}>{toneLabel}</div>
        </div>
        <div className="lsx-tiles">
          <div className="lsx-tile">
            <span className="lsx-tile-k">Book</span>
            <span className="lsx-tile-v">{bookCr > 0 ? fmtCr(bookCr) : '—'}</span>
          </div>
          <div className="lsx-tile">
            <span className="lsx-tile-k">Subscribed</span>
            <span className={`lsx-tile-v tone-${tc}`}>{subCr > 0 ? fmtCr(subCr) : '—'}</span>
          </div>
          <div className="lsx-tile">
            <span className="lsx-tile-k">Applications</span>
            <span className="lsx-tile-v">{apps > 0 ? fmtIn(apps) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Share-wise + Application-wise — same components /subscription/v2 uses. */}
      <div className="subv2-ln-detail" style={{ marginTop: 14 }}>
        <div className="subv2-det-in">
          <ShareWisePanel rows={rows} total={total} price={price} />
          {/* Application-wise is mainboard-only. SME reads that count off
              the Lot Ladder's Reserved column, so a separate table is
              redundant (operator ask, 2026-09-22). */}
          {ipoType !== 'sme' && <AppWisePanel rows={rows} />}
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
