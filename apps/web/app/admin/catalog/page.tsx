'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const STATUSES = ['upcoming', 'open', 'closed', 'listed', 'withdrawn'] as const;
const RESERVATIONS = ['shareholder', 'employee'] as const;
const DOC_TYPES = ['RHP', 'DRHP', 'Prospectus', 'Anchor allocation'] as const;

type Doc = { type: string; url: string };
interface FormState {
  id?: string; symbol: string; name: string; type: string; status: string;
  priceBandMin: string; priceBandMax: string; lotSize: string; minAmount: string; issueSizeCr: string;
  registrar: string; isin: string; logoUrl: string; objectsOfIssue: string;
  openDate: string; closeDate: string; allotmentDate: string; listingDate: string;
  gmp: string; listingGainPct: string; reservations: string[]; documents: Doc[];
}
const blankForm = (): FormState => ({
  symbol: '', name: '', type: 'mainboard', status: 'upcoming',
  priceBandMin: '', priceBandMax: '', lotSize: '', minAmount: '', issueSizeCr: '',
  registrar: '', isin: '', logoUrl: '', objectsOfIssue: '',
  openDate: '', closeDate: '', allotmentDate: '', listingDate: '',
  gmp: '', listingGainPct: '', reservations: [], documents: [],
});
const str = (v: any) => (v == null ? '' : String(v));

