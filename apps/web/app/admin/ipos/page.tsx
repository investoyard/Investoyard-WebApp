'use client';
import { useState } from 'react';
import { admin, useAdmin, can, type AdminIpo } from '@/lib/admin-store';
import { NoAccess, Modal } from '@/components/AdminUI';
import { priceBand } from '@/lib/format';

const STATUSES: AdminIpo['status'][] = ['upcoming', 'open', 'closed', 'listed'];
const blank: Omit<AdminIpo, 'id'> = { symbol: '', name: '', type: 'mainboard', status: 'upcoming', priceBandMin: 0, priceBandMax: 0, lotSize: 0, openDate: '', closeDate: '' };

export default function AdminIpos() {
  const s = useAdmin((x) => x);
  const manage = can(s, 'ipos.manage');
  const [edit, setEdit] = useState<AdminIpo | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [fType, setFType] = useState('all');
  const [fStatus, setFStatus] = useState('all');

  if (!can(s, 'ipos.view')) return <NoAccess />;

  const ql = q.trim().toLowerCase();
  const rows = s.ipos.filter((i) => {
    if (fType !== 'all' && i.type !== fType) return false;
    if (fStatus !== 'all' && i.status !== fStatus) return false;
    if (ql && !(`${i.symbol} ${i.name}`.toLowerCase().includes(ql))) return false;
    return true;
  });
  const hasFilter = q || fType !== 'all' || fStatus !== 'all';

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>IPOs</h1><p className="muted">{rows.length} of {s.ipos.length} issues</p></div>
        {manage && <button className="btn" onClick={() => setCreating(true)}>+ Add IPO</button>}
      </div>

      <div className="filters">
        <div className="fg" style={{ flex: '2 1 220px' }}>
          <label>Search</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol or company…" />
        </div>
        <div className="fg"><label>Type</label>
          <select className="input" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="all">All</option><option value="mainboard">Mainboard</option><option value="sme">SME</option>
          </select>
        </div>
        <div className="fg"><label>Status</label>
          <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">All</option>{STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        {hasFilter && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setFType('all'); setFStatus('all'); }}>Clear</button>}
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden', marginTop: 4 }}>
        <table className="table">
          <thead><tr><th>Symbol</th><th>Company</th><th>Type</th><th>Band</th><th>Lot</th><th>Dates</th><th>Status</th>{manage && <th></th>}</tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="mono" style={{ fontWeight: 700 }}>{i.symbol}</td>
                <td>{i.name}</td>
                <td><span className="chip">{i.type === 'sme' ? 'SME' : 'Mainboard'}</span></td>
                <td className="mono">{priceBand(i.priceBandMin, i.priceBandMax)}</td>
                <td className="mono">{i.lotSize}</td>
                <td className="muted mono" style={{ fontSize: 12 }}>{i.openDate} → {i.closeDate}</td>
                <td>
                  {manage ? (
                    <select className="input" style={{ padding: '5px 8px', fontSize: 12 }} value={i.status} onChange={(e) => admin.updateIpo(i.id, { status: e.target.value as AdminIpo['status'] })}>
                      {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  ) : <span className={`status ${i.status}`}>{i.status}</span>}
                </td>
                {manage && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdit(i)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => admin.deleteIpo(i.id)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <IpoForm title="Add IPO" initial={blank} onClose={() => setCreating(false)} onSave={(v) => { admin.createIpo(v); setCreating(false); }} />}
      {edit && <IpoForm title={`Edit — ${edit.symbol}`} initial={edit} onClose={() => setEdit(null)} onSave={(v) => { admin.updateIpo(edit.id, v); setEdit(null); }} />}
    </>
  );
}

function IpoForm({ title, initial, onClose, onSave }: {
  title: string; initial: Omit<AdminIpo, 'id'> | AdminIpo; onClose: () => void; onSave: (v: Omit<AdminIpo, 'id'>) => void;
}) {
  const [f, setF] = useState<Omit<AdminIpo, 'id'>>({ ...initial });
  const upd = (patch: Partial<AdminIpo>) => setF({ ...f, ...patch });
  const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
  const valid = f.symbol.trim() && f.name.trim() && f.priceBandMax > 0 && f.lotSize > 0;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="cols-2">
        <div className="field"><label>Symbol</label><input className="input mono" value={f.symbol} onChange={(e) => upd({ symbol: e.target.value.toUpperCase() })} /></div>
        <div className="field"><label>Type</label>
          <select className="input" value={f.type} onChange={(e) => upd({ type: e.target.value as AdminIpo['type'] })}>
            <option value="mainboard">Mainboard</option><option value="sme">SME</option>
          </select>
        </div>
      </div>
      <div className="field"><label>Company name</label><input className="input" value={f.name} onChange={(e) => upd({ name: e.target.value })} /></div>
      <div className="cols-2">
        <div className="field"><label>Price band min</label><input className="input mono" value={f.priceBandMin || ''} onChange={(e) => upd({ priceBandMin: num(e.target.value) })} /></div>
        <div className="field"><label>Price band max</label><input className="input mono" value={f.priceBandMax || ''} onChange={(e) => upd({ priceBandMax: num(e.target.value) })} /></div>
      </div>
      <div className="cols-2">
        <div className="field"><label>Lot size</label><input className="input mono" value={f.lotSize || ''} onChange={(e) => upd({ lotSize: num(e.target.value) })} /></div>
        <div className="field"><label>Status</label>
          <select className="input" value={f.status} onChange={(e) => upd({ status: e.target.value as AdminIpo['status'] })}>
            {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>
      <div className="cols-2">
        <div className="field"><label>Open date</label><input type="date" className="input" value={f.openDate} onChange={(e) => upd({ openDate: e.target.value })} /></div>
        <div className="field"><label>Close date</label><input type="date" className="input" value={f.closeDate} onChange={(e) => upd({ closeDate: e.target.value })} /></div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!valid} onClick={() => onSave(f)}>Save</button>
      </div>
    </Modal>
  );
}
