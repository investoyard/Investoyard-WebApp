'use client';
import { useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/** Sample applicants JSON pre-loaded into the Test panel textarea. Trimmed
 *  down from the SAMPLE_REQUEST — this is JUST the applicants array so the
 *  operator can paste a real payload without editing the wrapper. */
const SAMPLE_APPLICANTS = JSON.stringify([
  {
    fullName: 'Rakesh Kumar',
    pan: 'ABCDE1234F',
    depository: 'NSDL',
    dpId: 'IN301234',
    clientId: '12345678',
    bankAccount: '004501234567',
    bankName: 'HDFC Bank',
    branchName: 'Andheri West',
    address: 'Flat 402, Sunrise Apartments, Link Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400053',
    email: 'rakesh.kumar@example.com',
    mobile: '9876543210',
    lots: 2,
    shareQty: 530,
    sharePrice: 425,
    amount: 225250,
    category: 'sHNI',
  },
], null, 2);

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
      "depository": "NSDL",             // or "CDSL"
      "dpId": "IN301234",               // NSDL only — CDSL: omit
      "clientId": "12345678",           // CDSL: 16-digit demat number
      "bankAccount": "004501234567",    // optional
      "bankName": "HDFC Bank",          // optional (prefills the form)
      "branchName": "Andheri West",     // optional (prints in the branch box)
      "address": "Flat 402, Sunrise Apartments, Link Road",  // optional
      "city": "Mumbai",                 // optional
      "state": "Maharashtra",           // optional
      "pincode": "400053",              // optional
      "email": "rakesh.kumar@example.com",   // optional (prints on templates that carry it)
      "mobile": "9876543210",           // optional
      "familyGroup": "KUMAR-HUF",       // optional — prints in the form's group box

      "lots": 2,                        // FINAL values — printed exactly as sent
      "shareQty": 530,
      "sharePrice": 425,
      "amount": 225250,
      "category": "sHNI"                // Retail | sHNI | bHNI | Shareholder | Employee
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
  ['fullName / pan', 'optional', 'Printed verbatim — NO format validation. Anything omitted prints blank.'],
  ['depository / dpId / clientId', 'optional', 'NSDL: dpId (IN + 6 digits) + 8-digit clientId · CDSL: 16-digit demat in clientId, no dpId. Omitted depository is treated as CDSL.'],
  ['bankAccount / bankName / branchName', 'optional', 'The form’s account boxes print the BANK ACCOUNT number, bank name and branch. Bank account is stored encrypted (PII vault).'],
  ['address / city / state / pincode', 'optional', 'Applicant’s postal address. Printed on templates that carry an address block; omitted parts print blank.'],
  ['email / mobile', 'optional', 'Contact fields. Printed on templates that carry them (mainly for Retail syndicate blanks); stored on the applicant record.'],
  ['familyGroup', 'optional', 'Grouping label printed in the form’s FamilyGroup box.'],
  ['lots / shareQty / sharePrice / amount', 'optional', 'FINAL figures computed by you — printed exactly as sent, never derived or corrected.'],
  ['category', 'optional', 'Retail · sHNI · bHNI · Shareholder · Employee. With amount, picks the blank: ≤ ₹5L normal, > ₹5L syndicate, Shareholder form for the shareholder quota.'],
];

const ERRORS: [string, string][] = [
  ['401', 'Missing / invalid / revoked X-Api-Key, or partner account inactive.'],
  ['400', 'Malformed JSON, unknown category value, > 100 applicants, or printing not enabled for the IPO. (No data validation — values print as sent.)'],
  ['404', 'ipoSymbol not found in the catalog.'],
  ['500', 'Unexpected failure — the call is logged; retry after checking the API Calls report.'],
];

