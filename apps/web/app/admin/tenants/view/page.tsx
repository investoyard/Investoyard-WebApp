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
import { RichText } from '@/components/ui/RichText';
import { PAGE_LABEL, TENANT_PAGE_KEYS } from '@investoyard/shared-types';

/* The selector's order: what a partner is most likely to be chased for first.
   PAGE_LABEL is the shared map, so the admin and the public page cannot name
   the same document differently. */
const PAGE_ORDER = ['terms', 'privacy', 'disclaimer', 'about'] as const;

function fmtVal(f: EField, v: any) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (f.type === 'doc') return v?.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.name ?? 'View document'}</a> : null;
  if (f.type === 'products') return (v as string[]).join(', ');
  return String(v);
}

/**
 * Our public origin. A partner's A record points here, so it is operator-facing
 * setup copy rather than anything the app resolves — the box itself sits behind
 * NAT at 192.168.46.88 and never sees this address bound locally.
 */
const ORIGIN_IP = '103.107.27.38';

const DOMAIN_TONE: Record<string, { label: string; cls: string }> = {
  unset:        { label: 'Not set',          cls: 'st' },
  refused:      { label: 'Refused',          cls: 'st bad' },
  /* 'no-dns' now means the name resolves NOWHERE. A record that resolves to
     the wrong address is 'other-dns' — a different problem with a different
     owner, and before the two were split this said "DNS not pointing here"
     for a domain whose DNS was verifiably correct worldwide. */
  'no-dns':     { label: 'No DNS record',         cls: 'st bad' },
  'other-dns':  { label: 'DNS points elsewhere',  cls: 'st bad' },
  'no-binding': { label: 'IIS binding missing',   cls: 'st bad' },
  'other-site': { label: 'Another site answers',  cls: 'st bad' },
  'no-tls':     { label: 'Certificate missing',   cls: 'st bad' },
  live:         { label: 'Live',             cls: 'st ok' },
};

/**
 * BRANDING AND DOMAIN, EDITABLE AFTER REGISTRATION.
 *
 * The API has always accepted these fields on PATCH /admin/tenants/:slug —
 * superadmin only — but nothing rendered them, so in practice a partner's logo,
 * colours and domain were write-once at registration and could only be changed
 * with a direct database edit.
 *
 * THE DOMAIN SETUP CARD IS THE POINT OF THE PANEL, not decoration. Four layers
 * have to line up before a white-label works (partner DNS, the IIS binding, the
 * TLS certificate, this customDomain field) and when a partner reports "it does
 * not work" the useful answer names the one that is missing. The Check button
 * asks the server, which probes from outside and reports which layer failed.
 */
