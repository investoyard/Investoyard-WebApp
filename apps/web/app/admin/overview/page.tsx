'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { PartnerBranchFilter } from '@/components/admin/Filters';
import { DonutChart, AreaChart } from '@/components/admin/Charts';
import { Icon } from '@/components/Icon';
import { inr } from '@/lib/format';
import * as api from '@/lib/tenants-admin';

const STATUS_COLORS: Record<string, string> = {
  allotted: '#12925a', submitted: '#3c2e7e', pending: '#5645a6', mandate_pending: '#e0a200',
  not_allotted: '#98a0ae', refunded: '#2f66d0', failed: '#d8412a', rejected: '#d8412a', draft: '#c8ccd4',
};
const STCLS: Record<string, string> = { allotted: 'ok', not_allotted: 'mut', submitted: 'brand', pending: 'brand', draft: 'mut', failed: 'warn', rejected: 'warn' };
const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function Stat({ icon, cls, n, label, sub }: { icon: Parameters<typeof Icon>[0]['name']; cls?: string; n: string; label: string; sub?: React.ReactNode }) {
  return (
    <div className={`stat ${cls ?? ''}`}>
      <div className="stat-row">
        <span className="ic"><Icon name={icon} size={22} /></span>
        <div className="stat-fig"><div className="l">{label}</div><div className="n mono">{n}</div></div>
      </div>
      {sub && <div className="sub-line">{sub}</div>}
    </div>
  );
}

