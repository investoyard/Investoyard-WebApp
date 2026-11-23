import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { PartnerApiScrollSpy } from './scroll-spy';
import type { ReactNode } from 'react';
import { PARTNER_SCOPE_META } from '@investoyard/shared-types';
import {
  ENDPOINTS, ERRORS, GROUPS, LANGS, PUBLIC_BASE, WEBHOOK_EVENTS, WEBHOOK_SAMPLE, WEBHOOK_VERIFY,
  codeSample, prettyJson, type ApiEndpoint, type Lang,
} from '@/lib/partnerApiDocs';
import { PaCodeTabs } from './code-tabs';
/* The canonical and og:url are ABSOLUTE by necessity, so they are built from
   the one origin constant rather than typed — a page with a stale canonical
   tells Google its own domain is a duplicate of a domain we no longer use. */
import { SITE_HOST, absolute } from '@/lib/site';
/* The cover and the print scaffolding (@page, hiding the site chrome,
   resetting main.container) come from the platform document's stylesheet, as
   they already do for /brokers — so all three PDFs carry the SAME cover by
   construction rather than by three people remembering to match it. */
import '../platform/platform.css';
import './partner-api.css';

// JetBrains Mono only — Inter and Plus Jakarta already load from the root
// layout (var(--font-sans) / var(--font-display)), and the doc reuses those
// for prose and headings.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-mono-pa',
});

export const metadata: Metadata = {
  title: 'Partner API — Investoyard',
  description:
    'Partner API reference for empanelled Investoyard distribution partners: authentication, print-forms endpoint, IPO catalog reads, error responses.',
  robots: { index: true, follow: true },
  alternates: { canonical: absolute('/partner-api') },
  openGraph: {
    title: 'Investoyard Partner API',
    description: 'Reference for empanelled distribution partners integrating with Investoyard.',
    url: absolute('/partner-api'),
    type: 'article',
  },
};

const SCOPE_LABEL = new Map<string, string>(PARTNER_SCOPE_META.map((s) => [s.key, s.label]));

/** A field table with the required dot, shared by parameters, body and response fields. */
function PaFields({ rows, head }: { rows: { name: string; type: string; required?: boolean; notes: ReactNode }[]; head?: string }) {
  const anyRequired = rows.some((r) => r.required);
  return (
    <>
      <div className="pa-fields"><table>
        <thead><tr><th>{head ?? 'Field'}</th><th>Type</th><th>Notes</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="pa-name">{r.required && <span className="pa-req-dot"></span>}{r.name.split("].").map((part, i, all) => <span key={i}>{part}{i < all.length - 1 ? <>].<wbr /></> : null}</span>)}</td>
              <td className="pa-type">{r.type}</td>
              <td className="pa-notes">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {anyRequired && <p className="pa-legend"><span className="pa-req-dot"></span> Required</p>}
    </>
  );
}

