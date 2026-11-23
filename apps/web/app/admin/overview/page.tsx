'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { PartnerBranchFilter } from '@/components/admin/Filters';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';
import { getRecentIposEnriched } from '@/lib/api';
import {
  stageOf, stageLabel, toneOf, compareForList, subscriptionTable, shortName,
  istToday, istDaysUntil, istClock, type IpoListItem, type Stage,
} from '@investoyard/shared-types';

/*
 * THE ADMIN DASHBOARD (rebuilt 2026-11-23, operator + business-head brief).
 *
 * One screen that answers "what needs me today". The old one read the dead
 * Ipo.status column (0 live while two issues were open), counted partner-printed
 * forms as applications, showed "₹34.5 Cr in flight" for paper forms whose money
 * we never hold, and cut its days at 5:30 am.
 *
 * WHERE EACH FIGURE COMES FROM, so nobody has to guess:
 *  - which IPOs are in play, their stage, subscription and applications: the
 *    enriched IPO list and the shared resolvers the public pages use — so the
 *    dashboard cannot disagree with /subscription;
 *  - forms, bids, partner calls, refusals, form numbers left, readers, sign-ups,
 *    messages and system state: GET /admin/dashboard/:slug (DashboardService).
 * Every day is an India day. Partner admins see the same layout limited to
 * their own data; the platform blocks only appear for a platform operator.
 */

const IST_MS = 330 * 60_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const n = (x: number) => x.toLocaleString('en-IN');
const istDayOf = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10);
const dayLabel = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;
const addDay = (ymd: string, k: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
/** "today 3:52 pm" · "yesterday 9 am" · "21 Nov 4:10 pm" — always India time. */
function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = istDayOf(iso), t = istClock(Date.parse(iso)) ?? '';
  const today = istToday();
  if (d === today) return `today ${t}`;
  if (d === addDay(today, -1)) return `yesterday ${t}`;
  return `${dayLabel(d)} ${t}`;
}
function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
function dateRange(o?: string, c?: string): string {
  if (!o || !c) return o ? `opens ${dayLabel(o)}` : '—';
  return o.slice(0, 7) === c.slice(0, 7)
    ? `${Number(o.slice(8))}–${Number(c.slice(8))} ${MON[Number(c.slice(5, 7)) - 1]}`
    : `${dayLabel(o)} – ${dayLabel(c)}`;
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

const LIVE_STAGES: Stage[] = ['closingtoday', 'opentoday', 'live'];

type Chip = { tone: 'bad' | 'warn' | 'mut' | 'ok'; text: string; title?: string };
interface PlayRow {
  ipo: any; stage: Stage; label: string; tone: string;
  why: 'live' | 'opening' | 'allotment' | 'listing';
  times: number | null; bids: number | null; asOf: string | null;
  gmp: number | null; startPrint: boolean; startBid: boolean;
  forms: { all: number; today: number }; chips: Chip[];
}

/** Everything about one IPO that needs a person, worded as what to do. */
function readinessOf(ipo: any, stage: Stage, hasTable: boolean, play: api.DashData['inPlay'][string] | undefined, platformView: boolean): Chip[] {
  const ex = ipo.extra ?? {};
  const live = LIVE_STAGES.includes(stage);
  const out: Chip[] = [];
  if (play?.refusedToday) out.push({ tone: 'bad', text: `${play.refusedToday} partner call${play.refusedToday === 1 ? '' : 's'} refused today` });
  if (live && ex.startPrint !== true) out.push({ tone: 'bad', text: 'Printing is off', title: 'Partners asking to print this IPO are refused. Turn Start Print on in IPO Operations.' });
  const s = play?.series;
  if (s && s.left <= 0) out.push({ tone: 'bad', text: 'Form numbers used up', title: `The ${s.kind} series of ${n(s.size)} numbers is finished — new prints get no form number.` });
  else if (s && s.left <= Math.max(200, s.size * 0.05)) out.push({ tone: 'warn', text: `${n(s.left)} form numbers left`, title: `${s.kind} series, ${n(s.size)} numbers in all.` });
  else if (!s && ex.startPrint === true) out.push({ tone: 'warn', text: 'No form-number series', title: 'Printing is on but no form-number range is set — forms print without a number.' });
  if (platformView) {
    if (!hasTable) out.push({ tone: 'bad', text: 'No reservation table', title: 'Without the reservation split the poller cannot work out subscription, and a bidding day that passes cannot be recovered.' });
    const docs: any[] = Array.isArray(ipo.documents) ? ipo.documents : [];
    if ((live || ex.startPrint === true) && !docs.some((d) => typeof d?.type === 'string' && d.type.startsWith('asba_form') && d.url)) {
      out.push({ tone: 'warn', text: 'No ASBA form template', title: 'Upload the blank ASBA form so printed forms are filled on the real template.' });
    }
    const log: any[] = Array.isArray(ex.gmpLog) ? ex.gmpLog : [];
    if (live && log[log.length - 1]?.d !== istToday()) out.push({ tone: 'warn', text: 'No GMP today', title: log.length ? `Last entered ${dayLabel(String(log[log.length - 1].d))}.` : 'No GMP has been entered for this IPO.' });
  }
  return out;
}

function buildPlay(ipos: IpoListItem[], dash: api.DashData | null): PlayRow[] {
  const today = istToday();
  const rows: PlayRow[] = [];
  for (const raw of ipos) {
    const ipo: any = raw;
    const stage = stageOf(ipo);
    let why: PlayRow['why'] | null = null;
    if (LIVE_STAGES.includes(stage)) why = 'live';
    else if ((stage === 'upcoming' || stage === 'preapply')) { const d = istDaysUntil(ipo.openDate); if (d != null && d >= 0 && d <= 7) why = 'opening'; }
    if (!why && ipo.allotmentDate === today) why = 'allotment';
    if (!why && ipo.listingDate === today) why = 'listing';
    if (!why) continue;
    const table = subscriptionTable(ipo);
    const play = dash?.inPlay[ipo.symbol];
    rows.push({
      ipo, stage, label: stageLabel(ipo), tone: toneOf(ipo), why,
      times: table?.total?.times ?? null,
      bids: table?.total?.bidCount ?? null,
      asOf: ipo.subscriptionAsOf ?? null,
      gmp: typeof ipo.gmp === 'number' ? ipo.gmp : null,
      startPrint: ipo.extra?.startPrint === true, startBid: ipo.extra?.startBid === true,
      forms: { all: play?.formsAll ?? 0, today: play?.formsToday ?? 0 },
      chips: readinessOf(ipo, stage, !!table, play, !!dash?.platformView),
    });
  }
  return rows.sort((a, b) => compareForList(a.ipo, b.ipo));
}

function Tile({ icon, label, value, sub, tone, href }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string; sub: React.ReactNode; tone?: 'brand' | 'pos' | 'blue' | 'gold'; href?: string }) {
  const body = (
    <>
      <div className="db-tile-top"><span className={`db-tile-ic ${tone ?? 'brand'}`}><Icon name={icon} size={18} /></span><span className="db-tile-l">{label}</span></div>
      <div className="db-tile-n mono">{value}</div>
      <div className="db-tile-s">{sub}</div>
    </>
  );
  return href ? <a className="db-tile" href={href}>{body}</a> : <div className="db-tile">{body}</div>;
}

