'use client';
import { useState } from 'react';
import { useAdmin, can } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';

const fmt = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

export default function AdminAudit() {
  const s = useAdmin((x) => x);
  const [q, setQ] = useState('');
  const [fActor, setFActor] = useState('all');
  const [fAction, setFAction] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  if (!can(s, 'audit.view')) return <NoAccess />;

  const actors = Array.from(new Set(s.audit.map((a) => a.actor)));
  const actions = Array.from(new Set(s.audit.map((a) => a.action)));
  const ql = q.trim().toLowerCase();
  const rows = s.audit.filter((a) => {
    if (fActor !== 'all' && a.actor !== fActor) return false;
    if (fAction !== 'all' && a.action !== fAction) return false;
    const day = a.at.slice(0, 10);
    if (fFrom && day < fFrom) return false;
    if (fTo && day > fTo) return false;
    if (ql && !(`${a.actor} ${a.action} ${a.target ?? ''}`.toLowerCase().includes(ql))) return false;
    return true;
  });
  const hasFilter = q || fActor !== 'all' || fAction !== 'all' || fFrom || fTo;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Audit log</h1><p className="muted">{rows.length} of {s.audit.length} events</p></div>
      </div>

      <div className="filters">
        <div className="fg" style={{ flex: '2 1 220px' }}>
          <label>Search</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Actor, action or target…" />
        </div>
        <div className="fg"><label>Actor</label>
          <select className="input" value={fActor} onChange={(e) => setFActor(e.target.value)}>
            <option value="all">All</option>{actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="fg"><label>Action</label>
          <select className="input" value={fAction} onChange={(e) => setFAction(e.target.value)}>
            <option value="all">All</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="fg"><label>From</label><input type="date" className="input" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /></div>
        <div className="fg"><label>To</label><input type="date" className="input" value={fTo} onChange={(e) => setFTo(e.target.value)} /></div>
        {hasFilter && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setFActor('all'); setFAction('all'); setFFrom(''); setFTo(''); }}>Clear</button>}
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden', marginTop: 4 }}>
        <table className="table">
          <thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>{fmt(a.at)}</td>
                <td style={{ fontWeight: 600 }}>{a.actor}</td>
                <td><span className="chip">{a.action}</span></td>
                <td className="muted mono">{a.target ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No events match the filters.</p>}
    </>
  );
}
