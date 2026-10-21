'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * THE FIFTH TAB IS A DIFFERENT KIND OF THING, and the type says so.
 *
 * The first four are groupings of one summary query; `visits` is the
 * visit-by-visit list behind them — paged, with the IP and the signed-in
 * reader. It shares the toolbar (same window, same page filter, same bots
 * switch) because *"who were those 59 people"* is a question asked of the
 * range already on screen.
 */
type View = api.VisitorsBy | 'visits';
const TABS: [View, string][] = [
  ['day', 'By day'], ['hour', 'By hour'], ['page', 'By page'], ['symbol', 'By IPO'],
  ['visits', 'Visitors'],
];

/** A visit time, in the operator's own zone. */
const fmtAt = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
};
/** Quick ranges, alongside the explicit from/to the operator asked for. */
const QUICK: [number, string][] = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];

/** Today in IST — the report's days are the operator's days, so the picker's are too. */
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
function istDaysAgo(n: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date(Date.now() - n * 86_400_000));
}
const fmt = (n: number) => n.toLocaleString('en-IN');

/**
 * Visitors on the subscription pages (operator ask, 2026-10-21).
 *
 * Follows the Partner API Calls report deliberately — same toolbar outside the
 * card, same `.card-head` with a count badge, same segmented tabs, same
 * CSV-per-grouping. A second report that looks like a different product is a
 * second thing to learn.
 */