export default function AdminCatalog() {
  const s = useAdmin((x) => x);
  const [ipos, setIpos] = useState<api.AdminIpo[]>([]);
  const [form, setForm] = useState<FormState>(blankForm());
  const [editing, setEditing] = useState(false);
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
    catch (e: any) { setErr(String(e?.message ?? e)); throw e; }
    finally { setBusy(false); }
  };

  const set = (part: Partial<FormState>) => setForm((f) => ({ ...f, ...part }));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const reset = () => { setForm(blankForm()); setEditing(false); };

  const startEdit = async (id: string) => {
    setErr(null);
    try {
      const d = await api.fetchIpo(id);
      setForm({
        id: d.id, symbol: d.symbol, name: d.name, type: d.type, status: d.status,
        priceBandMin: str(d.priceBandMin), priceBandMax: str(d.priceBandMax), lotSize: str(d.lotSize),
        minAmount: str(d.minAmount), issueSizeCr: str(d.issueSizeCr),
        registrar: str(d.registrar), isin: str(d.isin), logoUrl: str(d.logoUrl), objectsOfIssue: str(d.objectsOfIssue),
        openDate: str(d.openDate), closeDate: str(d.closeDate), allotmentDate: str(d.allotmentDate), listingDate: str(d.listingDate),
        gmp: str(d.gmp), listingGainPct: str(d.listingGainPct),
        reservations: d.reservations ?? [], documents: (d.documents ?? []).map((x) => ({ type: x.type, url: x.url })),
      });
      setEditing(true);
      if (typeof window !== 'undefined') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const payload = (): api.IpoWrite => ({
    name: form.name, type: form.type, status: form.status,
    priceBandMin: num(form.priceBandMin), priceBandMax: num(form.priceBandMax), lotSize: num(form.lotSize),
    minAmount: num(form.minAmount), issueSizeCr: num(form.issueSizeCr),
    registrar: form.registrar || undefined, isin: form.isin || undefined, logoUrl: form.logoUrl || undefined,
    objectsOfIssue: form.objectsOfIssue || undefined,
    openDate: form.openDate || undefined, closeDate: form.closeDate || undefined,
    allotmentDate: form.allotmentDate || undefined, listingDate: form.listingDate || undefined,
    reservations: form.reservations,
    documents: form.documents.filter((d) => d.url.trim()).map((d) => ({ type: d.type, url: d.url.trim() })),
    gmp: num(form.gmp), listingGainPct: num(form.listingGainPct),
  });

  const onSave = () => {
    if (!editing && !/^[A-Z0-9]{2,12}$/.test(form.symbol)) { setErr('Enter a valid uppercase symbol (2–12 letters/digits).'); return; }
    if (!form.name.trim()) { setErr('Enter a name.'); return; }
    run(async () => {
      if (editing && form.id) await api.updateIpo(form.id, payload());
      else await api.createIpo({ ...payload(), symbol: form.symbol });
      reset();
    }).catch(() => { /* error already shown */ });
  };

  const onDelete = (i: api.AdminIpo) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${i.symbol}? This can't be undone.`)) return;
    run(() => api.deleteIpo(i.id)).catch(() => { /* 409 (has applications) shown in banner */ });
  };

  if (!can(s, 'ipos.view')) return <NoAccess />;
  const canManage = can(s, 'ipos.manage');
  const toggleRes = (r: string) => set({ reservations: form.reservations.includes(r) ? form.reservations.filter((x) => x !== r) : [...form.reservations, r] });

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
                <thead><tr><th>Symbol</th><th>Name</th><th>Type</th><th>Band</th><th>Lot</th><th>Close</th><th>GMP</th><th>Status</th>{canManage && <th></th>}</tr></thead>
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
                          onChange={(e) => run(() => api.updateIpo(i.id, { status: e.target.value })).catch(() => {})}>
                          {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      {canManage && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-secondary" disabled={busy} onClick={() => startEdit(i.id)}>Edit</button>{' '}
                          <button className="btn btn-sm" style={{ background: 'var(--danger, #c0392b)' }} disabled={busy} onClick={() => onDelete(i)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {canManage && (
            <div className="panel">
              <div className="between">
                <h3 style={{ marginTop: 0 }}>{editing ? `Edit ${form.symbol}` : 'Add an IPO'}</h3>
                {editing && <button className="btn btn-sm btn-secondary" onClick={reset}>Cancel</button>}
              </div>

              <Group title="Basics">
                <Field label="Symbol"><input className="input mono" style={{ width: 110 }} disabled={editing} value={form.symbol} onChange={(e) => set({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} /></Field>
                <Field label="Name"><input className="input" style={{ width: 220 }} value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="Type"><select className="input" style={{ width: 120 }} value={form.type} onChange={(e) => set({ type: e.target.value })}><option value="mainboard">Mainboard</option><option value="sme">SME</option></select></Field>
                <Field label="Status"><select className="input" style={{ width: 120 }} value={form.status} onChange={(e) => set({ status: e.target.value })}>{STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}</select></Field>
                <Field label="Logo URL"><input className="input" style={{ width: 200 }} value={form.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} /></Field>
              </Group>

              <Group title="Pricing">
                <Field label="Band ₹ min"><input className="input mono" style={{ width: 90 }} value={form.priceBandMin} onChange={(e) => set({ priceBandMin: e.target.value })} /></Field>
                <Field label="Band ₹ max"><input className="input mono" style={{ width: 90 }} value={form.priceBandMax} onChange={(e) => set({ priceBandMax: e.target.value })} /></Field>
                <Field label="Lot size"><input className="input mono" style={{ width: 90 }} value={form.lotSize} onChange={(e) => set({ lotSize: e.target.value })} /></Field>
                <Field label="Min amount ₹"><input className="input mono" style={{ width: 110 }} value={form.minAmount} onChange={(e) => set({ minAmount: e.target.value })} /></Field>
                <Field label="Issue ₹cr"><input className="input mono" style={{ width: 100 }} value={form.issueSizeCr} onChange={(e) => set({ issueSizeCr: e.target.value })} /></Field>
                <Field label="GMP ₹"><input className="input mono" style={{ width: 90 }} value={form.gmp} onChange={(e) => set({ gmp: e.target.value })} /></Field>
                <Field label="Listing gain %"><input className="input mono" style={{ width: 100 }} value={form.listingGainPct} onChange={(e) => set({ listingGainPct: e.target.value })} /></Field>
              </Group>

              <Group title="Timeline">
                <Field label="Open"><input type="date" className="input mono" value={form.openDate} onChange={(e) => set({ openDate: e.target.value })} /></Field>
                <Field label="Close"><input type="date" className="input mono" value={form.closeDate} onChange={(e) => set({ closeDate: e.target.value })} /></Field>
                <Field label="Allotment"><input type="date" className="input mono" value={form.allotmentDate} onChange={(e) => set({ allotmentDate: e.target.value })} /></Field>
                <Field label="Listing"><input type="date" className="input mono" value={form.listingDate} onChange={(e) => set({ listingDate: e.target.value })} /></Field>
              </Group>

              <Group title="Details">
                <Field label="Registrar"><input className="input" style={{ width: 200 }} value={form.registrar} onChange={(e) => set({ registrar: e.target.value })} /></Field>
                <Field label="ISIN"><input className="input mono" style={{ width: 150 }} value={form.isin} onChange={(e) => set({ isin: e.target.value })} /></Field>
                <Field label="Reserved quotas">
                  <div className="row" style={{ gap: 12 }}>
                    {RESERVATIONS.map((r) => (
                      <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                        <input type="checkbox" checked={form.reservations.includes(r)} onChange={() => toggleRes(r)} /> {r}
                      </label>
                    ))}
                  </div>
                </Field>
              </Group>

              <Group title="Objects of the issue">
                <textarea className="input" style={{ width: '100%', minHeight: 60, fontSize: 13 }} value={form.objectsOfIssue} onChange={(e) => set({ objectsOfIssue: e.target.value })} placeholder="What the company will use the proceeds for…" />
              </Group>

              <Group title="Documents">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  {form.documents.map((doc, idx) => (
                    <div className="row" key={idx} style={{ gap: 8, alignItems: 'center' }}>
                      <select className="input" style={{ width: 150 }} value={doc.type} onChange={(e) => set({ documents: form.documents.map((d, i) => i === idx ? { ...d, type: e.target.value } : d) })}>
                        {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input className="input mono" style={{ flex: 1, minWidth: 220 }} placeholder="https://…" value={doc.url} onChange={(e) => set({ documents: form.documents.map((d, i) => i === idx ? { ...d, url: e.target.value } : d) })} />
                      <button className="btn btn-sm btn-secondary" onClick={() => set({ documents: form.documents.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                  ))}
                  <div><button className="btn btn-sm btn-secondary" onClick={() => set({ documents: [...form.documents, { type: 'RHP', url: '' }] })}>+ Add document</button></div>
                </div>
              </Group>

              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add IPO'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border, #e7e3f1)', paddingTop: 12, marginTop: 12 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>
    </div>
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
