import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { PartnerApiScrollSpy } from './scroll-spy';
import { PARTNER_BID_BATCH_MAX, PARTNER_SCOPE_META } from '@investoyard/shared-types';
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
            and the error codes — with curl, JavaScript and Python examples.
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

            <div className="pa-toc-label">Endpoints</div>
            <a href="#print-forms" className="pa-nested">POST /print-forms</a>
            <a href="#list-ipos" className="pa-nested">GET /ipos</a>
            <a href="#get-ipo" className="pa-nested">GET /ipos/{'{'}symbol{'}'}</a>
            <a href="#list-prints" className="pa-nested">GET /prints</a>
            <a href="#get-print" className="pa-nested">GET /prints/detail · /pdf</a>
            <a href="#allotment" className="pa-nested">GET /allotment</a>
            <a href="#bids" className="pa-nested">POST /bids</a>
            <a href="#bid-changes" className="pa-nested">Change or cancel</a>
            <a href="#bid-status" className="pa-nested">GET /bids</a>

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

          {/* ── POST /print-forms ── */}
          <section id="print-forms" className="pa-section">
            <h2><span className="pa-num">04</span>Print forms</h2>
            <p>Store final application data and receive prefilled ASBA form(s) as one merged PDF. Applications land in the partner's tenant with <code>applyMethod: &quot;pdf&quot;</code>; form numbers come from the same per-IPO PDF series the operator's own applications use.</p>

            <div className="pa-endpoint">
              <span className="pa-method pa-post">POST</span>
              <span className="pa-endpoint-path">/partner/v1/<b>print-forms</b></span>
            </div>

            <h3>Request body</h3>
            <p>Two top-level fields: the IPO's ticker symbol and an array of applicants. Up to <strong>100 applicants per request</strong>. The endpoint returns one merged PDF with a page per applicant, in the order sent.</p>

            <div className="pa-code">
              <div className="pa-code-head"><span>Body — application/json</span><span>example</span></div>
              <pre>{`{
  "ipoSymbol": "PERNIASPOP",
  "applicants": [
    {
      "fullName":    "Ananya Kapoor",
      "pan":         "AAAPK1234C",
      "depository":  "CDSL",
      "clientId":    "1201060012345678",
      "bankAccount": "123456789012",
      "bankName":    "HDFC Bank",
      "branchName":  "Andheri West",
      "address":     "12 Sea View Rd",
      "city":        "Mumbai",
      "state":       "Maharashtra",
      "pincode":     "400058",
      "email":       "ananya@example.com",
      "mobile":      "9820012345",
      "category":    "Retail",
      "lots":        2,
      "shareQty":    52,
      "sharePrice":  575,
      "amount":      29900
    }
  ]
}`}</pre>
            </div>

            <h4>Top-level fields</h4>
            <div className="pa-fields"><table>
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>ipoSymbol</td><td className="pa-type">string</td><td className="pa-notes">Ticker symbol as it appears in the catalog (e.g. <code>PERNIASPOP</code>). Case-insensitive.</td></tr>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>applicants</td><td className="pa-type">Applicant[]</td><td className="pa-notes">1 to 100 applicants. See applicant schema below.</td></tr>
              </tbody>
            </table></div>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '-.5rem' }}><span className="pa-req-dot"></span> Required</p>

            <h4>Applicant schema</h4>
            <p>Every applicant field is <strong>optional</strong>. Missing values print as blanks on the form. There is no schema-level validation on PAN format, demat length, bid amount, or category caps — the correctness of every value is the partner's responsibility.</p>

            <div className="pa-fields"><table>
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="pa-name">fullName</td><td className="pa-type">string</td><td className="pa-notes">Applicant's full name as on the demat account.</td></tr>
                <tr><td className="pa-name">pan</td><td className="pa-type">string</td><td className="pa-notes">10-character PAN. Stored under your tenant's PII vault.</td></tr>
                <tr><td className="pa-name">depository</td><td className="pa-type"><code>&quot;NSDL&quot; | &quot;CDSL&quot;</code></td><td className="pa-notes">Selects which demat identifier layout to print.</td></tr>
                <tr><td className="pa-name">dpId</td><td className="pa-type">string</td><td className="pa-notes"><strong>NSDL only.</strong> Format <code>IN</code> + 6 digits. For CDSL, leave blank.</td></tr>
                <tr><td className="pa-name">clientId</td><td className="pa-type">string</td><td className="pa-notes">NSDL: 8 digits. CDSL: 16-digit demat account number.</td></tr>
                <tr><td className="pa-name">bankAccount</td><td className="pa-type">string</td><td className="pa-notes">Bank account number for the ASBA block. Stored under your tenant's PII vault.</td></tr>
                <tr><td className="pa-name">bankName</td><td className="pa-type">string</td><td className="pa-notes">Bank name — printed on the form.</td></tr>
                <tr><td className="pa-name">branchName</td><td className="pa-type">string</td><td className="pa-notes">Branch name — printed on the form.</td></tr>
                <tr><td className="pa-name">address</td><td className="pa-type">string</td><td className="pa-notes"></td></tr>
                <tr><td className="pa-name">city</td><td className="pa-type">string</td><td className="pa-notes"></td></tr>
                <tr><td className="pa-name">state</td><td className="pa-type">string</td><td className="pa-notes"></td></tr>
                <tr><td className="pa-name">pincode</td><td className="pa-type">string</td><td className="pa-notes"></td></tr>
                <tr><td className="pa-name">email</td><td className="pa-type">string</td><td className="pa-notes"></td></tr>
                <tr><td className="pa-name">mobile</td><td className="pa-type">string</td><td className="pa-notes"></td></tr>
                <tr><td className="pa-name">familyGroup</td><td className="pa-type">string</td><td className="pa-notes">Grouping label — fills the form's <em>FamilyGroup</em> box for print organisation.</td></tr>
                <tr><td className="pa-name">category</td><td className="pa-type"><code>enum</code></td><td className="pa-notes">One of <code>&quot;Retail&quot;</code>, <code>&quot;sHNI&quot;</code>, <code>&quot;bHNI&quot;</code>, <code>&quot;Shareholder&quot;</code>, <code>&quot;Employee&quot;</code>.</td></tr>
                <tr><td className="pa-name">lots</td><td className="pa-type">integer ≥ 0</td><td className="pa-notes">Number of lots bid. Printed verbatim.</td></tr>
                <tr><td className="pa-name">shareQty</td><td className="pa-type">integer ≥ 0</td><td className="pa-notes">Final share quantity. Printed verbatim.</td></tr>
                <tr><td className="pa-name">sharePrice</td><td className="pa-type">number ≥ 0</td><td className="pa-notes">Bid price per share.</td></tr>
                <tr><td className="pa-name">amount</td><td className="pa-type">number ≥ 0</td><td className="pa-notes">Total blocked amount in rupees.</td></tr>
              </tbody>
            </table></div>

            <div className="pa-callout">
              <div className="pa-icon">i</div>
              <div>
                <p style={{ margin: 0 }}><strong>The API does not accept <code>ifsc</code> or <code>upiId</code>.</strong> The printed ASBA form carries only Bank Account, Bank Name, and Branch Name — the block runs on the applicant's own bank statement (no interbank routing means IFSC has no role), and UPI is a separate electronic rail that does not appear on the physical form at all. Requests containing either field succeed but the values are silently discarded.</p>
              </div>
            </div>

            <h3>Response</h3>
            <p><span className="pa-status pa-ok">200 OK</span> The response body carries the list of created applications and the merged PDF as base64.</p>

            <div className="pa-code">
              <div className="pa-code-head"><span>Response — application/json</span><span>example (truncated)</span></div>
              <pre>{`{
  "ipoSymbol": "PERNIASPOP",
  "batchId":   "6b3f2d7c-1a4e-4b8c-9f2d-1e3c4b5a6d7f",
  "applications": [
    {
      "applicationRef": "clw3k9qx0000v7u01g5h8m2b",
      "formNo":         "PERNIASPOP-000042",
      "fullName":       "Ananya Kapoor",
      "category":       "Retail",
      "lots":           2,
      "amount":         29900
    }
  ],
  "filename":  "PERNIASPOP-2026-09-07-forms.pdf",
  "pdfBase64": "JVBERi0xLjcKJcTl8uXrp/Og0MTGCjQg…"
}`}</pre>
            </div>

            <h4>Response fields</h4>
            <div className="pa-fields"><table>
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="pa-name">ipoSymbol</td><td className="pa-type">string</td><td className="pa-notes">Echoes the request.</td></tr>
                <tr><td className="pa-name">batchId</td><td className="pa-type">string</td><td className="pa-notes">UUID linking every application created in this call. Useful for reconciliation.</td></tr>
                <tr><td className="pa-name">applications</td><td className="pa-type">object[]</td><td className="pa-notes">One entry per applicant, in the order sent. Carries the assigned form number and the applicationRef (Investoyard's stable ID).</td></tr>
                <tr><td className="pa-name">filename</td><td className="pa-type">string</td><td className="pa-notes">Suggested filename for the merged PDF.</td></tr>
                <tr><td className="pa-name">pdfBase64</td><td className="pa-type">string</td><td className="pa-notes">The full merged PDF encoded as base64. Decode with <code>Buffer.from(str, &apos;base64&apos;)</code> or equivalent.</td></tr>
              </tbody>
            </table></div>

            <h3>Examples</h3>

            <h4>cURL</h4>
            <div className="pa-code">
              <div className="pa-code-head"><span>bash</span></div>
              <pre>{`# Save the response body to disk, then extract the PDF.
curl https://<your-base-url>/partner/v1/print-forms \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: pk_a1b2c3d4.3f9e7c5b…" \\
  -d @request.json \\
  -o response.json

jq -r '.pdfBase64' response.json | base64 -d > forms.pdf`}</pre>
            </div>

            <h4>Node.js</h4>
            <div className="pa-code">
              <div className="pa-code-head"><span>javascript</span></div>
              <pre>{`import fs from 'node:fs/promises';

const res = await fetch('https://<your-base-url>/partner/v1/print-forms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.INVESTOYARD_API_KEY,
  },
  body: JSON.stringify({
    ipoSymbol: 'PERNIASPOP',
    applicants: [ /* … */ ],
  }),
});

if (!res.ok) throw new Error(\`\${res.status} \${await res.text()}\`);
const { pdfBase64, filename } = await res.json();
await fs.writeFile(filename, Buffer.from(pdfBase64, 'base64'));`}</pre>
            </div>

            <h4>Python</h4>
            <div className="pa-code">
              <div className="pa-code-head"><span>python</span></div>
              <pre>{`import os, base64, requests

r = requests.post(
    "https://<your-base-url>/partner/v1/print-forms",
    headers={"X-Api-Key": os.environ["INVESTOYARD_API_KEY"]},
    json={
        "ipoSymbol": "PERNIASPOP",
        "applicants": [ # … ],
    },
    timeout=60,
)
r.raise_for_status()
data = r.json()
with open(data["filename"], "wb") as f:
    f.write(base64.b64decode(data["pdfBase64"]))`}</pre>
            </div>
          </section>

          {/* ── GET /ipos ── */}
          <section id="list-ipos" className="pa-section pa-noprint">
            <h2><span className="pa-num">05</span>List IPOs</h2>
            <p>List IPOs from the catalog, optionally filtered by board type, instrument, or status. Every response is projected through the operational contract, so adding an internal reporting field can never change your payload.</p>

            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/<b>ipos</b></span>
            </div>

            <h4>Query parameters</h4>
            <div className="pa-fields"><table>
              <thead><tr><th>Parameter</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="pa-name">board</td><td className="pa-type">string</td><td className="pa-notes">Filter by <code>&quot;mainboard&quot;</code> or <code>&quot;sme&quot;</code>.</td></tr>
                <tr><td className="pa-name">instrument</td><td className="pa-type">string</td><td className="pa-notes">Filter by instrument type (e.g. <code>&quot;ipo&quot;</code>).</td></tr>
                <tr><td className="pa-name">status</td><td className="pa-type">string</td><td className="pa-notes">One of <code>&quot;upcoming&quot;</code>, <code>&quot;open&quot;</code>, <code>&quot;closed&quot;</code>, <code>&quot;listed&quot;</code>.</td></tr>
                <tr><td className="pa-name">limit</td><td className="pa-type">integer</td><td className="pa-notes">Page size. Default is server-side; do not depend on a specific default.</td></tr>
                <tr><td className="pa-name">offset</td><td className="pa-type">integer</td><td className="pa-notes">Offset for pagination.</td></tr>
              </tbody>
            </table></div>
          </section>

          {/* ── GET /ipos/:symbol ── */}
          <section id="get-ipo" className="pa-section pa-noprint">
            <h2><span className="pa-num">06</span>Get one IPO</h2>
            <p>Return the full catalog record for a single IPO by ticker symbol.</p>
            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/ipos/<b>{'{symbol}'}</b></span>
            </div>
            <p style={{ fontSize: '.9rem' }}>Response is a single IPO record shaped by the same operational contract as the list endpoint.</p>
          </section>

          {/* ── GET /prints ── */}
          <section id="list-prints" className="pa-section pa-noprint">
            <h2><span className="pa-num">07</span>Your print records</h2>
            <p>The forms your account has printed, newest first. Needs the <code>prints:read</code> scope. Only your own records are ever returned.</p>
            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/<b>prints</b></span>
            </div>
            <h4>Query parameters — all optional</h4>
            <div className="pa-fields"><table>
              <thead><tr><th>Parameter</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="pa-name">ipoSymbol</td><td className="pa-type">string</td><td className="pa-notes">Only prints for this IPO. An unknown symbol returns <code>404</code>.</td></tr>
                <tr><td className="pa-name">batchId</td><td className="pa-type">string</td><td className="pa-notes">Only the applications from one <code>print-forms</code> call.</td></tr>
                <tr><td className="pa-name">from · to</td><td className="pa-type">date</td><td className="pa-notes"><code>YYYY-MM-DD</code>, India time, both ends included.</td></tr>
                <tr><td className="pa-name">page · per</td><td className="pa-type">integer</td><td className="pa-notes">Page number (from 1) and page size. <code>per</code> defaults to 50 and is capped at 200.</td></tr>
              </tbody>
            </table></div>
            <div className="pa-code">
              <div className="pa-code-head"><span>Response — application/json</span><span>200 OK</span></div>
              <pre>{`{
  "total": 132, "page": 1, "per": 50,
  "rows": [
    {
      "applicationRef": "9b2f0c1e-…",
      "batchId":        "4d7a…",
      "formNo":         "40012345",
      "ipoSymbol":      "PERNIASPOP",
      "printedAt":      "2026-11-20T06:41:12.000Z",
      "keyId":          "pk_a1b2c3d4",
      "fullName":       "Rakesh Kumar",
      "panMasked":      "ABCDE**34F",
      "category":       "sHNI",
      "lots":           2,
      "shareQty":       530,
      "amount":         225250
    }
  ]
}`}</pre>
            </div>
          </section>

          {/* ── GET /prints/detail + /prints/pdf ── */}
          <section id="get-print" className="pa-section pa-noprint">
            <h2><span className="pa-num">08</span>One print, and its PDF again</h2>
            <p>Read one record, or download the same form again — same form number, filled from the data you sent the first time. Use this instead of calling <code>print-forms</code> a second time, which would create a second record and take a new form number. Both need <code>prints:read</code>.</p>
            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/prints/<b>detail</b>?ref=<b>{'{applicationRef}'}</b></span>
            </div>
            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/prints/<b>pdf</b>?ref=<b>{'{applicationRef}'}</b></span>
            </div>
            <p style={{ fontSize: '.9rem' }}><code>ref</code> is the <code>applicationRef</code> that <code>print-forms</code> returned. <code>detail</code> adds the depository, DP ID, bank and branch to the list fields; the client ID and bank account come back masked to their last four digits. <code>pdf</code> returns <code>{'{ applicationRef, formNo, filename, pdfBase64 }'}</code>, the same shape as <code>print-forms</code>.</p>
            <div className="pa-callout">
              <div className="pa-icon">i</div>
              <div>PAN, client ID and bank account are masked in every read, including details you sent us yourself. They are your records, but a leaked API key must not become a way to read them back.</div>
            </div>
          </section>

          {/* ── GET /allotment ── */}
          <section id="allotment" className="pa-section pa-noprint">
            <h2><span className="pa-num">09</span>Allotment results</h2>
            <p>The allotment outcome of your own applications, once the registrar has published and we have imported its file. Needs the <code>allotment:read</code> scope. It answers for applications you printed through this API; it does not look up other PANs.</p>
            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/<b>allotment</b>?ipoSymbol=<b>{'{symbol}'}</b></span>
            </div>
            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/<b>allotment</b>?ref=<b>{'{applicationRef}'}</b></span>
            </div>
            <p style={{ fontSize: '.9rem' }}>Send <code>ipoSymbol</code> for every application on one IPO (paged with <code>page</code> and <code>per</code>), or <code>ref</code> for one application.</p>
            <div className="pa-fields"><table>
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="pa-name">result</td><td className="pa-type">string</td><td className="pa-notes"><code>allotted</code> · <code>not_allotted</code> (not picked in the draw) · <code>rejected</code> (the registrar gave a reason, in <code>reason</code>) · <code>pending</code> (no result recorded yet).</td></tr>
                <tr><td className="pa-name">allottedLots · allottedShares</td><td className="pa-type">integer</td><td className="pa-notes"><code>null</code> while pending.</td></tr>
                <tr><td className="pa-name">allottedAmount · refundAmount</td><td className="pa-type">number</td><td className="pa-notes">Rupees, from the application amount. <code>null</code> while pending.</td></tr>
                <tr><td className="pa-name">registrarFileReceived</td><td className="pa-type">boolean</td><td className="pa-notes">Whether we hold the registrar&apos;s file for this IPO. <code>true</code> with <code>result: &quot;pending&quot;</code> means the file is in but this application could not be matched — contact support with its <code>applicationRef</code>.</td></tr>
                <tr><td className="pa-name">applicationRef · formNo · ipoSymbol · fullName · panMasked · appliedLots · recordedAt</td><td className="pa-type">—</td><td className="pa-notes">As in the print records.</td></tr>
              </tbody>
            </table></div>
          </section>

          {/* ── POST /bids ── */}
          <section id="bids" className="pa-section pa-noprint">
            <h2><span className="pa-num">10</span>Place bids</h2>
            <p>Place UPI bids for your clients under our exchange membership. Needs the <code>bids:write</code> scope. Up to {PARTNER_BID_BATCH_MAX} bids per call, <strong>all or nothing</strong>: every bid is checked first, and if any fails none is placed and every problem is listed.</p>
            <div className="pa-callout pa-warn">
              <div className="pa-icon">!</div>
              <div><strong>Live bidding is not open yet.</strong> Use a <strong>test key</strong>: its bids go to a simulator and never reach an exchange, so you can build and test your whole integration now. See <a href="#test-mode">Test mode</a>.</div>
            </div>
            <div className="pa-endpoint">
              <span className="pa-method pa-post">POST</span>
              <span className="pa-endpoint-path">/partner/v1/<b>bids</b></span>
            </div>
            <div className="pa-code">
              <div className="pa-code-head"><span>Body — application/json</span><span>example</span></div>
              <pre>{`{
  "ipoSymbol": "PERNIASPOP",
  "bids": [
    {
      "orderId":    "ORD-2026-000123",
      "consentRef": "CONSENT-88412",
      "fullName":   "Rakesh Kumar",
      "pan":        "ABCDE1234F",
      "depository": "NSDL",
      "dpId":       "IN301234",
      "clientId":   "12345678",
      "upiId":      "rakesh@okhdfcbank",
      "category":   "retail",
      "lots":       1,
      "atCutoff":   true
    }
  ]
}`}</pre>
            </div>
            <div className="pa-fields"><table>
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>orderId</td><td className="pa-type">string</td><td className="pa-notes">Your own id for this bid. <strong>Sending the same orderId again returns the bid it made</strong> (<code>replayed: true</code>) and places nothing new, so a retried call is always safe.</td></tr>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>consentRef</td><td className="pa-type">string</td><td className="pa-notes">Your reference for the client&apos;s instruction and consent to this bid. We keep it with the instruction; you keep the consent itself.</td></tr>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>pan · fullName</td><td className="pa-type">string</td><td className="pa-notes">The applicant&apos;s own PAN and name. One public bid per PAN per IPO, plus one in each reserved quota — across every channel, not only yours.</td></tr>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>depository · dpId · clientId</td><td className="pa-type">string</td><td className="pa-notes">NSDL: <code>dpId</code> is IN and six digits, <code>clientId</code> eight digits. CDSL: no <code>dpId</code>, <code>clientId</code> is the sixteen-digit demat number.</td></tr>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>upiId</td><td className="pa-type">string</td><td className="pa-notes">The applicant&apos;s own UPI ID; the mandate request goes there.</td></tr>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>category</td><td className="pa-type">string</td><td className="pa-notes"><code>retail</code>, <code>shni</code>, <code>shareholder</code> or <code>employee</code> (reserved quotas only where the IPO offers them). It must agree with the amount: retail up to ₹2 lakh on mainboard (exactly the minimum lots on SME), small-HNI above ₹2 lakh. A UPI mandate is capped at ₹5 lakh, so big-HNI bids go through print forms.</td></tr>
                <tr><td className="pa-name"><span className="pa-req-dot"></span>lots</td><td className="pa-type">integer</td><td className="pa-notes">At least the category&apos;s minimum for this IPO.</td></tr>
                <tr><td className="pa-name">atCutoff · price</td><td className="pa-type">boolean · number</td><td className="pa-notes">Cut-off is for retail and reserved quotas only. Otherwise send a <code>price</code> inside the price band.</td></tr>
              </tbody>
            </table></div>
            <p style={{ fontSize: '.9rem' }}>The response lists each bid with its <code>ref</code> (our id — keep it), our <code>applicationNumber</code>, its status and amount. A bid is then sent to the exchange within seconds; you hear about every step by <a href="#webhooks">webhook</a>.</p>
          </section>

          {/* ── change a bid ── */}
          <section id="bid-changes" className="pa-section pa-noprint">
            <h2><span className="pa-num">11</span>Change or cancel a bid</h2>
            <p>Each takes <code>ref</code> or <code>orderId</code>, and a <code>consentRef</code> for the client&apos;s instruction. Needs <code>bids:write</code>.</p>
            <div className="pa-endpoint"><span className="pa-method pa-post">POST</span><span className="pa-endpoint-path">/partner/v1/bids/<b>modify</b></span></div>
            <p style={{ fontSize: '.9rem' }}>New <code>lots</code> (and <code>price</code> or <code>atCutoff</code>). SEBI does not let an HNI bid at the exchange be lowered — only raised.</p>
            <div className="pa-endpoint"><span className="pa-method pa-post">POST</span><span className="pa-endpoint-path">/partner/v1/bids/<b>cancel</b></span></div>
            <p style={{ fontSize: '.9rem' }}>Withdraw a bid. Once at the exchange, only retail and reserved-quota bids may be withdrawn.</p>
            <div className="pa-endpoint"><span className="pa-method pa-post">POST</span><span className="pa-endpoint-path">/partner/v1/bids/<b>upi</b></span></div>
            <p style={{ fontSize: '.9rem' }}>A new <code>upiId</code>. Refused once the funds are blocked — the block sits behind the old UPI ID.</p>
          </section>

          {/* ── read ── */}
          <section id="bid-status" className="pa-section pa-noprint">
            <h2><span className="pa-num">12</span>Bid status</h2>
            <p>Needs <code>bids:read</code>. A key reads only bids in its own mode — a test key sees test bids.</p>
            <div className="pa-endpoint"><span className="pa-method pa-get">GET</span><span className="pa-endpoint-path">/partner/v1/<b>bids</b>?ref= | ?orderId=</span></div>
            <p style={{ fontSize: '.9rem' }}>One bid with its full history. Without <code>ref</code> or <code>orderId</code>, a page of bids filtered by <code>ipoSymbol</code> and <code>status</code>.</p>
            <div className="pa-endpoint"><span className="pa-method pa-get">GET</span><span className="pa-endpoint-path">/partner/v1/bids/<b>summary</b>?ipoSymbol=</span></div>
            <p style={{ fontSize: '.9rem' }}>Bids and rupees by status for one IPO.</p>
            <p style={{ fontSize: '.9rem' }}>Statuses: <code>submitted</code> (queued) · <code>mandate_pending</code> (sent; waiting for the investor) · <code>upi_blocked</code> (funds blocked) · <code>dp_verified</code> · <code>confirmed</code> · <code>allotted</code> · <code>not_allotted</code> · <code>released</code> (refunded) · <code>cancelled</code> · <code>rejected</code> · <code>failed</code>.</p>
          </section>

          {/* ── webhooks ── */}
          <section id="webhooks" className="pa-section pa-noprint">
            <h2><span className="pa-num">13</span>Webhooks</h2>
            <p>Set an https endpoint under <strong>Partner API → Webhooks</strong> in the partner admin. Whenever one of your bids changes we send a <code>POST</code> with the event and the bid&apos;s current state. Events: <code>bid.accepted</code>, <code>bid.sent</code>, <code>bid.funds_blocked</code>, <code>bid.demat_verified</code>, <code>bid.rejected</code>, <code>bid.instruction_refused</code>, <code>bid.cancelled</code>, <code>bid.allotment</code>, <code>bid.refund</code>, <code>bid.status</code>.</p>
            <div className="pa-code">
              <div className="pa-code-head"><span>Verify a delivery — Node.js</span></div>
              <pre>{`import crypto from 'node:crypto';

// header: X-Investoyard-Signature: t=1700000000,v1=<hex>
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`}</pre>
            </div>
            <p style={{ fontSize: '.9rem' }}>Answer with any 2xx within 10 seconds. Anything else is retried — after 1 minute, 5 minutes, 30 minutes, 2, 6, 12 and 24 hours — then marked failed, and can be sent again from the admin. Deliveries can arrive more than once and out of order: use <code>X-Investoyard-Delivery</code> to ignore repeats, and the bid&apos;s <code>status</code> as the truth. <code>GET /bids</code> is always the backup.</p>
          </section>

          {/* ── test mode ── */}
          <section id="test-mode" className="pa-section pa-noprint">
            <h2><span className="pa-num">14</span>Test mode</h2>
            <p>Ask for a <strong>test key</strong> (or create one under <strong>My API Keys</strong>). Bids placed with it behave like live bids — the same checks, the same responses, the same webhooks — except that they:</p>
            <ul>
              <li>go to a simulator and never reach an exchange;</li>
              <li>are accepted for any IPO in the catalogue, open or not;</li>
              <li>get application numbers starting <code>TEST</code>;</li>
              <li>are invisible to live keys and to every live rule.</li>
            </ul>
            <p>Move a test bid on with:</p>
            <div className="pa-endpoint"><span className="pa-method pa-post">POST</span><span className="pa-endpoint-path">/partner/v1/test/<b>simulate</b></span></div>
            <p style={{ fontSize: '.9rem' }}><code>{'{ "ref": "…", "event": "mandate_accepted" }'}</code> — events: <code>mandate_accepted</code>, <code>mandate_rejected</code>, <code>exchange_rejected</code>, <code>allotted</code> (with <code>allottedLots</code>), <code>not_allotted</code>, <code>refund</code>. A full cycle: place → <code>bid.sent</code> → <code>mandate_accepted</code> → <code>allotted</code> → <code>refund</code>.</p>
            <p style={{ fontSize: '.9rem' }}>A <strong>live</strong> key that places bids must have an IP allowlist; requests from any other address are refused. A test key is held to its allowlist only when one is set.</p>
          </section>

          {/* ── Scopes ── */}
          <section id="scopes" className="pa-section pa-noprint">
            <h2><span className="pa-num">15</span>Scopes and keys</h2>
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
            <h2><span className="pa-num">16</span>Error responses</h2>
            <p>All errors are JSON with a machine-readable status code and a human-readable message. The <code>Content-Type</code> is <code>application/json</code>. HTTP status classes:</p>

            <div className="pa-fields"><table>
              <thead><tr><th>Status</th><th>Meaning</th><th>Typical cause</th></tr></thead>
              <tbody>
                <tr>
                  <td className="pa-name"><span className="pa-status pa-err">400</span></td>
                  <td className="pa-notes">Bad request</td>
                  <td className="pa-notes">The body failed schema validation, or the IPO is not accepting prints yet. Example: <code>&quot;Form printing is not enabled for PERNIASPOP yet.&quot;</code></td>
                </tr>
                <tr>
                  <td className="pa-name"><span className="pa-status pa-err">401</span></td>
                  <td className="pa-notes">Unauthorised</td>
                  <td className="pa-notes">Missing <code>X-Api-Key</code>, malformed header (not <code>keyId.secret</code>), invalid or revoked key, or partner account not active.</td>
                </tr>
                <tr>
                  <td className="pa-name"><span className="pa-status pa-err">403</span></td>
                  <td className="pa-notes">Forbidden</td>
                  <td className="pa-notes">The endpoint needs a scope this key, or your account, does not have. The message names the scope and says which of the two lacks it.</td>
                </tr>
                <tr>
                  <td className="pa-name"><span className="pa-status pa-err">404</span></td>
                  <td className="pa-notes">Not found</td>
                  <td className="pa-notes">No IPO in the catalog matches the <code>ipoSymbol</code> you sent, or no record of yours matches the <code>ref</code>.</td>
                </tr>
                <tr className="pa-noprint">
                  <td className="pa-name"><span className="pa-status pa-err">409</span></td>
                  <td className="pa-notes">Conflict</td>
                  <td className="pa-notes">A bid: this PAN already has a live application for this IPO in the same quota, or the orderId was already used for a different IPO.</td>
                </tr>
                <tr>
                  <td className="pa-name"><span className="pa-status pa-err">5xx</span></td>
                  <td className="pa-notes">Server error</td>
                  <td className="pa-notes">Rare — retry with exponential backoff. If the error persists, contact support with the request timestamp; every request is logged for audit.</td>
                </tr>
              </tbody>
            </table></div>

            <h3>Example error body</h3>
            <div className="pa-code">
              <div className="pa-code-head"><span>Response — application/json</span><span>401 Unauthorised</span></div>
              <pre>{`{
  "statusCode": 401,
  "message":    "Invalid or revoked API key.",
  "error":      "Unauthorized"
}`}</pre>
            </div>
          </section>

          {/* ── Limits & behaviour ── */}
          <section id="limits" className="pa-section pa-noprint">
            <h2><span className="pa-num">17</span>Limits &amp; behaviour</h2>
            <div className="pa-fields"><table>
              <thead><tr><th>Aspect</th><th>Behaviour</th></tr></thead>
              <tbody>
                <tr><td className="pa-name">Applicants per call</td><td className="pa-notes"><strong>25 by default per tenant</strong> — the operator may raise this for your tenant up to a platform hard ceiling of 500. Contact the operator if 25 is too low for your workflow. Requests above your configured cap return a 400 that states your tenant's actual limit.</td></tr>
                <tr><td className="pa-name">Form numbering</td><td className="pa-notes">Shared per-IPO series with the operator's own applications. Numbers are assigned atomically as rows are inserted, so retries of the same batchId will not renumber.</td></tr>
                <tr><td className="pa-name">Idempotency</td><td className="pa-notes">The server derives an idempotency key from <code>keyId + batchId + profileId</code>. Retrying the same request from the same partner does not create duplicates as long as the batchId is stable.</td></tr>
                <tr><td className="pa-name">PII vaulting</td><td className="pa-notes">PAN and bank account are tokenised per tenant on write. Read endpoints never return the raw values.</td></tr>
                <tr><td className="pa-name">Audit trail</td><td className="pa-notes">Every print-forms call writes an audit row: <code>keyId</code>, IPO, applicant count, batchId. PII is never audited.</td></tr>
                <tr><td className="pa-name">Rate limits</td><td className="pa-notes">No hard rate limit today. Sustained bursts above a few requests per second are visible on the operator's monitoring; if that becomes a routine pattern, please coordinate on a scheduled window.</td></tr>
                <tr><td className="pa-name">Timeouts</td><td className="pa-notes">Merging 100 forms takes several seconds. Set your client timeout to at least 60s.</td></tr>
                <tr><td className="pa-name">Reporting</td><td className="pa-notes">Your own print records and allotment results can be read through <code>/prints</code> and <code>/allotment</code>. Every call — including a refused one — is also in the operator&apos;s API Call Report, by partner, key, day and IPO.</td></tr>
                <tr><td className="pa-name">Endpoint access</td><td className="pa-notes">Each endpoint needs a scope. The operator switches scopes on for your account and you can limit each key further — see <a href="#scopes">Scopes and keys</a>. Defaults for a new partner: print-forms and the IPO catalogue reads.</td></tr>
              </tbody>
            </table></div>
          </section>

          {/* ── Support ── */}
          <section id="support" className="pa-section">
            <h2 className="pa-noprint"><span className="pa-num">18</span>Support</h2>
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