/** One endpoint, laid out exactly like the admin API Docs page lays it out. */
function PaEndpoint({ ep }: { ep: ApiEndpoint }) {
  const samples = Object.fromEntries(LANGS.map((l) => [l.id, codeSample(l.id, ep, PUBLIC_BASE)])) as Record<Lang, string>;
  return (
    <section id={ep.id} className="pa-section pa-ep">
      <h3 className="pa-ep-title">{ep.title}</h3>
      <div className="pa-endpoint">
        <span className={`pa-method ${ep.method === 'POST' ? 'pa-post' : 'pa-get'}`}>{ep.method}</span>
        <span className="pa-endpoint-path">{ep.path}</span>
      </div>
      <p>{ep.summary}</p>
      <p className="pa-scope-line">Needs the <code>{ep.scope}</code> scope — {SCOPE_LABEL.get(ep.scope) ?? ep.scope}.</p>
      {ep.details?.map((d) => <p key={d}>{d}</p>)}
      {ep.id === 'print-forms' && (
        <div className="pa-callout">
          <div className="pa-icon">i</div>
          <div><p style={{ margin: 0 }}><strong>The API does not accept <code>ifsc</code> or <code>upiId</code> here.</strong> The printed ASBA form carries only the bank account, bank name and branch — the block runs on the applicant&apos;s own bank account, and UPI does not appear on the paper form. Requests that include either field succeed, and the values are ignored.</p></div>
        </div>
      )}

      {ep.params && ep.params.length > 0 && (
        <>
          <h4>Parameters</h4>
          <PaFields head="Parameter" rows={ep.params.map((p) => ({
            name: p.name, type: p.type, required: p.required,
            notes: <>{p.in === 'path' ? <em>In the path. </em> : null}{p.description}{p.example ? <> e.g. <code>{p.example}</code></> : null}</>,
          }))} />
        </>
      )}
      {ep.bodyFields && (
        <>
          <h4>Request body</h4>
          <PaFields rows={ep.bodyFields.map((f) => ({ name: f.name, type: f.type, required: f.required, notes: f.description }))} />
        </>
      )}
      {ep.body !== undefined && (
        <div className="pa-code">
          <div className="pa-code-head"><span>Body — application/json</span><span>example</span></div>
          <pre>{prettyJson(ep.body)}</pre>
        </div>
      )}

      <h4>Example request</h4>
      <PaCodeTabs samples={samples} />

      <h4>Responses</h4>
      {ep.responses.map((r) => (
        <div key={r.status} className="pa-code">
          <div className="pa-code-head pa-resp-head"><span><span className={`pa-status ${r.status < 300 ? 'pa-ok' : 'pa-err'}`}>{r.status}</span> {r.when}</span></div>
          <pre>{prettyJson(r.body)}</pre>
        </div>
      ))}

      {ep.responseFields && (
        <>
          <h4>Response fields</h4>
          <PaFields rows={ep.responseFields.map((f) => ({ name: f.name, type: f.type, notes: f.description }))} />
        </>
      )}
    </section>
  );
}

/**
 * Public Partner API reference page.
 *
 * Content mirrors the artifact preview the operator signed off on. Layout
 * is a sticky TOC on the left + scrollable content on the right; scroll-spy
 * highlights the active section in the TOC.
 *
 * Every class name is `pa-` prefixed so the site's global sheet cannot
 * bleed in (CLAUDE.md's four-collisions warning). Site tokens
 * (--brand / --gold / --text / --header-h / --font-sans / --font-display)
 * are reused so the doc reads as part of Investoyard rather than an
 * implant, and dark mode falls through automatically from the site's own
 * data-theme handling.
 *
 * Scroll-spy is a small client shard (see scroll-spy.tsx) so the page
 * itself stays server-rendered.
 */
