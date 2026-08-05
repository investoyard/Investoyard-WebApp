'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Icon } from '@/components/Icon';
import { Loader } from '@/components/ui/Loader';
import { PartnerBranchFilter, AppFilters } from '@/components/admin/Filters';
import { filterApps, distinct, aggregate, appsToCsv, emptyFilter, type AppFilter } from '@/lib/appfilters';
import * as api from '@/lib/tenants-admin';

const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`);

function Stat({ icon, n, l, cls }: { icon: Parameters<typeof Icon>[0]['name']; n: string; l: string; cls?: string }) {
  return <div className={`stat ${cls ?? ''}`}><span className="ic"><Icon name={icon} size={20} /></span><div className="n">{n}</div><div className="l">{l}</div></div>;
}

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function AdminReportsLive() {
  const me = useOperator();
  const homeSlug = me?.homeTenant.slug ?? '';
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [rows, setRows] = useState<api.AdminApplication[]>([]);
  const [filter, setFilter] = useState<AppFilter>(emptyFilter());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async (slug: string) => {
    try { setRows(await api.fetchApplications(slug)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setRows([]); }
  }, []);
  useEffect(() => {
    (async () => {
      try { setTree(await api.fetchTree()); if (homeSlug) await loadRows(homeSlug); }
      catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [loadRows, homeSlug]);

  const filtered = useMemo(() => filterApps(rows, filter), [rows, filter]);
  const agg = useMemo(() => aggregate(filtered), [filtered]);
  const ipoOpts = useMemo(() => distinct(rows, 'ipoSymbol'), [rows]);
  const statusOpts = useMemo(() => distinct(rows, 'status'), [rows]);
  const maxStatus = Math.max(1, ...Object.values(agg.byStatus));

  if (!operatorCan(me, 'reports.view')) return <NoAccess />;

  return (
    <>
      <PageHead
        title="Reports"
        sub="Live bid analytics. Every figure reflects the partner, branch, IPO and date filters below."
        actions={<button className="btn btn-secondary" disabled={!filtered.length} onClick={() => downloadCsv('investoyard-report.csv', appsToCsv(filtered))}>↓ Export CSV</button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="filter-bar">
        <PartnerBranchFilter tree={tree} homeSlug={homeSlug} onScope={loadRows} />
        <AppFilters ipos={ipoOpts} statuses={statusOpts} value={filter} onChange={setFilter} />
      </div>

      {loading ? <Loader /> : (
        <>
          <div className="stat-grid" style={{ marginBottom: 18 }}>
            <Stat icon="doc" n={String(agg.applications)} l="Applications" />
            <Stat icon="wallet" n={inr(agg.amount)} l="Amount applied" cls="a-blue" />
            <Stat icon="check" n={agg.allotmentRate == null ? '—' : `${agg.allotmentRate}%`} l={`${agg.allotted} allotted · ${agg.notAllotted} not`} cls="a-green" />
            <Stat icon="refresh" n={inr(agg.totalRefund)} l="Refunds released" />
            <Stat icon="trending" n={inr(agg.totalCommission)} l="Commission (on allotted)" cls="a-gold" />
          </div>

          <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
            <div className="fs-head" style={{ marginBottom: 14 }}><div className="t">By status</div></div>
            {Object.keys(agg.byStatus).length === 0 ? <div className="muted">No applications in this view.</div> :
              Object.entries(agg.byStatus).sort((a, b) => b[1] - a[1]).map(([st, n]) => (
                <div key={st} className="row" style={{ gap: 12, alignItems: 'center', margin: '8px 0' }}>
                  <span style={{ width: 130, fontSize: 13, textTransform: 'capitalize' }}>{st.replace(/_/g, ' ')}</span>
                  <span style={{ flex: 1, height: 10, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(n / maxStatus) * 100}%`, background: 'linear-gradient(90deg, var(--brand-400), var(--brand))', borderRadius: 999 }} />
                  </span>
                  <span className="mono" style={{ width: 36, textAlign: 'right', fontWeight: 700 }}>{n}</span>
                </div>
              ))}
          </div></div>

          <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
            <div className="fs-head" style={{ marginBottom: 8 }}><div className="t">Demand by IPO</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Symbol</th><th>Name</th><th style={{ textAlign: 'right' }}>Applications</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Allotted</th></tr></thead>
                <tbody>
                  {agg.byIpo.length === 0 ? <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>No applications.</td></tr> :
                    agg.byIpo.map((r) => (
                      <tr key={r.symbol}>
                        <td className="mono" style={{ fontWeight: 700 }}>{r.symbol}</td>
                        <td>{r.name}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{r.applications}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{inr(r.amount)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{r.allotted}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div></div>

          <div className="card"><div className="card-pad">
            <div className="fs-head" style={{ marginBottom: 8 }}><div className="t">By partner / channel</div><div className="d">Commission is % of allotted amount, per channel code.</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Code</th><th>Channel</th><th style={{ textAlign: 'right' }}>Applications</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Allotted</th><th style={{ textAlign: 'right' }}>Commission</th></tr></thead>
                <tbody>
                  {agg.byPartner.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>No applications.</td></tr> :
                    agg.byPartner.map((p) => (
                      <tr key={p.code}>
                        <td className="mono" style={{ fontWeight: 700 }}>{p.code}</td>
                        <td>{p.name}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{p.applications}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{inr(p.amount)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{p.allotted}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{inr(p.commission)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div></div>
        </>
      )}
    </>
  );
}
