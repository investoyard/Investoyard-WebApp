'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { EmpanelmentFields } from '@/components/EmpanelmentFields';
import { EMPANELMENT, isIndividual, type EField } from '@/lib/empanelment';
import * as api from '@/lib/tenants-admin';

function fmtVal(f: EField, v: any) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (f.type === 'doc') return v?.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.name ?? 'View document'}</a> : null;
  if (f.type === 'products') return (v as string[]).join(', ');
  return String(v);
}

function ProfileView({ profile }: { profile: Record<string, any> }) {
  const individual = isIndividual(profile.applicantType);
  return (
    <>
      {EMPANELMENT.map((s) => {
        const rows = s.fields
          .filter((f) => !f.showFor || (f.showFor === 'individual') === individual)
          .map((f) => ({ f, node: fmtVal(f, profile[f.key]) }))
          .filter((r) => r.node != null);
        if (!rows.length) return null;
        return (
          <div className="form-section" key={s.key}>
            <div className="fs-head"><div className="t">{s.title}</div></div>
            <div className="form-grid">
              {rows.map(({ f, node }) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <div style={{ fontSize: 14, wordBreak: 'break-word' }}>{node}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** API access — issue/revoke keys for the white-label Print-PDF API. */
function ApiKeysPanel({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<api.PartnerApiKeyRow[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ keyId: string; apiKey: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.listPartnerKeys(tenantId).then(setRows).catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  const generate = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.createPartnerKey(tenantId, label || undefined); setFresh(r); setLabel(''); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true); setErr(null);
    try { await api.revokePartnerKey(id); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="fs-head" style={{ marginBottom: 6 }}>
        <div className="t">API access — Print-PDF</div>
        <div className="d">Partner calls <span className="mono">POST /partner/v1/print-forms</span> with header <span className="mono">X-Api-Key: keyId.secret</span>. Forms number from each IPO&apos;s own PDF series.</div>
      </div>
      {err && <div className="banner warn" style={{ margin: '10px 0' }}>{err}</div>}
      {fresh && (
        <div className="banner ok" style={{ margin: '10px 0', wordBreak: 'break-all' }}>
          Key created — copy it NOW, the secret is never shown again:&nbsp;
          <b className="mono">{fresh.apiKey}</b>
        </div>
      )}
      <div className="row" style={{ gap: 8, margin: '10px 0 14px' }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Label (e.g. Production)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-sm" disabled={busy} onClick={generate}>{busy ? 'Working…' : 'Generate key'}</button>
      </div>
      {rows === null ? <Loader /> : rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13.5 }}>No API keys yet.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Key ID</th><th>Label</th><th>Status</th><th>Created</th><th>Last used</th><th /></tr></thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.id}>
                <td className="mono">{k.keyId}</td>
                <td>{k.label ?? '—'}</td>
                <td>{k.active ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>active</span> : <span className="pill">revoked</span>}</td>
                <td>{new Date(k.createdAt).toLocaleDateString('en-IN')}</td>
                <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('en-IN') : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {k.active && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => revoke(k.id)}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div></div>
  );
}

function PartnerProfilePage() {
  const me = useOperator();
  const slug = useSearchParams().get('slug') ?? '';
  const [data, setData] = useState<api.PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [commission, setCommission] = useState('');
  const [commBusy, setCommBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const d = await api.fetchTenant(slug); setData(d); setProfile(d.profile ?? {}); setCommission(d.commissionRate != null ? String(d.commissionRate) : ''); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  };

  const saveCommission = async () => {
    setCommBusy(true); setErr(null);
    try { await api.updateTenant(slug, { commissionRate: commission === '' ? null : Number(commission) }); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setCommBusy(false); }
  };
  useEffect(() => { if (slug) load(); /* eslint-disable-next-line */ }, [slug]);

  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.updateTenant(slug, { profile }); setEdit(false); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (!operatorCan(me, 'tenants.manage')) return <NoAccess />;
  if (loading) return <Loader />;
  if (!data) return <div className="banner warn">{err ?? 'Partner not found.'}</div>;

  return (
    <div style={{ maxWidth: 1360 }}>
      <PageHead
        back={{ href: '/admin/tenants', label: 'Partners & tenants' }}
        title={data.name}
        sub={`${data.type === 'branch' ? 'Branch' : 'Partner'}${data.whitelabel ? ' · white-label' : ''}${data.customDomain ? ` · ${data.customDomain}` : ''} · ${data.counts.branches} branches · ${data.counts.operators} operators`}
        actions={!edit ? (
          <>
            <button className="btn btn-secondary" onClick={() => api.downloadEmpanelmentPdf(slug).catch((e) => setErr(String(e?.message ?? e)))}>Download form</button>
            <button className="btn btn-secondary" onClick={() => setEdit(true)}>Edit profile</button>
          </>
        ) : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head" style={{ marginBottom: 14 }}><div className="t">Channel & commercials</div></div>
        <div className="form-grid">
          <div className="field"><label>Channel code</label><div className="mono" style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1 }}>{data.code ?? '—'}</div></div>
          <Field label="Commission %" hint="Applied to this channel's bids">
            <div className="row" style={{ gap: 8 }}>
              <input className="input mono" style={{ width: 110 }} value={commission} onChange={(e) => setCommission(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2.5" />
              <button className="btn btn-sm" disabled={commBusy || commission === (data.commissionRate != null ? String(data.commissionRate) : '')} onClick={saveCommission}>{commBusy ? 'Saving…' : 'Save'}</button>
            </div>
          </Field>
        </div>
      </div></div>

      <ApiKeysPanel tenantId={data.id} />

      <div>
        {edit ? (
          <>
            <EmpanelmentFields profile={profile} onChange={setProfile} startAt={1} />
            <FormActions>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
              <button className="btn btn-secondary" onClick={() => { setProfile(data.profile ?? {}); setEdit(false); }}>Cancel</button>
            </FormActions>
          </>
        ) : (
          Object.keys(data.profile ?? {}).length
            ? <ProfileView profile={data.profile} />
            : <div className="card"><div className="card-pad muted">No empanelment profile captured yet. Click <b>Edit profile</b> to add it.</div></div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loader />}><PartnerProfilePage /></Suspense>;
}
