'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const STATUSES = ['upcoming', 'open', 'closed', 'listed', 'withdrawn'] as const;
const blankForm = { symbol: '', name: '', type: 'mainboard', priceBandMin: '', priceBandMax: '', lotSize: '', issueSizeCr: '', registrar: '', openDate: '', closeDate: '' };

export default function AdminCatalog() {
  const s = useAdmin((x) => x);
  const [ipos, setIpos] = useState<api.AdminIpo[]>([]);
  const [form, setForm] = useState({ ...blankForm });
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

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const onCreate = () => {
    if (!/^[A-Z0-9]{2,12}$/.test(form.symbol) || !form.name.trim()) { setErr('Enter a valid uppercase symbol and a name.'); return; }
    run(async () => {
      await api.createIpo({
        symbol: form.symbol, name: form.name, type: form.type,
        priceBandMin: num(form.priceBandMin), priceBandMax: num(form.priceBandMax), lotSize: num(form.lotSize),
        issueSizeCr: num(form.issueSizeCr), registrar: form.registrar || undefined,
        openDate: form.openDate || undefined, closeDate: form.closeDate || undefined,
      });
      setForm({ ...blankForm });
    });
  };

  if (!can(s, 'ipos.view')) return <NoAccess />;
  const canManage = can(s, 'ipos.manage');

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>IPO catalog</h1><p className="muted">The live catalog every tenant reads — {ipos.length} issues.</p></div>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {loading ? <div className="muted">Loading…</div> : (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Symbol</th><th>Name</th><th>Type</th><th>Band</th><th>Lot</th><th>Close</th><th>GMP</th><th>Status</th></tr></thead>
                <tbody>
                  {ipos.map((i) => (
                    <tr key={i.id}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {canManage && (
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Add an IPO</h3>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Symbol"><input className="input mono" style={{ width: 110 }} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} /></Field>
                <Field label="Name"><input className="input" style={{ width: 200 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Type"><select className="input" style={{ width: 120 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="mainboard">Mainboard</option><option value="sme">SME</option></select></Field>
                <Field label="Band ₹ min"><input className="input mono" style={{ width: 80 }} value={form.priceBandMin} onChange={(e) => setForm({ ...form, priceBandMin: e.target.value })} /></Field>
                <Field label="max"><input className="input mono" style={{ width: 80 }} value={form.priceBandMax} onChange={(e) => setForm({ ...form, priceBandMax: e.target.value })} /></Field>
                <Field label="Lot"><input className="input mono" style={{ width: 80 }} value={form.lotSize} onChange={(e) => setForm({ ...form, lotSize: e.target.value })} /></Field>
                <Field label="Issue ₹cr"><input className="input mono" style={{ width: 90 }} value={form.issueSizeCr} onChange={(e) => setForm({ ...form, issueSizeCr: e.target.value })} /></Field>
                <Field label="Open"><input className="input mono" style={{ width: 130 }} placeholder="YYYY-MM-DD" value={form.openDate} onChange={(e) => setForm({ ...form, openDate: e.target.value })} /></Field>
                <Field label="Close"><input className="input mono" style={{ width: 130 }} placeholder="YYYY-MM-DD" value={form.closeDate} onChange={(e) => setForm({ ...form, closeDate: e.target.value })} /></Field>
                <button className="btn" disabled={busy} onClick={onCreate}>Add IPO</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="muted" style={{ fontSize: 11 }}>{label}</label>
      {children}
    </div>
  );
}
