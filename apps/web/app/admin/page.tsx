'use client';
import { useAdmin, can, roleName } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import { BarChart, DonutChart, AreaChart } from '@/components/admin/Charts';
import { Icon } from '@/components/Icon';
import { inr } from '@/lib/format';

const stCls = (s: string) => (s === 'allotted' ? 'good' : s === 'not_allotted' ? 'bad' : s === 'mandate_pending' ? 'wait' : 'info');

function groupCount<T>(arr: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  arr.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1));
  return [...m.entries()];
}

export default function AdminDashboard() {
  const s = useAdmin((x) => x);
  if (!can(s, 'dashboard.view')) return <NoAccess />;

  const blocked = s.bids.filter((b) => ['upi_blocked', 'submitted', 'mandate_pending'].includes(b.status)).reduce((a, b) => a + b.amount, 0);
  const openIpos = s.ipos.filter((i) => i.status === 'open').length;

  const byStatus = groupCount(s.bids, (b) => b.status).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value }));
  const byIpo = groupCount(s.bids, (b) => b.ipoSymbol).map(([label, value]) => ({ label, value }));
  const byRole = groupCount(s.users, (u) => roleName(s, u.roleId)).map(([label, value]) => ({ label, value }));
  const byDayMap = new Map<string, number>();
  s.bids.forEach((b) => byDayMap.set(b.createdAt, (byDayMap.get(b.createdAt) ?? 0) + b.amount));
  const byDay = [...byDayMap.entries()].sort().map(([d, v]) => ({ label: d.slice(5), value: Math.round(v / 1000) }));

  return (
    <>
      <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
      <p className="muted" style={{ marginBottom: 18 }}>Overview of the Investoyard platform.</p>

      <div className="stat-grid">
        <div className="stat grad">
          <span className="ic"><Icon name="wallet" size={20} /></span>
          <div className="n mono">{inr(blocked)}</div><div className="l">Funds blocked</div>
        </div>
        <div className="stat"><span className="ic"><Icon name="users" size={20} /></span><div className="n mono">{s.users.length}</div><div className="l">Users</div></div>
        <div className="stat"><span className="ic"><Icon name="shield" size={20} /></span><div className="n mono">{s.roles.length}</div><div className="l">Roles</div></div>
        <div className="stat"><span className="ic"><Icon name="trending" size={20} /></span><div className="n mono">{openIpos}/{s.ipos.length}</div><div className="l">IPOs open / total</div></div>
        <div className="stat"><span className="ic"><Icon name="doc" size={20} /></span><div className="n mono">{s.bids.length}</div><div className="l">Bids</div></div>
      </div>

      <div className="cols-2" style={{ marginTop: 18 }}>
        <div className="panel">
          <h3 style={{ marginBottom: 14 }}>Bids by status</h3>
          <DonutChart data={byStatus} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 14 }}>Bids by IPO</h3>
          <BarChart data={byIpo} />
        </div>
      </div>

      <div className="cols-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3 style={{ marginBottom: 14 }}>Users by role</h3>
          <DonutChart data={byRole} />
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 4 }}>Bid value trend</h3>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>₹ thousands, by day</p>
          <AreaChart data={byDay} />
        </div>
      </div>

      <div className="section-head" style={{ marginBottom: 12 }}><h2>Recent bids</h2><a className="linklike" href="/admin/bids">View all →</a></div>
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead><tr><th>Application</th><th>IPO</th><th>Investor</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {s.bids.slice(0, 6).map((b) => (
              <tr key={b.id}>
                <td className="mono">{b.applicationNumber}</td>
                <td>{b.ipoName}</td>
                <td>{b.userName}</td>
                <td className="mono">{inr(b.amount)}</td>
                <td><span className={`appstatus ${stCls(b.status)}`}>{b.status.replace(/_/g, ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
