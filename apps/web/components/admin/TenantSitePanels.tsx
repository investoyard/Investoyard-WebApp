'use client';
import { useState } from 'react';
import { Field } from '@/components/ui/Form';
import { RichText } from '@/components/ui/RichText';
import * as api from '@/lib/tenants-admin';
import {
  PAGE_LABEL,
  TENANT_PAGE_KEYS,
  OPERATOR_ONLY_IDENTITY_FIELDS,
  SITE_TEMPLATES,
  themeReady,
  SITE_FONTS,
  DEFAULT_TEMPLATE,
  DEFAULT_FONT,
  templateMeta,
  defaultHeadline,
} from '@investoyard/shared-types';

/**
 * THE THREE PANELS A WHITE-LABEL CHANNEL'S SITE IS EDITED THROUGH — branding,
 * published identity & contact, and the four legal pages.
 *
 * THEY LIVE HERE BECAUSE TWO SCREENS RENDER THEM. The operator edits any
 * partner from Tenants → Partners & Branches; a white-label partner edits
 * their OWN from My Organisation, which is the only one of the two they can
 * reach (a partner correctly lacks `tenants.manage`, which opens the
 * platform-wide tenant tree). Two copies of a panel that publishes a legal
 * entity is exactly the drift this codebase keeps paying for, so there is one.
 *
 * WHAT DIFFERS BETWEEN THE TWO CALLERS is passed in, never re-derived here:
 *   • `canEditLegal`  — the operator-only identity fields. A partner may keep
 *     their site correct; they may not restate the legal entity their
 *     empanelment was approved against. The field list is
 *     OPERATOR_ONLY_IDENTITY_FIELDS in shared-types, which the SERVER strips a
 *     partner's patch against — so this is the readable half of one rule, not
 *     a second opinion about it.
 *   • `canEditDomain` — the custom domain. Operator-only whatever the screen:
 *     it feeds the API's CORS allow-list and needs DNS plus a TLS binding on
 *     the box, neither of which a partner can complete.
 */
/* The selector's order: what a partner is most likely to be chased for first.
   PAGE_LABEL is the shared map, so the admin and the public page cannot name
   the same document differently. */
