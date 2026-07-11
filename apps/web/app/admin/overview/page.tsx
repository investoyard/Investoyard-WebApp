'use client';
import { useEffect, useState } from 'react';
import { useAdmin, can } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import { BarChart, DonutChart } from '@/components/admin/Charts';
import { Icon } from '@/components/Icon';
import { inr } from '@/lib/format';
import * as api from '@/lib/tenants-admin';

const PLATFORM = 'investoyard-platform'; // dashboard is scoped to the whole tree for the operator

const stCls = (s: string) => (s === 'allotted' ? 'good' : s === 'not_allotted' ? 'bad' : s === 'mandate_pending' ? 'wait' : 'info');

export default function AdminOverview() {
  const s = useAdmin((x) => x);
  const [d, setD] = useState<api.AdminDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setD(await api.fetchDashboard(PLATFORM)); setErr(null); }
      catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, []);

  if (!can(s, 'dashboard.view')) return <NoAccess />;

  const byStatus = d ? Object.entries(d.byStatus).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value })) : [];
  const byIpo = d ? d.topIpos.map((i) => ({ label: i.symbol, value: i.applications })) : [];

  return (
    <>
      <div className="between" style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <span className="pill" style={{ fontSize: 11 }}>live · platform-wide</span>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>Real-time overview of the Investoyard platform.</p>

      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err} — is the API running?</div>}
      {loading ? <div className="muted">Loading…</div> : d && (
        <>
          <div className="stat-grid">
            <div className="stat grad">
              <span className="ic"><Icon name="wallet" size={20} /></span>
              <div className="n mono">{inr(Math.max(0, d.counts.blocked))}</div><div className="l">Funds in flight</div>
            </div>
            <div className="stat"><span className="ic"><Icon name="doc" size={20} /></span><div className="n mono">{d.counts.applications}</div><div className="l">Applications</div></div>
            <div className="stat"><span className="ic"><Icon name="trending" size={20} /></span><div className="n mono">{d.counts.iposOpen}/{d.counts.iposTotal}</div><div className="l">IPOs open / total</div></div>
            <div className="stat"><span className="ic"><Icon name="chart" size={20} /></span><div className="n mono">{d.counts.allotmentRate == null ? '—' : `${d.counts.allotmentRate}%`}</div><div className="l">Allotment rate</div></div>
            <div className="stat"><span className="ic"><Icon name="users" size={20} /></span><div className="n mono">{d.counts.operators}</div><div className="l">Operators</div></div>
            <div className="stat"><span className="ic"><Icon name="globe" size={20} /></span><div className="n mono">{d.counts.tenants}</div><div className="l">Tenants</div></div>
          </div>

          <div className="cols-2" style={{ marginTop: 18 }}>
            <div className="panel">
              <h3 style={{ marginBottom: 14 }}>Applications by status</h3>
              {byStatus.length ? <DonutChart data={byStatus} /> : <p className="muted">No applications yet.</p>}
            </div>
            <div className="panel">
              <h3 style={{ marginBottom: 14 }}>Demand by IPO</h3>
              {byIpo.length ? <BarChart data={byIpo} /> : <p className="muted">No applications yet.</p>}
            </div>
          </div>

          <div className="section-head" style={{ marginBottom: 12, marginTop: 18 }}><h2>Open &amp; upcoming IPOs</h2><a className="linklike" href="/admin/catalog">Manage catalog →</a></div>
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead><tr><th>Symbol</th><th>Name</th><th>Type</th><th>Band</th><th>Closes</th><th>Status</th></tr></thead>
              <tbody>
                {d.openIpos.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>No open or upcoming IPOs.</td></tr> :
                  d.openIpos.map((i) => (
                    <tr key={i.symbol}>
                      <td className="mono" style={{ fontWeight: 600 }}>{i.symbol}</td>
                      <td>{i.name}</td>
                      <td>{i.type === 'sme' ? 'SME' : 'Mainboard'}</td>
                      <td className="mono">{i.band ?? '—'}</td>
                      <td className="mono">{i.closeDate ?? '—'}</td>
                      <td><span className={`appstatus ${stCls(i.status)}`}>{i.status}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
