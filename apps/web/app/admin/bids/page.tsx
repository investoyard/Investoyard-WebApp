'use client';
import { useState } from 'react';
import { admin, useAdmin, can, type AdminBid } from '@/lib/admin-store';
import { NoAccess, Modal } from '@/components/AdminUI';
import { CompanyMark } from '@/components/CompanyMark';
import { inr } from '@/lib/format';

const STATUSES = ['submitted', 'dp_verified', 'mandate_pending', 'upi_blocked', 'allotted', 'not_allotted', 'cancelled'];
const stCls = (s: string) => (s === 'allotted' ? 'good' : s === 'not_allotted' || s === 'cancelled' ? 'bad' : s === 'mandate_pending' ? 'wait' : 'info');
const catShort = (c: string) => (c === 'Retail' ? 'Retail' : c === 'sNII' ? 'Small-NII' : 'Big-NII');

export default function AdminBids() {
  const s = useAdmin((x) => x);
  const manage = can(s, 'bids.manage');
  const [q, setQ] = useState('');
  const [fIpo, setFIpo] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fMethod, setFMethod] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);

  if (!can(s, 'bids.view')) return <NoAccess />;

  const ipoOptions = Array.from(new Map(s.bids.map((b) => [b.ipoSymbol, b.ipoName])).entries());
  const ql = q.trim().toLowerCase();
  const rows = s.bids.filter((b) => {
    if (fIpo !== 'all' && b.ipoSymbol !== fIpo) return false;
    if (fStatus !== 'all' && b.status !== fStatus) return false;
    if (fMethod !== 'all' && b.method !== fMethod) return false;
    if (fFrom && b.createdAt < fFrom) return false;
    if (fTo && b.createdAt > fTo) return false;
    if (ql && !(`${b.applicationNumber} ${b.userName} ${b.pan}`.toLowerCase().includes(ql))) return false;
    return true;
  });
  const total = rows.reduce((a, b) => a + b.amount, 0);
  const hasFilter = fIpo !== 'all' || fStatus !== 'all' || fMethod !== 'all' || fFrom || fTo || q;
  const clear = () => { setQ(''); setFIpo('all'); setFStatus('all'); setFMethod('all'); setFFrom(''); setFTo(''); };

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Bids</h1><p className="muted">{rows.length} of {s.bids.length} bids · {inr(total)} value</p></div>
      </div>

      <div className="filters">
        <div className="fg" style={{ flex: '2 1 220px' }}>
          <label>Search</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="App no, investor or PAN…" />
        </div>
        <div className="fg"><label>IPO</label>
          <select className="input" value={fIpo} onChange={(e) => setFIpo(e.target.value)}>
            <option value="all">All IPOs</option>{ipoOptions.map(([sym, name]) => <option key={sym} value={sym}>{name}</option>)}
          </select>
        </div>
        <div className="fg"><label>Status</label>
          <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">All</option>{STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="fg"><label>Method</label>
          <select className="input" value={fMethod} onChange={(e) => setFMethod(e.target.value)}>
            <option value="all">All</option><option value="upi">UPI</option><option value="pdf">ASBA</option>
          </select>
        </div>
        <div className="fg"><label>From</label><input type="date" className="input" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /></div>
        <div className="fg"><label>To</label><input type="date" className="input" value={fTo} onChange={(e) => setFTo(e.target.value)} /></div>
        {hasFilter && <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>}
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden', marginTop: 4 }}>
        <table className="table">
          <thead><tr><th>Application</th><th>IPO</th><th>Investor</th><th>PAN</th><th>Category</th><th>Lots</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><button className="linklike mono" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setViewId(b.id)}>{b.applicationNumber}</button></td>
                <td>{b.ipoName}</td>
                <td>{b.userName}</td>
                <td className="mono">{b.pan}</td>
                <td><span className="chip">{catShort(b.category)}</span></td>
                <td className="mono">{b.lots}</td>
                <td className="mono">{inr(b.amount)}</td>
                <td>{b.method === 'upi' ? 'UPI' : 'ASBA'}</td>
                <td>
                  {manage ? (
                    <select className="input" style={{ padding: '5px 8px', fontSize: 12, width: 'auto' }} value={b.status} onChange={(e) => admin.setBidStatus(b.id, e.target.value)}>
                      {STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
                    </select>
                  ) : <span className={`appstatus ${stCls(b.status)}`}>{b.status.replace(/_/g, ' ')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No bids match the filters.</p>}

      {viewId && <BidDetail id={viewId} manage={manage} onClose={() => setViewId(null)} />}
    </>
  );
}

function BidDetail({ id, manage, onClose }: { id: string; manage: boolean; onClose: () => void }) {
  const s = useAdmin((x) => x);
  const b = s.bids.find((x) => x.id === id);
  if (!b) return null;
  return (
    <Modal title="Bid detail" onClose={onClose}>
      <div className="row" style={{ gap: 12, marginBottom: 14, flexWrap: 'nowrap' }}>
        <CompanyMark name={b.ipoName} symbol={b.ipoSymbol} size="md" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{b.ipoName}</div>
          <div className="muted mono" style={{ fontSize: 12 }}>{b.applicationNumber}</div>
        </div>
        <div style={{ flex: 1 }} />
        <span className={`appstatus ${stCls(b.status)}`}>{b.status.replace(/_/g, ' ')}</span>
      </div>
      <div className="panel-sub">
        <div className="kv"><span className="k">Investor</span><span className="v">{b.userName}</span></div>
        <div className="kv"><span className="k">PAN</span><span className="v mono">{b.pan}</span></div>
        <div className="kv"><span className="k">Category</span><span className="v">{catShort(b.category)}</span></div>
        <div className="kv"><span className="k">Lots</span><span className="v mono">{b.lots}</span></div>
        <div className="kv"><span className="k">Amount</span><span className="v mono">{inr(b.amount)}</span></div>
        <div className="kv"><span className="k">Method</span><span className="v">{b.method === 'upi' ? 'UPI / ASBA' : 'Bank ASBA'}</span></div>
        <div className="kv"><span className="k">Date</span><span className="v mono">{b.createdAt}</span></div>
      </div>
      {manage && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>Update status</label>
          <select className="input" value={b.status} onChange={(e) => admin.setBidStatus(b.id, e.target.value)}>
            {STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
