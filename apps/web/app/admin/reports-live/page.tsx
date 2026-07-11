'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const TYPE_LABEL: Record<string, string> = { platform: 'Operator', direct: 'Direct (B2C)', partner: 'Partner', branch: 'Branch' };
const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`);

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel" style={{ flex: '1 1 160px', minWidth: 160 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function AdminReportsLive() {
  const s = useAdmin((x) => x);
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [rep, setRep] = useState<api.AdminReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (slug: string) => {
    try { setRep(await api.fetchReports(slug)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setRep(null); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await api.fetchTree(); setTree(t);
        const first = t.find((x) => x.type !== 'platform') ?? t[0];
        if (first) { setSel(first.slug); await load(first.slug); }
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [load]);

  const select = async (slug: string) => { setSel(slug); await load(slug); };
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!sel) return;
    setExporting(true); setErr(null);
    try { await api.downloadReportCsv(sel); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setExporting(false); }
  };

  if (!can(s, 'reports.view')) return <NoAccess />;

  const childrenOf = (pid: string | null) => tree.filter((t) => t.parentId === pid);
  const roots = tree.filter((t) => !t.parentId || !tree.some((x) => x.id === t.parentId));
  const renderNode = (t: api.AdminTenant, depth: number): React.ReactNode => (
    <div key={t.id}>
      <button onClick={() => select(t.slug)} style={{
        width: '100%', textAlign: 'left', padding: '9px 12px', paddingLeft: 12 + depth * 20, border: 'none',
        borderRadius: 10, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center',
        background: sel === t.slug ? 'var(--brand-50)' : 'transparent',
        boxShadow: sel === t.slug ? 'inset 0 0 0 1px var(--brand-200)' : 'none',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: t.brandColor ?? 'var(--border-2)' }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
        <span className="muted" style={{ fontSize: 12 }}>{TYPE_LABEL[t.type] ?? t.type}</span>
      </button>
      {childrenOf(t.id).map((c) => renderNode(c, depth + 1))}
    </div>
  );

  const maxStatus = rep ? Math.max(1, ...Object.values(rep.totals.byStatus)) : 1;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Reports</h1><p className="muted">Live bid analytics across the tenant sub-tree.</p></div>
        <button className="btn btn-secondary btn-sm" disabled={!sel || exporting || !rep || rep.totals.applications === 0} onClick={exportCsv}>
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {loading ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 20, alignItems: 'start' }}>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Tenant</h3>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>{roots.map((r) => renderNode(r, 0))}</div>
          </div>

          <div>
            {!rep ? <div className="muted">No data.</div> : (
              <>
                <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                  <Kpi label="Applications" value={String(rep.totals.applications)} sub={`in ${rep.scope.name}`} />
                  <Kpi label="Amount applied" value={inr(rep.totals.amount)} />
                  <Kpi label="Allotment rate" value={rep.allotment.allotmentRate == null ? '—' : `${rep.allotment.allotmentRate}%`} sub={`${rep.allotment.allotted} allotted · ${rep.allotment.notAllotted} not`} />
                  <Kpi label="Refunds released" value={inr(rep.allotment.totalRefund)} />
                </div>

                <div className="panel" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginTop: 0 }}>By status</h3>
                  {Object.keys(rep.totals.byStatus).length === 0 ? <div className="muted">No applications yet.</div> :
                    Object.entries(rep.totals.byStatus).sort((a, b) => b[1] - a[1]).map(([st, n]) => (
                      <div key={st} className="row" style={{ gap: 12, alignItems: 'center', margin: '7px 0' }}>
                        <span style={{ width: 120, fontSize: 13 }}>{st.replace(/_/g, ' ')}</span>
                        <span style={{ flex: 1, height: 10, background: 'var(--bg-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${(n / maxStatus) * 100}%`, background: 'var(--brand)', borderRadius: 999 }} />
                        </span>
                        <span className="mono" style={{ width: 32, textAlign: 'right', fontWeight: 600 }}>{n}</span>
                      </div>
                    ))}
                </div>

                <div className="panel">
                  <h3 style={{ marginTop: 0 }}>Demand by IPO</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ width: '100%' }}>
                      <thead><tr><th>Symbol</th><th>Name</th><th style={{ textAlign: 'right' }}>Applications</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Allotted</th></tr></thead>
                      <tbody>
                        {rep.byIpo.length === 0 ? <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>No applications.</td></tr> :
                          rep.byIpo.map((r) => (
                            <tr key={r.symbol}>
                              <td className="mono" style={{ fontWeight: 600 }}>{r.symbol}</td>
                              <td>{r.name}</td>
                              <td className="mono" style={{ textAlign: 'right' }}>{r.applications}</td>
                              <td className="mono" style={{ textAlign: 'right' }}>{inr(r.amount)}</td>
                              <td className="mono" style={{ textAlign: 'right' }}>{r.allotted}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
