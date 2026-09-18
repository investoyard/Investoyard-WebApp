'use client';
import { useEffect, useState } from 'react';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoRow } from '@/components/SubscriptionHub';
import { SubscriptionDisclaimer } from '@/components/SubscriptionDisclaimer';

/**
 * NseIpoLanding — single-issue landing page for the National Stock Exchange
 * of India IPO (symbol `NSE`). Rendered at /subscription/v2.
 *
 * Same card design as /subscription (operator ask, 2026-09-18): summary row
 * with avatar / times / meter / stat tiles, then three side-by-side detail
 * panels (Share-wise / Application-wise / Lot ladder). Reuses the exact
 * `IpoRow` component the aggregate page uses, so the two surfaces can never
 * disagree on card layout. No filter bar / view toggle since this page is
 * pinned to ONE issue.
 *
 * Auto-refreshes the live payload every 60 s while the page is open.
 */
export function NseIpoLanding({ ipo: baked }: { ipo: IpoFull | null }) {
  const [ipo, setIpo] = useState<IpoFull | null>(baked);

  useEffect(() => {
    let alive = true;
    const load = () => getIpos().then((live) => {
      if (!alive || !Array.isArray(live)) return;
      const nse = live.find((i: any) => (i.symbol ?? '').toUpperCase() === 'NSE');
      if (nse) setIpo(nse as IpoFull);
    }).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!ipo) {
    return (
      <div className="subv2">
        <div className="subv2-empty">
          <h3>NSE IPO not open right now</h3>
          <p className="muted">
            The National Stock Exchange of India IPO isn&apos;t in the live catalogue at the moment.
            Live subscription for this issue will appear here once it opens.
          </p>
          <p style={{ marginTop: 14 }}>
            <a className="linklike" href="/subscription">Browse all open IPOs →</a>
          </p>
        </div>
        <SubscriptionDisclaimer />
      </div>
    );
  }

  return (
    <div className="subv2">
      <div className="subv2-list">
        {/* Single card, same shell as /subscription. Share button hidden
            (no onShare prop) — one-issue page doesn't need the aggregate
            hub's canvas-snapshot flow. */}
        <IpoRow ipo={ipo} today={istTodayYmd()} />
      </div>
      <SubscriptionDisclaimer />
    </div>
  );
}

function istTodayYmd(): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