/** Forms printed per India day, as columns with the figure on the tallest and on today. */
function FormsChart({ byDay }: { byDay: api.DashData['forms']['byDay'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const hasBids = byDay.some((d) => d.bids > 0);
  const max = Math.max(1, ...byDay.map((d) => d.forms + d.bids));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = [1, 2, 2.5, 5, 10].map((m) => m * step).find((v) => v >= max) ?? max;
  const peak = byDay.reduce((best, d, i) => (d.forms + d.bids > byDay[best].forms + byDay[best].bids ? i : best), 0);
  const last = byDay.length - 1;
  const every = byDay.length <= 10 ? 1 : byDay.length <= 31 ? 5 : 15;
  const total = byDay.reduce((s, d) => s + d.forms, 0);
  return (
    <div className="db-chart">
      {hasBids && <div className="db-legend"><span><i className="db-sw forms" />Forms printed</span><span><i className="db-sw bids" />Online bids</span></div>}
      <div className="db-plot" role="img" aria-label={`Forms printed per day: ${n(total)} over ${byDay.length} days, most on ${dayLabel(byDay[peak].day)} (${n(byDay[peak].forms)}).`} onMouseLeave={() => setHover(null)}>
        <div className="db-grid" aria-hidden="true">
          {[top, top / 2, 0].map((v) => <div key={v} className="db-gl"><span>{n(Math.round(v))}</span></div>)}
        </div>
        <div className="db-cols">
          {byDay.map((d, i) => {
            const v = d.forms + d.bids;
            const showVal = v > 0 && (i === peak || (i === last && byDay.length <= 31));
            return (
              <div key={d.day} className={`db-col${hover === i ? ' on' : ''}`} onMouseEnter={() => setHover(i)}>
                <div className="db-stack" style={{ height: `${(v / top) * 100}%` }}>
                  {showVal && <span className="db-val">{n(v)}</span>}
                  {d.bids > 0 && <span className="db-seg bids" style={{ flexGrow: d.bids }} />}
                  {d.forms > 0 && <span className="db-seg forms" style={{ flexGrow: d.forms }} />}
                </div>
                <span className="db-x">{i % every === 0 || i === last ? (i === last ? 'Today' : dayLabel(d.day)) : ''}</span>
              </div>
            );
          })}
        </div>
        {hover != null && (
          <div className="db-tip" style={{ left: `${((hover + 0.5) / byDay.length) * 100}%` }}>
            <b>{hover === last ? 'Today' : dayLabel(byDay[hover].day)}</b>
            <span>{n(byDay[hover].forms)} forms printed</span>
            {hasBids && <span>{n(byDay[hover].bids)} online bids</span>}
          </div>
        )}
      </div>
      <details className="db-tbl-toggle">
        <summary>Show as a table</summary>
        <table className="table db-mini">
          <thead><tr><th>Day</th><th className="r">Forms printed</th>{hasBids && <th className="r">Online bids</th>}</tr></thead>
          <tbody>{[...byDay].reverse().map((d) => <tr key={d.day}><td>{dayLabel(d.day)}</td><td className="r mono">{n(d.forms)}</td>{hasBids && <td className="r mono">{n(d.bids)}</td>}</tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

const REFUSAL_TEXT: Record<api.RefusalKind, (sym: string | null) => string> = {
  'print-off': (s) => `Printing was off for ${s ?? 'an IPO'}`,
  'not-in-catalogue': (s) => `${s ?? 'An IPO'} was not in our catalogue`,
  'api-off': () => 'A partner with the API switched off called it',
  scope: () => 'Called an API the key or account is not allowed',
  limit: () => 'Went over a limit',
  other: () => 'Other refusals',
};

export default function AdminOverview() {
  const me = useOperator();
  const home = me?.homeTenant.slug ?? 'investoyard-platform';
  const [scope, setScope] = useState(home);
  const [days, setDays] = useState(7);
  const [dash, setDash] = useState<api.DashData | null>(null);
  const [ipos, setIpos] = useState<IpoListItem[] | null>(null);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [iposErr, setIposErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  /** The daily subscription check and the feed watch — shown only when the alert list is not available to this operator. */
  const [readiness, setReadiness] = useState<api.SubscriptionReadiness | null>(null);
  /** Operator alerts — platform operators only (the API refuses anyone else). */
  const [alerts, setAlerts] = useState<api.AlertList | null>(null);
  const live = useRef({ scope, days });
  live.current = { scope, days };

  const load = useCallback(async () => {
    const { scope: s, days: d } = live.current;
    await Promise.all([
      api.fetchDashboard(s, d).then(async (x) => {
        setDash(x); setErr(null);
        if (x.platformView) {
          await Promise.all([
            api.fetchAlerts().then(setAlerts).catch(() => setAlerts(null)),
            api.fetchSubscriptionReadiness().then(setReadiness).catch(() => setReadiness(null)),
          ]);
        } else { setAlerts(null); setReadiness(null); }
      }).catch((e) => setErr(String(e?.message ?? e))),
      getRecentIposEnriched(30).then((x) => { setIpos(x); setIposErr(null); }).catch((e) => setIposErr(String(e?.message ?? e))),
    ]);
    setLoadedAt(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => { api.fetchTree().then(setTree).catch(() => {}); }, []);
  useEffect(() => { void load(); }, [load, scope, days]);
  /* Refresh every minute while the page is open and visible: an alert or a
     refused partner call should not wait for someone to reload. */
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const play = useMemo(() => (ipos ? buildPlay(ipos, dash) : []), [ipos, dash]);

  if (!operatorCan(me, 'dashboard.view')) return <NoAccess />;

  const pv = !!dash?.platformView;
  const liveRows = play.filter((r) => r.why === 'live');
  const opening = play.filter((r) => r.why === 'opening');
  const attention = play.filter((r) => r.chips.some((c) => c.tone === 'bad')).length;
  const symbols = new Set((ipos ?? []).map((i: any) => i.symbol));
  const printOn = new Map((ipos ?? []).map((i: any) => [i.symbol, i.extra?.startPrint === true]));
  const quiet = (dash?.partners ?? []).filter((p) => p.quiet);
  const partnersShown = (dash?.partners ?? []).filter((p) => p.apiOn || p.calls > 0 || p.forms30 > 0);
  const partnersHidden = (dash?.partners.length ?? 0) - partnersShown.length;

  return (
    <div className="db">
      <PageHead
        title="Dashboard"
        sub={`${dayLabel(istToday())} · ${dash ? (pv ? 'Whole platform' : dash.scope.name) : '…'}${loadedAt ? ` · updated ${istClock(loadedAt)}, refreshes every minute` : ''}`}
        actions={
          <div className="db-actions">
            {(me?.isSuperAdmin ? tree.some((t) => t.type === 'partner') : tree.some((t) => t.type === 'branch')) && <PartnerBranchFilter tree={tree} homeSlug={home} onScope={(s) => setScope(s)} />}
            <div className="filter">
              <span className="fl">Period</span>
              <div className="seg" role="group" aria-label="Period">
                {[7, 30, 90].map((d) => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
              </div>
            </div>
          </div>
        }
      />

      {err && <div className="banner bad" style={{ marginBottom: 16 }}><span>The dashboard could not load: {err}</span></div>}

      {/* Alerts first: the only things here that lose data while nobody looks. */}
      {dash?.platformView && (alerts ? <AlertsCard data={alerts} /> : <><SubscriptionWatch data={readiness} /><FeedWatch data={readiness} /></>)}

      {!dash ? <Loader /> : (
        <>
          {dash.status && <StatusStrip s={dash.status} />}

          <div className="db-tiles">
            <Tile icon="trending" tone="pos" label="Live now" href="#in-play"
              value={ipos ? String(liveRows.length) : '…'}
              sub={liveRows.length ? <>{liveRows.filter((r) => r.stage === 'closingtoday').length ? <><b>{liveRows.filter((r) => r.stage === 'closingtoday').map((r) => r.ipo.symbol).join(', ')}</b> {liveRows.filter((r) => r.stage === 'closingtoday').length === 1 ? 'closes' : 'close'} today</> : <>next close <b>{dayLabel(liveRows[0].ipo.closeDate)}</b></>}</> : 'No IPO is open today'} />
            <Tile icon="calendar" label="Opening in 7 days" href="#in-play"
              value={ipos ? String(opening.length) : '…'}
              sub={opening.length ? <>next <b>{opening[0].ipo.symbol}</b> on {dayLabel(opening[0].ipo.openDate)}</> : 'None scheduled'} />
            <Tile icon="doc" tone="blue" label="Forms printed today"
              value={n(dash.forms.today)}
              sub={<><b>{n(dash.forms.window)}</b> in {dash.window.days} days · online bids <b>{n(dash.bids.live.today)}</b></>} />
            {dash.readers ? (
              <Tile icon="users" tone="gold" label="Subscription readers today" href="/admin/reports/visitors"
                value={n(dash.readers.today.people)}
                sub={<><b>{n(dash.readers.liveNow)}</b> on the pages now · yesterday <b>{n(dash.readers.yesterday.people)}</b></>} />
            ) : (
              <Tile icon="exchange" tone="gold" label="API calls today" href="/admin/partner-api/calls"
                value={n(dash.calls.today)}
                sub={dash.calls.refusedToday ? <><b>{n(dash.calls.refusedToday)}</b> refused</> : 'none refused'} />
            )}
          </div>

          {/* ---------- IPOs in play ---------- */}
          <div className="card db-card" id="in-play">
            <div className="card-head">
              <span className="t">IPOs in play <span className="count-badge">{play.length}</span>{attention > 0 && <span className="st bad">{attention} need attention</span>}</span>
              {pv && <a className="linklike" href="/admin/catalog/operations">IPO Operations →</a>}
            </div>
            {iposErr ? <div className="card-pad"><span className="muted">The IPO list could not load: {iposErr}</span></div>
              : !ipos ? <Loader />
              : play.length === 0 ? <div className="card-pad muted">No IPO is open, opening in the next 7 days, or has allotment or listing today.</div>
              : (
                <div className="db-scroll">
                  <table className="table db-play">
                    <thead>
                      <tr>
                        <th>IPO</th><th>Status</th><th className="r">Subscribed</th>{pv && <th className="r">Exp. Premium</th>}
                        <th className="r">Forms printed</th><th>Print · Bid</th><th>Needs attention</th>
                      </tr>
                    </thead>
                    <tbody>
                      {play.map((r) => (
                        <tr key={r.ipo.symbol}>
                          <td>
                            <a className="db-ipo" href={`/admin/catalog/view?id=${r.ipo.id}`} title={r.ipo.name}>{shortName(r.ipo.name)}</a>
                            <div className="db-sub"><span className="mono">{r.ipo.symbol}</span> · {r.ipo.type === 'sme' ? 'SME' : 'Mainboard'}</div>
                          </td>
                          <td>
                            <span className={`status t-${r.tone}`}>{r.label}</span>
                            <div className="db-sub">{r.why === 'allotment' ? 'Allotment today' : r.why === 'listing' ? 'Listing today' : dateRange(r.ipo.openDate, r.ipo.closeDate)}</div>
                          </td>
                          <td className="r">
                            {r.times != null ? <b className="mono">{r.times.toFixed(2)}×</b> : <span className="muted">—</span>}
                            <div className="db-sub">{r.bids != null ? `${n(r.bids)} applications` : r.times != null ? '' : r.why === 'opening' ? 'not open yet' : 'no figures'}</div>
                            {r.asOf && r.times != null && <div className="db-sub">updated {ago(r.asOf)}</div>}
                          </td>
                          {pv && <td className="r mono">{r.gmp != null ? `${r.gmp > 0 ? '+' : r.gmp < 0 ? '−' : ''}₹${Math.abs(r.gmp)}` : <span className="muted">—</span>}</td>}
                          <td className="r">
                            <b className="mono">{n(r.forms.all)}</b>
                            <div className="db-sub">{r.forms.today ? `${n(r.forms.today)} today` : 'none today'}</div>
                          </td>
                          <td>
                            <span className={`db-gate${r.startPrint ? ' on' : ''}`} title={r.startPrint ? 'Start Print is on' : 'Start Print is off'}>Print</span>
                            <span className={`db-gate${r.startBid ? ' on' : ''}`} title={r.startBid ? 'Start Bid is on' : 'Start Bid is off'}>Bid</span>
                          </td>
                          <td>
                            {r.chips.length === 0 ? <span className="st ok">Ready</span> : (
                              <div className="db-chips">{r.chips.map((c) => <span key={c.text} className={`st ${c.tone}`} title={c.title}>{c.text}</span>)}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          {/* ---------- refusals + trend ---------- */}
          <div className="db-row2">
            <div className="card db-card">
              <div className="card-head">
                <span className="t">Partner refusals {dash.refusals.refused24h > 0 && <span className="st bad">{n(dash.refusals.refused24h)} in 24 h</span>}</span>
                <a className="linklike" href="/admin/partner-api/calls">API Calls →</a>
              </div>
              <div className="card-pad">
                <p className="db-lead">
                  Last 24 hours: <b>{n(dash.refusals.refused24h)}</b> of {n(dash.refusals.calls24h)} calls refused.
                  {' '}Last {dash.window.days} days: <b>{n(dash.refusals.refusedWindow)}</b> of {n(dash.refusals.callsWindow)}
                  {dash.refusals.callsWindow > 0 && <> ({pct(dash.refusals.refusedWindow, dash.refusals.callsWindow)}%)</>}.
                </p>
                {dash.refusals.groups.length === 0 ? <p className="db-ok"><Icon name="check" size={15} /> No partner call was refused in the last {dash.window.days} days.</p> : (
                  <ul className="db-ref">
                    {dash.refusals.groups.map((g) => {
                      const fixed = g.kind === 'not-in-catalogue' ? !!g.symbol && symbols.has(g.symbol)
                        : g.kind === 'print-off' ? !!g.symbol && printOn.get(g.symbol) === true : false;
                      return (
                        <li key={`${g.kind}-${g.symbol}-${g.reason}`}>
                          <div className="db-ref-top">
                            <b>{g.kind === 'other' ? g.reason : REFUSAL_TEXT[g.kind](g.symbol)}</b>
                            {fixed ? <span className="st ok">{g.kind === 'print-off' ? 'Printing is on now' : 'Added since'}</span>
                              : !pv ? null
                              : g.kind === 'print-off' ? <a className="linklike" href="/admin/catalog/operations">Turn printing on →</a>
                              : g.kind === 'not-in-catalogue' ? <a className="linklike" href="/admin/catalog/new">Add the IPO →</a>
                              : g.kind === 'api-off' || g.kind === 'scope' ? <a className="linklike" href="/admin/partner-api/access">API Access →</a> : null}
                          </div>
                          <div className="db-sub">
                            {n(g.countWindow)} in {dash.window.days} days{g.count24h ? <> · <b>{n(g.count24h)}</b> in the last 24 h</> : ''} · {g.partners.join(', ')} · last {when(g.lastAt)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="card db-card">
              <div className="card-head">
                <span className="t">Forms printed — last {dash.window.days} days <span className="count-badge">{n(dash.forms.window)}</span></span>
                <a className="linklike" href="/admin/partner-api/prints">Print report →</a>
              </div>
              <div className="card-pad">
                <FormsChart byDay={dash.forms.byDay} />
                {dash.forms.byIpo.length > 0 && (
                  <div className="db-byipo">
                    <div className="db-h">Most forms this period</div>
                    {dash.forms.byIpo.map((r) => (
                      <div key={r.symbol} className="db-bar">
                        <span className="nm" title={r.name}><span className="mono">{r.symbol}</span> <span className="muted">{shortName(r.name)}</span></span>
                        <span className="vv mono">{n(r.forms)}</span>
                        <span className="tr"><i style={{ width: `${(r.forms / dash.forms.byIpo[0].forms) * 100}%` }} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------- partner activity ---------- */}
          {dash.partners.length > 0 && (
            <div className="card db-card">
              <div className="card-head">
                <span className="t">Partner activity <span className="count-badge">{partnersShown.length}</span></span>
                <a className="linklike" href={pv ? '/admin/partner-api/access' : '/admin/partner-api/keys'}>{pv ? 'API Access →' : 'API Keys →'}</a>
              </div>
              {partnersShown.length === 0 ? <div className="card-pad muted">No partner has the API switched on or printed a form in 30 days.</div> : (
                <div className="db-scroll">
                  <table className="table db-partners">
                    <thead>
                      <tr><th>Partner</th><th>API</th><th className="r">Forms today</th><th className="r">Forms {dash.window.days} days</th>{dash.window.days !== 30 && <th className="r">Forms 30 days</th>}<th className="r">Calls {dash.window.days} days</th><th className="r">Refused</th><th>Last call</th></tr>
                    </thead>
                    <tbody>
                      {partnersShown.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {pv ? <a className="db-ipo" href={`/admin/tenants/view?slug=${encodeURIComponent(p.slug)}`}>{p.name}</a> : <b>{p.name}</b>}
                            <div className="db-sub">{p.code ? <span className="mono">{p.code}</span> : null}{p.type === 'branch' ? ` · branch of ${p.parentName ?? '—'}` : ''}{p.quiet && <> · <span className="db-quiet">quiet</span></>}</div>
                          </td>
                          <td>
                            <span className={`st ${p.apiOn ? 'ok' : 'mut'}`}>{p.apiOn ? 'On' : 'Off'}</span>
                            <div className="db-sub">{p.keysLive + p.keysTest ? `${p.keysLive} live · ${p.keysTest} test key${p.keysLive + p.keysTest === 1 ? '' : 's'}` : 'no keys'}</div>
                          </td>
                          <td className="r mono">{n(p.formsToday)}</td>
                          <td className="r mono">{n(p.formsWindow)}</td>
                          {dash.window.days !== 30 && <td className="r mono">{n(p.forms30)}</td>}
                          <td className="r mono">{n(p.calls)}</td>
                          <td className="r">{p.refused ? <><b className="mono db-neg">{n(p.refused)}</b><div className="db-sub">{pct(p.refused, p.calls)}%</div></> : <span className="mono muted">0</span>}</td>
                          <td><span title={p.lastCallAt ? when(p.lastCallAt) : undefined}>{ago(p.lastCallAt)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {partnersHidden > 0 && <div className="db-foot">{partnersHidden} partner{partnersHidden === 1 ? '' : 's'} with the API off and no forms in 30 days not shown.</div>}
            </div>
          )}

          {/* ---------- quiet partners · pipeline · online bids ---------- */}
          <div className={`db-row3${pv ? '' : ' one'}`}>
            {pv && (
              <div className="card db-card">
                <div className="card-head"><span className="t">Partners gone quiet {quiet.length > 0 && <span className="st warn">{quiet.length}</span>}</span></div>
                <div className="card-pad">
                  {quiet.length === 0 ? <p className="db-ok"><Icon name="check" size={15} /> Every partner with the API on has called in the last 7 days.</p> : (
                    <ul className="db-list">
                      {quiet.map((p) => (
                        <li key={p.id}>
                          <a className="db-ipo" href={`/admin/tenants/view?slug=${encodeURIComponent(p.slug)}`}>{p.name}</a>
                          <div className="db-sub">API on · {p.keysLive} live, {p.keysTest} test key{p.keysLive + p.keysTest === 1 ? '' : 's'} · {p.lastCallAt ? `last call ${ago(p.lastCallAt)}` : 'has never called'}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {pv && dash.pipeline && (
              <div className="card db-card">
                <div className="card-head"><span className="t">Partner pipeline</span><a className="linklike" href="/admin/tenants/applications">Applications →</a></div>
                <div className="card-pad">
                  <div className="db-kv">
                    <div><span>Waiting for review</span><b className={dash.pipeline.waiting ? 'db-warn' : ''}>{n(dash.pipeline.waiting)}</b></div>
                    <div><span>Changes requested</span><b>{n(dash.pipeline.changesRequested)}</b></div>
                    <div><span>Approved this month</span><b>{n(dash.pipeline.approvedThisMonth)}</b></div>
                    <div><span>API switched on</span><b>{n(dash.pipeline.partnersApiOn)} <small>of {n(dash.pipeline.partnersTotal)} partners</small></b></div>
                  </div>
                </div>
              </div>
            )}
            <div className="card db-card">
              <div className="card-head"><span className="t">Online bids</span><a className="linklike" href={pv ? '/admin/bidding/report' : '/admin/partner-api/bids'}>Bids →</a></div>
              <div className="card-pad">
                <div className="db-kv">
                  <div><span>Live bids today</span><b>{n(dash.bids.live.today)}</b></div>
                  <div><span>Live bids, {dash.window.days} days</span><b>{n(dash.bids.live.window)}</b></div>
                  <div><span>Test bids, {dash.window.days} days</span><b>{n(dash.bids.testWindow)}</b></div>
                </div>
                {Object.keys(dash.bids.live.byStatus).length > 0 ? (
                  <div className="db-chips" style={{ marginTop: 10 }}>
                    {Object.entries(dash.bids.live.byStatus).sort((a, b) => b[1] - a[1]).map(([s, c]) => <span key={s} className="st mut">{s.replace(/_/g, ' ')} {n(c)}</span>)}
                  </div>
                ) : dash.bids.live.window === 0 && <p className="db-note">Live online bidding has not started yet. Printed forms are counted separately above.</p>}
              </div>
            </div>
          </div>

          {/* ---------- readers · sign-ups · messages (platform) ---------- */}
          {pv && (
            <div className="db-row3">
              {dash.readers && (
                <div className="card db-card">
                  <div className="card-head"><span className="t">Subscription readers</span><a className="linklike" href="/admin/reports/visitors">Visitors →</a></div>
                  <div className="card-pad">
                    <div className="db-kv">
                      <div><span>People today</span><b>{n(dash.readers.today.people)}</b></div>
                      <div><span>Yesterday</span><b>{n(dash.readers.yesterday.people)}</b></div>
                      <div><span>On the pages now</span><b>{n(dash.readers.liveNow)}</b></div>
                      <div><span>Bot hits today</span><b>{n(dash.readers.botHitsToday)}</b></div>
                    </div>
                    {dash.readers.topIpos.length > 0 && <div className="db-note">Most read today: {dash.readers.topIpos.map((t) => `${t.symbol} (${t.people})`).join(', ')}</div>}
                    <div className="db-note">People are counted once a day without cookies. Bot hits come from the server log{dash.readers.botLogReadAt ? `, read ${ago(dash.readers.botLogReadAt)}` : ''}.</div>
                  </div>
                </div>
              )}
              {dash.signups && (
                <div className="card db-card">
                  <div className="card-head"><span className="t">Investor sign-ups</span><a className="linklike" href="/admin/clients">Clients →</a></div>
                  <div className="card-pad">
                    <div className="db-kv">
                      <div><span>New accounts today</span><b>{n(dash.signups.today)}</b></div>
                      <div><span>New accounts, {dash.window.days} days</span><b>{n(dash.signups.window)}</b></div>
                      <div><span>Accounts in all</span><b>{n(dash.signups.total)}</b></div>
                      <div><span>Have added an applicant</span><b>{n(dash.signups.withApplicant)} <small>of {n(dash.signups.total)}</small></b></div>
                    </div>
                    <div className="db-note">Applicants added by investors in {dash.window.days} days: <b>{n(dash.signups.profilesWindow)}</b>. Partner prints are not counted here.</div>
                  </div>
                </div>
              )}
              {dash.messages && (
                <div className="card db-card">
                  <div className="card-head"><span className="t">SMS &amp; email</span><a className="linklike" href="/admin/templates/log">Message log →</a></div>
                  <div className="card-pad">
                    <table className="table db-mini">
                      <thead><tr><th></th><th className="r">Today</th><th className="r">{dash.window.days} days</th><th className="r">Failed</th></tr></thead>
                      <tbody>
                        {(['sms', 'email', 'whatsapp'] as const).map((c) => (
                          <tr key={c}>
                            <td>{c === 'sms' ? 'SMS' : c === 'email' ? 'Email' : 'WhatsApp'}</td>
                            <td className="r mono">{n(dash.messages!.today[c]?.sent ?? 0)}</td>
                            <td className="r mono">{n(dash.messages!.window[c]?.sent ?? 0)}</td>
                            <td className="r mono">{(dash.messages!.window[c]?.failed ?? 0) > 0 ? <b className="db-neg">{n(dash.messages!.window[c].failed)}</b> : <span className="muted">0</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dash.messages.lastFailure && <div className="db-note">Last failure: {dash.messages.lastFailure.channel.toUpperCase()} {when(dash.messages.lastFailure.at)} — {dash.messages.lastFailure.error || 'no reason given'}</div>}
                  </div>
                </div>
              )}
            </div>
          )}

        </>
      )}
    </div>
  );
}

/** One line: exchange logins, subscription figures, alerts, last night's site rebuild. */
function StatusStrip({ s }: { s: NonNullable<api.DashData['status']> }) {
  const ex = (e: string) => (e.startsWith('NSE') ? 'NSE' : e.startsWith('BSE') ? 'BSE' : e);
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const stale = s.subscription.newestAsOf && s.subscription.polling && Date.now() - Date.parse(s.subscription.newestAsOf) > 15 * 60_000;
  const rebuildOk = s.rebuild?.status === 'ok';
  return (
    <div className="db-strip" role="list" aria-label="System status">
      {s.logins.map((l) => (
        <a key={l.id} role="listitem" href="/admin/rails-live" className={`db-si ${l.pausedAt ? 'bad' : 'ok'}`} title={l.pausedReason ?? `${l.member} — login working`}>
          <i />{ex(l.exchange)} login <b>{l.pausedAt ? 'paused' : 'OK'}</b>
        </a>
      ))}
      <span role="listitem" className={`db-si ${s.subscription.openIpos === 0 ? 'mut' : stale || s.subscription.withoutFigures.length ? 'warn' : 'ok'}`}>
        <i />Subscription {s.subscription.openIpos === 0 ? <b>no IPO open</b>
          : s.subscription.newestAsOf ? <>updated <b>{ago(s.subscription.newestAsOf)}</b>{!s.subscription.polling && ` · polling ${hm(s.subscription.windowFromMin)}–${hm(s.subscription.windowToMin)}`}</> : <b>no figures yet</b>}
      </span>
      <span role="listitem" className={`db-si ${s.alerts.critical ? 'bad' : s.alerts.open ? 'warn' : 'ok'}`}>
        <i />{s.alerts.open ? <><b>{s.alerts.open}</b> open alert{s.alerts.open === 1 ? '' : 's'}</> : 'No open alerts'}
      </span>
      <span role="listitem" className={`db-si ${!s.rebuild ? 'mut' : rebuildOk ? 'ok' : 'bad'}`} title={s.rebuild?.detail}>
        <i />Site rebuild {s.rebuild ? <><b>{rebuildOk ? 'OK' : 'failed'}</b> {when(s.rebuild.at)}</> : <b>unknown</b>}
      </span>
    </div>
  );
}

/**
 * THE DAILY SUBSCRIPTION CHECK (operator ask, 2026-10-06).
 *
 * Ten SME issues closed between 5 and 6 October with no subscription data at
 * all, lost silently over nine days. The poller returns nothing the moment it
 * has no Book Size to divide, so the exchange's demand is fetched and discarded
 * on every tick — and a bidding day that passes cannot be recovered, because the
 * usual rescue (`nseShares ÷ timesSubscribed`) needs a row that was written.
 *
 * W-SUB on the IPO form covers the operator who opens that form. This covers the
 * one who does not: the dashboard is the screen they see every day, so the
 * warning comes to them instead of waiting to be found.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. A card that is permanently
 * present and permanently empty is a card people stop reading, which is exactly
 * how the thing it is warning about happened.
 */
/**
 * AN EXCHANGE FEED THAT HAS STOPPED ANSWERING.
 *
 * On 2026-10-23 BSE's member /demandschedule froze at ~18:54 and never
 * resumed, through the 19:00 close of a Rs 30,213 Cr issue. JPL published a
 * QIB book 10.2% short, and NOTHING said so — the response carries no
 * timestamp, and `subscriptionAsOf` records when WE last wrote, so the page
 * read "Updated 19:05" over figures frozen eleven minutes earlier. It was
 * found days later, by comparing against the exchange's own page.
 *
 * THE TEST IS RELATIVE. One exchange moving while the other sits still is
 * unambiguous; an absolute "nothing for N minutes" alarm cannot tell a frozen
 * feed from a quiet market, and would fire every slow afternoon.
 *
 * Nothing on this card can be fixed by entering data, which is exactly why it
 * needs to exist: there is no form to fill and no error anywhere, so without
 * it the only symptom is a figure that is quietly too low.
 *
 * Renders NOTHING when there is nothing to say, same as its sibling.
 */
function FeedWatch({ data }: { data: api.SubscriptionReadiness | null }) {
  if (!data || !data.staleFeeds || data.staleFeeds.length === 0) return null;
  const name = (x: 'nse' | 'bse') => (x === 'nse' ? 'NSE' : 'BSE');
  const mins = (m: number) => (m >= 120 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  return (
    <div className="card" style={{ marginBottom: 18, borderColor: 'var(--neg)' }}>
      <div className="card-head">
        <span className="t">
          <Icon name="trending" size={15} /> Exchange feed has stopped updating{' '}
          <span className="count-badge">{data.staleFeeds.length}</span>
        </span>
        <a className="linklike" href="/admin/subscription-report" style={{ fontSize: 13 }}>Subscription report →</a>
      </div>
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <div className="banner bad" style={{ margin: 0, fontSize: 13.5 }}>
          <b>One exchange is still answering and the other is not.</b>{' '}
          The subscription figures published for these issues are short by whatever that
          exchange's book has done since it went quiet, and the gap widens until it resumes.
          There is nothing to enter here — the exchange's own page is the reference, and a
          freeze that lasts through the close leaves the final figures permanently short.
        </div>
      </div>
      <div className="card-pad">
        <table className="table">
          <thead><tr>
            <th>IPO</th><th>Stalled</th>
            <th style={{ textAlign: 'right' }}>No change for</th>
            {/* The proof it is a stall and not a quiet market. */}
            <th style={{ textAlign: 'right' }}>Other exchange moved</th>
          </tr></thead>
          <tbody>
            {data.staleFeeds.map((r) => (
              <tr key={`${r.id}:${r.exchange}`}>
                <td><b className="mono">{r.symbol}</b><div className="sub">{r.name}</div></td>
                <td><span className="st bad">{name(r.exchange)}</span></td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--neg-ink)' }}>
                  {mins(r.stalledMin)}
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{mins(r.siblingMin)} ago</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-pad muted" style={{ fontSize: 12, paddingTop: 10 }}>
        Measured from the last time each exchange's own figures CHANGED — not from the last poll.
        Checked {new Date(data.checkedAt).toLocaleString('en-IN')}.
      </div>
    </div>
  );
}

function SubscriptionWatch({ data }: { data: api.SubscriptionReadiness | null }) {
  if (!data || data.atRisk.length === 0) return null;
  const open = data.atRisk.filter((r) => r.state === 'open');
  return (
    <div className="card" style={{ marginBottom: 18, borderColor: 'var(--neg)' }}>
      <div className="card-head">
        <span className="t">
          <Icon name="trending" size={15} /> Subscription data not being recorded{' '}
          <span className="count-badge">{data.atRisk.length}</span>
        </span>
        <a className="linklike" href="/admin/catalog" style={{ fontSize: 13 }}>IPO catalog →</a>
      </div>
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <div className="banner warn" style={{ margin: 0, fontSize: 13.5 }}>
          {open.length > 0 ? (
            <><b>{open.length} issue{open.length === 1 ? ' is' : 's are'} open right now with no usable reservation table.</b>{' '}
              Every poll discards the exchange's figures, and those bidding days cannot be recovered afterwards.</>
          ) : (
            <><b>These issues open soon and have no usable reservation table yet.</b>{' '}
              Fill it in before the first bidding day or that day's figures are lost.</>
          )}{' '}
          Either percentages or share counts will do — you do not need both.
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr>
            <th>IPO</th><th>Window</th>
            {/* The two figures that say how urgent each row is. One bidding day
                left is an emergency; four still to come is a note. */}
            <th style={{ textAlign: 'right' }}>Days lost</th>
            <th style={{ textAlign: 'right' }}>Days left</th>
            <th>What’s missing</th><th style={{ textAlign: 'right' }}>Action</th>
          </tr></thead>
          <tbody>
            {data.atRisk.map((r) => (
              <tr key={r.id}>
                <td>
                  <b className="mono">{r.symbol}</b>
                  <span className={`chip ${r.board}`} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, marginLeft: 8 }}>
                    {r.board === 'sme' ? 'SME' : 'Mainboard'}
                  </span>
                  <div className="sub">{r.name}</div>
                </td>
                <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {r.openDate ?? '—'} → {r.closeDate ?? '—'}
                  <div className="sub">{r.state === 'open' ? 'open now' : 'upcoming'}</div>
                </td>
                <td className="mono" style={{ textAlign: 'right', color: r.lostDays > 0 ? 'var(--neg)' : undefined, fontWeight: r.lostDays > 0 ? 700 : 400 }}>
                  {r.lostDays || '—'}
                </td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{r.daysLeft || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{r.reason}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <a className="btn btn-secondary btn-sm" href={`/admin/catalog/edit?id=${r.id}`}>Enter it</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-pad muted" style={{ fontSize: 12, paddingTop: 10 }}>
        Days are TRADING days from the real NSE calendar — a weekend or a market holiday is not a lost day.
        Checked {new Date(data.checkedAt).toLocaleString('en-IN')}.
      </div>
    </div>
  );
}

/**
 * OPERATOR ALERTS (2026-11-23) — exchange logins the system had to pause, calls
 * that keep failing, feeds that stopped, open issues the poller cannot compute.
 * The same rows are emailed to the recipients named at the foot of the card.
 * Renders nothing when there is nothing open: a card that is always present
 * and always empty is a card people stop reading.
 */
function AlertsCard({ data }: { data: api.AlertList | null }) {
  const [showResolved, setShowResolved] = useState(false);
  if (!data || (data.open.length === 0 && data.resolved.length === 0)) return null;
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const critical = data.open.filter((a) => a.severity === 'critical').length;
  return (
    <div className={`card ovl-alerts${data.open.length ? '' : ' quiet'}`}>
      <div className="card-head">
        <span className="t">
          <Icon name="bolt" size={15} /> {data.open.length ? 'Needs attention' : 'Alerts'}{' '}
          {data.open.length > 0 && <span className={`count-badge${critical ? ' bad' : ''}`}>{data.open.length}</span>}
        </span>
        {data.resolved.length > 0 && (
          <button type="button" className="linklike" style={{ fontSize: 13 }} onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? 'Hide' : 'Show'} resolved in the last 7 days ({data.resolved.length})
          </button>
        )}
      </div>
      {data.open.length === 0 && <div className="card-pad muted" style={{ fontSize: 13.5 }}>Nothing open right now.</div>}
      {data.open.map((a) => (
        <div key={a.id} className={`ovl-alert ${a.severity}`}>
          <div className="ovl-alert-top">
            <span className={`st ${a.severity === 'critical' ? 'bad' : 'warn'}`}>{a.severity === 'critical' ? 'Action needed' : 'Warning'}</span>
            <b className="ovl-alert-t">{a.title}</b>
          </div>
          <div className="ovl-alert-d">{a.detail}</div>
          <div className="ovl-alert-m">
            Since {when(a.openedAt)} · last seen {when(a.lastSeenAt)} · {a.emailedAt ? `emailed ${when(a.emailedAt)}` : 'not emailed'}
            {a.kind === 'login-rejected' && <> · <a href="/admin/rails-live">Exchange Rails →</a></>}
            {a.kind === 'no-reservation' && <> · <a href="/admin/catalog">IPO List →</a></>}
          </div>
        </div>
      ))}
      {showResolved && data.resolved.map((a) => (
        <div key={a.id} className="ovl-alert resolved">
          <div className="ovl-alert-top"><span className="st ok">Resolved</span><b className="ovl-alert-t">{a.title}</b></div>
          <div className="ovl-alert-m">Opened {when(a.openedAt)} · resolved {when(a.resolvedAt!)}</div>
        </div>
      ))}
      <div className="card-pad muted" style={{ fontSize: 12, paddingTop: 10 }}>
        Emailed to {data.recipients.join(', ')} when an alert opens and when it resolves. Change the list in System Settings → Provider Keys → Operator alerts.
      </div>
    </div>
  );
}
