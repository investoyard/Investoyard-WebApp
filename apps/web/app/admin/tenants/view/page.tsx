'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions, Toggle } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { EmpanelmentFields } from '@/components/EmpanelmentFields';
import { EMPANELMENT, isIndividual, type EField } from '@/lib/empanelment';
import * as api from '@/lib/tenants-admin';
import { BrandingPanel, ContentPanel, PagesPanel, TemplatePanel } from "@/components/admin/TenantSitePanels";
import { RichText } from '@/components/ui/RichText';
import { PAGE_LABEL, PARTNER_SCOPE_META, TENANT_PAGE_KEYS } from '@investoyard/shared-types';
import { PartnerKeysPanel } from '@/components/admin/PartnerKeysPanel';
import { PartnerBidLimitsPanel } from '@/components/admin/PartnerBidLimitsPanel';

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

/**
 * Partner API operator controls — scope checkboxes + applicants-per-call cap.
 * Sits below the API keys panel on the tenant view. Saves to the same PATCH
 * endpoint the profile edits use; changes are effective on the very next
 * partner call (no cache, no restart). The scope list itself is
 * PARTNER_SCOPE_META in shared-types.
 */
/* The list is shared with the API's scope guard and the key panel — one list,
   so the screen offers exactly what the guard enforces. */
const SCOPE_META = PARTNER_SCOPE_META;

function ApiAccessControlPanel({ slug, tenant, onSaved }: {
  slug: string;
  tenant: api.PartnerDetail;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState<boolean>(tenant.partnerApiEnabled === true);
  const [scopes, setScopes] = useState<Set<string>>(() => new Set(tenant.partnerApiScopes ?? []));
  const [cap, setCap] = useState<string>(String(tenant.partnerMaxApplicantsPerCall ?? 25));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isBranch = tenant.type === 'branch';
  const inheriting = isBranch && scopes.size === 0;

  const toggle = (key: string) => setScopes((s) => {
    const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });

  const save = async () => {
    const capNum = Math.max(1, Math.min(500, Number(cap) || 25));
    setBusy(true); setErr(null);
    try {
      // The switch and the API groups go through the one audited writer that
      // Partner API → Access uses; the per-call cap stays on the tenant route.
      await api.setPartnerAccess(tenant.id, { enabled, scopes: Array.from(scopes) });
      await api.updateTenant(slug, { partnerMaxApplicantsPerCall: capNum });
      setCap(String(capNum));
      setSavedAt(Date.now());
      onSaved();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="fs-head" style={{ marginBottom: 6 }}>
        <div className="t">API access &amp; limits</div>
        <div className="d">Whether this partner may use the Partner API at all, which API groups it may call, and how many applicants it may include in one <span className="mono">print-forms</span> request. Every partner is listed on <a href="/admin/partner-api/access">Partner API → API Access</a>.</div>
      </div>

      <div className="pac-switch" style={{ margin: '12px 0 4px' }}>
        <Toggle on={enabled} onChange={setEnabled} disabled={busy} label="Partner API access" />
        <span><b>{enabled ? 'API access on' : 'API access off'}</b>
          <span className="muted" style={{ fontSize: 12.5, marginLeft: 8 }}>
            {enabled ? 'It may call the API groups ticked below.' : 'Every call is refused and it cannot create keys. The groups below apply once it is switched on.'}
          </span>
        </span>
      </div>
      {err && <div className="banner warn" style={{ margin: '10px 0' }}>{err}</div>}
      {savedAt && !err && <div className="banner ok" style={{ margin: '10px 0' }}>Saved — effective on the next partner call.</div>}

      <div style={{ margin: '12px 0 16px', display: 'grid', gap: 10 }}>
        {SCOPE_META.map((s) => (
          <label key={s.key} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 12, alignItems: 'start', cursor: 'pointer' }}>
            <input type="checkbox" checked={scopes.has(s.key)} onChange={() => toggle(s.key)} style={{ marginTop: 4 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{s.label} <span className="mono muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>{s.key}</span></div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s.hint}</div>
            </div>
          </label>
        ))}
        {isBranch && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Branch behaviour: leave every box unchecked to <b>inherit</b> the parent partner's scopes.
            {inheriting && ' Currently inheriting.'}
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Applicants per print-forms call" hint="Default 25 · maximum 500 (platform ceiling)">
          <input
            className="input mono" style={{ width: 100 }}
            value={cap}
            onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="25"
          />
        </Field>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
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

  /* See the comment at the render site. `data` is null until the fetch lands,
     so this is guarded rather than read directly. */
  const whiteLabelSurface = !!data && (
    data.whitelabel
    /* OUR OWN CHANNEL KEEPS ALL THREE, and leaving it out was a real
       regression caught before shipping: `investoyard` is type `direct`, is not
       white-label and has nothing filled in yet — so a gate on `whitelabel`
       alone hides the ONLY screen for entering our own registered name,
       grievance officer and support contact, which our footer and /contact
       render from. A channel that publishes a site needs these; "white-label"
       is not the same question as "publishes a site". */
    || data.type === 'direct'
    || !!(data.customDomain || data.brandColor || data.goldColor
          || data.logoUrl || data.footerLogoUrl || data.faviconUrl)
    || Object.keys(data.content ?? {}).length > 0
    || Object.values(data.pages ?? {}).some((p) => (p?.html ?? '').trim().length > 0)
  );
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

      {/*
        THESE THREE PANELS ARE A WHITE-LABEL CONCERN AND NOTHING ELSE —
        Branding & domain, Published identity & contact, and Published pages.
        A Standard partner consumes the Partner API from their own front end and
        has no site of ours to brand: there is no footer to print their legal
        entity in, no page to publish their Terms on, and no domain to serve
        either from. Every control in all three is inert for them, sitting at
        the top of the screen staff read first.

        ONE GATE, COMPUTED ONCE. Three copies of this condition is how two of
        them end up disagreeing after the next field is added.

        THE SECOND HALF IS THE PART THAT MATTERS: a Standard tenant that ALREADY
        carries any of this still gets all three panels, because the values are
        not inert just because the screen is hidden. A customDomain on any
        tenant is matched by the host resolver and allowed through the API's
        CORS list; a published Terms page is served by
        GET /tenants/:slug/page/:key to anyone who asks. Hiding the screen would
        leave live configuration with nothing left to clear it from.
      */}
      {whiteLabelSurface ? (
        <>
          <BrandingPanel slug={slug} tenant={data} onSaved={load} />
          <ContentPanel slug={slug} tenant={data} onSaved={load} />
          <PagesPanel slug={slug} tenant={data} onSaved={load} />
          <TemplatePanel slug={slug} tenant={data} onSaved={load} />
        </>
      ) : null}

      {/* Access first: whether this partner may use the API at all decides
          whether its keys mean anything. Platform operators only — the API
          refuses anyone else. */}
      {me?.isSuperAdmin && <ApiAccessControlPanel slug={slug} tenant={data} onSaved={load} />}

      <PartnerKeysPanel tenantId={data.id} title="API keys" />

      {/* Platform operators only: this is what lets a partner send REAL bids. */}
      {me?.isSuperAdmin && <PartnerBidLimitsPanel tenantId={data.id} />}

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
