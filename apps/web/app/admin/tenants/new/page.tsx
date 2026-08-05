'use client';
import { useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Section, Field, Segmented, FormActions, PasswordInput } from '@/components/ui/Form';
import { Icon } from '@/components/Icon';
import { EmpanelmentFields } from '@/components/EmpanelmentFields';
import { isIndividual } from '@/lib/empanelment';
import * as api from '@/lib/tenants-admin';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function RegisterPartner() {
  const me = useOperator();
  const [kind, setKind] = useState<'partner' | 'branch'>('partner');
  const [whitelabel, setWhitelabel] = useState(false);
  const [parents, setParents] = useState<api.PartnerRow[]>([]);
  const [t, setT] = useState({
    name: '', slug: '', slugTouched: false, parentSlug: '',
    brandColor: '', goldColor: '', logoUrl: '', customDomain: '', commissionRate: '',
    adminName: '', adminUsername: '', adminPassword: '',
  });
  const [profile, setProfile] = useState<Record<string, any>>({ applicantType: 'Company' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<api.RegisterTenantResult | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  // Deep-link support: /admin/tenants/new?kind=branch&parent=<slug>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('kind') === 'branch') {
      setKind('branch');
      const parent = p.get('parent'); if (parent) setT((s) => ({ ...s, parentSlug: parent }));
    }
  }, []);

  useEffect(() => { if (kind === 'branch') api.fetchTenants().then((rows) => setParents(rows.filter((r) => r.type === 'partner'))).catch(() => {}); }, [kind]);

  const set = (part: Partial<typeof t>) => setT((s) => ({ ...s, ...part }));
  const onName = (v: string) => set({ name: v, ...(t.slugTouched ? {} : { slug: slugify(v) }) });

  const effectiveKind = (): 'partner' | 'whitelabel' | 'branch' => (kind === 'branch' ? 'branch' : whitelabel ? 'whitelabel' : 'partner');

  const submit = async () => {
    if (!t.name.trim()) return setErr('Enter a display name.');
    if (!/^[a-z0-9-]{2,40}$/.test(t.slug)) return setErr('Enter a valid slug (2–40 lowercase letters/digits/hyphens).');
    if (kind === 'branch' && !t.parentSlug) return setErr('Pick the parent partner for this branch.');
    if (!t.adminName.trim() || !/^[A-Za-z0-9_.]{3,40}$/.test(t.adminUsername)) return setErr('Enter the admin name and a valid username (3–40 letters/digits/._).');
    setBusy(true); setErr(null);
    try {
      const res = await api.registerTenant({
        kind: effectiveKind(), name: t.name.trim(), slug: t.slug,
        parentSlug: kind === 'branch' ? t.parentSlug : undefined,
        brandColor: whitelabel ? (t.brandColor || undefined) : undefined,
        goldColor: whitelabel ? (t.goldColor || undefined) : undefined,
        logoUrl: whitelabel ? (t.logoUrl || undefined) : undefined,
        customDomain: whitelabel ? (t.customDomain || undefined) : undefined,
        adminName: t.adminName.trim(), adminUsername: t.adminUsername, adminPassword: t.adminPassword || undefined,
        commissionRate: t.commissionRate ? Number(t.commissionRate) : undefined,
        profile,
      });
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const onLogo = async (file?: File) => {
    if (!file) return;
    setLogoBusy(true);
    try { set({ logoUrl: await api.uploadImage(file) }); } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setLogoBusy(false); }
  };

  if (!operatorCan(me, 'tenants.manage')) return <NoAccess />;

  if (result) {
    return (
      <div style={{ maxWidth: 720 }}>
        <PageHead back={{ href: '/admin/tenants', label: 'Partners & tenants' }} title="Partner registered" />
        <div className="card"><div className="card-pad">
          <div className="banner info" style={{ marginBottom: 18 }}>
            <b>{result.tenant.name}</b> is registered ({result.tenant.type}{result.tenant.whitelabel ? ', white-label' : ''}{result.tenant.customDomain ? ` · ${result.tenant.customDomain}` : ''}).
          </div>
          <div className="form-grid">
            <Field label="Channel code" hint="Auto-mapped onto this channel's bids"><div className="input mono" style={{ background: 'var(--bg-2)', fontWeight: 700, letterSpacing: 1 }}>{result.tenant.code ?? '—'}</div></Field>
            <Field label="Admin username"><div className="input mono" style={{ background: 'var(--bg-2)' }}>{result.admin.username}</div></Field>
            <Field label="Temporary password" hint={result.admin.temporaryPassword ? 'Share this securely — shown only once.' : 'Set as provided.'}>
              <div className="input mono" style={{ background: 'var(--bg-2)' }}>{result.admin.temporaryPassword ?? '••••••••'}</div>
            </Field>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 18 }}>
            <a className="btn" href="/admin/tenants">Done</a>
            <button className="btn btn-secondary" onClick={() => { setResult(null); setT({ name: '', slug: '', slugTouched: false, parentSlug: '', brandColor: '', goldColor: '', logoUrl: '', customDomain: '', commissionRate: '', adminName: '', adminUsername: '', adminPassword: '' }); setProfile({ applicantType: 'Company' }); }}>Register another</button>
          </div>
        </div></div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1360 }}>
      <PageHead
        back={{ href: '/admin/tenants', label: 'Partners & tenants' }}
        title="Register a partner"
        sub="Full empanelment — the same form for partners and white-label partners (turn on white-label to capture brand & domain)."
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div>
        <Section title="Channel">
          <Field label="Type"><Segmented value={kind} onChange={(v) => setKind(v as any)} options={[{ value: 'partner', label: 'Partner' }, { value: 'branch', label: 'Branch of a partner' }]} /></Field>
          {kind === 'branch' && (
            <Field label="Parent partner" required span={2}>
              <select className="input" value={t.parentSlug} onChange={(e) => set({ parentSlug: e.target.value })}>
                <option value="">— select —</option>
                {parents.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Display name" required span={2} hint="Shown across the admin console."><input className="input" value={t.name} onChange={(e) => onName(e.target.value)} placeholder="Axis Capital" /></Field>
          <Field label="Slug" required hint="URL-safe id"><input className="input mono" value={t.slug} onChange={(e) => set({ slug: slugify(e.target.value), slugTouched: true })} placeholder="axis-capital" /></Field>
          <Field label="Commission %" hint="On this channel's bids · a 6-digit code is auto-assigned"><input className="input mono" value={t.commissionRate} onChange={(e) => set({ commissionRate: e.target.value.replace(/[^\d.]/g, '') })} placeholder="2.5" /></Field>
          {kind === 'partner' && (
            <Field label="White-label?" span={3} hint="If on, the partner gets its own brand + domain and GMP is turned off (locked) for compliance.">
              <div className="row" style={{ gap: 10, paddingTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <input type="checkbox" style={{ width: 17, height: 17, accentColor: 'var(--brand)' }} checked={whitelabel} onChange={(e) => setWhitelabel(e.target.checked)} />
                  This partner needs their own white-label brand
                </label>
              </div>
            </Field>
          )}
        </Section>

        {whitelabel && kind === 'partner' && (
          <Section title="White-label brand" desc="The partner's own identity for their hosted experience.">
            <Field label="Brand / display name" hint="Falls back to the display name"><input className="input" value={t.name} onChange={(e) => onName(e.target.value)} /></Field>
            <Field label="Custom domain" span={2}><input className="input mono" value={t.customDomain} onChange={(e) => set({ customDomain: e.target.value })} placeholder="ipo.partner.com" /></Field>
            <Field label="Brand color"><input className="input mono" value={t.brandColor} onChange={(e) => set({ brandColor: e.target.value })} placeholder="#0b5cad" /></Field>
            <Field label="Gold / accent color"><input className="input mono" value={t.goldColor} onChange={(e) => set({ goldColor: e.target.value })} placeholder="#ffcb32" /></Field>
            <Field label="Logo" span={2}>
              <div className="up-tile">
                <img className="up-preview" src={t.logoUrl || undefined} alt="" />
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {logoBusy ? 'Uploading…' : t.logoUrl ? 'Replace' : 'Upload logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={(e) => onLogo(e.target.files?.[0])} />
                </label>
                {t.logoUrl && <button type="button" className="icon-btn danger" onClick={() => set({ logoUrl: '' })} title="Remove logo"><Icon name="trash" size={15} /></button>}
              </div>
            </Field>
          </Section>
        )}

        <Section title="Admin login" desc="The partner's first operator account (auto-created). Leave the password blank to generate a temporary one.">
          <Field label="Admin name" required span={2}><input className="input" value={t.adminName} onChange={(e) => set({ adminName: e.target.value })} /></Field>
          <Field label="Username" required><input className="input mono" value={t.adminUsername} onChange={(e) => set({ adminUsername: e.target.value.replace(/[^A-Za-z0-9_.]/g, '').slice(0, 40) })} placeholder="axis.admin" /></Field>
          <Field label="Password" hint="Blank → auto-generate (shown once)"><PasswordInput value={t.adminPassword} onChange={(v) => set({ adminPassword: v })} placeholder="auto-generate" /></Field>
        </Section>

        <EmpanelmentFields profile={profile} onChange={setProfile} startAt={1} />

        <FormActions>
          <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Registering…' : 'Register partner'}</button>
          <a className="btn btn-secondary" href="/admin/tenants">Cancel</a>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>{isIndividual(profile.applicantType) ? 'Individual' : 'Non-individual'} applicant</span>
        </FormActions>
      </div>
    </div>
  );
}