export default function AdminOverview() {
  const me = useOperator();
  const home = me?.homeTenant.slug ?? 'investoyard-platform';
  const [scope, setScope] = useState(home);
  const [d, setD] = useState<api.AdminDashboard | null>(null);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [activity, setActivity] = useState<api.AuditEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** The daily subscription check — see `SubscriptionWatch` at the foot of this file. */
  const [readiness, setReadiness] = useState<api.SubscriptionReadiness | null>(null);

  const loadDash = useCallback(async (slug: string) => {
    try { setD(await api.fetchDashboard(slug)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const [, t, a, r] = await Promise.all([
          loadDash(home),
          api.fetchTree().then(setTree).catch(() => {}),
          operatorCan(me, 'audit.view') ? api.fetchAudit().then(setActivity).catch(() => {}) : Promise.resolve(),
          /* Caught, never surfaced as a page error: a failure here must not put a
             red banner over a dashboard that is otherwise fine. The card simply
             does not render. */
          operatorCan(me, 'ipos.view') ? api.fetchSubscriptionReadiness().then(setReadiness).catch(() => {}) : Promise.resolve(),
        ]);
        void t; void a; void r;
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!operatorCan(me, 'dashboard.view')) return <NoAccess />;

  const c = d?.counts;
  const flow = d ? Object.entries(d.byStatus).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value, color: STATUS_COLORS[label] ?? '#7565bd' })) : [];
  const partnerDonut = d ? [
    { label: 'Active', value: d.partnerStatus.active, color: '#12925a' },
    { label: 'Suspended', value: d.partnerStatus.suspended, color: '#d8412a' },
  ].filter((x) => x.value > 0) : [];
  const trend = d ? d.trend7.map((t) => ({ label: t.date.slice(5), value: t.count })) : [];
  const maxPartner = Math.max(1, ...(d?.topPartners.map((p) => p.applications) ?? [1]));

  return (
    <>
      <PageHead
        title="Dashboard"
        sub={`Welcome back, ${me?.name ?? 'there'}.`}
        actions={
          <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
            <PartnerBranchFilter tree={tree} homeSlug={home} onScope={(s) => { setScope(s); loadDash(s); }} />
            <span className="st mut" style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={14} /> {today()}</span>
          </div>
        }
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err} — is the API running?</div>}
      {/* ABOVE the stat grid and OUTSIDE the loading gate: this is the one thing on
          the dashboard that is losing data while it is not looked at, and it must
          not wait on the counts to render. */}
      <SubscriptionWatch data={readiness} />
      {loading || !c || !d ? <Loader /> : (
        <>
          {/* ---- headline counts ---- */}
          <div className="stat-grid">
            <Stat icon="trending" n={String(c.iposTotal)} label="Total IPOs" sub={<><b>{c.iposOpen}</b> live · <b>{c.iposUpcoming}</b> upcoming · <b>{c.iposClosed}</b> closed</>} />
            <Stat icon="doc" cls="a-blue" n={c.applications.toLocaleString('en-IN')} label="Total Applications" sub={<>{inr(Math.max(0, c.blocked))} in flight</>} />
            <Stat icon="globe" n={String(c.partners)} label="Total Partners" sub={<><b>{d.partnerStatus.active}</b> active</>} />
            <Stat icon="share" n={String(c.branches)} label="Total Branches" sub={<>across <b>{c.partners}</b> partners</>} />
            <Stat icon="users" cls="a-green" n={c.clients.toLocaleString('en-IN')} label="Total Clients" sub={<>registered investors</>} />
          </div>

          {/* ---- live IPO performance + application flow ---- */}
          <div className="dash-2">
            <div className="card">
              <div className="card-head"><span className="t">IPO Performance <span className="st ok" style={{ marginLeft: 4 }}>Live</span></span><a className="linklike" href="/admin/catalog" style={{ fontSize: 13 }}>View all →</a></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th>IPO</th><th>Price band</th><th>Subscription</th><th>GMP</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.livePerformance.length === 0 ? <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>No live IPOs right now.</td></tr> :
                      d.livePerformance.map((i) => (
                        <tr key={i.symbol}>
                          <td><b className="mono">{i.symbol}</b><div className="sub">{i.name}</div></td>
                          <td className="mono">{i.band ?? '—'}</td>
                          <td>{i.subscription != null ? (
                            <span className="row" style={{ gap: 8 }}><span className="subx"><i style={{ width: `${Math.min(100, (i.subscription / 50) * 100)}%` }} /></span><b className="mono" style={{ fontSize: 12.5 }}>{i.subscription.toFixed(1)}×</b></span>
                          ) : <span className="muted">—</span>}</td>
                          <td className="mono" style={{ color: i.gmp != null && i.gmp > 0 ? 'var(--pos)' : i.gmp != null && i.gmp < 0 ? 'var(--neg)' : undefined }}>{i.gmp != null ? `${i.gmp > 0 ? '+' : ''}${i.gmp}` : '—'}</td>
                          <td><span className={`st ${STCLS[i.status] ?? 'brand'}`}>{i.status}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card"><div className="card-head"><span className="t">Application Flow</span></div>
              <div className="card-pad">{flow.length ? <DonutChart data={flow} /> : <p className="muted">No applications yet.</p>}</div>
            </div>
          </div>

          {/* ---- trend + partners ---- */}
          <div className="dash-2">
            <div className="card"><div className="card-head"><span className="t">Applications — last 7 days</span><a className="linklike" href="/admin/reports-live" style={{ fontSize: 13 }}>Reports →</a></div>
              <div className="card-pad">{trend.some((t) => t.value > 0) ? <AreaChart data={trend} height={160} /> : <p className="muted">No applications in the last 7 days.</p>}</div>
            </div>
            <div className="card"><div className="card-head"><span className="t">Applications by Partner</span></div>
              <div className="card-pad">
                {d.topPartners.length === 0 ? <p className="muted">No applications yet.</p> : (
                  <div className="dash-bars">
                    {d.topPartners.map((p) => (
                      <div className="dash-bar" key={p.code}>
                        <span className="nm">{p.name} <span className="muted mono" style={{ fontSize: 11 }}>{p.code}</span></span>
                        <span className="vv">{p.applications.toLocaleString('en-IN')}</span>
                        <span className="track"><i style={{ width: `${(p.applications / maxPartner) * 100}%` }} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---- IPO-wise summary + (partner overview + activity) ---- */}
          <div className="dash-2">
            <div className="card"><div className="card-head"><span className="t">IPO-wise Application Summary</span><a className="linklike" href="/admin/reports-live" style={{ fontSize: 13 }}>Full report →</a></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th>IPO</th><th style={{ textAlign: 'right' }}>Applications</th><th style={{ textAlign: 'right' }}>Allotted</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
                  <tbody>
                    {d.topIpos.length === 0 ? <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>No applications yet.</td></tr> :
                      d.topIpos.map((r) => (
                        <tr key={r.symbol}>
                          <td><b className="mono">{r.symbol}</b><div className="sub">{r.name}</div></td>
                          <td className="mono" style={{ textAlign: 'right' }}>{r.applications.toLocaleString('en-IN')}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{r.allotted}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{inr(r.amount)}</td>
                          <td style={{ textAlign: 'right' }}><a className="icon-btn" href="/admin/applications" title="View applications"><Icon name="eye" size={15} /></a></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="dash-side">
              <div className="card"><div className="card-head"><span className="t">Partner / Branch Overview</span></div>
                <div className="card-pad">
                  {partnerDonut.length ? <DonutChart data={partnerDonut} size={150} /> : <p className="muted">No partners yet.</p>}
                  <div className="sub-line" style={{ marginTop: 14 }}><b>{c.partners}</b> partners · <b>{c.branches}</b> branches · <b>{c.operators}</b> operators</div>
                </div>
              </div>
              {operatorCan(me, 'audit.view') && (
                <div className="card"><div className="card-head"><span className="t">Recent activity</span><a className="linklike" href="/admin/audit-live" style={{ fontSize: 13 }}>View all →</a></div>
                  <div className="card-pad">
                    {activity.length === 0 ? <p className="muted">No recent activity.</p> : (
                      <ul className="activity">
                        {activity.slice(0, 6).map((a) => (
                          <li key={a.id}>
                            <span className="adot" />
                            <span style={{ minWidth: 0 }}><b style={{ fontSize: 13 }}>{a.action.replace(/[._]/g, ' ')}</b>{a.targetLabel && <span className="muted"> · {a.targetLabel}</span>}</span>
                            <span className="at">{a.at.slice(5, 16).replace('T', ' ')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
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
