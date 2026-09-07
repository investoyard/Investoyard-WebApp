import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { PartnerApiScrollSpy } from './scroll-spy';
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
  alternates: { canonical: 'https://newipo.finwave.co/partner-api' },
  openGraph: {
    title: 'Investoyard Partner API',
    description: 'Reference for empanelled distribution partners integrating with Investoyard.',
    url: 'https://newipo.finwave.co/partner-api',
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

            <div className="pa-toc-label">Reference</div>
            <a href="#errors">Error responses</a>
            <a href="#limits">Limits &amp; behaviour</a>
            <a href="#support">Support</a>
          </nav>
        </aside>

        <main className="pa-main">

          {/* ── Overview / hero ── */}
          <section id="overview" className="pa-section">
            <div className="pa-hero-head">
              <span className="pa-version">
                <span className="pa-version-dot"></span>
                v1.0
              </span>
              <span className="pa-doc-updated">First release · September 2026</span>
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
          <section id="getting-started" className="pa-section">
            <h2><span className="pa-num">01</span>How to get an API key</h2>
            <p>
              Every call to this API is authenticated with a partner <strong>API key</strong>, issued against an active partner tenant on Investoyard. Which path you follow depends on whether your organisation already has a tenant on the platform.
            </p>

            <h3>Path A — new partner onboarding</h3>
            <p>Follow this path if you do not yet have a tenant on Investoyard.</p>
            <ol style={{ maxWidth: '42em' }}>
              <li><strong>Visit the partner landing page.</strong> Open <a href="https://newipo.finwave.co/partner"><code>newipo.finwave.co/partner</code></a>. This page explains what the Partner API offers and links to the application form.</li>
              <li><strong>Sign in with your mobile number.</strong> Investoyard uses OTP-based sign-in. Enter your mobile number, receive the OTP over SMS, and confirm. You now have a personal session; the partner application is filed against it.</li>
              <li><strong>Fill the partner application.</strong> At <a href="https://newipo.finwave.co/partner/apply"><code>/partner/apply</code></a>, complete the short form with your organisation details, a primary contact person, and references to any existing empanelment arrangement (if applicable). Submit.</li>
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
              <dd><code>https://newipoapi.finwave.co/api</code></dd>
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
curl https://newipoapi.finwave.co/api/partner/v1/print-forms \\
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

const res = await fetch('https://newipoapi.finwave.co/api/partner/v1/print-forms', {
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
    "https://newipoapi.finwave.co/api/partner/v1/print-forms",
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
          <section id="list-ipos" className="pa-section">
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
          <section id="get-ipo" className="pa-section">
            <h2><span className="pa-num">06</span>Get one IPO</h2>
            <p>Return the full catalog record for a single IPO by ticker symbol.</p>
            <div className="pa-endpoint">
              <span className="pa-method pa-get">GET</span>
              <span className="pa-endpoint-path">/partner/v1/ipos/<b>{'{symbol}'}</b></span>
            </div>
            <p style={{ fontSize: '.9rem' }}>Response is a single IPO record shaped by the same operational contract as the list endpoint.</p>
          </section>

          {/* ── Error responses ── */}
          <section id="errors" className="pa-section">
            <h2><span className="pa-num">07</span>Error responses</h2>
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
                  <td className="pa-name"><span className="pa-status pa-err">404</span></td>
                  <td className="pa-notes">Not found</td>
                  <td className="pa-notes">No IPO in the catalog matches the <code>ipoSymbol</code> you sent.</td>
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
          <section id="limits" className="pa-section">
            <h2><span className="pa-num">08</span>Limits &amp; behaviour</h2>
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
                <tr><td className="pa-name">Reporting</td><td className="pa-notes">Every partner call is available to the operator in the API Call Report and Print Report (CSV). If you need a report of your own calls, ask the operator to share the CSV.</td></tr>
                <tr><td className="pa-name">Endpoint access</td><td className="pa-notes">Each endpoint is gated per tenant. Your key can call an endpoint only if the operator has granted that scope to your tenant. Calls to a scope your tenant lacks return <code>403</code> with a message naming the scope. Defaults for a new partner: print-forms + ipo catalog reads. Additional endpoints (not documented here) are available on request.</td></tr>
              </tbody>
            </table></div>
          </section>

          {/* ── Support ── */}
          <section id="support" className="pa-section">
            <h2><span className="pa-num">09</span>Support</h2>
            <p>Questions about the API, key issuance, incident reports, and feature requests: contact the operator through your existing empanelment channel, or reach out to your Investoyard relationship manager.</p>
            <p>When reporting an integration issue, include: the request timestamp (UTC), your keyId (never the secret), the endpoint called, the HTTP status you received, and the response body — this is enough for us to trace the call in the audit log.</p>

            <footer className="pa-footer">
              <p>Investoyard is a product of <strong style={{ color: 'var(--text)' }}>Safal Capital Services Private Limited</strong>. The Partner API is provided to empanelled distribution partners only.</p>
            </footer>
          </section>

        </main>
      </div>
    </div>
  );
}
