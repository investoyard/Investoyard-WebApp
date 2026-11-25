'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PARTNER_SCOPE_META, PARTNER_BID_BATCH_MAX } from '@investoyard/shared-types';
import { useOperator } from '@/lib/operator-context';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';
import {
  API_BASE, ENDPOINTS, ERRORS, GROUPS, LANGS, WEBHOOK_EVENTS, WEBHOOK_SAMPLE, WEBHOOK_VERIFY,
  codeSample, exampleUrl, prettyJson, type ApiEndpoint, type ApiField, type ApiParam, type Lang,
} from '@/lib/partnerApiDocs';

/**
 * Partner API reference (rebuilt 2026-11-23). Every endpoint is laid out the
 * same way — what it does, whether this account may call it, its parameters,
 * request examples in five languages, real example responses and what the
 * fields mean — with Try it running the real endpoint as the signed-in
 * partner. The content is `lib/partnerApiDocs.ts`; this file only draws it.
 *
 * A partner sees ONLY the APIs it may call: the rest are not listed at all,
 * with no hint that they exist (operator decision 2026-11-25, replacing the
 * "not enabled" lock rows of 2026-11-23). A platform operator picking a
 * partner sees exactly that partner's page; with none picked every API is
 * shown and Try it waits for a pick. Hiding is presentation only — the API
 * refuses a call outside the account's groups whatever this page shows.
 */

const LABEL = new Map<string, string>(PARTNER_SCOPE_META.map((s) => [s.key, s.label]));
const LANG_KEY = 'iy.apidocs.lang';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="apx-copy" aria-label={label}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}>
      <Icon name={done ? 'check' : 'copy'} size={13} /> {done ? 'Copied' : label}
    </button>
  );
}

function Code({ code, title, tools }: { code: string; title?: ReactNode; tools?: ReactNode }) {
  return (
    <div className="apx-code">
      <div className="apx-code-bar">
        <span className="apx-code-t">{title}</span>
        <span className="apx-code-tools">{tools}<CopyButton text={code} /></span>
      </div>
      <pre className="mono">{code}</pre>
    </div>
  );
}

function Method({ m }: { m: string }) {
  return <span className={`apd-method ${m === 'POST' ? 'post' : 'get'}`}>{m}</span>;
}

