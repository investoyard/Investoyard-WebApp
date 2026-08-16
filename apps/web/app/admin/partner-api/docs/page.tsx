'use client';
import { useOperator } from '@/lib/operator-context';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';

/**
 * Partner API documentation — visible to any signed-in operator (platform and
 * partner logins alike), so integrating brokers can self-serve the contract.
 */

const SAMPLE_REQUEST = `POST /partner/v1/print-forms
Host: newipoapi.finwave.co
Content-Type: application/json
X-Api-Key: pk_a1b2c3d4e5f6.<secret>

{
  "ipoSymbol": "ARDEE",
  "applicants": [
    {
      "fullName": "Rakesh Kumar",
      "pan": "ABCDE1234F",
      "depository": "NSDL",          // or "CDSL"
      "dpId": "IN301234",            // NSDL only — CDSL: omit
      "clientId": "12345678",        // CDSL: 16-digit demat number
      "bankAccount": "004501234567", // optional
      "ifsc": "HDFC0000045",         // optional
      "upiId": "rakesh@okaxis",      // optional
      "bankName": "HDFC Bank",       // optional (prefills the form)
      "mobile": "9876543210",        // optional

      "lots": 2,                     // FINAL values — printed exactly as sent
      "shareQty": 530,
      "sharePrice": 425,
      "amount": 225250,
      "category": "sHNI"             // Retail | sHNI | bHNI | Shareholder | Employee
    }
  ]
}`;

const SAMPLE_RESPONSE = `201 Created
{
  "ipoSymbol": "ARDEE",
  "batchId": "1f7c…",
  "applications": [
    {
      "applicationRef": "8a2e…",     // keep this — allotment reconciliation
      "formNo": "100234",            // from the IPO's PDF-printing series
      "fullName": "Rakesh Kumar",
      "category": "sHNI",
      "lots": 2,
      "amount": 225250
    }
  ],
  "filename": "ARDEE_100234.pdf",
  "pdfBase64": "JVBERi0xLjcK…"       // all applicants merged into ONE PDF
}`;

const SAMPLE_CURL = `curl -X POST https://newipoapi.finwave.co/api/partner/v1/print-forms \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: pk_a1b2c3d4e5f6.<secret>" \\
  -d @request.json`;

const FIELDS: [string, string, string][] = [
  ['ipoSymbol', 'string · required', 'Investoyard IPO symbol (case-insensitive). Printing must be enabled for the issue.'],
  ['applicants[]', 'array · 1–100', 'One entry per applicant; all forms return merged in one PDF.'],
  ['fullName / pan', 'required', 'PAN must be a valid format (ABCDE1234F). Values print as sent.'],
  ['depository / dpId / clientId', 'required', 'NSDL: dpId (IN + 6 digits) + 8-digit clientId · CDSL: 16-digit demat in clientId, no dpId.'],
  ['bankAccount / ifsc / upiId', 'optional', 'Prefills the bank/UPI blocks on the form. Stored encrypted (PII vault).'],
  ['lots / shareQty / sharePrice / amount', 'required', 'FINAL figures computed by you — we never derive or correct them.'],
  ['category', 'required', 'Retail · sHNI · bHNI · Shareholder · Employee. Picks the blank: ≤ ₹5L normal, > ₹5L syndicate, Shareholder form for the shareholder quota.'],
];

const ERRORS: [string, string][] = [
  ['401', 'Missing / invalid / revoked X-Api-Key, or partner account inactive.'],
  ['400', 'Validation: unknown category, missing demat fields, invalid PAN, printing not enabled for the IPO, > 100 applicants.'],
  ['404', 'ipoSymbol not found in the catalog.'],
  ['500', 'Unexpected failure — the call is logged; retry with the same batch after checking the API Calls report.'],
];

export default function PartnerApiDocsPage() {
  const me = useOperator();
  if (!me) return <Loader />;
  if (!me.username) return <NoAccess />;

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHead title="Partner API — Print-PDF" sub="Generate prefilled ASBA forms for your clients over one authenticated call." />

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Authentication</div></div>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>
          Every call carries the header <span className="mono">X-Api-Key: keyId.secret</span>. Keys are issued per partner from
          the Investoyard admin (your account manager, or Tenants → your profile → API access). The secret is shown once at
          creation — store it in your secret manager. Revoked keys fail with <span className="mono">401</span> immediately.
          All traffic is HTTPS-only; every call (success or failure) is audit-logged and visible in your API Calls report.
        </p>
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Request</div><div className="d">POST /partner/v1/print-forms — you send FINAL, pre-computed data; we store it and print it verbatim.</div></div>
        <pre className="mono" style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 14, fontSize: 12, overflowX: 'auto', marginTop: 12 }}>{SAMPLE_REQUEST}</pre>
        <table className="table" style={{ marginTop: 14 }}>
          <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
          <tbody>
            {FIELDS.map(([f, t, n]) => (
              <tr key={f}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{f}</td><td style={{ whiteSpace: 'nowrap' }}>{t}</td><td>{n}</td></tr>
            ))}
          </tbody>
        </table>
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Response</div><div className="d">Form numbers allocate from the SAME per-IPO series as Investoyard&apos;s own prints — sequential and reconciliation-safe.</div></div>
        <pre className="mono" style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 14, fontSize: 12, overflowX: 'auto', marginTop: 12 }}>{SAMPLE_RESPONSE}</pre>
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Quick test</div></div>
        <pre className="mono" style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 14, fontSize: 12, overflowX: 'auto', marginTop: 12 }}>{SAMPLE_CURL}</pre>
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Errors</div></div>
        <table className="table" style={{ marginTop: 10 }}>
          <thead><tr><th style={{ width: 80 }}>Status</th><th>Meaning</th></tr></thead>
          <tbody>{ERRORS.map(([c, m]) => <tr key={c}><td className="mono">{c}</td><td>{m}</td></tr>)}</tbody>
        </table>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Notes: you own the correctness of quantities/amounts and your clients&apos; consent; Investoyard prints what you send.
          Client PII is stored encrypted under your tenant only. Rate limits and IP allowlists can be configured per key on request.
        </p>
      </div></div>
    </div>
  );
}