export default function PartnerApiDoc() {
  return (
    <div className={`pa ${jetbrainsMono.variable}`}>
      <PartnerApiScrollSpy />

      {/*
        * PRINT-ONLY COVER. `display: none` on screen (platform.css), shown by
        * the print rules — so the web page is unchanged and the PDF opens on a
        * cover like the other two documents.
        */}
      <div className="plt-cover" aria-hidden="true">
        <svg className="plt-cover-art" viewBox="0 0 420 120" preserveAspectRatio="none" aria-hidden="true">
          {[
            [10, 34, 62, 18, 86], [46, 50, 78, 32, 96], [82, 22, 54, 10, 72],
            [118, 44, 88, 28, 104], [154, 30, 58, 16, 78], [190, 56, 96, 40, 110],
            [226, 26, 66, 14, 84], [262, 48, 82, 34, 98], [298, 36, 70, 22, 90],
            [334, 54, 100, 42, 114], [370, 28, 60, 12, 80],
          ].map(([x, top, bot, wTop, wBot], i) => (
            <g key={i} className={i % 3 === 0 ? 'plt-c-gold' : 'plt-c-pale'}>
              <line x1={x + 9} y1={wTop} x2={x + 9} y2={wBot} strokeWidth="1.5" />
              <rect x={x} y={top} width="18" height={bot - top} rx="2" />
            </g>
          ))}
        </svg>

        <span className="pa-cover-logo">
          <img src="/investoyard-logo.svg" alt="Investoyard" style={{ height: 30, width: 'auto', display: 'block' }} />
        </span>

        <div className="plt-cover-mid">
          <div className="plt-cover-kicker">API reference for empanelled partners</div>
          <h1>Partner API</h1>
          <span className="plt-cover-rule" />
          <p>
            The print-forms contract: authentication, the full request field list, the response
            and the error codes — with a cURL example to start from.
          </p>
        </div>

        <div className="plt-cover-stats">
          <div>
            <div className="plt-cover-stat-v">v1.0</div>
            <div className="plt-cover-stat-l">API version</div>
          </div>
          <div>
            <div className="plt-cover-stat-v">POST</div>
            <div className="plt-cover-stat-l">/partner/v1/print-forms</div>
          </div>
          <div>
            <div className="plt-cover-stat-v">HTTPS</div>
            <div className="plt-cover-stat-l">Only, key per tenant</div>
          </div>
          <div>
            <div className="plt-cover-stat-v">JSON</div>
            <div className="plt-cover-stat-l">Request and response</div>
          </div>
        </div>

        <div className="plt-cover-foot">
          <span>Safal Capital Services Private Limited</span>
          <span>v1.0 · October 2026</span>
        </div>
      </div>

      <div className="pa-page">
        <aside className="pa-rail">
          <nav className="pa-toc" id="pa-toc">
            <div className="pa-toc-label">Introduction</div>
            <a href="#overview">Overview</a>
            <a href="#getting-started">How to get an API key</a>
            <a href="#authentication">Authentication</a>
            <a href="#base-url">Base URL &amp; versioning</a>

            {GROUPS.map((g) => (
              <div key={g.id}>
                <div className="pa-toc-label">{g.title}</div>
                {ENDPOINTS.filter((e) => e.group === g.id).map((e) => (
                  <a key={e.id} href={`#${e.id}`} className="pa-nested">{e.title}</a>
                ))}
              </div>
            ))}

            <div className="pa-toc-label">Reference</div>
            <a href="#webhooks">Webhooks</a>
            <a href="#test-mode">Test mode</a>
            <a href="#scopes">Scopes and keys</a>
            <a href="#errors">Error responses</a>
            <a href="#limits">Limits &amp; behaviour</a>
            <a href="#support">Support</a>
          </nav>
        </aside>

        <main className="pa-main">

          {/* ── Overview / hero ── */}
          <section id="overview" className="pa-section pa-noprint">
            <div className="pa-hero-head">
              <span className="pa-version">
                <span className="pa-version-dot"></span>
                v1.0
              </span>
              <span className="pa-doc-updated">First release · September 2026</span>
              {/* Same affordance /platform and /brokers carry. It sits inside
                  the overview section, which is pa-noprint, so it cannot
                  appear in the PDF it links to. */}
              <a className="pa-dl" href="/Investoyard-Partner-API.pdf" download>Download PDF</a>
            </div>
            <h1>Partner <em>API</em></h1>
            <p className="pa-lede">
              Empanelled distribution partners submit final IPO application data through this API and receive prefilled ASBA forms as a merged PDF, ready to print and hand to the client.
            </p>

            <h3>What it is</h3>
            <p>
              Investoyard provides IPO distribution partners with a programmatic interface to two things: read the live IPO catalog, and generate prefilled ASBA application PDFs at scale. The Print PDF endpoint accepts final, pre-computed application data from your systems and returns forms carrying the same catalog PDF series the operator's own applications use — form numbers are naturally sequential across both channels.
            </p>

            <h3>What it is not</h3>
            <p>
              The Print PDF endpoint <strong>does not validate the data you send</strong>. Fields print verbatim; a missing value prints blank; a mistyped PAN prints the mistyped PAN. Correctness of every applicant record — PAN, demat, bank, bid amount, applicable category caps, client consent — is the partner's responsibility. The API is a form-filling service, not a bidding rail.
            </p>

            <div className="pa-callout">
              <div className="pa-icon">i</div>
              <div>
                <p style={{ margin: 0 }}><strong>The Print PDF path is separate from ASBA bidding on the exchange.</strong> Prefilled PDFs let a partner's field team collect signed physical ASBA forms and submit them at a bank; the block runs on the applicant's own bank statement, not through this API. If you need programmatic bid submission, that surface is not covered by this document.</p>
              </div>
            </div>
          </section>

          {/* ── How to get an API key ── */}
          <section id="getting-started" className="pa-section pa-noprint">
            <h2><span className="pa-num">01</span>How to get an API key</h2>
            <p>
              Every call to this API is authenticated with a partner <strong>API key</strong>, issued against an active partner tenant on Investoyard. Which path you follow depends on whether your organisation already has a tenant on the platform.
            </p>

            <h3>Path A — new partner onboarding</h3>
            <p>Follow this path if you do not yet have a tenant on Investoyard.</p>
            <ol style={{ maxWidth: '42em' }}>
              <li><strong>Visit the partner landing page.</strong> Open <a href="/partner"><code>{SITE_HOST}/partner</code></a>. This page explains what the Partner API offers and links to the application form.</li>
              <li><strong>Sign in with your mobile number.</strong> Investoyard uses OTP-based sign-in. Enter your mobile number, receive the OTP over SMS, and confirm. You now have a personal session; the partner application is filed against it.</li>
              <li><strong>Fill the partner application.</strong> At <a href="/partner/apply"><code>/partner/apply</code></a>, complete the short form with your organisation details, a primary contact person, and references to any existing empanelment arrangement (if applicable). Submit.</li>
              <li><strong>Operator review.</strong> The Investoyard operations team reviews the application in an internal queue. Turnaround is typically one business day. You will be contacted if the team needs any clarification before deciding.</li>
              <li><strong>Activation email.</strong> On approval, the operator creates a partner tenant for your organisation and emails you a one-time activation link. Click the link, land on <code>/partner/activate</code>, and set your admin password. This account is your partner admin.</li>
              <li><strong>Generate your first API key.</strong> Sign in with the credentials you just set. Under <strong>Tenants → your tenant → API access</strong>, click <em>Create key</em> and give it a label (e.g. &quot;prod backend&quot;). The response shows the full <code>keyId.secret</code> string <strong>once</strong>. Copy it and store it in your secrets manager.</li>
            </ol>

            <h3>Path B — existing partner, new key</h3>
            <p>Follow this path if your organisation already has a tenant on Investoyard and you need an additional key (a new environment, a rotation, a replacement for a lost secret).</p>
            <ol style={{ maxWidth: '42em' }}>
              <li><strong>Sign in to admin.</strong> Use your partner admin credentials to log into the admin panel.</li>
              <li><strong>Open the API access panel.</strong> Navigate to <strong>Tenants → your tenant → API access</strong>. This panel lists every key currently issued against your tenant, with a status column and a last-used timestamp.</li>
              <li><strong>Create a new key.</strong> Click <em>Create key</em>, give it a descriptive label, and confirm. The full <code>keyId.secret</code> pair is displayed once. Store it immediately; the secret cannot be recovered afterwards.</li>
              <li><strong>Revoke keys you no longer use.</strong> Revoke stale or leaked keys from the same panel. Revocation is instant; the next request using that key returns <code>401</code>.</li>
            </ol>

            <h3>Key format &amp; storage</h3>
            <div className="pa-code">
              <div className="pa-code-head"><span>Issued key — displayed once</span></div>
              <pre>
<span className="pa-k">keyId:</span>  <span className="pa-s">pk_a1b2c3d4</span>       <span className="pa-c"># public — safe to log</span>{'\n'}
<span className="pa-k">secret:</span> <span className="pa-s">3f9e7c5b8a2d1e4f6c8b0a2d5e7f9c1b3a5d7e9f1c3b5a7d9e1f3c5b7a9d1e3f5</span>{'\n'}
                        <span className="pa-c"># confidential — treat as a password</span>{'\n'}{'\n'}
<span className="pa-c"># Compose them with a single dot on every request:</span>{'\n'}
<span className="pa-k">X-Api-Key:</span> <span className="pa-s">pk_a1b2c3d4</span><span className="pa-p">.</span><span className="pa-s">3f9e7c5b8a2d1e4f6c8b0a2d5e7f9c1b3a5d7e9f1c3b5a7d9e1f3c5b7a9d1e3f5</span>
              </pre>
            </div>
            <p>Store the secret in a server-only environment variable, a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler, etc.), or an equivalent vault. If a secret is exposed accidentally in logs, source control, or client code, revoke it immediately from the API access panel and issue a replacement.</p>

            <h3>Testing before you integrate</h3>
            <p>
              There is no separate sandbox environment. Every partner key is scoped to its own tenant, so calls to <code>/partner/v1/print-forms</code> create real prints under your tenant only. To test without generating live forms, target an IPO in your tenant's catalog where the operator has not enabled <strong>Start Print</strong>: the endpoint accepts the request shape but returns a friendly 400 explaining that printing is not enabled yet, letting you confirm auth and payload wiring without producing PDFs.
            </p>
          </section>

          {/* ── Authentication ── */}
          <section id="authentication" className="pa-section">
            <h2><span className="pa-num">02</span>Authentication</h2>
            <p>Every request must carry an <code>X-Api-Key</code> header. The value is a compound of the key identifier and its secret, separated by a single dot:</p>

            <div className="pa-code">
              <div className="pa-code-head"><span>HTTP header</span><span>required on every call</span></div>
              <pre><span className="pa-k">X-Api-Key:</span> <span className="pa-s">pk_a1b2c3d4</span><span className="pa-p">.</span><span className="pa-s">3f9e7c5b8a2d1e4f6c8b0a2d5e7f9c1b3a5d7e9f1c3b5a7d9e1f3c5b7a9d1e3f5</span></pre>
            </div>

            <ul>
              <li><strong>keyId</strong> is public — it identifies which partner is calling. It is safe to log server-side.</li>
              <li><strong>secret</strong> is confidential. Rotate it if leaked; the operator can revoke a key from the admin panel and issue a new one.</li>
              <li>Keys are <strong>tenant-scoped</strong>. A key issued to Partner X only reads and writes Partner X's data.</li>
              <li>Every successful call updates the key's <code>lastUsedAt</code> timestamp on a best-effort basis, for the operator's monitoring.</li>
            </ul>

            <div className="pa-callout pa-warn">
              <div className="pa-icon">!</div>
              <div>
                <p style={{ margin: 0 }}><strong>Never embed the secret in client-side code.</strong> API keys grant server-to-server access under your tenant. Store the secret in a server-only environment variable, a secrets manager, or an equivalent vault; never in a mobile binary, browser bundle, or repository.</p>
              </div>
            </div>
          </section>

          {/* ── Base URL & versioning ── */}
          <section id="base-url" className="pa-section">
            <h2><span className="pa-num">03</span>Base URL &amp; versioning</h2>
            <dl className="pa-kv">
              <dt>Production base URL</dt>
              <dd><code>Issued with your API key</code></dd>
              <dt>API prefix</dt>
              <dd><code>/partner/v1</code></dd>
              <dt>Transport</dt>
              <dd>HTTPS only. Plain HTTP requests are refused at the edge.</dd>
              <dt>Content type</dt>
              <dd>Request: <code>application/json</code> · Response: <code>application/json</code></dd>
            </dl>

            <h3>Versioning policy</h3>
            <p>The API lives under <code>/v1</code>. We version by <strong>breaking change</strong>, not by feature release. New optional request fields, new response fields, new endpoints, and new enum values on existing fields do <strong>not</strong> bump the version — v1 stays v1 as we add. We publish a new major version only when the shape of an existing field changes, an existing field is required to disappear, or auth semantics change.</p>
          </section>

          {/*
            * EVERY ENDPOINT BELOW IS DRAWN FROM lib/partnerApiDocs.ts (2026-11-23) —
            * the same content the admin API Docs page renders, so the public
            * reference and the PDF cannot drift from it. Before this, this page
            * still said 100 applicants per call (the default is 25), "200 OK"
            * for a print (it is 201) and a PAN mask the API never returns.
            *
            * The PDF is the print-forms contract only: the Print forms group
            * prints, every other group is pa-noprint.
            */}
          {GROUPS.map((g, gi) => {
            const eps = ENDPOINTS.filter((e) => e.group === g.id);
            return (
              <div key={g.id} className={g.id === 'print' ? undefined : 'pa-noprint'}>
                <section id={`g-${g.id}`} className="pa-section pa-group">
                  <h2><span className="pa-num">{String(gi + 4).padStart(2, '0')}</span>{g.title}</h2>
                  <p>{g.intro}</p>
                  {g.id === 'bids' && (
                    <div className="pa-callout pa-warn">
                      <div className="pa-icon">!</div>
                      <div><strong>Live bidding is not open yet.</strong> Use a <strong>test key</strong>: its bids go to a simulator and never reach an exchange, so you can build and test your whole integration now. See <a href="#test-mode">Test mode</a>.</div>
                    </div>
                  )}
                </section>
                {eps.map((e) => <PaEndpoint key={e.id} ep={e} />)}
              </div>
            );
          })}

          {/* ── webhooks ── */}
          <section id="webhooks" className="pa-section pa-noprint">
            <h2><span className="pa-num">{String(GROUPS.length + 4).padStart(2, '0')}</span>Webhooks</h2>
            <p>Set an https endpoint under <strong>Partner API → Webhooks</strong> in the partner admin. Whenever one of your bids changes we send a signed <code>POST</code> with the event and the bid&apos;s current state, so you do not have to keep asking.</p>
            <p>Events: {WEBHOOK_EVENTS.map((e, i) => <span key={e}>{i ? ', ' : ''}<code>{e}</code></span>)}.</p>
            <div className="pa-code">
              <div className="pa-code-head"><span>Example delivery</span></div>
              <pre>{`POST https://your-server.example/investoyard/webhooks
X-Investoyard-Event: bid.funds_blocked
X-Investoyard-Delivery: 7c1d9e2a-…
X-Investoyard-Signature: t=1700000000,v1=<hex>

${prettyJson(WEBHOOK_SAMPLE)}`}</pre>
            </div>
            <div className="pa-code">
              <div className="pa-code-head"><span>Check the signature — Node.js</span></div>
              <pre>{WEBHOOK_VERIFY}</pre>
            </div>
            <p style={{ fontSize: '.9rem' }}>Answer with any 2xx within 10 seconds. Anything else is retried — after 1 minute, 5 minutes, 30 minutes, 2, 6, 12 and 24 hours — then marked failed, and can be sent again from the admin. Deliveries can arrive more than once and out of order: use <code>X-Investoyard-Delivery</code> to ignore repeats, and the bid&apos;s <code>status</code> as the truth. <code>GET /bids</code> is always the backup.</p>
          </section>

          {/* ── test mode ── */}
          <section id="test-mode" className="pa-section pa-noprint">
            <h2><span className="pa-num">{String(GROUPS.length + 5).padStart(2, '0')}</span>Test mode</h2>
            <p>Ask for a <strong>test key</strong> (or create one under <strong>My API Keys</strong>). Bids placed with it behave like live bids — the same checks, the same responses, the same webhooks — except that they:</p>
            <ul>
              <li>go to a simulator and never reach an exchange;</li>
              <li>are accepted for any IPO in the catalogue, open or not;</li>
              <li>get application numbers starting <code>TEST</code>;</li>
              <li>are invisible to live keys and to every live rule.</li>
            </ul>
            <p>Move a test bid on with <a href="#simulate">Simulate the next step</a>. A full cycle: place → <code>bid.sent</code> → <code>mandate_accepted</code> → <code>allotted</code> → <code>refund</code>.</p>
            <p style={{ fontSize: '.9rem' }}>A <strong>live</strong> key that places bids must have an IP allowlist; requests from any other address are refused. A test key is held to its allowlist only when one is set.</p>
          </section>

          {/* ── Scopes ── */}
          <section id="scopes" className="pa-section pa-noprint">
            <h2><span className="pa-num">{String(GROUPS.length + 6).padStart(2, '0')}</span>Scopes and keys</h2>
            <p>Each endpoint needs a scope. The operator switches scopes on for your account; you can then limit any key to some of them, so a system that only reads allotment results does not hold a key that can print forms. A key with no scopes of its own can use everything your account has.</p>
            <div className="pa-fields"><table>
              <thead><tr><th>Scope</th><th>Opens</th><th>For a new partner</th></tr></thead>
              <tbody>
                {PARTNER_SCOPE_META.filter((s) => s.key !== 'subscription:read' && s.key !== 'gmp:read').map((s) => (
                  <tr key={s.key}>
                    <td className="pa-name">{s.key}</td>
                    <td className="pa-notes">{s.endpoints.map((e) => <div key={e}><code>{e.replace('/partner/v1', '')}</code></div>)}</td>
                    <td className="pa-notes">{s.byDefault ? 'On' : 'On request'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p style={{ fontSize: '.9rem' }}>Keys are created and limited in the partner admin under <strong>My API Keys</strong>, and a key&apos;s scopes can be changed without issuing a new secret. A call your key is not allowed to make returns <code>403</code> and says whether it is the key or your account that lacks the scope.</p>
          </section>

          {/* ── Error responses ── */}
          <section id="errors" className="pa-section">
            <h2><span className="pa-num">{String(GROUPS.length + 7).padStart(2, '0')}</span>Error responses</h2>
            <p>All errors are JSON with the HTTP status in <code>statusCode</code> and a <code>message</code> that says what to fix. The <code>Content-Type</code> is <code>application/json</code>.</p>

            <div className="pa-fields"><table>
              <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
              <tbody>
                {ERRORS.map((x) => (
                  /* 409 is a bid conflict — the PDF is the print-forms contract only. */
                  <tr key={x.status} className={x.status === 409 ? 'pa-noprint' : undefined}>
                    <td className="pa-name"><span className="pa-status pa-err">{x.status}</span> {x.title}</td>
                    <td className="pa-notes">{x.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <h3>Example error body</h3>
            <div className="pa-code">
              <div className="pa-code-head"><span>Response — application/json</span><span>401 Unauthorized</span></div>
              <pre>{`{
  "statusCode": 401,
  "message":    "Invalid or revoked API key.",
  "error":      "Unauthorized"
}`}</pre>
            </div>
          </section>

          {/* ── Limits & behaviour ── */}
          <section id="limits" className="pa-section pa-noprint">
            <h2><span className="pa-num">{String(GROUPS.length + 8).padStart(2, '0')}</span>Limits &amp; behaviour</h2>
            <div className="pa-fields"><table>
              <thead><tr><th>Aspect</th><th>Behaviour</th></tr></thead>
              <tbody>
                <tr><td className="pa-name">Applicants per call</td><td className="pa-notes"><strong>25 by default per tenant</strong> — the operator may raise this for your tenant up to a platform hard ceiling of 500. Contact the operator if 25 is too low for your workflow. Requests above your configured cap return a 400 that states your tenant's actual limit.</td></tr>
                <tr><td className="pa-name">Form numbering</td><td className="pa-notes">Shared per-IPO series with the operator's own applications. Numbers are assigned atomically as rows are inserted, so retries of the same batchId will not renumber.</td></tr>
                <tr><td className="pa-name">Idempotency</td><td className="pa-notes">The server derives an idempotency key from <code>keyId + batchId + profileId</code>. Retrying the same request from the same partner does not create duplicates as long as the batchId is stable.</td></tr>
                <tr><td className="pa-name">PII vaulting</td><td className="pa-notes">PAN and bank account are tokenised per tenant on write. Read endpoints never return the raw values.</td></tr>
                <tr><td className="pa-name">Audit trail</td><td className="pa-notes">Every print-forms call writes an audit row: <code>keyId</code>, IPO, applicant count, batchId. PII is never audited.</td></tr>
                <tr><td className="pa-name">Rate limits</td><td className="pa-notes">No hard rate limit today. Sustained bursts above a few requests per second are visible on the operator's monitoring; if that becomes a routine pattern, please coordinate on a scheduled window.</td></tr>
                <tr><td className="pa-name">Timeouts</td><td className="pa-notes">Merging a large batch of forms takes several seconds. Set your client timeout to at least 60s.</td></tr>
                <tr><td className="pa-name">Reporting</td><td className="pa-notes">Your own print records and allotment results can be read through <code>/prints</code> and <code>/allotment</code>. Every call — including a refused one — is also in the operator&apos;s API Call Report, by partner, key, day and IPO.</td></tr>
                <tr><td className="pa-name">Endpoint access</td><td className="pa-notes">Each endpoint needs a scope. The operator switches scopes on for your account and you can limit each key further — see <a href="#scopes">Scopes and keys</a>. Defaults for a new partner: print-forms and the IPO catalogue reads.</td></tr>
              </tbody>
            </table></div>
          </section>

          {/* ── Support ── */}
          <section id="support" className="pa-section">
            <h2 className="pa-noprint"><span className="pa-num">{String(GROUPS.length + 9).padStart(2, '0')}</span>Support</h2>
            <p className="pa-noprint">Questions about the API, key issuance, incident reports, and feature requests: contact the operator through your existing empanelment channel, or reach out to your Investoyard relationship manager.</p>
            <p className="pa-noprint">When reporting an integration issue, include: the request timestamp (UTC), your keyId (never the secret), the endpoint called, the HTTP status you received, and the response body — this is enough for us to trace the call in the audit log.</p>

            {/* NOT marked pa-noprint: a PDF that leaves our hands has to name
                the entity that published it and who it is for. */}
            <footer className="pa-footer">
              <p>Investoyard is a product of <strong style={{ color: 'var(--text)' }}>Safal Capital Services Private Limited</strong>. The Partner API is provided to empanelled distribution partners only.</p>
            </footer>
          </section>

        </main>
      </div>
    </div>
  );
}
