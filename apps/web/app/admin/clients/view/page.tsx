'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/Loader';
import { inr } from '@/lib/format';
import * as api from '@/lib/tenants-admin';

const KYC_CLS: Record<string, string> = { verified: 'ok', pending: 'brand', unverified: 'warn', rejected: 'warn' };
const APP_CLS: Record<string, string> = { allotted: 'ok', not_allotted: 'mut', submitted: 'brand', pending: 'brand', draft: 'mut', failed: 'warn', rejected: 'warn' };

function ClientDetailPage() {
  const me = useOperator();
  const canManage = operatorCan(me, 'clients.manage');
  const id = useSearchParams().get('id') ?? '';
  const [c, setC] = useState<api.ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', status: 'active' as 'active' | 'suspended' });
  const [busy, setBusy] = useState(false);
  const blankKyc = { fullName: '', relationship: 'self', pan: '', dateOfBirth: '', depository: 'NSDL' as 'NSDL' | 'CDSL', dpId: '', clientId: '', bankAccount: '', ifsc: '', upi: '' };
  const [showKyc, setShowKyc] = useState(false);
  const [kyc, setKyc] = useState({ ...blankKyc });
  const [kycBusy, setKycBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const d = await api.fetchClient(id); setC(d); setForm({ name: d.name ?? '', email: d.email ?? '', status: (d.status === 'suspended' ? 'suspended' : 'active') }); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (id) load(); /* eslint-disable-next-line */ }, [id]);

  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.updateClient(id, form); setEdit(false); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const addKyc = async () => {
    if (!kyc.fullName.trim()) return setErr('Enter the applicant name.');
    if (!/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(kyc.pan)) return setErr('Enter a valid PAN (ABCDE1234F).');
    if (!kyc.dpId.trim() || !kyc.clientId.trim()) return setErr('DP ID and Client ID are required.');
    setKycBusy(true); setErr(null);
    try {
      await api.addClientProfile(id, {
        fullName: kyc.fullName.trim(), relationship: kyc.relationship, pan: kyc.pan.trim().toUpperCase(),
        dateOfBirth: kyc.dateOfBirth || undefined, depository: kyc.depository, dpId: kyc.dpId.trim(), clientId: kyc.clientId.trim(),
        bankAccount: kyc.bankAccount || undefined, ifsc: kyc.ifsc || undefined, upi: kyc.upi || undefined,
      });
      setShowKyc(false); setKyc({ ...blankKyc }); await load();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setKycBusy(false); }
  };

  if (!operatorCan(me, 'clients.view')) return <NoAccess />;
  if (loading) return <Loader />;
  if (!c) return <div className="banner warn">{err ?? 'Client not found.'}</div>;

  return (
    <div style={{ maxWidth: 940 }}>
      <PageHead
        back={{ href: '/admin/clients', label: 'Clients' }}
        title={c.name ?? c.mobileMasked ?? 'Client'}
        sub={`${c.tenant.name} · joined ${c.createdAt}${c.status !== 'active' ? ` · ${c.status}` : ''}`}
        actions={canManage && !edit ? <button className="btn btn-secondary" onClick={() => setEdit(true)}>Edit</button> : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head" style={{ marginBottom: 14 }}><div className="t">Contact</div></div>
        {edit ? (
          <>
            <div className="form-grid">
              <Field label="Name" span={2}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </Field>
              <Field label="Mobile" hint="Set at sign-in; cannot be edited here"><div className="input mono" style={{ background: 'var(--bg-2)' }}>{c.mobileMasked ?? '—'}</div></Field>
            </div>
            <FormActions>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
            </FormActions>
          </>
        ) : (
          <div className="form-grid">
            <div className="field"><label>Mobile</label><div className="mono" style={{ fontSize: 14 }}>{c.mobileMasked ?? '—'}</div></div>
            <div className="field"><label>Email</label><div style={{ fontSize: 14 }}>{c.email ?? '—'}</div></div>
            <div className="field"><label>Marketing consent</label><div style={{ fontSize: 14 }}>{c.marketingConsent ? 'Yes' : 'No'}</div></div>
          </div>
        )}
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="between" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
          <div className="fs-head" style={{ margin: 0 }}><div className="t">KYC profiles</div><div className="d">Self &amp; family — each applies with their own PAN, demat &amp; UPI.</div></div>
          {canManage && <button className="btn btn-secondary btn-sm" onClick={() => setShowKyc((v) => !v)}>{showKyc ? 'Close' : '＋ Add PAN / demat'}</button>}
        </div>

        {showKyc && (
          <Modal title="Add KYC / demat profile" sub="Self or a family member — their own PAN, demat & UPI. PAN, bank & UPI are vault-encrypted." onClose={() => setShowKyc(false)} wide>
            {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
            <div className="form-grid">
              <Field label="Applicant name" required span={2}><input className="input" value={kyc.fullName} onChange={(e) => setKyc({ ...kyc, fullName: e.target.value })} /></Field>
              <Field label="Relationship"><select className="input" value={kyc.relationship} onChange={(e) => setKyc({ ...kyc, relationship: e.target.value })}>{['self', 'spouse', 'child', 'parent', 'sibling', 'other'].map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
              <Field label="PAN" required hint="Their own PAN — never a shared one"><input className="input mono" value={kyc.pan} onChange={(e) => setKyc({ ...kyc, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })} placeholder="ABCDE1234F" /></Field>
              <Field label="Date of birth"><input className="input mono" type="date" value={kyc.dateOfBirth} onChange={(e) => setKyc({ ...kyc, dateOfBirth: e.target.value })} /></Field>
              <Field label="Depository"><select className="input" value={kyc.depository} onChange={(e) => setKyc({ ...kyc, depository: e.target.value as any })}><option value="NSDL">NSDL</option><option value="CDSL">CDSL</option></select></Field>
              <Field label="DP ID" required><input className="input mono" value={kyc.dpId} onChange={(e) => setKyc({ ...kyc, dpId: e.target.value })} /></Field>
              <Field label="Client ID" required><input className="input mono" value={kyc.clientId} onChange={(e) => setKyc({ ...kyc, clientId: e.target.value })} /></Field>
              <Field label="Bank account no."><input className="input mono" value={kyc.bankAccount} onChange={(e) => setKyc({ ...kyc, bankAccount: e.target.value })} /></Field>
              <Field label="IFSC"><input className="input mono" value={kyc.ifsc} onChange={(e) => setKyc({ ...kyc, ifsc: e.target.value.toUpperCase() })} /></Field>
              <Field label="UPI ID" span={2}><input className="input mono" value={kyc.upi} onChange={(e) => setKyc({ ...kyc, upi: e.target.value })} placeholder="name@bank" /></Field>
            </div>
            <FormActions>
              <button className="btn" disabled={kycBusy} onClick={addKyc}>{kycBusy ? 'Saving…' : 'Add profile'}</button>
              <button className="btn btn-secondary" onClick={() => setShowKyc(false)}>Cancel</button>
            </FormActions>
          </Modal>
        )}

        {c.profiles.length === 0 ? <div className="muted">No KYC profiles yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Relationship</th><th>PAN</th><th>Depository</th><th>DP / Client ID</th><th>IFSC</th><th>KYC</th></tr></thead>
              <tbody>
                {c.profiles.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.fullName}</b></td>
                    <td style={{ textTransform: 'capitalize' }}>{p.relationship}</td>
                    <td className="mono">{p.panMasked ?? '—'}</td>
                    <td>{p.depository}</td>
                    <td className="mono">{p.dpId} / {p.clientId ?? '—'}</td>
                    <td className="mono">{p.ifsc ?? '—'}</td>
                    <td><span className={`st ${KYC_CLS[p.kycStatus] ?? 'mut'}`}>{p.kycStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div></div>

      <div className="card"><div className="card-pad">
        <div className="fs-head" style={{ marginBottom: 14 }}><div className="t">Applications</div></div>
        {c.applications.length === 0 ? <div className="muted">No applications yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>IPO</th><th>Category</th><th>Lots</th><th>Amount</th><th>Status</th><th>Allotted</th><th>Applied</th></tr></thead>
              <tbody>
                {c.applications.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.ipoSymbol ?? '—'}</b> <span className="muted">{a.ipoName}</span></td>
                    <td style={{ textTransform: 'uppercase', fontSize: 12 }}>{a.category}</td>
                    <td className="mono">{a.lots}</td>
                    <td className="mono">{inr(a.amount)}</td>
                    <td><span className={`st ${APP_CLS[a.status] ?? 'mut'}`}>{a.status.replace('_', ' ')}</span></td>
                    <td className="mono">{a.allottedLots ?? '—'}</td>
                    <td className="mono muted">{a.appliedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div></div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loader />}><ClientDetailPage /></Suspense>;
}
