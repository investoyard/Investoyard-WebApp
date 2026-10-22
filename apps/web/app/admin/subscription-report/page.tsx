'use client';
/**
 * Admin → Subscription Report.
 *
 * Pick any IPO that carries subscription data and read it the way the public
 * page reads it, including the day-wise table and its hourly drill-down —
 * which `/subscription` only ever offered for issues that are open RIGHT NOW.
 * This screen's whole reason to exist is the back catalogue.
 *
 * IT RENDERS THE PUBLIC COMPONENTS, NOT ADMIN COPIES OF THEM. `IpoRow` brings
 * Share-wise, Application-wise and the lot ladder; `DayWiseSubscription`
 * brings the timeline. Re-implementing either here would put a second opinion
 * of the same figures on a second screen, which is the exact fault that had
 * the detail page and the hub disagreeing about Applications and about the
 * tone word — a shared component is the only thing that keeps them equal.
 *
 * WHAT THE DATA CAN AND CANNOT DO, measured 2026-10-22 and worth knowing
 * before anyone reports this screen as broken:
 *   · 32 IPOs carry a day-wise log, 29 of those an hourly one. A normal
 *     three-day issue keeps 3 day entries and 24 hourly buckets, so the
 *     14-day and 72-entry caps never bite and the record is complete.
 *   · 298 more carry a FINAL SNAPSHOT ONLY. `IpoSubscription` is deleted and
 *     rewritten on every poll, so their timeline was never stored and cannot
 *     be reconstructed from anything we hold.
 *   · The archive therefore begins 18 Sep 2026. Older issues show totals.
 * The picker says which of the two an issue is, so the empty timeline reads as
 * a known limit rather than a fault.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { SearchSelect, type SearchOption } from '@/components/ui/SearchSelect';
import { Icon } from '@/components/Icon';
import { IpoRow, istTodayYmd } from '@/components/SubscriptionHub';
import { DayWiseSubscription } from '@/components/DayWiseSubscription';
import { titleCase, shortName } from '@investoyard/shared-types';
import * as api from '@/lib/tenants-admin';

/** Categories in the order every other subscription surface prints them. */
const CATS: Array<[string, string]> = [
  ['qib', 'QIB'], ['nii', 'NII'], ['hni', 'HNI (10L+)'], ['hni2', 'HNI (2-10L)'],
  ['retail', 'Retail'], ['employee', 'Employee'], ['shareholder', 'Shareholder'], ['total', 'Total'],
];

const fmtDay = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}/.test(d)
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : (d ?? ''));