function ParamTable({ params }: { params: ApiParam[] }) {
  return (
    <div className="apx-tbl-wrap">
      <table className="table apx-tbl">
        <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name}>
              <td className="mono apx-nm">{p.name}{p.in === 'path' && <span className="apx-in">in path</span>}</td>
              <td className="mono apx-ty">{p.type}</td>
              <td>{p.required ? <span className="st warn">Required</span> : <span className="muted">Optional</span>}</td>
              <td>{p.description}{p.example && <div className="apx-eg">e.g. <span className="mono">{p.example}</span></div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldTable({ fields, showRequired }: { fields: ApiField[]; showRequired?: boolean }) {
  return (
    <div className="apx-tbl-wrap">
      <table className="table apx-tbl">
        <thead><tr><th>Field</th><th>Type</th>{showRequired && <th>Required</th>}<th>Description</th></tr></thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name}>
              <td className="mono apx-nm">{f.name}</td>
              <td className="mono apx-ty">{f.type}</td>
              {showRequired && <td>{f.required ? <span className="st warn">Required</span> : <span className="muted">Optional</span>}</td>}
              <td>{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeTabs({ ep, lang, setLang }: { ep: ApiEndpoint; lang: Lang; setLang: (l: Lang) => void }) {
  const tabs = (
    <span className="apx-tabs" role="tablist" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.id} type="button" role="tab" aria-selected={lang === l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>{l.label}</button>
      ))}
    </span>
  );
  return <Code code={codeSample(lang, ep)} title={tabs} />;
}

function ResponseTabs({ ep }: { ep: ApiEndpoint }) {
  const [i, setI] = useState(0);
  const r = ep.responses[i] ?? ep.responses[0];
  const tabs = (
    <span className="apx-tabs" role="tablist" aria-label="Response">
      {ep.responses.map((x, k) => (
        <button key={x.status} type="button" role="tab" aria-selected={i === k} className={`${i === k ? 'on' : ''} s${String(x.status)[0]}`} onClick={() => setI(k)}>{x.status}</button>
      ))}
    </span>
  );
  return (
    <>
      <Code code={prettyJson(r.body)} title={tabs} />
      <div className="apx-when"><b>{r.status}</b> — {r.when}</div>
    </>
  );
}

/* ── Try it ──────────────────────────────────────────────────────────────── */

const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
const randomPan = () => `${L()}${L()}${L()}P${L()}${String(Math.floor(1000 + Math.random() * 9000))}${L()}`;

/** Prefill Try it with real values for this account, so the first click returns data. */
function trySeed(ep: ApiEndpoint, ctx: api.PartnerDocsContext | null) {
  const s = ctx?.samples;
  const ipoSym = ep.group === 'ipos' ? (s?.openIpoSymbol || s?.printedIpoSymbol) : (s?.printedIpoSymbol || s?.openIpoSymbol);
  const values: Record<string, string> = {};
  for (const p of ep.params ?? []) {
    let v = p.example ?? '';
    if ((p.name === 'symbol' || p.name === 'ipoSymbol') && ipoSym) v = ipoSym;
    if (p.name === 'ref' && ep.group !== 'bids') v = s?.applicationRef ?? '';
    if (p.name === 'ref' && ep.group === 'bids') v = '';
    values[p.name] = v;
  }
  let body = ep.body ? JSON.parse(JSON.stringify(ep.body)) : undefined;
  if (body && typeof body === 'object') {
    if ('ipoSymbol' in body && (s?.openIpoSymbol || s?.printedIpoSymbol)) body.ipoSymbol = s?.openIpoSymbol || s?.printedIpoSymbol;
    if (ep.id === 'bid-place' && Array.isArray(body.bids)) {
      const stamp = Date.now().toString(36).toUpperCase();
      body.bids = body.bids.map((b: any) => ({ ...b, orderId: `TRY-${stamp}`, pan: randomPan() }));
    }
  }
  return { values, bodyText: body ? prettyJson(body) : '' };
}

function TryPanel({ ep, ctx, tenantId }: { ep: ApiEndpoint; ctx: api.PartnerDocsContext | null; tenantId?: string }) {
  const seed = useMemo(() => trySeed(ep, ctx), [ep, ctx]);
  const [values, setValues] = useState(seed.values);
  const [bodyText, setBodyText] = useState(seed.bodyText);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<api.PartnerTryResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setValues(seed.values); setBodyText(seed.bodyText); setRes(null); setErr(null); }, [seed]);

  const blocked = !ctx?.tenant ? 'Choose a partner at the top of the page to try this as them.' : null;

  const send = async () => {
    setBusy(true); setErr(null); setRes(null);
    try {
      let body: unknown;
      if (ep.method === 'POST') {
        try { body = JSON.parse(bodyText || '{}'); } catch (e: any) { throw new Error(`The request body is not valid JSON: ${e?.message ?? e}`); }
      }
      const q: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v.trim()) q[k] = v.trim();
      setRes(await api.tryPartnerEndpoint({ tenantId, endpoint: ep.id, query: q, body }));
      if (ep.id === 'bid-place') setBodyText(trySeed(ep, ctx).bodyText); // fresh orderId + PAN for the next go
    } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };

  const pdf = res?.body?.pdfBase64 as string | undefined;
  const download = () => {
    if (!pdf) return;
    const bin = atob(pdf); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = res?.body?.filename ?? 'form.pdf';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const shown = res ? prettyJson(pdf ? { ...res.body, pdfBase64: `${pdf.slice(0, 48)}… (${Math.round(pdf.length / 1024)} KB — use Download PDF)` } : res.body) : '';

  return (
    <div className="apx-try">
      {ep.tryNote && <p className="apx-try-note">{ep.tryNote}</p>}
      {blocked ? <div className="banner warn">{blocked}</div> : (
        <>
          {(ep.params ?? []).length > 0 && (
            <div className="apx-try-grid">
              {(ep.params ?? []).map((p) => (
                <label key={p.name} className="apx-try-f">
                  <span className="mono">{p.name}{p.required && <b className="apx-req"> *</b>}</span>
                  <input className="input mono" value={values[p.name] ?? ''} placeholder={p.example ?? p.type}
                    onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))} />
                </label>
              ))}
            </div>
          )}
          {ep.method === 'POST' && (
            <label className="apx-try-f">
              <span>Request body (JSON)</span>
              <textarea className="input mono apx-try-body" rows={Math.min(18, Math.max(5, bodyText.split('\n').length + 1))}
                value={bodyText} spellCheck={false} onChange={(e) => setBodyText(e.target.value)} />
            </label>
          )}
          <div className="apx-try-act">
            <button className="btn btn-sm" disabled={busy} onClick={send}><Icon name="arrow-right" size={14} /> {busy ? 'Sending…' : 'Send request'}</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setValues(seed.values); setBodyText(trySeed(ep, ctx).bodyText); setRes(null); setErr(null); }}>Reset</button>
            <span className="muted mono apx-try-url">{ep.method} {exampleUrl(ep, values).replace(API_BASE, '')}</span>
          </div>
          {err && <div className="banner bad">{err}</div>}
          {res && (
            <div className="apx-try-res">
              <div className="apx-try-head">
                <span className={`apx-status s${String(res.status)[0]}`}>{res.status}</span>
                <span className="muted">{res.ms} ms</span>
                {pdf && <button className="btn btn-sm" onClick={download}><Icon name="download" size={14} /> Download PDF</button>}
              </div>
              <Code code={shown} title="Response" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── One endpoint ────────────────────────────────────────────────────────── */

function EndpointSection({ ep, ctx, tenantId, lang, setLang }: {
  ep: ApiEndpoint; ctx: api.PartnerDocsContext | null; tenantId?: string; lang: Lang; setLang: (l: Lang) => void;
}) {
  const [tryOpen, setTryOpen] = useState(false);
  const path = `${API_BASE}${ep.path}`;
  return (
    <section id={ep.id} className="apx-ep">
      <div className="apx-ep-top">
        <h3>{ep.title}</h3>
      </div>
      <div className="apx-path">
        <Method m={ep.method} />
        <span className="mono">{ep.path}</span>
        <CopyButton text={path} label="Copy URL" />
      </div>
      <p className="apx-sum">{ep.summary}</p>
      <div className="apx-needs">Needs the <b>{LABEL.get(ep.scope) ?? ep.scope}</b> API group <span className="mono muted">({ep.scope})</span></div>

      {ep.details?.map((d) => <p key={d} className="apx-p">{d}</p>)}

      {ep.params && ep.params.length > 0 && (<><h4>Parameters</h4><ParamTable params={ep.params} /></>)}
      {ep.bodyFields && (<><h4>Request body</h4><FieldTable fields={ep.bodyFields} showRequired /></>)}

      <h4>Example request</h4>
      <CodeTabs ep={ep} lang={lang} setLang={setLang} />

      <h4>Responses</h4>
      <ResponseTabs ep={ep} />

      {ep.responseFields && (<><h4>Response fields</h4><FieldTable fields={ep.responseFields} /></>)}

      <div className="apx-try-wrap">
        <button type="button" className={`apx-try-toggle${tryOpen ? ' on' : ''}`} aria-expanded={tryOpen} onClick={() => setTryOpen((o) => !o)}>
          <Icon name="bolt" size={14} /> Try it <Icon name={tryOpen ? 'chevron-down' : 'chevron-right'} size={14} />
        </button>
        {tryOpen && <TryPanel ep={ep} ctx={ctx} tenantId={tenantId} />}
      </div>
    </section>
  );
}

/* ── The page ────────────────────────────────────────────────────────────── */

const GUIDES = [
  { id: 'quick-start', title: 'Quick start' },
  { id: 'authentication', title: 'Authentication' },
];
/** The first call the quick start shows: the first of these the account can make. */
const FIRST_CALL = [
  { id: 'ipos', text: 'List the IPOs open today:' },
  { id: 'prints', text: 'List the forms you have printed:' },
  { id: 'allotment', text: 'Get the allotment results for an IPO:' },
  { id: 'bid-read', text: 'List your bids:' },
  { id: 'print-forms', text: 'Print an ASBA form:' },
];
const AFTER = [
  { id: 'webhooks', title: 'Webhooks' },
  { id: 'errors', title: 'Errors' },
  { id: 'limits', title: 'Limits' },
];

export default function PartnerApiDocsPage() {
  const me = useOperator();
  const [ctx, setCtx] = useState<api.PartnerDocsContext | null | undefined>(undefined);
  const [partners, setPartners] = useState<api.PartnerAccessRow[]>([]);
  const [asTenant, setAsTenant] = useState('');
  const [lang, setLangState] = useState<Lang>('curl');
  const [active, setActive] = useState('quick-start');

  useEffect(() => { try { const l = localStorage.getItem(LANG_KEY) as Lang | null; if (l && LANGS.some((x) => x.id === l)) setLangState(l); } catch { /* private window */ } }, []);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ } }, []);

  useEffect(() => {
    if (!me) return;
    api.fetchPartnerDocsContext(asTenant || undefined).then(setCtx).catch(() => setCtx(null));
  }, [me, asTenant]);
  useEffect(() => { if (me?.isSuperAdmin) api.fetchPartnerAccess().then(setPartners).catch(() => setPartners([])); }, [me]);

  const operator = ctx?.operator ?? !!me?.isSuperAdmin;
  // An operator with no partner picked reads the whole reference.
  const allOpen = operator && !ctx?.tenant;
  const enabledScopes = new Set<string>(allOpen ? PARTNER_SCOPE_META.map((s) => s.key) : (ctx?.enabled ? ctx?.scopes ?? [] : []));
  const isOn = (ep: ApiEndpoint) => enabledScopes.has(ep.scope);
  // What this page lists: the account's APIs only, nothing about the rest.
  const shown = ENDPOINTS.filter(isOn);
  const groupsShown = GROUPS.filter((g) => shown.some((e) => e.group === g.id));
  const hasBids = enabledScopes.has('bids:write') || enabledScopes.has('bids:read');
  const hasPrint = enabledScopes.has('print-forms');
  const after = AFTER.filter((g) => g.id !== 'webhooks' || hasBids);
  // The reference is withheld when the account has no API at all.
  const noApi = !allOpen && ctx !== undefined && shown.length === 0;

  // Which section is on screen, for the menu. Read positions directly — an
  // IntersectionObserver picks the topmost intersecting section, which for a
  // tall one is the section already scrolled past.
  const idKey = [...shown.map((e) => e.id), ...after.map((g) => g.id)].join(',');
  const ids = useMemo(() => [...GUIDES.map((g) => g.id), ...idKey.split(',').filter(Boolean)], [idKey]);
  const last = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const now = Date.now(); if (now - last.current < 120) return; last.current = now;
      let cur = ids[0];
      for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
      setActive(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ids]);

  if (!me) return <Loader />;
  if (!me.username) return <NoAccess />;

  const tenantId = operator ? (ctx?.tenant?.id ?? undefined) : undefined;
  const firstEp = FIRST_CALL.map((f) => shown.find((e) => e.id === f.id)).find(Boolean) ?? shown[0];
  const firstLine = FIRST_CALL.find((f) => f.id === firstEp?.id)?.text ?? (firstEp ? `${firstEp.title}:` : '');
  const firstCall = firstEp?.id === 'ipos'
    ? `curl "${API_BASE}/partner/v1/ipos?status=open&limit=5" \\\n  -H "X-Api-Key: YOUR_KEY_ID.YOUR_SECRET"`
    : firstEp ? codeSample('curl', firstEp, API_BASE) : '';
  const groupNames = PARTNER_SCOPE_META.filter((s) => enabledScopes.has(s.key)).map((s) => s.label);

  return (
    <div className="apx">
      <PageHead title="Partner API" sub="Print ASBA forms, read your records and allotment results, read IPO data, and place UPI bids for your clients — over one API." />

      {/* Whose account this page is showing */}
      <div className="apx-acct">
        {operator && (
          <label className="apx-acct-pick">
            <span>View as partner</span>
            <select className="input" value={asTenant} onChange={(e) => setAsTenant(e.target.value)}>
              <option value="">All APIs — no partner</option>
              {partners.map((p) => <option key={p.tenantId} value={p.tenantId}>{p.name}{p.effective.enabled ? '' : ' (API off)'}</option>)}
            </select>
          </label>
        )}
        {ctx === undefined ? <span className="muted">Loading your account…</span> : ctx?.tenant ? (
          <div className="apx-acct-facts">
            <span className="apx-acct-name">{ctx.tenant.name}</span>
            {ctx.enabled
              ? <span className="st ok">API on</span>
              : <span className="st bad">API off — every call is refused</span>}
            {ctx.enabled && <span className="muted">{groupNames.length ? groupNames.join(' · ') : 'No API groups switched on'}</span>}
            <span className="muted">{ctx.keys?.live ?? 0} live · {ctx.keys?.test ?? 0} test key{(ctx.keys?.test ?? 0) === 1 ? '' : 's'}</span>
            <span className="muted">Up to {ctx.maxApplicantsPerCall ?? 25} applicants per print call</span>
          </div>
        ) : allOpen ? <span className="muted">Showing every API. Pick a partner to see what it may call and to use Try it.</span> : null}
        <div className="apx-acct-base">
          <span className="muted">Base URL</span>
          <span className="mono">{API_BASE}</span>
          <CopyButton text={API_BASE} />
        </div>
      </div>

      {ctx?.tenant && !ctx.enabled && (
        <div className="banner bad" style={{ marginBottom: 16 }}>
          <span><b>API access is not enabled for this account.</b> Every call is refused with 403 and no key can be created.
          {operator ? ' Switch it on in Partner API → API Access.' : ' Contact the Investoyard team to request it.'}</span>
        </div>
      )}

      {ctx?.tenant && ctx.enabled && noApi && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <span><b>No API groups are switched on for this account.</b>
          {operator ? ' Choose them in Partner API → API Access.' : ' Contact the Investoyard team to request them.'}</span>
        </div>
      )}

      {!noApi && (<>
      {/* Jump menu for narrow screens, where the side menu is hidden */}
      <select className="input apx-jump" value={active} onChange={(e) => { document.getElementById(e.target.value)?.scrollIntoView({ behavior: 'smooth' }); }} aria-label="Jump to">
        {GUIDES.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        {groupsShown.map((g) => (
          <optgroup key={g.id} label={g.title}>
            {shown.filter((e) => e.group === g.id).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </optgroup>
        ))}
        {after.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
      </select>

      <div className="apx-layout">
        <nav className="apx-nav" aria-label="API reference">
          <div className="apx-nav-g">Get started</div>
          {GUIDES.map((g) => <a key={g.id} href={`#${g.id}`} className={active === g.id ? 'on' : ''}>{g.title}</a>)}
          {groupsShown.map((g) => (
            <div key={g.id}>
              <div className="apx-nav-g">{g.title}</div>
              {shown.filter((e) => e.group === g.id).map((e) => (
                <a key={e.id} href={`#${e.id}`} className={active === e.id ? 'on' : ''}>
                  <Method m={e.method} /><span>{e.title}</span>
                </a>
              ))}
            </div>
          ))}
          <div className="apx-nav-g">More</div>
          {after.map((g) => <a key={g.id} href={`#${g.id}`} className={active === g.id ? 'on' : ''}>{g.title}</a>)}
        </nav>

        <div className="apx-main">
          <section id="quick-start" className="apx-guide">
            <h2>Quick start</h2>
            <ol className="apx-steps">
              <li>
                <b>Get an API key.</b>{' '}
                {operator
                  ? <>Create it on the partner’s page (Partners → the partner → API keys). The secret is shown once.</>
                  : <>Create one on <a href="/admin/partner-api/keys">My API Keys</a>. The secret is shown once — keep it in your server’s secret store, never in a browser or app.</>}
                {' '}Start with a <b>test</b> key: everything works the same{hasBids ? ', and bids go to a simulator' : ''}.
              </li>
              <li>
                <b>Make your first call.</b> {firstLine}
                <Code code={firstCall} title="Your first call" />
              </li>
              <li>
                <b>Read the answer.</b> A 2xx status means success and the body is JSON. Anything else returns a JSON body with
                {' '}<span className="mono">statusCode</span> and a <span className="mono">message</span> that says what to fix — see <a href="#errors">Errors</a>.
                Every call, including refused ones, appears in <a href="/admin/partner-api/calls">API Calls</a>.
              </li>
            </ol>
          </section>

          <section id="authentication" className="apx-guide">
            <h2>Authentication</h2>
            <p className="apx-p">Send your key on every request in the <span className="mono">X-Api-Key</span> header, as <span className="mono">keyId.secret</span>. Requests must use HTTPS. A revoked key is refused with 401 straight away.</p>
            <Code code={`X-Api-Key: pk_a1b2c3d4e5f6.7f3c…your secret…`} title="Header" />
            <div className="apx-facts">
              <div><b>Live and test keys.</b> A test key works the same on every API{hasBids ? ', except that its bids go to a simulator and never reach an exchange' : ''}.</div>
              <div><b>API groups.</b> We switch on the API groups your account may use. A key can be limited to some of them — a reporting server that only reads allotment does not need a key that can print.</div>
              <div><b>IP allowlist.</b> A key can be locked to your server addresses.{hasBids ? ' A live key must have one before it can place or read bids.' : ''}</div>
            </div>
          </section>

          {groupsShown.map((g) => (
            <div key={g.id} className="apx-group">
              <div className="apx-group-h"><h2>{g.title}</h2><p>{g.intro}</p></div>
              {shown.filter((e) => e.group === g.id).map((e) => (
                <EndpointSection key={e.id} ep={e} ctx={ctx ?? null} tenantId={tenantId} lang={lang} setLang={setLang} />
              ))}
            </div>
          ))}

          {hasBids && (
          <section id="webhooks" className="apx-guide">
            <h2>Webhooks</h2>
            <p className="apx-p">
              Set an https address on <a href="/admin/partner-api/webhooks">Webhooks</a>. Whenever one of your bids changes, we send a signed POST with the event and the
              bid’s current state, so you do not have to keep asking.
            </p>
            <div className="apx-chips">{WEBHOOK_EVENTS.map((e) => <span key={e} className="st brand mono">{e}</span>)}</div>
            <h4>What we send</h4>
            <Code code={`POST https://your-server.example/investoyard/webhooks\nX-Investoyard-Event: bid.funds_blocked\nX-Investoyard-Delivery: 7c1d9e2a-…\nX-Investoyard-Signature: t=1700000000,v1=<hex>\n\n${prettyJson(WEBHOOK_SAMPLE)}`} title="Example delivery" />
            <h4>Check the signature</h4>
            <Code code={WEBHOOK_VERIFY} title="Node.js" />
            <p className="apx-p">
              Answer with any 2xx within 10 seconds. Anything else is retried after 1 minute, 5 minutes, 30 minutes, then 2, 6, 12 and 24 hours, and then marked failed —
              you can send it again from the Webhooks page. A delivery can arrive twice or out of order: use <span className="mono">X-Investoyard-Delivery</span> to ignore
              repeats, and treat the bid’s <span className="mono">status</span> as the truth. Get bids is always the backup.
            </p>
          </section>
          )}

          <section id="errors" className="apx-guide">
            <h2>Errors</h2>
            <div className="apx-tbl-wrap">
              <table className="table apx-tbl">
                <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
                <tbody>{ERRORS.map((x) => <tr key={x.status}><td className="mono apx-nm">{x.status} {x.title}</td><td>{x.meaning}</td></tr>)}</tbody>
              </table>
            </div>
            <h4>Every error looks like this</h4>
            <Code code={prettyJson({ statusCode: 403, error: 'Forbidden', message: 'This endpoint requires the "prints:read" scope. Your account does not have it enabled — contact the operator to request it.' })} title="Error body" />
          </section>

          <section id="limits" className="apx-guide">
            <h2>Limits</h2>
            <div className="apx-facts">
              {hasPrint && <div><b>Print forms:</b> up to {ctx?.maxApplicantsPerCall ?? 25} applicants per call{operator && !ctx?.tenant ? ' (25 unless raised for the partner, at most 500)' : ''}.</div>}
              {hasBids && <div><b>Bids:</b> up to {PARTNER_BID_BATCH_MAX} per call, all or nothing. Live bidding is limited per account: named IPOs, a cap per bid, bids per day and rupees per day — see Your live bidding limits.</div>}
              <div><b>Lists:</b> at most 200 rows per page.</div>
              <div><b>Personal details</b> you send are stored encrypted under your account only, and come back masked in every read.</div>
            </div>
          </section>
        </div>
      </div>
      </>)}
    </div>
  );
}