export default function PartnerApiDocsPage() {
  const me = useOperator();

  // Test panel state
  const [ipos, setIpos] = useState<api.AdminIpo[]>([]);
  const [testIpo, setTestIpo] = useState<string>('');
  const [testPayload, setTestPayload] = useState<string>(SAMPLE_APPLICANTS);
  const [testBusy, setTestBusy] = useState(false);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [testResp, setTestResp] = useState<api.PartnerTestPrintResult | null>(null);

  // Only IPOs where printing is enabled — the test flow tolerates disabled ones
  // on the backend, but a dropdown of them keeps the demo relevant.
  useEffect(() => {
    if (!me) return;
    api.fetchAllIpos().then((r) => setIpos(r)).catch(() => setIpos([]));
  }, [me]);

  const testableIpos = useMemo(
    () =>
      ipos
        .filter((x) => (x.extra as any)?.startPrint === true)
        .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [ipos],
  );

  const runTest = async () => {
    setTestBusy(true); setTestErr(null); setTestResp(null);
    try {
      let applicants: unknown;
      try { applicants = JSON.parse(testPayload); }
      catch (e: any) { throw new Error(`Applicants JSON is not valid: ${e?.message ?? e}`); }
      if (!Array.isArray(applicants) || applicants.length === 0) throw new Error('Applicants must be a non-empty JSON array.');
      const resp = await api.testPartnerPrint({ ipoSymbol: testIpo, applicants });
      setTestResp(resp);
    } catch (e: any) {
      setTestErr(String(e?.message ?? e));
    } finally {
      setTestBusy(false);
    }
  };

  const downloadTestPdf = () => {
    if (!testResp) return;
    const bin = atob(testResp.pdfBase64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = testResp.filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

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
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>
          <b>Note.</b> <span className="mono">ifsc</span> and <span className="mono">upiId</span> used to be accepted here — both
          are now <b>silently ignored</b>. The ASBA form carries Bank Account, Bank Name and Branch only (the ASBA block runs on
          the applicant’s own bank statement, so no interbank routing is needed); UPI is an electronic rail that doesn’t appear on
          the physical form. Requests that still include either field are stripped by the validator and processed as if omitted —
          backwards-compatible for any partner still integrated against the old shape.
        </p>
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
        <div className="fs-head">
          <div className="t">Test the API <span className="st ok" style={{ marginLeft: 8 }}>dry-run</span></div>
          <div className="d">
            Runs a real dry-run through the print engine using your session — <b>no API key</b>, <b>no rows persisted</b>, and
            <b> no form numbers consumed</b>. Every form prints with <span className="mono">formNo:&nbsp;&quot;TEST&quot;</span> so
            the sample is unmistakable. Use this to verify a payload shape and preview the ASBA template that will be picked
            for a given amount / category.
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ minWidth: 240 }}
            value={testIpo}
            onChange={(e) => setTestIpo(e.target.value)}
          >
            <option value="">— Select an IPO —</option>
            {testableIpos.map((x) => (
              <option key={x.id} value={x.symbol}>{x.symbol} · {x.name}</option>
            ))}
            {testableIpos.length === 0 && ipos.length > 0 && (
              <option disabled>(no IPOs have Start Printing turned on)</option>
            )}
          </select>
          <button
            className="btn"
            disabled={testBusy || !testIpo}
            onClick={runTest}
          >
            {testBusy ? 'Testing…' : 'Run test'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={testBusy}
            onClick={() => { setTestPayload(SAMPLE_APPLICANTS); setTestResp(null); setTestErr(null); }}
          >
            Reset sample
          </button>
        </div>

        <label className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Applicants JSON (array — same shape as the real endpoint)</label>
        <textarea
          className="input mono"
          rows={16}
          value={testPayload}
          onChange={(e) => setTestPayload(e.target.value)}
          style={{ fontSize: 12, lineHeight: 1.55, marginTop: 6, width: '100%', resize: 'vertical' }}
          spellCheck={false}
        />

        {testErr && <div className="banner warn" style={{ marginTop: 12 }}>{testErr}</div>}

        {testResp && (
          <>
            <div className="row" style={{ gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={downloadTestPdf}>
                <Icon name="download" size={14} /> Download {testResp.filename}
              </button>
              <span className="st brand">{testResp.applications.length} form{testResp.applications.length === 1 ? '' : 's'} generated</span>
              <span className="muted" style={{ fontSize: 12.5 }}>All formNo are <span className="mono">TEST</span>, batchId is <span className="mono">DRY-RUN</span> — no data was saved.</span>
            </div>
            <pre
              className="mono"
              style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 14, fontSize: 12, marginTop: 12, overflowX: 'auto' }}
            >
{JSON.stringify(
  { ...testResp, pdfBase64: testResp.pdfBase64.slice(0, 60) + '… (truncated · use Download to save)' },
  null,
  2,
)}
            </pre>
          </>
        )}
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
