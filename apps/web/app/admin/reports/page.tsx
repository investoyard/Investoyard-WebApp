'use client';
import { useState } from 'react';
import { useAdmin, can } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import { BarChart, DonutChart } from '@/components/admin/Charts';
import { Icon } from '@/components/Icon';
import { inr } from '@/lib/format';

const STATUSES = ['submitted', 'dp_verified', 'mandate_pending', 'upi_blocked', 'allotted', 'not_allotted', 'cancelled'];
const CATS = ['Retail', 'sNII', 'bNII'];
const catShort = (c: string) => (c === 'Retail' ? 'Retail' : c === 'sNII' ? 'Small-NII' : 'Big-NII');

export default function AdminReports() {
  const s = useAdmin((x) => x);
  const [fIpo, setFIpo] = useState('all');
  const [fCat, setFCat] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  if (!can(s, 'reports.view')) return <NoAccess />;

  const ipoOptions = Array.from(new Map(s.bids.map((b) => [b.ipoSymbol, b.ipoName])).entries());
  const rows = s.bids.filter((b) => {
    if (fIpo !== 'all' && b.ipoSymbol !== fIpo) return false;
    if (fCat !== 'all' && b.category !== fCat) return false;
    if (fStatus !== 'all' && b.status !== fStatus) return false;
    if (fFrom && b.createdAt < fFrom) return false;
    if (fTo && b.createdAt > fTo) return false;
    return true;
  });

  const value = rows.reduce((a, b) => a + b.amount, 0);
  const allotted = rows.filter((b) => b.status === 'allotted');
  const allottedVal = allotted.reduce((a, b) => a + b.amount, 0);

  const catData = CATS.map((c) => ({ label: catShort(c), value: rows.filter((b) => b.category === c).length })).filter((d) => d.value);
  const ipoData = Array.from(new Map(rows.map((b) => [b.ipoSymbol, 0])).keys()).map((sym) => ({
    label: sym, value: Math.round(rows.filter((b) => b.ipoSymbol === sym).reduce((a, b) => a + b.amount, 0) / 1000),
  }));

  function exportCsv() {
    const head = ['Application', 'IPO', 'Investor', 'PAN', 'Category', 'Lots', 'Amount', 'Method', 'Status', 'Date'];
    const lines = rows.map((b) => [b.applicationNumber, b.ipoName, b.userName, b.pan, b.category, b.lots, b.amount, b.method, b.status, b.createdAt]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [head.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'investoyard-bids-report.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const clear = () => { setFIpo('all'); setFCat('all'); setFStatus('all'); setFFrom(''); setFTo(''); };
  const hasFilter = fIpo !== 'all' || fCat !== 'all' || fStatus !== 'all' || fFrom || fTo;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Reports</h1><p className="muted">Bid analytics across the platform</p></div>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={!rows.length}><Icon name="doc" size={16} /> Export CSV</button>
      </div>

      <div className="filters">
        <div className="fg"><label>IPO</label>
          <select className="input" value={fIpo} onChange={(e) => setFIpo(e.target.value)}>
            <option value="all">All IPOs</option>{ipoOptions.map(([sym, name]) => <option key={sym} value={sym}>{name}</option>)}
          </select>
        </div>
        <div className="fg"><label>Category</label>
          <select className="input" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="all">All</option>{CATS.map((c) => <option key={c} value={c}>{catShort(c)}</option>)}
          </select>
        </div>
        <div className="fg"><label>Status</label>
          <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">All</option>{STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="fg"><label>From</label><input type="date" className="input" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /></div>
        <div className="fg"><label>To</label><input type="date" className="input" value={fTo} onChange={(e) => setFTo(e.target.value)} /></div>
        {hasFilter && <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>}
      </div>

      <div className="stat-grid" style={{ marginTop: 4 }}>
        <div className="stat grad"><span className="ic"><Icon name="wallet" size={20} /></span><div className="n mono">{inr(value)}</div><div className="l">Total bid value</div></div>
        <div className="stat"><span className="ic"><Icon name="doc" size={20} /></span><div className="n mono">{rows.length}</div><div className="l">Bids</div></div>
        <div className="stat"><span className="ic"><Icon name="check" size={20} /></span><div className="n mono">{allotted.length}</div><div className="l">Allotted</div></div>
        <div className="stat"><span className="ic"><Icon name="trending" size={20} /></span><div className="n mono">{inr(allottedVal)}</div><div className="l">Allotted value</div></div>
      </div>

      <div className="cols-2" style={{ marginTop: 18 }}>
        <div className="panel"><h3 style={{ marginBottom: 14 }}>Bids by category</h3>{catData.length ? <DonutChart data={catData} /> : <p className="muted">No data.</p>}</div>
        <div className="panel"><h3 style={{ marginBottom: 4 }}>Value by IPO</h3><p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>₹ thousands</p>{ipoData.length ? <BarChart data={ipoData} /> : <p className="muted">No data.</p>}</div>
      </div>

      <div className="section-head" style={{ marginBottom: 12 }}><h2>Detail</h2><span className="muted">{rows.length} rows</span></div>
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead><tr><th>Application</th><th>IPO</th><th>Investor</th><th>Category</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="mono">{b.applicationNumber}</td><td>{b.ipoName}</td><td>{b.userName}</td>
                <td><span className="chip">{catShort(b.category)}</span></td>
                <td className="mono">{inr(b.amount)}</td><td>{b.status.replace(/_/g, ' ')}</td>
                <td className="muted mono">{b.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No bids match the filters.</p>}
    </>
  );
}
