'use client';
import { useState } from 'react';
import { ShareWisePanel, AppWisePanel, DemandPanel, tone, toneLabel, type QibSplit } from '@/components/SubscriptionHub';
import { subscriptionTable } from '@/lib/ipoCalc';
import { fmtDateTime } from '@investoyard/shared-types';
import { useLiveIpo } from '@/lib/useLiveIpo';
import { Icon } from '@/components/Icon';
import type { SubRowT, AnchorBasis } from '@/lib/ipoCalc';

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
  rows, total, status, asOf, priceMin, priceMax, totalApps, ipoType, symbol, anchorDeducted = 0, anchorBasis = null, qibSplit,
}: {
  rows: SubRowT[];
  total: SubRowT;
  /** The QIB institutional split the poller writes to extra.qibSplit, when
   *  the exchange sent one. Absent on every issue that closed before
   *  2026-10-14 and on any the exchange gives no sub-category data for. */
  qibSplit?: QibSplit;
  /** Anchor shares actually taken off QIB — 0 when the record has no anchor
   *  figure, which changes what the footnote is allowed to claim. */
  anchorDeducted?: number;
  anchorBasis?: AnchorBasis;
  status: string;
  /** RAW ISO. Formatted here, not by the caller — see `asOfL`. */
  asOf?: string;
  priceMin?: number;
  priceMax?: number;
  totalApps?: number;
  ipoType?: string;
  symbol?: string;
}) {
  /*
   * THE PROPS ARE BAKED AT BUILD TIME, so on an open issue they are stale by
   * however long it has been since the last deploy. `useLiveIpo` re-fetches
   * once on mount and the table is recomputed from THAT, which is what makes
   * this card agree with /subscription instead of drifting from it. The
   * server render stays untouched, so a crawler still sees a full page.
   */
  const fresh = useLiveIpo(symbol);
  const freshT = fresh ? subscriptionTable(fresh as any) : null;
  const rowsL = freshT?.rows ?? rows;
  const totalL = freshT?.total ?? total;
  const anchorDeductedL = freshT ? freshT.anchorDeducted : anchorDeducted;
  const anchorBasisL = freshT ? freshT.anchorBasis : anchorBasis;
  /* ONE formatter for both branches. `fmtDateTime` returns "" for a missing
     or unparseable value, which the render below already treats as absent,
     and it is the same expression the hub uses — so the two surfaces can no
     longer disagree about how this stamp reads. */
  const asOfL = fmtDateTime((fresh as any)?.subscriptionAsOf ?? asOf);
  const totalAppsL = (fresh as any)?.totalApps ?? totalApps;
  const qibSplitL = ((fresh as any)?.extra?.qibSplit as QibSplit | undefined) ?? qibSplit;
  const live = status === 'open';
  const hasBand = !!priceMin && !!priceMax && priceMin !== priceMax;
  const [band, setBand] = useState<'upper' | 'lower'>('upper');
  const price = (band === 'lower' ? (priceMin ?? priceMax) : (priceMax ?? priceMin)) ?? 0;

  const t = totalL.times ?? 0;
  const meterPct = Math.min(100, (t / 3) * 100);
  /* IMPORTED, not re-stated — see the note on `tone` in SubscriptionHub. */
  const tc = tone(t);

  const fmtIn = (n: number) => Math.round(n).toLocaleString('en-IN');
  const fmtCr = (n: number) => (n >= 1000 ? `₹${Math.round(n).toLocaleString('en-IN')} Cr` : `₹${n.toFixed(2)} Cr`);

  /* Summed from the rows by `subscriptionTable`, not shares x the band price:
     a discounted quota makes those disagree and the Total has no price of its
     own. See the note on SubRowT.bookAmount. */
  const bookCr = (totalL.bookAmount ?? 0) / 1e7;
  const subCr = (totalL.subAmount ?? 0) / 1e7;
  /* The operator’s stated figure first, then the EXCHANGE’s own count — the
     same `total.bidCount` the hub tile prints, so the two pages cannot
     disagree. `enrich()` no longer derives a third answer; see lib/api.ts. */
  const apps = totalAppsL ?? totalL.bidCount ?? 0;

  return (
    <div className="subv2 subv2-detail">
      {/* Compact top strip — status + timestamp on left, band toggle and
          detail-view icon on right. The icon-link takes the reader to
          /subscription/v2?symbol=<sym> for the fuller day-wise + hourly
          history (operator ask, 2026-09-22). */}
      <div className="lsx-top">
        <div className="lsx-status-line">
          <span className={`ic-status ${live ? 'live' : 'closed'}`}>
            {live && <span className="pd" />}
            {live ? 'Live now' : 'Final'}
          </span>
          {asOfL && <span className="lsx-asof">Updated {asOfL}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasBand && (
            <div className="seg lsx-band" role="tablist" aria-label="Price band">
              <button className={band === 'upper' ? 'on' : ''} onClick={() => setBand('upper')} type="button">Upper ₹{priceMax}</button>
              <button className={band === 'lower' ? 'on' : ''} onClick={() => setBand('lower')} type="button">Lower ₹{priceMin}</button>
            </div>
          )}
          {symbol && (
            <a
              href={`/subscription/v2?symbol=${encodeURIComponent(symbol)}`}
              className="lsx-detail-btn"
              title="Open full detail view — day-wise + hourly"
              aria-label={`Open detail view for ${symbol}`}
            >
              <Icon name="arrow-right" size={14} />
            </a>
          )}
        </div>
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
          <div className={`lsx-tone lsx-tone-${tc}`}>{toneLabel(t)}</div>
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
          <ShareWisePanel rows={rowsL} total={totalL} price={price} anchorDeducted={anchorDeductedL} anchorBasis={anchorBasisL} />
          {/* SME shows this too (operator ask, 2026-10-09) — the Lot Ladder's
              Reserved column is only the Req 1× figure, not the applications
              received or the by-applications multiple. See the longer note at
              the AppWisePanel mount in SubscriptionHub.tsx. The panel
              self-hides when no row carries a bid count. */}
          <AppWisePanel rows={rowsL} />
          {/* The detail page carries no Lot ladder, so the Demand card takes
              the third column directly rather than stacking (2026-10-13). */}
          <DemandPanel rows={rowsL} total={totalL} price={price} qibSplit={qibSplitL} />
        </div>
      </div>

      {/* The "Net (post anchor)" line used to print unconditionally — and was
          FALSE on 5 of the 6 IPOs open on 2026-09-23, because only VARMORA had
          an anchor figure on its record. Stating which of the two a reader is
          looking at costs nothing and is the difference between a figure they
          can check against the exchange and one they cannot.

          THREE states, not two (2026-09-30). A deduction taken from a stated
          share count is the ALLOTMENT off the anchor intimation letter; one
          taken from a percentage is our own arithmetic against a ceiling the
          issue may not have used — the anchor book can close under 60%, so an
          estimate is an upper bound. Both produce a Net QIB and only one is a
          fact, so the reader is told which. */}
      {/* THE ANCHOR SENTENCE MOVED INTO ShareWisePanel (2026-10-10) so the two
          dedicated subscription pages carry it too — they rendered the same
          anchor-deducted QIB and said nothing about it. Repeating it here would
          print it twice on this page. */}
      <p className="lsx-note">
        {hasBand && `Amounts at the ${band} band (₹${price}). `}
        Times figures are computed from the shares this page shows so Book × Times = Subscribed always cross-checks.
      </p>
    </div>
  );
}
