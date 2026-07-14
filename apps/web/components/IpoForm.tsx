'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const STATUSES = ['upcoming', 'open', 'closed', 'listed', 'withdrawn'] as const;
const RESERVATIONS = ['shareholder', 'employee'] as const;
const DOC_TYPES = ['RHP', 'DRHP', 'Prospectus', 'Anchor allocation'] as const;

type Doc = { type: string; url: string };
interface FormState {
  symbol: string; name: string; type: string; status: string;
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

export function IpoForm({ ipoId }: { ipoId?: string }) {
  const me = useOperator();
  const router = useRouter();
  const editing = !!ipoId;
  const [form, setForm] = useState<FormState>(blankForm());
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ipoId) return;
    (async () => {
      try {
        const d = await api.fetchIpo(ipoId);
        setForm({
          symbol: d.symbol, name: d.name, type: d.type, status: d.status,
          priceBandMin: str(d.priceBandMin), priceBandMax: str(d.priceBandMax), lotSize: str(d.lotSize),
          minAmount: str(d.minAmount), issueSizeCr: str(d.issueSizeCr),
          registrar: str(d.registrar), isin: str(d.isin), logoUrl: str(d.logoUrl), objectsOfIssue: str(d.objectsOfIssue),
          openDate: str(d.openDate), closeDate: str(d.closeDate), allotmentDate: str(d.allotmentDate), listingDate: str(d.listingDate),
          gmp: str(d.gmp), listingGainPct: str(d.listingGainPct),
          reservations: d.reservations ?? [], documents: (d.documents ?? []).map((x) => ({ type: x.type, url: x.url })),
        });
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, [ipoId]);

  const set = (part: Partial<FormState>) => setForm((f) => ({ ...f, ...part }));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const toggleRes = (r: string) => set({ reservations: form.reservations.includes(r) ? form.reservations.filter((x) => x !== r) : [...form.reservations, r] });

  const onLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true); setErr(null);
    try { set({ logoUrl: await api.uploadImage(file) }); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
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

  const onSave = async () => {
    if (!editing && !/^[A-Z0-9]{2,12}$/.test(form.symbol)) { setErr('Enter a valid uppercase symbol (2–12 letters/digits).'); return; }
    if (!form.name.trim()) { setErr('Enter a name.'); return; }
    setBusy(true); setErr(null);
    try {
      if (editing && ipoId) await api.updateIpo(ipoId, payload());
      else await api.createIpo({ ...payload(), symbol: form.symbol });
      router.push('/admin/catalog');
    } catch (e: any) { setErr(String(e?.message ?? e)); setBusy(false); }
  };

  if (!operatorCan(me, 'ipos.manage')) return <NoAccess />;
  if (loading) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div>
          <a href="/admin/catalog" className="linklike" style={{ fontSize: 13 }}>← IPO catalog</a>
          <h1 style={{ margin: '4px 0 0' }}>{editing ? `Edit ${form.symbol}` : 'Add an IPO'}</h1>
        </div>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="panel">
        <Group title="Basics">
          <Field label="Symbol"><input className="input mono" style={{ width: 110 }} disabled={editing} value={form.symbol} onChange={(e) => set({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} /></Field>
          <Field label="Name"><input className="input" style={{ width: 240 }} value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Type"><select className="input" style={{ width: 120 }} value={form.type} onChange={(e) => set({ type: e.target.value })}><option value="mainboard">Mainboard</option><option value="sme">SME</option></select></Field>
          <Field label="Status"><select className="input" style={{ width: 120 }} value={form.status} onChange={(e) => set({ status: e.target.value })}>{STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}</select></Field>
          <Field label="Logo">
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              {form.logoUrl
                ? <img src={form.logoUrl} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} />
                : <span style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-subtle)', display: 'inline-block' }} />}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={(e) => onLogo(e.target.files?.[0])} />
              <button className="btn btn-sm btn-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : form.logoUrl ? 'Replace' : 'Upload'}</button>
              {form.logoUrl && <button className="btn btn-sm btn-secondary" onClick={() => set({ logoUrl: '' })}>Remove</button>}
            </div>
          </Field>
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

        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <button className="btn" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create IPO'}</button>
          <a className="btn btn-secondary" href="/admin/catalog">Cancel</a>
        </div>
      </div>
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