function BrandingPanel({ slug, tenant, onSaved }: { slug: string; tenant: api.PartnerDetail; onSaved: () => void }) {
  const [brand, setBrand] = useState(tenant.brandColor ?? '');
  const [gold, setGold] = useState(tenant.goldColor ?? '');
  const [logo, setLogo] = useState(tenant.logoUrl ?? '');
  const [footerLogo, setFooterLogo] = useState(tenant.footerLogoUrl ?? '');
  const [favicon, setFavicon] = useState(tenant.faviconUrl ?? '');
  const [domain, setDomain] = useState(tenant.customDomain ?? '');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [footerBusy, setFooterBusy] = useState(false);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [check, setCheck] = useState<api.DomainCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const dirty =
    brand !== (tenant.brandColor ?? '') || gold !== (tenant.goldColor ?? '') ||
    logo !== (tenant.logoUrl ?? '') || domain !== (tenant.customDomain ?? '') ||
    footerLogo !== (tenant.footerLogoUrl ?? '') || favicon !== (tenant.faviconUrl ?? '');

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.updateTenant(slug, {
        brandColor: brand.trim(), goldColor: gold.trim(),
        logoUrl: logo.trim(), footerLogoUrl: footerLogo.trim(),
        faviconUrl: favicon.trim(), customDomain: domain.trim(),
      });
      setSavedAt(Date.now());
      onSaved();
    } catch (e: any) {
      /* A duplicate customDomain is a UNIQUE violation; say which field, since
         the raw Prisma text names a constraint and not a cause. */
      const m = String(e?.message ?? e);
      setErr(/unique|P2002/i.test(m) ? 'That domain is already assigned to another partner.' : m);
    } finally { setBusy(false); }
  };

  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    setLogoBusy(true); setErr(null);
    try { setLogo(await api.uploadImage(f)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLogoBusy(false); }
  };

  const pickFavicon = async (f: File | undefined) => {
    if (!f) return;
    setFaviconBusy(true); setErr(null);
    try { setFavicon(await api.uploadImage(f)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setFaviconBusy(false); }
  };

  const pickFooterLogo = async (f: File | undefined) => {
    if (!f) return;
    setFooterBusy(true); setErr(null);
    try { setFooterLogo(await api.uploadImage(f)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setFooterBusy(false); }
  };

  const runCheck = async () => {
    setChecking(true); setCheck(null); setErr(null);
    try { setCheck(await api.checkTenantDomain(slug)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setChecking(false); }
  };

  const tone = check ? (DOMAIN_TONE[check.state] ?? DOMAIN_TONE.unset) : null;

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="section-title" style={{ fontSize: 13, marginTop: 0 }}>Branding &amp; domain</div>
      <p className="hint" style={{ marginTop: 0 }}>
        What this partner's clients see. The whole brand scale is derived from the primary colour.
      </p>
      {/* Only reachable for a Standard partner that already carries branding —
          the panel is hidden for one that does not. Says why it is here, because
          otherwise it reads as a screen that should not exist. */}
      {!tenant.whitelabel ? (
        <div className="banner warn" style={{ margin: '0 0 14px' }}>
          This is a <b>Standard</b> partner — they call the Partner API from their own front end and
          have no branded site here, so none of this is shown to anyone. It appears only because
          values are still set. A <b>custom domain</b> is the one that is not inert: it is still
          matched to this tenant and still allowed through the API's CORS list. Clear it unless
          this partner is being made white-label.
        </div>
      ) : null}

      <div className="filter-row">
        <div className="field" style={{ width: 170 }}>
          <label>Primary colour</label>
          <div className="row" style={{ gap: 8 }}>
            <input type="color" style={{ width: 38, height: 34, padding: 2 }}
              value={brand || '#3c2e7e'} onChange={(e) => setBrand(e.target.value)} />
            <input className="input mono" value={brand} placeholder="#3c2e7e"
              onChange={(e) => setBrand(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ width: 170 }}>
          <label>Accent colour <span className="hint">(optional)</span></label>
          <div className="row" style={{ gap: 8 }}>
            <input type="color" style={{ width: 38, height: 34, padding: 2 }}
              value={gold || '#ffcb32'} onChange={(e) => setGold(e.target.value)} />
            <input className="input mono" value={gold} placeholder="#ffcb32"
              onChange={(e) => setGold(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ width: 240 }}>
          <label>Logo</label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            {logo
              ? <img src={logo} alt="" style={{ height: 28, maxWidth: 110, objectFit: 'contain' }} />
              : <span className="hint">Name is used if none</span>}
            <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>
              {logoBusy ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/*" hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
            </label>
            {logo ? <button className="btn btn-sm btn-ghost" onClick={() => setLogo('')}>Clear</button> : null}
          </div>
        </div>
        {/* PREVIEWED ON THE FOOTER'S OWN BACKGROUND, because that is the only
            place the question "can you read this?" can be answered. The
            fallback preview applies the same filter the site will, so what is
            shown here is what their clients get. */}
        <div className="field" style={{ width: 300 }}>
          <label>Footer logo <span className="hint">(optional)</span></label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 10px',
              borderRadius: 7, background: 'linear-gradient(150deg,#4a3a95,#2a2050)' }}>
              {footerLogo
                ? <img src={footerLogo} alt="" style={{ height: 22, maxWidth: 110, objectFit: 'contain' }} />
                : logo
                  ? <img src={logo} alt="" style={{ height: 22, maxWidth: 110, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                  : <span style={{ color: 'rgba(255,255,255,.65)', fontSize: 12 }}>Name is used</span>}
            </span>
            <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>
              {footerBusy ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/*" hidden onChange={(e) => pickFooterLogo(e.target.files?.[0])} />
            </label>
            {footerLogo ? <button className="btn btn-sm btn-ghost" onClick={() => setFooterLogo('')}>Clear</button> : null}
          </div>
          <span className="hint">
            {footerLogo
              ? 'Shown as uploaded on the dark footer.'
              : 'None uploaded — the logo above is shown in white. Upload a light version to keep its colours.'}
          </span>
        </div>
        {/* Previewed at 16px, the size it is actually used at — a mark that
            reads fine at 110px wide can be an unidentifiable smudge in a tab,
            and that is the whole question this field answers. */}
        <div className="field" style={{ width: 260 }}>
          <label>Browser icon <span className="hint">(optional)</span></label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }}>
              {favicon || logo
                ? <img src={favicon || logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                : <span className="hint" style={{ fontSize: 10 }}>none</span>}
            </span>
            <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>
              {faviconBusy ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico,.png,.svg"
                hidden onChange={(e) => pickFavicon(e.target.files?.[0])} />
            </label>
            {favicon ? <button className="btn btn-sm btn-ghost" onClick={() => setFavicon('')}>Clear</button> : null}
          </div>
          <span className="hint">
            {favicon
              ? 'Shown in the browser tab.'
              : logo
                ? 'None uploaded — the logo above is used. A square .ico, .png or .svg reads better.'
                : 'None uploaded — the tab shows no icon rather than ours.'}
          </span>
        </div>
      </div>

      {/* A preview beats a hex code: staff are choosing what a broker's clients
          will see, and nobody reads #3c2e7e as a colour. */}
      <div className="row" style={{ gap: 10, alignItems: 'center', margin: '4px 0 16px' }}>
        <span className="hint">Preview</span>
        <span style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 9, fontSize: 13,
          fontWeight: 600, background: brand || '#3c2e7e', color: '#fff' }}>Apply now</span>
        <span style={{ display: 'inline-block', padding: '5px 11px', borderRadius: 999, fontSize: 12,
          fontWeight: 700, background: gold || '#ffcb32', color: '#2a2052' }}>Exp. Premium</span>
        <span style={{ fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase',
          fontSize: 13, color: brand || '#3c2e7e' }}>{tenant.name}</span>
      </div>

      {/* THE HINT SITS UNDER THE ROW, NOT UNDER THE INPUT, and that is the fix
          rather than a nudge. `.filter-row` is `align-items: flex-end`, so
          every item lines up on its own BOTTOM edge — and a field whose last
          child is a hint line is ~18px taller than one ending at its input.
          The buttons were therefore aligning to the bottom of the hint and
          sitting below the box they act on. Every other field in this panel
          ends at its control, which is why only this row looked wrong. */}
      <div className="filter-row" style={{ marginBottom: 4 }}>
        <div className="field" style={{ width: 280 }}>
          <label>Custom domain</label>
          <input className="input mono" value={domain} placeholder="ipo.partner.com"
            onChange={(e) => setDomain(e.target.value)} />
        </div>
        <button className="btn" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save branding'}
        </button>
        <button className="btn btn-secondary" disabled={checking || !tenant.customDomain} onClick={runCheck}>
          {checking ? 'Checking…' : 'Check domain'}
        </button>
        {savedAt ? <span className="hint" style={{ alignSelf: 'center' }}>Saved.</span> : null}
      </div>
      <div className="hint" style={{ marginBottom: 16 }}>Hostname only — no https://, no path.</div>

      {err ? <div className="banner bad" style={{ marginTop: 10 }}>{err}</div> : null}

      {check && tone ? (
        <div className="panel" style={{ padding: 14, marginTop: 12 }}>
          <div className="row" style={{ gap: 9, alignItems: 'center' }}>
            <span className={tone.cls}>{tone.label}</span>
            <b style={{ fontSize: 13 }}>{check.host ?? '—'}</b>
          </div>
          <p className="muted" style={{ margin: '7px 0 0', fontSize: 13.2, lineHeight: 1.55 }}>{check.detail}</p>
        </div>
      ) : null}

      {/* The setup steps live beside the field so staff never have to remember
          the order — and the order matters: win-acme validates over HTTP, so
          the port-80 binding has to exist before a certificate can. */}
      <div className="panel" style={{ padding: 16, marginTop: 14 }}>
        <b style={{ fontSize: 13.5 }}>Pointing a partner's domain here</b>
        <ol style={{ margin: '9px 0 0', paddingLeft: 20, fontSize: 13.2, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <li>
            The partner adds one DNS record:{' '}
            <code className="mono">A</code> &nbsp;<code className="mono">{domain || 'ipo.partner.com'}</code>
            {' '}&rarr; <code className="mono">{ORIGIN_IP}</code>
          </li>
          <li>Wait for it to resolve, then run on the server (elevated):<br />
            <code className="mono" style={{ fontSize: 12.4 }}>
              scripts\add-partner-domain.ps1 -Domain {domain || 'ipo.partner.com'} -Apply
            </code><br />
            <span className="hint">Adds the HTTP binding, runs win-acme, binds HTTPS with SNI.</span>
          </li>
          <li>Set <b>Custom domain</b> above and save — this is what makes the site render their brand.</li>
          <li>Press <b>Check domain</b> to confirm all four layers.</li>
        </ol>
        <p className="hint" style={{ marginTop: 10 }}>
          Until step 3 the domain serves the default Investoyard brand, and certificate renewal
          is automatic from then on — but never redirect <code className="mono">/.well-known/acme-challenge/</code>
          {' '}to HTTPS or renewals will fail silently in about 60 days.
        </p>
      </div>
    </div></div>
  );
}

/* The fields, in the order staff work through them. `area` renders a textarea:
   an address is a block, not a line. */
type CField = { key: string; label: string; hint?: string; area?: boolean; w?: number };

const IDENTITY_FIELDS: CField[] = [
  { key: 'legalName', label: 'Registered company name', hint: 'As incorporated — the accountable entity', w: 300 },
  { key: 'tradeName', label: 'Trade name', hint: 'Only if different from the channel name', w: 220 },
  { key: 'sebiRegistration', label: 'SEBI registration', hint: 'e.g. INZ000123456', w: 200 },
  { key: 'cin', label: 'CIN', w: 220 },
  { key: 'gstin', label: 'GSTIN', w: 190 },
  { key: 'registeredAddress', label: 'Registered office address', area: true },
];
const CONTACT_FIELDS: CField[] = [
  { key: 'supportEmail', label: 'Support email', w: 260 },
  { key: 'supportPhone', label: 'Support phone', w: 180 },
  { key: 'hours', label: 'Hours', hint: 'e.g. Mon-Fri, 9:00am - 6:00pm IST', w: 260 },
  { key: 'officeAddress', label: 'Office address', hint: 'Shown instead of the registered office, if different', area: true },
  { key: 'grievanceName', label: 'Grievance officer', hint: 'SEBI requires a designated officer', w: 230 },
  { key: 'grievanceEmail', label: 'Grievance email', w: 260 },
  { key: 'grievancePhone', label: 'Grievance phone', w: 180 },
  { key: 'complianceName', label: 'Compliance officer', w: 230 },
  { key: 'complianceEmail', label: 'Compliance email', w: 260 },
  { key: 'compliancePhone', label: 'Compliance phone', w: 180 },
];

/**
 * PUBLISHED IDENTITY — who operates this channel's site, and how to reach them.
 *
 * WHAT THIS FIXES. A white-label domain used to serve OUR identity: the footer
 * said Investoyard, there was no contact page at all, and the Organization
 * structured data on every page declared Safal Capital Services Private Limited
 * as the operator, with our logo. Nothing substitutes across tenants any more —
 * which means a field nobody fills is a field nobody publishes, and that is what
 * the gap list is for.
 *
 * THE GAPS COME FROM THE SERVER, computed by the same `contentGaps()` the site's
 * own resolvers are built on. Re-deriving "what is missing" here would let the
 * panel drift from what the footer actually prints — the mistake this codebase
 * has paid for four times over (three mappers into computeIssue, four readers of
 * sharesUpper), and the reason the subscription readiness card calls
 * `offeredFromIpo()` rather than re-testing its conditions.
 *
 * BLOCKING vs ADVISORY is a real distinction, not a severity gradient: without a
 * grievance officer a SEBI-registered broker's clients have nowhere to escalate,
 * and the only alternative on offer would be ours.
 */
function ContentPanel({ slug, tenant, onSaved }: { slug: string; tenant: api.PartnerDetail; onSaved: () => void }) {
  const stored = tenant.content ?? {};
  const asForm = (o: Record<string, any> | undefined, fields: CField[]) =>
    Object.fromEntries(fields.map((f) => [f.key, String((o ?? {})[f.key] ?? '')]));

  const [idf, setIdf] = useState(() => asForm(stored.identity, IDENTITY_FIELDS));
  const [cf, setCf] = useState(() => asForm(stored.contact, CONTACT_FIELDS));
  const [busy, setBusy] = useState<'identity' | 'contact' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [gaps, setGaps] = useState<api.ContentGap[]>(tenant.contentGaps ?? []);

  const dirtyIn = (form: Record<string, string>, o: Record<string, any> | undefined, fields: CField[]) =>
    fields.some((f) => form[f.key] !== String((o ?? {})[f.key] ?? ''));
  const idDirty = dirtyIn(idf, stored.identity, IDENTITY_FIELDS);
  const cDirty = dirtyIn(cf, stored.contact, CONTACT_FIELDS);

  const saveBlock = async (key: 'identity' | 'contact') => {
    setBusy(key); setErr(null); setSavedKey(null);
    try {
      /* Every box is posted, including the empty ones — that is what makes a
         cleared field DELETE rather than linger (see mergeContentPatch). */
      const r = key === 'identity'
        ? await api.updateTenantIdentity(slug, idf as any)
        : await api.updateTenantContact(slug, cf as any);
      setGaps(r.gaps ?? []);
      setSavedKey(key);
      onSaved();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  const blocking = gaps.filter((g) => g.severity === 'blocking');
  const advisory = gaps.filter((g) => g.severity === 'advisory');

  const box = (f: CField, form: Record<string, string>, set: (v: Record<string, string>) => void) => (
    <div className="field" key={f.key} style={{ width: f.area ? '100%' : f.w ?? 220 }}>
      <label>{f.label}</label>
      {f.area ? (
        <textarea className="input" rows={3} style={{ resize: 'vertical' }}
          value={form[f.key]} onChange={(e) => set({ ...form, [f.key]: e.target.value })} />
      ) : (
        <input className="input" value={form[f.key]}
          onChange={(e) => set({ ...form, [f.key]: e.target.value })} />
      )}
      {f.hint ? <span className="hint">{f.hint}</span> : null}
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="section-title" style={{ fontSize: 13, marginTop: 0 }}>Published identity &amp; contact</div>
      <p className="hint" style={{ marginTop: 0 }}>
        What this channel&apos;s site says about who runs it — the footer, the Contact page and the
        structured data on every page. Nothing here is inherited from Investoyard: a field left
        blank is simply not published.
      </p>

      {/* The gap list leads, because it is the reason to open the panel — and it
          renders nothing at all when there is nothing to say. A card that is
          permanently present and permanently empty is a card people stop
          reading, which is how ten SME issues closed with no subscription data. */}
      {blocking.length ? (
        <div className="banner bad" style={{ marginBottom: 14 }}>
          <b>Not ready for this partner&apos;s customers.</b>{' '}
          Still missing: {blocking.map((g) => g.label).join(' · ')}. Without a registered name the
          footer has no accountable entity, and without a grievance officer their clients have
          nowhere to escalate.
        </div>
      ) : gaps.length ? (
        <div className="banner" style={{ marginBottom: 14 }}>
          Ready to go live. Still worth filling: {advisory.map((g) => g.label).join(' · ')}.
        </div>
      ) : null}

      <div className="fs-head" style={{ marginBottom: 10 }}><div className="t">Operating entity</div></div>
      <div className="filter-row">{IDENTITY_FIELDS.map((f) => box(f, idf, setIdf))}</div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <button className="btn" disabled={busy !== null || !idDirty} onClick={() => saveBlock('identity')}>
          {busy === 'identity' ? 'Saving…' : 'Save entity'}
        </button>
        {savedKey === 'identity' ? <span className="hint">Saved.</span> : null}
      </div>

      <div className="fs-head" style={{ marginBottom: 10 }}><div className="t">Contact &amp; grievance</div></div>
      <div className="filter-row">{CONTACT_FIELDS.map((f) => box(f, cf, setCf))}</div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button className="btn" disabled={busy !== null || !cDirty} onClick={() => saveBlock('contact')}>
          {busy === 'contact' ? 'Saving…' : 'Save contact'}
        </button>
        {savedKey === 'contact' ? <span className="hint">Saved.</span> : null}
      </div>

      {err ? <div className="banner bad" style={{ marginTop: 12 }}>{err}</div> : null}
    </div></div>
  );
}

/**
 * PUBLISHED PAGES — About, Terms, Privacy, Disclaimer.
 *
 * ONE EDITOR AND A KEY SELECTOR, not four editors stacked. TipTap is a heavy
 * mount and four live instances on a page that already carries the branding,
 * content, API-key and empanelment panels is a lot of editor for a screen
 * someone opened to change a phone number. The selector shows which pages are
 * published, so nothing is hidden by the collapse.
 *
 * NOTHING HERE INHERITS. A page left empty is NOT filled with Investoyard's
 * copy — the partner's site says so plainly instead — which is why the three
 * legal pages are BLOCKING in the gap list and About is only advisory. See
 * TrustPage for the rendering half of the same rule.
 */
function PagesPanel({ slug, tenant, onSaved }: { slug: string; tenant: api.PartnerDetail; onSaved: () => void }) {
  const stored = tenant.pages ?? {};
  const [key, setKey] = useState<api.TenantPageKey>('terms');
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(PAGE_ORDER.map((k) => [k, String(stored[k]?.html ?? '')])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [gaps, setGaps] = useState<api.ContentGap[]>(tenant.contentGaps ?? []);

  const dirty = draft[key] !== String(stored[key]?.html ?? '');

  const save = async () => {
    setBusy(true); setErr(null); setSavedAt(null);
    try {
      const r = await api.updateTenantPage(slug, key, draft[key] ?? '');
      setGaps(r.gaps ?? []);
      setSavedAt(Date.now());
      onSaved();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  /* The gap list is the server's, computed by the same resolver the site
     renders with — the panel must not form its own opinion of "published". */
  const missing = new Set(gaps.filter((g) => g.field === 'html').map((g) => g.key));
  const blocking = gaps.filter((g) => g.field === 'html' && g.severity === 'blocking');

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="section-title" style={{ fontSize: 13, marginTop: 0 }}>Published pages</div>
      <p className="hint" style={{ marginTop: 0 }}>
        The channel&apos;s own About, Terms, Privacy Policy and Disclaimer. Nothing is inherited from
        Investoyard: a page left empty tells the partner&apos;s visitors it has not been published,
        rather than showing them ours.
      </p>

      {blocking.length ? (
        <div className="banner bad" style={{ marginBottom: 14 }}>
          <b>Not ready for this partner&apos;s customers.</b>{' '}
          Still unpublished: {blocking.map((g) => g.label).join(' · ')}. These are the agreements
          between the partner and their client — ours under their brand would name the wrong company.
        </div>
      ) : null}

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {PAGE_ORDER.map((k) => (
          <button
            key={k}
            className={`btn btn-sm ${k === key ? '' : 'btn-secondary'}`}
            onClick={() => setKey(k)}
          >
            {PAGE_LABEL[k]}
            <span className={missing.has(k) ? 'st bad' : 'st ok'} style={{ marginLeft: 8 }}>
              {missing.has(k) ? 'empty' : 'published'}
            </span>
          </button>
        ))}
      </div>

      <RichText value={draft[key] ?? ''} onChange={(html) => setDraft({ ...draft, [key]: html })} minHeight={260} />

      <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 12 }}>
        <button className="btn" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : `Save ${PAGE_LABEL[key]}`}
        </button>
        {savedAt ? <span className="hint">Saved.</span> : null}
        <span className="hint" style={{ marginLeft: 'auto' }}>
          Links are kept; scripts, event handlers and pasted styling are stripped when it is shown.
        </span>
      </div>

      {err ? <div className="banner bad" style={{ marginTop: 12 }}>{err}</div> : null}
    </div></div>
  );
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

/**
 * Partner API operator controls — scope checkboxes + applicants-per-call cap.
 * Sits below ApiKeysPanel on the tenant view. Saves to the same PATCH
 * endpoint the profile edits use; changes are effective on the very next
 * partner call (no cache, no restart). Scope semantics live in
 * apps/api/src/modules/partner/partner-scope.ts — keep in step.
 */
const SCOPE_META: { key: string; label: string; hint: string }[] = [
  { key: 'print-forms',       label: 'Print forms',       hint: 'POST /partner/v1/print-forms — the merged prefilled PDF endpoint. The flagship of the API.' },
  { key: 'ipos:read',         label: 'IPO catalog',       hint: 'GET /ipos, GET /ipos/{symbol} — read the live IPO list and per-issue detail.' },
  { key: 'subscription:read', label: 'Subscription snapshot', hint: 'GET /ipos/{symbol}/subscription — gross subscription figures from the exchange. Opt-in per partner (not in the public doc).' },
  { key: 'gmp:read',          label: 'Grey Market Premium', hint: 'GET /ipos/{symbol}/gmp — GMP with SEBI disclaimer. Opt-in per partner (not in the public doc).' },
];

function ApiAccessControlPanel({ slug, tenant, onSaved }: {
  slug: string;
  tenant: api.PartnerDetail;
  onSaved: () => void;
}) {
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
      await api.updateTenant(slug, {
        partnerApiScopes: Array.from(scopes),
        partnerMaxApplicantsPerCall: capNum,
      });
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
        <div className="d">Which Partner API endpoints this tenant may call, and how many applicants they may include in one <span className="mono">print-forms</span> request.</div>
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
            Branch behaviour: leave all four unchecked to <b>inherit</b> the parent partner's scopes.
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
        </>
      ) : null}

      <ApiKeysPanel tenantId={data.id} />

      <ApiAccessControlPanel slug={slug} tenant={data} onSaved={load} />

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
