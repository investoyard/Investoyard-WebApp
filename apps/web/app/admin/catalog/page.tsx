'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const STATUSES = ['upcoming', 'open', 'closed', 'listed', 'withdrawn'] as const;

export default function AdminCatalog() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setIpos(await api.fetchIpos()); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const onDelete = (i: api.AdminIpo) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${i.symbol}? This can't be undone.`)) return;
    run(() => api.deleteIpo(i.id));
  };

  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.manage');

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>IPO catalog</h1><p className="muted">The live catalog every tenant reads — {ipos.length} issue(s).</p></div>
        {canManage && <a className="btn" href="/admin/catalog/new">＋ Add IPO</a>}
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {loading ? <div className="muted">Loading…</div> : (
        <div className="panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th></th><th>Symbol</th><th>Name</th><th>Type</th><th>Band</th><th>Lot</th><th>Close</th><th>GMP</th><th>Status</th>{canManage && <th></th>}</tr></thead>
              <tbody>
                {ipos.length === 0 ? <tr><td colSpan={canManage ? 10 : 9} className="muted" style={{ padding: 14 }}>No IPOs yet. {canManage && <a className="linklike" href="/admin/catalog/new">Add the first one →</a>}</td></tr> :
                  ipos.map((i) => (
                    <tr key={i.id}>
                      <td>{i.logoUrl ? <img src={i.logoUrl} alt="" width={26} height={26} style={{ borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg-subtle)', display: 'inline-block' }} />}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{i.symbol}</td>
                      <td>{i.name}</td>
                      <td><span className="pill">{i.type === 'sme' ? 'SME' : 'Mainboard'}</span></td>
                      <td className="mono">{i.priceBandMin != null ? `₹${i.priceBandMin}–${i.priceBandMax}` : '—'}</td>
                      <td className="mono">{i.lotSize ?? '—'}</td>
                      <td className="mono">{i.closeDate ?? '—'}</td>
                      <td className="mono">{i.gmp != null ? `+${i.gmp}` : '—'}</td>
                      <td>
                        <select className="input" style={{ padding: '5px 8px', fontSize: 13 }} value={i.status} disabled={!canManage || busy}
                          onChange={(e) => run(() => api.updateIpo(i.id, { status: e.target.value }))}>
                          {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      {canManage && (
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <a className="btn btn-sm btn-secondary" href={`/admin/catalog/edit?id=${i.id}`}>Edit</a>{' '}
                          <button className="btn btn-sm" style={{ background: 'var(--danger, #c0392b)' }} disabled={busy} onClick={() => onDelete(i)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