export default function VisitorsReportPage() {
  const me = useOperator();
  const [view, setView] = useState<View>('day');
  /* The grouping the summary query uses. Held through a trip to the Visitors
     tab so coming back does not lose where the operator was. */
  const by: api.VisitorsBy = view === 'visits' ? 'day' : view;
  const [from, setFrom] = useState(istDaysAgo(29));
  const [to, setTo] = useState(istToday());
  const [path, setPath] = useState('');
  const [bots, setBots] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [data, setData] = useState<api.VisitorReport | null>(null);
  const [visits, setVisits] = useState<api.VisitList | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useMemo<api.VisitorQuery>(
    () => ({ from, to, by, path: path || undefined, bots: bots ? '1' : undefined }),
    [from, to, by, path, bots],
  );

  const load = useCallback(() => {
    setBusy(true);
    api.fetchVisitors(query)
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, [query]);
  useEffect(() => { load(); }, [load]);

  /* ONLY THE OPEN TAB FETCHES — the rule the Partner API summary tabs follow.
     The detail list is the expensive one and nobody should pay for it while
     reading the day chart. */
  useEffect(() => {
    if (view !== 'visits') return;
    let dead = false;
    setBusy(true);
    api.fetchVisits({ ...query, page })
      .then((d) => { if (!dead) { setVisits(d); setErr(null); } })
      .catch((e) => { if (!dead) setErr(String(e?.message ?? e)); })
      .finally(() => { if (!dead) setBusy(false); });
    return () => { dead = true; };
  }, [view, query, page]);

  /* A filter change takes the reader back to page 1: page 4 of a different
     range is a different set of rows, and landing past the end shows an
     empty table under a total that says there is plenty. */
  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { api.fetchVisitorPaths().then((r) => setPaths(r.paths)).catch(() => {}); }, []);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'dashboard.view')) return <NoAccess />;

  const rows = data?.rows ?? [];

  return (
    <>
      <PageHead
        title="Visitors"
        sub="Who reads the subscription pages, by date and hour. A visitor is counted once per bucket."
      />

      <div className="filter-row">
        <div className="field">
          <label>From</label>
          <input type="date" className="input mono" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" className="input mono" value={to} min={from} max={istToday()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field">
          <label>Page</label>
          <select className="input" value={path} onChange={(e) => setPath(e.target.value)}>
            <option value="">All tracked pages</option>
            {paths.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Quick range</label>
          <div className="seg">
            {QUICK.map(([d, label]) => (
              <button
                key={d}
                type="button"
                className={from === istDaysAgo(d - 1) && to === istToday() ? 'on' : ''}
                onClick={() => { setFrom(istDaysAgo(d - 1)); setTo(istToday()); }}
              >{label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <label className="auth-pair" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} />
            <span>Include bots</span>
          </label>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button type="button" className="btn btn-secondary" onClick={() => api.exportVisitorsCsv(query).catch((e) => setErr(String(e?.message ?? e)))}>
            <Icon name="download" size={14} /> CSV
          </button>
        </div>
      </div>

      {err && <div className="banner bad" style={{ fontSize: 13 }}>{err}</div>}

      <div className="card">
        <div className="card-head">
          <h3>
            {TABS.find(([k]) => k === view)?.[1]}
            {view === 'visits' ? (
              <span className="count-badge">{fmt(visits?.total ?? 0)} visits</span>
            ) : (
              <>
                <span className="count-badge">{fmt(data?.total.visitors ?? 0)} visitors</span>
                <span className="count-badge">{fmt(data?.total.views ?? 0)} views</span>
              </>
            )}
          </h3>
          <div className="seg">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
        </div>

        {view === 'visits' ? (
          busy && !visits ? <Loader /> : (visits?.rows.length ?? 0) === 0 ? (
            <div className="muted" style={{ padding: '26px 18px', fontSize: 13 }}>
              No visits recorded in this range.
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>When (IST)</th>
                    <th>Page</th>
                    <th>IPO</th>
                    <th>IP address</th>
                    <th>Signed in as</th>
                    <th style={{ textAlign: 'right' }}>Views</th>
                  </tr>
                </thead>
                <tbody>
                  {visits!.rows.map((r, i) => (
                    <tr key={`${r.at}-${r.path}-${r.symbol ?? ''}-${i}`}>
                      <td className="mono">{fmtAt(r.at)}</td>
                      <td className="mono">{r.path}</td>
                      <td className="mono">{r.symbol || <span className="muted">—</span>}</td>
                      {/* An address cleared by the retention sweep reads as
                          "not held any more", never as a visit with no IP. */}
                      <td className="mono">{r.ip || <span className="muted" title={`Cleared after the retention window`}>not held</span>}</td>
                      <td>
                        {r.name || r.mobile4 ? (
                          <>
                            {r.name || <span className="muted">(no name)</span>}
                            {r.mobile4 && <span className="muted mono" style={{ marginLeft: 6 }}>&bull;&bull;&bull;&bull;{r.mobile4}</span>}
                          </>
                        ) : (
                          <span className="muted">Not signed in</span>
                        )}
                        {r.bot && <span className="st" style={{ marginLeft: 8 }}>bot</span>}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(r.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visits!.pages > 1 && (
                <div className="filter-row" style={{ padding: '12px 18px', marginBottom: 0, alignItems: 'center' }}>
                  <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
                    <Icon name="chevron-left" size={14} /> Newer
                  </button>
                  <span className="muted" style={{ fontSize: 12.5 }}>Page {fmt(visits!.page)} of {fmt(visits!.pages)}</span>
                  <button type="button" className="btn btn-secondary" disabled={page >= visits!.pages} onClick={() => setPage((n) => n + 1)}>
                    Older <Icon name="chevron-right" size={14} />
                  </button>
                </div>
              )}
            </>
          )
        ) : busy && !data ? <Loader /> : rows.length === 0 ? (
          <div className="muted" style={{ padding: '26px 18px', fontSize: 13 }}>
            Nothing recorded in this range.{' '}
            {bots ? '' : 'Crawlers are excluded — tick Include bots if you expected traffic here.'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{by === 'day' ? 'Date' : by === 'hour' ? 'Hour (IST)' : by === 'page' ? 'Page' : 'IPO'}</th>
                <th style={{ textAlign: 'right' }}>Visitors</th>
                <th style={{ textAlign: 'right' }}>Views</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bucket || '(none)'}>
                  <td className="mono">{r.label || '(no IPO)'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(r.visitors)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(r.views)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tbl-total">
                <td>Total (unique)</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(data?.total.visitors ?? 0)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(data?.total.views ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/*
        * THE TOTAL IS NOT THE COLUMN SUM, AND SAYING SO IS THE POINT. A visitor
        * seen in three different hours is three rows in the hourly view and one
        * person; summing the column would count them three times. Across DAYS
        * the two agree, because the identifier rotates at IST midnight and
        * yesterday's can never equal today's. A total that quietly disagrees
        * with its own column is a bug; one that says why is a measurement.
        */}
      {view === 'visits' ? (
        /*
         * THE RETENTION WINDOW IS STATED WHERE THE DATA IS READ, not only in
         * a policy document. An operator looking at a list of IP addresses
         * should be able to see from the screen how long they are kept and
         * what survives afterwards.
         */
        <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
          One row per visitor per hour, newest first. <b>IP addresses and names are kept for 90 days</b>
          {' '}and then cleared; the visit and its counts stay, so the figures above are unaffected by the
          sweep. A reader shows a name only while signed in — these pages are public and most are not.
          A mobile number is shown as its last four digits, the same way the message log does it.
        </p>
      ) : (
      <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
        <b>Total (unique)</b> counts each visitor once across the whole range, so it is smaller than
        the Visitors column adds to when grouped by hour. A visitor who returns on another day counts
        again: the identifier rotates at midnight IST, which is what lets us measure this without
        placing a cookie or any other marker on anybody&rsquo;s device.
        Figures come from the page itself, so an ad-blocker can suppress one — expect these to read a
        little under the raw server log, which in turn reads high because it counts crawlers.
      </p>
      )}
    </>
  );
}