const PAGE_ORDER = ['terms', 'privacy', 'disclaimer', 'about'] as const;

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
export function BrandingPanel({ slug, tenant, onSaved, canEditDomain = true }: {
  slug: string; tenant: api.PartnerDetail; onSaved: () => void;
  /** Operator-only. A partner edits their brand assets but never the domain. */
  canEditDomain?: boolean;
}) {
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

  const domainDirty = canEditDomain && domain !== (tenant.customDomain ?? '');
  const dirty =
    brand !== (tenant.brandColor ?? '') || gold !== (tenant.goldColor ?? '') ||
    logo !== (tenant.logoUrl ?? '') || domainDirty ||
    footerLogo !== (tenant.footerLogoUrl ?? '') || favicon !== (tenant.faviconUrl ?? '');

  /* TWO ROUTES, because the two halves have different answers to "who may do
     this". The brand assets go to PATCH /tenants/:slug/branding, which a
     white-label partner may call for their own tenant; the custom domain stays
     on PATCH /tenants/:slug, superadmin-only, and is only sent when this screen
     is the operator's. Sending the domain from the partner screen would be
     silently dropped by the server, which is worse than not offering it. */
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.updateTenantBranding(slug, {
        brandColor: brand.trim(), goldColor: gold.trim(),
        logoUrl: logo.trim(), footerLogoUrl: footerLogo.trim(),
        faviconUrl: favicon.trim(),
      });
      if (domainDirty) await api.updateTenant(slug, { customDomain: domain.trim() });
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
        {canEditDomain ? (
          <div className="field" style={{ width: 280 }}>
            <label>Custom domain</label>
            <input className="input mono" value={domain} placeholder="ipo.partner.com"
              onChange={(e) => setDomain(e.target.value)} />
          </div>
        ) : null}
        <button className="btn" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save branding'}
        </button>
        {canEditDomain ? (
          <button className="btn btn-secondary" disabled={checking || !tenant.customDomain} onClick={runCheck}>
            {checking ? 'Checking…' : 'Check domain'}
          </button>
        ) : null}
        {savedAt ? <span className="hint" style={{ alignSelf: 'center' }}>Saved.</span> : null}
      </div>
      <div className="hint" style={{ marginBottom: 16 }}>
        {canEditDomain
          ? 'Hostname only — no https://, no path.'
          /* Say WHY rather than leave a gap where a field was. The domain needs
             a DNS record and a TLS binding on our server, so it is not a thing
             a partner could finish even if the box were here. */
          : <>Your site address is set by Investoyard — it needs a DNS record and a certificate on our server. Ask us to change it.</>}
      </div>

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
          the port-80 binding has to exist before a certificate can. Operator
          screen only: three of the four steps are run ON this server. */}
      <div className="panel" style={{ padding: 16, marginTop: 14, display: canEditDomain ? undefined : 'none' }}>
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
export function ContentPanel({ slug, tenant, onSaved, canEditLegal = true }: {
  slug: string; tenant: api.PartnerDetail; onSaved: () => void;
  /** Operator-only: the legal entity and its registrations — the approval record. */
  canEditLegal?: boolean;
}) {
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

  /* The operator-only identity fields are rendered READ-ONLY rather than
     hidden: a partner should be able to SEE the legal name their own footer
     publishes, and a blank where a value sits reads as "not set". The server
     strips these from a partner's patch regardless — this is the readable half
     of that rule, and OPERATOR_ONLY_IDENTITY_FIELDS is the one list both use. */
  const locked = (f: CField) =>
    !canEditLegal && (OPERATOR_ONLY_IDENTITY_FIELDS as readonly string[]).includes(f.key);

  const box = (f: CField, form: Record<string, string>, set: (v: Record<string, string>) => void) => (
    <div className="field" key={f.key} style={{ width: f.area ? '100%' : f.w ?? 220 }}>
      <label>{f.label}</label>
      {f.area ? (
        <textarea className="input" rows={3} style={{ resize: 'vertical' }} readOnly={locked(f)}
          value={form[f.key]} onChange={(e) => set({ ...form, [f.key]: e.target.value })} />
      ) : (
        <input className="input" value={form[f.key]} readOnly={locked(f)}
          onChange={(e) => set({ ...form, [f.key]: e.target.value })} />
      )}
      {locked(f)
        ? <span className="hint">Set by Investoyard — this is the entity your empanelment was approved against.</span>
        : f.hint ? <span className="hint">{f.hint}</span> : null}
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
export function PagesPanel({ slug, tenant, onSaved }: { slug: string; tenant: api.PartnerDetail; onSaved: () => void }) {
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


/**
 * WHICH LAYOUT THIS CHANNEL'S SITE RENDERS IN, and the handful of strings that
 * are the partner's rather than ours.
 *
 * THE DESCRIPTIONS ARE SIR'S OWN CAPTIONS, verbatim from the design canvas and
 * carried in `SITE_TEMPLATES` so the admin screen, the resolver and the build
 * cannot disagree about what exists. They say who each layout is FOR, which is
 * the only thing that helps someone choose — and they are better copy than
 * anything written to replace them.
 *
 * WHEN A CHANGE TAKES EFFECT, said on the screen rather than left to be
 * discovered: the layout is baked per host at BUILD time, so a change here
 * reaches visitors on the next deploy, and until then the browser corrects it
 * after the page loads. That is a real two-state behaviour and an operator who
 * is not told about it will reasonably conclude the setting did not work.
 *
 * `false` IS SENT FOR EVERY TOGGLE, never omitted. An omitted key is left alone
 * by `mergeContentPatch`, so a cleared checkbox would never turn anything off.
 * The text boxes are the opposite and deliberately so: every box this panel
 * renders is posted, and an emptied one DELETES its field.
 */
/**
 * THE LIVE PREVIEW, as Sir drew it on the "admin partner site" screen: a
 * browser-framed view of the partner's OWN site at the selected layout, with
 * an "Open full page" link beside it.
 *
 * IT IS THE REAL SITE IN AN IFRAME, NOT A MOCK-UP. A mock-up of a layout is a
 * second implementation of it, and it would start lying the first time the
 * layout changed — which is exactly the trap a hand-copied `check.html` fell
 * into when the featured panel was built: it rendered a perfect figure the real
 * component could never produce. Same origin, so this is the shipped CSS, the
 * shipped components and the partner's real brand colours.
 *
 * IT IS LAZY, AND THE REASON IS A MEASUREMENT. The home page is ~10 MB of baked
 * markup, so auto-loading it would cost the operator that on every visit to
 * this screen whether or not they wanted to look. The frame renders empty with
 * a Show button; once mounted it stays, so switching layouts re-navigates one
 * iframe rather than mounting a new one.
 *
 * THE PAGE PICKER IS THE POINT, not a nicety. A template is a site-wide look —
 * chrome, type scale, density, surfaces — so a preview that could only ever
 * show the home page would be unable to demonstrate the thing being chosen.
 * Home shows the arrangement; the IPO detail page and a trust page show that
 * the look carries.
 *
 * `preview=1` STOPS THE IFRAME WRITING THE PARTNER'S BRAND INTO THE OPERATOR'S
 * OWN SESSION — see TenantProvider: sessionStorage is shared across a tab's
 * same-origin frames.
 */
const PREVIEW_PAGES: { path: string; label: string }[] = [
  { path: '/', label: 'Home' },
  { path: '/ipos/open/', label: 'IPO list' },
  { path: '/subscription/', label: 'Subscription' },
  { path: '/terms/', label: 'Terms' },
];

/* Rendered at a desktop width and scaled down, so what the operator sees is the
   DESKTOP layout rather than the mobile one a narrow iframe would trigger —
   the templates differ most above the 1100px breakpoint, and a preview that
   silently showed the phone layout would be worse than none. */
const PREVIEW_W = 1280;
const PREVIEW_H = 860;

function SitePreview({ slug, template, font, domain }: {
  slug: string; template: string; font: string; domain?: string;
}) {
  const [show, setShow] = useState(false);
  const [page, setPage] = useState(PREVIEW_PAGES[0]!.path);

  const q = `brand=${encodeURIComponent(slug)}&template=${encodeURIComponent(template)}`
    + `&font=${encodeURIComponent(font)}&preview=1`;
  const src = `${page}?${q}`;
  const full = `${page}?${q.replace('&preview=1', '')}`;

  return (
    <div className="tplp-prev">
      <div className="tplp-prev-head">
        <span className="tplp-prev-ttl">Live preview</span>
        <div className="tplp-prev-pages">
          {PREVIEW_PAGES.map((p) => (
            <button
              key={p.path}
              type="button"
              className={page === p.path ? 'on' : ''}
              onClick={() => setPage(p.path)}
            >{p.label}</button>
          ))}
        </div>
        <a className="linklike" href={full} target="_blank" rel="noreferrer">Open full page ↗</a>
      </div>

      {/* The browser frame from Sir's design: the three dots and the padlock
          with the partner's own host, so it reads as THEIR site rather than a
          panel in ours. Falls back to the slug when no domain is set — which is
          honest, because without a domain this layout never reaches anyone. */}
      <div className="tplp-prev-chrome">
        <span className="tplp-prev-dots"><i /><i /><i /></span>
        <span className="tplp-prev-url">{domain ? `🔒 ${domain}` : `${slug} — no domain set`}</span>
      </div>

      <div className="tplp-prev-body" style={{ height: Math.round(PREVIEW_H * 0.42) }}>
        {show ? (
          <iframe
            title={`Preview of the ${slug} site`}
            src={src}
            className="tplp-prev-frame"
            style={{ width: PREVIEW_W, height: PREVIEW_H }}
            sandbox="allow-same-origin allow-scripts"
          />
        ) : (
          <button type="button" className="btn btn-secondary tplp-prev-go" onClick={() => setShow(true)}>
            Show preview
          </button>
        )}
      </div>
      {show ? (
        <p className="hint tplp-prev-note">
          The real site at this layout and brand, scaled to fit. Nothing here is saved, and the
          preview cannot change your own session.
        </p>
      ) : null}
    </div>
  );
}


export function TemplatePanel({ slug, tenant, onSaved }: { slug: string; tenant: api.PartnerDetail; onSaved: () => void }) {
  const stored: api.TenantSite = tenant.content?.site ?? {};
  const [d, setD] = useState<api.TenantSite>(() => ({ ...stored }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [gaps, setGaps] = useState<api.ContentGap[]>(tenant.contentGaps ?? []);

  const set = <K extends keyof api.TenantSite>(k: K, v: api.TenantSite[K]) => setD((p) => ({ ...p, [k]: v }));
  const txt = (k: keyof api.TenantSite) => String((d as any)[k] ?? '');
  const flag = (k: keyof api.TenantSite) => (d as any)[k] === true;

  const template = (d.template ?? DEFAULT_TEMPLATE) as api.SiteTemplate;
  const isDefault = template === DEFAULT_TEMPLATE;
  const meta = templateMeta(template);

  const dirty = JSON.stringify({ ...stored }) !== JSON.stringify(d);

  const save = async () => {
    setBusy(true); setErr(null); setSavedAt(null);
    try {
      /* EVERY field this panel renders is posted — a blanked box must delete
         rather than linger as "", and a cleared toggle must store `false`. */
      const r = await api.updateTenantSite(slug, {
        template, font: (d.font ?? DEFAULT_FONT) as api.SiteFont,
        headline: txt('headline'), sub: txt('sub'),
        navCta: txt('navCta'), applyCta: txt('applyCta'), applyNote: txt('applyNote'),
        showUtility: flag('showUtility'), mainSiteUrl: txt('mainSiteUrl'), supportUrl: txt('supportUrl'),
        showApp: flag('showApp'), appUrl: txt('appUrl'),
        showRm: flag('showRm'), rmLabel: txt('rmLabel'), rmName: txt('rmName'),
        rmRole: txt('rmRole'), rmBlurb: txt('rmBlurb'), rmContact: txt('rmContact'), rmCta: txt('rmCta'),
      });
      setGaps(r.gaps ?? []);
      setSavedAt(Date.now());
      onSaved();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  /* The SERVER's gap list for this block, by the same resolver the site renders
     with — so the panel cannot form its own opinion of what is missing. */
  const siteGapList = gaps.filter((g) => g.key === 'site');

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="section-title" style={{ fontSize: 13, marginTop: 0 }}>Site layout</div>
      <p className="hint" style={{ marginTop: 0 }}>
        How this channel&apos;s public site is arranged. Every layout shows the same IPO data from
        the same place — what changes is the order it is read in and how much room the opening
        statement gets. A change here reaches visitors on the <b>next deploy</b>; until then the
        page corrects itself once it loads.
      </p>
      {/* A layout is baked PER HOST, so a channel with no domain of its own has
          no host to bake it against and will go on rendering ours. Said here
          because the setting otherwise saves, reports success and changes
          nothing visible — which reads as a broken panel rather than as a
          missing DNS record. */}
      {!tenant.customDomain ? (
        <div className="banner warn" style={{ marginBottom: 12 }}>
          This channel has no custom domain yet, so it is still served under ours and will keep
          rendering the Investoyard layout whatever is picked here. Set the domain in Branding
          first — the choice is saved either way and takes effect when the domain goes live.
        </div>
      ) : null}

      {/* ---- the layout ---- */}
      <div className="tplp-grid">
        {SITE_TEMPLATES.map((t) => {
          /* A THEME IS BUILT ONE AT A TIME, so one that is listed but not
             finished must not be selectable — and must say so rather than just
             refusing the click. `themeReady` is the registry's own answer, so
             this screen cannot form a second opinion about what is shippable. */
          const ready = themeReady(t.id);
          return (
            <label
              key={t.id}
              className={`tplp-opt${template === t.id ? ' is-on' : ''}${ready ? '' : ' is-off'}`}
            >
              <input
                type="radio" name="tpl" value={t.id}
                checked={template === t.id}
                disabled={!ready}
                onChange={() => set('template', t.id as api.SiteTemplate)}
              />
              <span className="tplp-opt-h">{t.label}</span>
              <span className="tplp-opt-d">{t.blurb}</span>
              {/* `.st.mut`, not a bare `.st`: that class sets size, weight and a
                  pill radius and NO colour at all, so the chip rendered as a
                  pill-shaped nothing. */}
              {t.design ? <span className="st mut tplp-opt-src">{t.design}</span> : null}
              {!ready ? <span className="st warn tplp-opt-src">In build</span> : null}
            </label>
          );
        })}
      </div>

      {/* Our own layout reads none of the copy below, so showing the boxes would
          invite someone to fill in fields that cannot appear anywhere. */}
      {isDefault ? (
        <p className="hint" style={{ marginTop: 14 }}>
          <b>{meta.label}</b> — the hero copy, the utility bar and the relationship-manager card
          below belong to the other layouts and are not rendered by this one. Pick one of them to
          edit them.
        </p>
      ) : (
        <>
          <div className="filter-row" style={{ marginTop: 16 }}>
            <Field label="Typeface">
              <select value={d.font ?? DEFAULT_FONT} onChange={(e) => set('font', e.target.value as api.SiteFont)}>
                {SITE_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="section-title" style={{ fontSize: 12.5 }}>Opening statement</div>
          <Field label="Headline" hint={`Left empty, the page builds one from the channel's name — e.g. "${defaultHeadline(tenant.name)}". Write your own.`}>
            <input value={txt('headline')} maxLength={120} onChange={(e) => set('headline', e.target.value)} />
          </Field>
          <Field label="Sub-heading" hint="One sentence under the headline.">
            <input value={txt('sub')} maxLength={240} onChange={(e) => set('sub', e.target.value)} />
          </Field>
          <div className="filter-row">
            <Field label="Header button" hint="e.g. Sign in">
              <input value={txt('navCta')} maxLength={40} onChange={(e) => set('navCta', e.target.value)} />
            </Field>
            <Field label="Hero button" hint="e.g. Apply to an IPO">
              <input value={txt('applyCta')} maxLength={40} onChange={(e) => set('applyCta', e.target.value)} />
            </Field>
          </div>
          <Field label="Note under the hero button" hint="Optional, e.g. No charges to apply.">
            <input value={txt('applyNote')} maxLength={120} onChange={(e) => set('applyNote', e.target.value)} />
          </Field>

          {/* ---- the three optional blocks ---- */}
          <div className="section-title" style={{ fontSize: 12.5 }}>Optional blocks</div>
          <p className="hint" style={{ marginTop: 0 }}>
            A block only appears once it has something to show — a bar with no links in it and a
            card with no name in it are not rendered at all, and the list at the bottom of this
            panel is what will tell you one is half-finished.
          </p>

          <label className="tplp-tog">
            <input type="checkbox" checked={flag('showUtility')} onChange={(e) => set('showUtility', e.target.checked)} />
            <span>Bar above the header, linking back to the main platform</span>
          </label>
          {flag('showUtility') && (
            <div className="filter-row">
              <Field label="Back to main site" hint="Where the client came from.">
                <input value={txt('mainSiteUrl')} maxLength={600} placeholder="https://…" onChange={(e) => set('mainSiteUrl', e.target.value)} />
              </Field>
              <Field label="Support page">
                <input value={txt('supportUrl')} maxLength={600} placeholder="https://…" onChange={(e) => set('supportUrl', e.target.value)} />
              </Field>
            </div>
          )}

          <label className="tplp-tog">
            <input type="checkbox" checked={flag('showRm')} onChange={(e) => set('showRm', e.target.checked)} />
            <span>Relationship-manager card</span>
          </label>
          {flag('showRm') && (
            <>
              <div className="filter-row">
                <Field label="Name"><input value={txt('rmName')} maxLength={80} onChange={(e) => set('rmName', e.target.value)} /></Field>
                <Field label="Role" hint="e.g. Senior Relationship Manager">
                  <input value={txt('rmRole')} maxLength={80} onChange={(e) => set('rmRole', e.target.value)} />
                </Field>
              </div>
              <Field label="Heading above the name" hint="Left empty: “Your relationship manager”.">
                <input value={txt('rmLabel')} maxLength={60} onChange={(e) => set('rmLabel', e.target.value)} />
              </Field>
              <Field label="What they help with"><input value={txt('rmBlurb')} maxLength={400} onChange={(e) => set('rmBlurb', e.target.value)} /></Field>
              <div className="filter-row">
                <Field label="How to reach them" hint="A number, an email or a booking link — printed as entered.">
                  <input value={txt('rmContact')} maxLength={120} onChange={(e) => set('rmContact', e.target.value)} />
                </Field>
                <Field label="Button or prompt" hint="e.g. Call between 9 and 6">
                  <input value={txt('rmCta')} maxLength={40} onChange={(e) => set('rmCta', e.target.value)} />
                </Field>
              </div>
            </>
          )}

          <label className="tplp-tog">
            <input type="checkbox" checked={flag('showApp')} onChange={(e) => set('showApp', e.target.checked)} />
            <span>Band pointing at the channel&apos;s own mobile app</span>
          </label>
          {flag('showApp') && (
            <Field label="App link" hint="A store listing or a landing page. No store badge is shown — those carry the store owners' own brand conditions.">
              <input value={txt('appUrl')} maxLength={600} placeholder="https://…" onChange={(e) => set('appUrl', e.target.value)} />
            </Field>
          )}
        </>
      )}

      {/* THE PREVIEW SHOWS THE DRAFT, NOT THE SAVED ROW — `template` and `d.font`
          are the controls' current values, so picking a layout updates the frame
          before Save is pressed. A preview that only reflected what was already
          stored would make choosing a layout a matter of saving and hoping. */}
      <SitePreview
        slug={slug}
        template={template}
        font={(d.font ?? DEFAULT_FONT) as string}
        domain={tenant.customDomain}
      />

      <div className="tplp-actions" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save layout'}
        </button>
        {savedAt ? <span className="st ok">Saved</span> : null}
        {dirty && !busy ? <span className="hint">Unsaved changes</span> : null}
      </div>

      {siteGapList.length > 0 && !isDefault ? (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <b>Still to write:</b>{' '}
          {siteGapList.map((g) => g.label).join(' · ')}
          <div className="hint" style={{ marginTop: 4 }}>
            None of these stops the site going live — the page renders without them and nothing on
            it is wrong. They are what makes it look like the partner&apos;s own.
          </div>
        </div>
      ) : null}

      {err ? <div className="banner bad" style={{ marginTop: 12 }}>{err}</div> : null}
    </div></div>
  );
}