export default function SubscriptionReportPage() {
  const me = useOperator();
  const router = useRouter();
  const sp = useSearchParams();
  const [all, setAll] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string>(sp.get('symbol') ?? '');

  useEffect(() => {
    let alive = true;
    api.fetchAllIpos()
      .then((rows: any) => { if (alive) setAll(Array.isArray(rows) ? rows : []); })
      .catch((e: any) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, []);

  /* Only issues that HAVE subscription data (operator's choice, 2026-10-22):
     the other 977 records would be options that always render nothing.
     Newest first, because a report is almost always about a recent issue. */
  const { options, bySymbol } = useMemo(() => {
    const map = new Map<string, any>();
    const withHistory: SearchOption[] = [];
    const snapshotOnly: SearchOption[] = [];
    for (const i of all ?? []) {
      if (!Array.isArray(i.subscription) || i.subscription.length === 0) continue;
      map.set(i.symbol, i);
      const days = (i.extra?.subLog ?? []).length;
      const hours = (i.extra?.subLogHour ?? []).length;
      const opt: SearchOption = {
        value: i.symbol,
        label: `${i.symbol} — ${shortName(titleCase(i.name ?? ''))}`,
        sub: [
          i.closeDate ? `closed ${fmtDay(String(i.closeDate).slice(0, 10))}` : 'no close date',
          days ? `${days} day${days > 1 ? 's' : ''}` : null,
          hours ? `${hours} hourly point${hours > 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(' · '),
        group: days ? 'Day & hour history' : 'Final figures only',
      };
      (days ? withHistory : snapshotOnly).push(opt);
    }
    const byClose = (a: SearchOption, b: SearchOption) =>
      String(map.get(b.value)?.closeDate ?? '').localeCompare(String(map.get(a.value)?.closeDate ?? ''));
    withHistory.sort(byClose);
    snapshotOnly.sort(byClose);
    return { options: [...withHistory, ...snapshotOnly], bySymbol: map };
  }, [all]);

  const sel = symbol ? bySymbol.get(symbol) : null;
  const subLog: any[] = Array.isArray(sel?.extra?.subLog) ? sel.extra.subLog : [];
  const subLogHour: any[] = Array.isArray(sel?.extra?.subLogHour) ? sel.extra.subLogHour : [];

  const pick = useCallback((next: string) => {
    setSymbol(next);
    /* Keep the symbol in the URL so a report can be bookmarked or pasted to a
       colleague. `replace`, not `push` — stepping back through every IPO
       somebody browsed is not what the back button is for. */
    router.replace(next ? `/admin/subscription-report?symbol=${encodeURIComponent(next)}` : '/admin/subscription-report');
  }, [router]);

  /* CSV of exactly what is on screen: the day rows and, indented beneath each,
     its hourly points — one file rather than two, with a `Scope` column, so a
     sheet can filter it either way. BOM first: without it Excel reads the
     system codepage and mangles any non-ASCII name. */
  const downloadCsv = useCallback(() => {
    if (!sel) return;
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Scope', 'Date', 'Time',
      ...CATS.map(([, l]) => `${l} (times)`),
      ...CATS.map(([, l]) => `${l} (applications)`)];
    const row = (scope: string, e: any) => [
      scope, e.d ?? '', e.t ?? '',
      ...CATS.map(([k]) => (e[k] ?? '') === '' ? '' : e[k]),
      ...CATS.map(([k]) => e.apps?.[k]?.n ?? ''),
    ];
    const lines = [head];
    for (const d of subLog) {
      lines.push(row('Day', d));
      for (const h of subLogHour.filter((x) => x.d === d.d)) lines.push(row('Hour', h));
    }
    const csv = '﻿' + lines.map((l) => l.map(esc).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `subscription-${sel.symbol}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [sel, subLog, subLogHour]);

  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;

  return (
    <div>
      <PageHead
        title="Subscription Report"
        sub="Day-wise and hour-wise subscription for any IPO we have polled. Older issues carry their final figures only."
      />

      <div className="filter-row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 280, maxWidth: 520 }}>
          <label>IPO</label>
          <SearchSelect
            options={options}
            value={symbol}
            onChange={pick}
            placeholder={all ? `Search ${options.length} IPOs with subscription data…` : 'Loading…'}
            disabled={!all}
          />
        </div>
        {sel && subLog.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={downloadCsv} style={{ marginBottom: 18 }}>
            <Icon name="download" size={15} /> Download CSV
          </button>
        )}
      </div>

      {err && <div className="banner bad">Could not load the IPO list — {err}</div>}
      {!all && !err && <Loader />}

      {all && !sel && (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
          Pick an IPO above to see its subscription.
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {options.length} issues have subscription data — those with a stored timeline are listed first.
          </div>
        </div>
      )}

      {sel && (
        /* The public classes, so this reads exactly as /subscription/v2 does. */
        <div className="subv2 subv2-solo">
          <div className="subv2-list">
            <IpoRow ipo={sel as any} today={istTodayYmd()} detailLink={false} />
          </div>

          {subLog.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <DayWiseSubscription subLog={subLog} subLogHour={subLogHour} closeDate={sel.closeDate} />
            </div>
          ) : (
            /* Not a failure, and it says so. This issue closed before the
               poller began storing a timeline, and `IpoSubscription` keeps only
               the latest snapshot — so there is nothing to recover. */
            <div className="card" style={{ marginTop: 14, padding: 18 }}>
              <b>No day-wise history for this issue.</b>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                The figures above are its final subscription. Day-wise and hour-wise history is stored
                only from <b>18 September 2026</b> onwards; for earlier issues it was never recorded and
                cannot be reconstructed.
              </div>
            </div>
          )}

          {subLog.length > 0 && subLogHour.length === 0 && (
            <div className="banner" style={{ marginTop: 12 }}>
              Day-wise only — no hourly points were stored for this issue.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
