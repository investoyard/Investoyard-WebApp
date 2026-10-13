'use client';
import { useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, FormActions } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { EmpanelmentFields } from '@/components/EmpanelmentFields';
import * as api from '@/lib/tenants-admin';

/**
 * My Organisation — a partner (or branch) admin's view + edit of their own
 * tenant. The Tenants → Partners & Branches page needs `tenants.manage`
 * (which a partner admin correctly lacks — that opens the whole platform
 * tenant tree), so a partner previously had no way to see or edit their
 * own profile. This page fills that gap.
 *
 * Server enforcement (see admin.service.tenantDetail / updateTenant):
 *   • Access — "superadmin OR active membership on the tenant"; a partner
 *     hitting someone else's slug is refused with 403.
 *   • Field allowlist — a non-superadmin can only PATCH `profile`. Fields
 *     like name/status/brand/commission are silently dropped from the
 *     payload, so the client doesn't have to know the list.
 *   • Legal identity fields (PAN, GSTIN, entityType) are immutable for
 *     non-superadmin — the server preserves the originals.
 *
 * Platform admin also gets this page (opens on the platform tenant); it
 * carries no empanelment profile, so the form is mostly empty for them.
 * The Tenants page remains the operator-facing surface for editing OTHER
 * partners' tenants.
 */
export default function MyOrganisationPage() {
  const me = useOperator();
  const [data, setData] = useState<api.PartnerDetail | null>(null);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const slug = me?.homeTenant?.slug;

  const load = async () => {
    if (!slug) return;
    setLoading(true); setErr(null);
    try {
      const d = await api.fetchTenant(slug);
      setData(d);
      setProfile((d.profile ?? {}) as Record<string, any>);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [slug]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.updateTenant(slug!, { profile });
      setSavedAt(Date.now());
      setEdit(false);
      await load();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (me === null) return <NoAccess />;
  if (me === undefined) return <Loader />;
  if (loading) return <Loader />;
  if (!data) return <div className="banner warn">{err ?? 'Organisation not found.'}</div>;

  const typeLabel = data.type === 'partner' ? 'Partner'
    : data.type === 'branch' ? 'Branch'
    : data.type === 'platform' ? 'Platform'
    : data.type;

  // Every user in the tenant sees the organisation profile; only an Admin
  // (`users.manage` — the same gate that identifies "an admin, not a staff
  // viewer") gets the Edit button. The server also refuses non-admin saves
  // via the `updateTenant` allowlist, so this is UI matching the wire.
  const canEdit = operatorCan(me, 'users.manage');

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHead
        title="My Organisation"
        sub={`${data.name} · ${typeLabel}${data.code ? ` · Code ${data.code}` : ''}${canEdit
          ? ' · Update your contact person, documents, and other empanelment details here — the operator sees the same profile on your tenant record.'
          : ' · Read-only view. Ask an admin on your organisation to update contact person, documents, or empanelment details.'}`}
        actions={canEdit && !edit ? (
          <button className="btn" onClick={() => setEdit(true)}>
            <Icon name="edit" size={15} /> Edit profile
          </button>
        ) : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {savedAt && !edit && <div className="banner ok" style={{ marginBottom: 16 }}>Profile updated.</div>}

      {/* Read-only header — the fields no partner admin can change. */}
      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head" style={{ marginBottom: 14 }}><div className="t">Identity</div></div>
        <div className="form-grid">
          <div className="field"><label>Organisation name</label><div style={{ fontSize: 15, fontWeight: 500 }}>{data.name}</div></div>
          <div className="field"><label>Type</label><div style={{ fontSize: 15 }}>{typeLabel}{data.whitelabel ? ' · white-label' : ''}</div></div>
          <div className="field"><label>Channel code</label><div className="mono" style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>{data.code ?? '—'}</div></div>
          <div className="field"><label>Status</label><div style={{ fontSize: 15 }}>{data.status === 'active'
            ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>active</span>
            : <span className="pill">{data.status}</span>}</div></div>
          {data.parent && (
            <div className="field"><label>Parent partner</label><div style={{ fontSize: 15 }}>{data.parent.name}</div></div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          Legal identity (PAN, GSTIN, entity type) is fixed after approval — a change there means a different legal entity. Contact the operator if you need one of these updated.
        </div>
      </div></div>

      {/* Empanelment profile — read-only for non-admins, editable for admins. */}
      <div>
        {edit && canEdit ? (
          <>
            <EmpanelmentFields profile={profile} onChange={setProfile} startAt={1} />
            <FormActions>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
              <button className="btn btn-secondary" onClick={() => { setProfile((data.profile ?? {}) as Record<string, any>); setEdit(false); }}>Cancel</button>
            </FormActions>
          </>
        ) : (
          Object.keys(profile).length ? (
            <ProfileSummary profile={profile} />
          ) : (
            <div className="card"><div className="card-pad muted">
              {canEdit
                ? <>No empanelment profile captured yet. Click <b>Edit profile</b> above to add your contact person, address, SEBI / ARN references and supporting documents.</>
                : 'No empanelment profile captured yet. Ask an admin on your organisation to add contact person, address, and supporting documents.'}
            </div></div>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Minimal read-only rendering of the empanelment profile. Mirrors what
 * the operator sees on the Tenant detail page, without the extra chrome
 * (channel code / commission / brand — those belong on the operator side).
 */
function ProfileSummary({ profile }: { profile: Record<string, any> }) {
  const rows = Object.entries(profile)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
      let display: any = String(v);
      if (typeof v === 'object' && v && 'url' in (v as any)) {
        const d: any = v;
        display = <a href={d.url} target="_blank" rel="noreferrer">{d.name ?? 'View document'}</a>;
      } else if (Array.isArray(v)) {
        display = v.join(', ');
      }
      return { k, label, display };
    });
  if (!rows.length) return null;
  return (
    <div className="card"><div className="card-pad">
      <div className="fs-head" style={{ marginBottom: 14 }}><div className="t">Empanelment profile</div></div>
      <div className="form-grid">
        {rows.map((r) => (
          <div className="field" key={r.k}>
            <label>{r.label}</label>
            <div style={{ fontSize: 14, wordBreak: 'break-word' }}>{r.display}</div>
          </div>
        ))}
      </div>
    </div></div>
  );
}
