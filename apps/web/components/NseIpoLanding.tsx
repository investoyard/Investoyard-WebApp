'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getIpos, type IpoFull } from '@/lib/api';
import { IpoRow } from '@/components/SubscriptionHub';
import { SubscriptionDisclaimer } from '@/components/SubscriptionDisclaimer';
import { DayWiseSubscription } from '@/components/DayWiseSubscription';
import { Icon } from '@/components/Icon';
import { titleCase } from '@investoyard/shared-types';

/**
 * SingleIpoLanding (still exported as NseIpoLanding for back-compat) —
 * single-issue landing at /subscription/v2.
 *
 * Reads the target IPO from `?symbol=XXX` in the URL — click any card on
 * /subscription to land here for that IPO. Falls back to NSE when the
 * query param is absent so the direct /subscription/v2 URL keeps working
 * (operator ask, 2026-09-22).
 *
 * Renders (from top): summary card (times / meter / stat tiles) via the
 * shared IpoRow → day-wise subscription table with hourly drill-down.
 * The day-wise section shows even with just Day 1 of data (previously
 * gated on 2+ entries — sir asked to keep it visible from Day 1).
 *
 * Auto-refreshes the live payload every 60 s while open.
 */
export function NseIpoLanding({ ipo: baked }: { ipo: IpoFull | null }) {
  const search = useSearchParams();
  const router = useRouter();
  const requested = (search?.get('symbol') ?? '').toUpperCase();
  const [ipo, setIpo] = useState<IpoFull | null>(baked);

  useEffect(() => {
    let alive = true;
    const load = () => getIpos().then((live) => {
      if (!alive || !Array.isArray(live)) return;
      const target = requested || 'NSE';
      const found = live.find((i: any) => (i.symbol ?? '').toUpperCase() === target);
      if (found) setIpo(found as IpoFull);
      else if (requested) setIpo(null); // requested but missing → empty state
    }).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [requested]);

  if (!ipo) {
    return (
      <div className="subv2">
        <div className="subv2-empty">
          <h3>{requested ? `${requested} not in the live catalogue` : 'NSE IPO not open right now'}</h3>
          <p className="muted">
            {requested
              ? 'This symbol isn\'t in the live catalogue right now. It may not be open yet, or the symbol may be misspelt.'
              : 'The National Stock Exchange of India IPO isn\'t in the live catalogue at the moment. Live subscription will appear here once it opens.'}
          </p>
          <p style={{ marginTop: 14 }}>
            <a className="linklike" href="/subscription">Browse all open IPOs →</a>
          </p>
        </div>
        <SubscriptionDisclaimer />
      </div>
    );
  }

  const ex: any = (ipo as any).extra ?? {};
  const subLog = Array.isArray(ex.subLog) ? ex.subLog : [];
  const subLogHour = Array.isArray(ex.subLogHour) ? ex.subLogHour : [];

  return (
    <div className="subv2 subv2-solo">
      {/* Back link — only shown when we arrived here from /subscription with
          a specific symbol; keeps the direct /subscription/v2 landing clean. */}
      {requested && (
        <button
          type="button"
          className="linklike"
          onClick={() => router.push('/subscription')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, background: 'none', border: 0, cursor: 'pointer', color: 'var(--brand)', fontSize: 13, fontWeight: 600 }}
        >
          <Icon name="arrow-right" size={14} style={{ transform: 'rotate(180deg)' }} /> All open IPOs
        </button>
      )}
      <div className="subv2-list">
        <IpoRow ipo={ipo} today={istTodayYmd()} />
      </div>
      {/* Day-wise + hourly drill-down — shows even with just Day 1 of data
          (operator ask 2026-09-22). Hidden entirely only when the poller
          hasn't written anything at all. */}
      {subLog.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <DayWiseSubscription subLog={subLog} subLogHour={subLogHour} />
        </div>
      )}
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
