'use client';
import { useEffect, useMemo, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';
import { PARTNER_BID_BATCH_MAX, PARTNER_SCOPE_META } from '@investoyard/shared-types';

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

/*
 * THE SAMPLES QUOTE THE REAL BASE URL, DERIVED NOT TYPED. An operator copies
 * the curl block and runs it; a host typed into a template literal survives a
 * domain move silently and hands them a command that resolves nowhere. Falls
 * back to the dev origin, which is what NEXT_PUBLIC_API_URL is absent for.
 *
 * The API host is deliberately NOT the site host — the two are separate
 * origins (that is what the CORS allow-list exists for), and as of the
 * 2026-10-15 domain move the API stayed put while the site changed.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '');
const API_HOST = (() => {
  try { return new URL(API_BASE).host; } catch { return 'localhost:3000'; }
})();

const SAMPLE_REQUEST = `POST /partner/v1/print-forms
Host: ${API_HOST}
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

const SAMPLE_CURL = `curl -X POST ${API_BASE}/partner/v1/print-forms \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: pk_a1b2c3d4e5f6.<secret>" \\
  -d @request.json`;

const FIELDS: [string, string, string][] = [
  ['ipoSymbol', 'string · required', 'Investoyard IPO symbol (case-insensitive). Printing must be enabled for the issue.'],
  ['applicants[]', 'array · 1 to your limit', 'One entry per applicant; all forms return merged in one PDF. The limit is 25 per call unless the operator has raised it (at most 500).'],
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
  ['400', 'The request was not accepted. Print forms: malformed JSON, more applicants than your limit, or printing not enabled for the IPO (values themselves are never validated). Bids: the body carries a problems list naming every bid and every reason — fix them all and send the batch again.'],
  ['401', 'Missing, malformed, invalid or revoked X-Api-Key, or your account is not active.'],
  ['403', 'Not allowed: the endpoint needs a scope this key or your account lacks (the message says which), the key is used from an address outside its allowlist, or a live bid is outside your live bidding limits (problems lists why).'],
  ['404', 'No IPO with that symbol, or no record of yours with that ref or orderId.'],
  ['409', 'A bid conflicts: that PAN already has a live application for this IPO in the same quota, or the orderId was already used for a different IPO.'],
  ['500', 'Unexpected failure — the call is logged; retry, and send us the time and keyId if it persists.'],
];

/* ── Every other endpoint (2026-11-20). Each block is the contract as the API
   implements it; the scope column comes from PARTNER_SCOPE_META, the same list
   the API's guard enforces, so the two cannot disagree about who may call what. */

type Param = [name: string, type: string, notes: string];
interface EndpointDoc {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  scope: string;
  summary: string;
  params?: Param[];
  paramsLabel?: string;
  sample?: string;
  sampleLabel?: string;
  note?: string;
}

const READ_ENDPOINTS: EndpointDoc[] = [
  {
    id: 'prints', method: 'GET', path: '/partner/v1/prints', scope: 'prints:read',
    summary: 'The forms your account has printed, newest first. Only your own records.',
    paramsLabel: 'Query — all optional',
    params: [
      ['ipoSymbol', 'string', 'Only prints for this IPO. An unknown symbol returns 404.'],
      ['batchId', 'string', 'Only the applications from one print-forms call.'],
      ['from · to', 'YYYY-MM-DD', 'India dates, both ends included.'],
      ['page · per', 'integer', 'Page from 1; per defaults to 50, at most 200.'],
    ],
    sample: `{
  "total": 132, "page": 1, "per": 50,
  "rows": [{
    "applicationRef": "9b2f…", "batchId": "4d7a…", "formNo": "100234",
    "ipoSymbol": "ARDEE", "printedAt": "2026-11-20T06:41:12.000Z", "keyId": "pk_a1b2c3d4e5f6",
    "fullName": "Rakesh Kumar", "panMasked": "ABC****4F",
    "category": "sHNI", "lots": 2, "shareQty": 530, "amount": 225250
  }]
}`,
  },
  {
    id: 'print-detail', method: 'GET', path: '/partner/v1/prints/detail?ref={applicationRef}', scope: 'prints:read',
    summary: 'One print. Adds the depository, DP ID, bank and branch; the client ID and bank account come back masked to their last four digits.',
  },
  {
    id: 'print-pdf', method: 'GET', path: '/partner/v1/prints/pdf?ref={applicationRef}', scope: 'prints:read',
    summary: 'The same form again, with the same form number, filled from the data you sent the first time. Use this rather than calling print-forms again, which would create a second record and take a new number.',
    sample: `{ "applicationRef": "9b2f…", "formNo": "100234", "filename": "ARDEE_100234.pdf", "pdfBase64": "JVBERi0x…" }`,
  },
  {
    id: 'allotment', method: 'GET', path: '/partner/v1/allotment?ipoSymbol={symbol}  |  ?ref={applicationRef}', scope: 'allotment:read',
    summary: 'The allotment result of your own applications, once the registrar file is in. It does not look up other PANs.',
    paramsLabel: 'Each row',
    params: [
      ['result', 'string', 'allotted · not_allotted (not picked) · rejected (registrar reason in reason) · pending (nothing recorded yet).'],
      ['allottedLots · allottedShares', 'integer', 'null while pending.'],
      ['allottedAmount · refundAmount', 'number', 'Rupees. null while pending.'],
      ['registrarFileReceived', 'boolean', 'true with result "pending" means the file is in but this application could not be matched — send us its applicationRef.'],
    ],
  },
  {
    id: 'ipos', method: 'GET', path: '/partner/v1/ipos?status=&board=&instrument=&limit=&offset=', scope: 'ipos:read',
    summary: 'The IPO catalogue, newest opening first. status is upcoming, open, closed, listed or withdrawn — worked out from the issue dates, as our own site does. board is mainboard or sme; limit is 1–200 (default 50).',
    sample: `{ "total": 1319, "limit": 50, "offset": 0, "ipos": [ { "symbol": "ARDEE", "name": "…", "board": "mainboard", … } ] }`,
  },
  {
    id: 'ipo', method: 'GET', path: '/partner/v1/ipos/{symbol}', scope: 'ipos:read',
    summary: 'One IPO: dates, price band, lot size, minimum amount, issue size, registrar, documents and issue details.',
  },
  {
    id: 'subscription', method: 'GET', path: '/partner/v1/ipos/{symbol}/subscription', scope: 'subscription:read',
    summary: 'The latest subscription figure for each category, with the time we last read it from the exchange. On request.',
    sample: `{ "symbol": "ARDEE", "asOf": "2026-11-20T11:30:05.000Z",
  "categories": [ { "category": "retail", "timesSubscribed": 4.12, "asOf": "…" } ] }`,
  },
  {
    id: 'gmp', method: 'GET', path: '/partner/v1/ipos/{symbol}/gmp', scope: 'gmp:read',
    summary: 'The latest Grey Market Premium, always with its disclaimer. On request, and unavailable to an account whose GMP is switched off.',
  },
];

const BID_REQUEST = `POST /partner/v1/bids
X-Api-Key: pk_a1b2c3d4e5f6.<secret>

{
  "ipoSymbol": "ARDEE",
  "bids": [
    {
      "orderId":    "ORD-2026-000123",   // yours — a repeat returns the same bid
      "consentRef": "CONSENT-88412",     // your record of the client's instruction
      "fullName":   "Rakesh Kumar",
      "pan":        "ABCDE1234F",
      "depository": "NSDL",              // or "CDSL" (no dpId; 16-digit clientId)
      "dpId":       "IN301234",
      "clientId":   "12345678",
      "upiId":      "rakesh@okhdfcbank",
      "category":   "retail",            // retail | shni | shareholder | employee
      "lots":       1,
      "atCutoff":   true                 // or "price": 425
    }
  ]
}`;

const BID_RESPONSE = `201 Created
{
  "ipoSymbol": "ARDEE", "mode": "test", "batchId": "c41e…",
  "bids": [
    { "orderId": "ORD-2026-000123", "ref": "5b38…", "applicationNumber": "TESTMWOUL…0",
      "status": "submitted", "amount": 13428, "replayed": false }
  ]
}`;

const BID_FIELDS: Param[] = [
  ['orderId', 'string · required', 'Up to 64 letters, digits, . _ : -. Sending one you already used returns that bid (replayed: true) and places nothing new.'],
  ['consentRef', 'string · required', 'Your reference for the client’s instruction and consent. We keep it with the instruction; you keep the consent.'],
  ['fullName · pan', 'string · required', 'The applicant’s own. One public bid per PAN per IPO, plus one per reserved quota — across every channel.'],
  ['depository · dpId · clientId', 'string · required', 'NSDL: dpId IN + 6 digits, clientId 8 digits. CDSL: no dpId, clientId is the 16-digit demat number.'],
  ['upiId', 'string · required', 'The applicant’s own; the mandate request goes there.'],
  ['category', 'string · required', 'retail · shni · shareholder · employee (quotas only where offered). Must agree with the amount: retail ≤ ₹2 lakh on mainboard (exactly the minimum lots on SME), shni above ₹2 lakh. Everything ≤ ₹5 lakh — the UPI cap — so big-HNI goes through print forms.'],
  ['lots', 'integer · required', 'At least the category’s minimum for this IPO.'],
  ['atCutoff · price', 'boolean · number', 'Cut-off for retail and quotas only; otherwise a price inside the band.'],
];

const BID_CHANGES: EndpointDoc[] = [
  { id: 'bid-modify', method: 'POST', path: '/partner/v1/bids/modify', scope: 'bids:write',
    summary: 'Body: ref or orderId, consentRef, lots, and price or atCutoff. An HNI bid at the exchange may only be raised, never lowered.' },
  { id: 'bid-cancel', method: 'POST', path: '/partner/v1/bids/cancel', scope: 'bids:write',
    summary: 'Body: ref or orderId, consentRef. Once at the exchange, only retail and reserved-quota bids may be withdrawn.' },
  { id: 'bid-upi', method: 'POST', path: '/partner/v1/bids/upi', scope: 'bids:write',
    summary: 'Body: ref or orderId, consentRef, upiId. Refused once the funds are blocked — the block sits behind the old UPI ID.' },
  { id: 'bid-read', method: 'GET', path: '/partner/v1/bids?ref= | ?orderId= | ?ipoSymbol=&status=&page=&per=', scope: 'bids:read',
    summary: 'One bid with its full history, or a page of them. A key sees only bids in its own mode — a test key sees test bids.' },
  { id: 'bid-summary', method: 'GET', path: '/partner/v1/bids/summary?ipoSymbol={symbol}', scope: 'bids:read',
    summary: 'Bids and rupees by status for one IPO.' },
  { id: 'bid-limits', method: 'GET', path: '/partner/v1/bids/limits', scope: 'bids:read',
    summary: 'Your live bidding limits — the IPOs, the cap per bid, bids per day and rupees per day — and what you have used today.' },
];

const BID_STATUSES = 'submitted (queued) · mandate_pending (sent; waiting for the investor) · upi_blocked (funds blocked) · dp_verified · confirmed · allotted · not_allotted · released (refunded) · cancelled · rejected · failed';

const SIMULATE = `POST /partner/v1/test/simulate        (test keys only)
{ "ref": "5b38…", "event": "mandate_accepted" }

events: mandate_accepted · mandate_rejected · exchange_rejected
        allotted (with "allottedLots") · not_allotted · refund`;

const WEBHOOK_EVENTS = 'bid.accepted · bid.sent · bid.funds_blocked · bid.demat_verified · bid.rejected · bid.instruction_refused · bid.cancelled · bid.allotment · bid.refund · bid.status';

const WEBHOOK_SAMPLE = `POST https://your-server.example/investoyard/webhooks
X-Investoyard-Event: bid.funds_blocked
X-Investoyard-Delivery: 7c1d…
X-Investoyard-Signature: t=1700000000,v1=<hex>

{
  "id": "7c1d…", "event": "bid.funds_blocked", "occurredAt": "2026-11-20T10:38:27.162Z", "mode": "live",
  "data": { "ref": "5b38…", "orderId": "ORD-2026-000123", "ipoSymbol": "ARDEE", "status": "upi_blocked",
            "applicationNumber": "48313001", "amount": 13428, "upiStatus": "…", "reason": null, "allotment": null }
}`;

const WEBHOOK_VERIFY = `import crypto from 'node:crypto';

// Use the RAW request body, before any JSON parsing.
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;   // refuse anything older than 5 minutes
  return fresh && expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`;

const SCOPE_OF = new Map<string, string>(PARTNER_SCOPE_META.map((s) => [s.key, s.label]));

const pre = { background: 'var(--bg-2)', borderRadius: 10, padding: 14, fontSize: 12, overflowX: 'auto', marginTop: 12 } as const;

/** One endpoint: method, path, the scope it needs, what it does, and its contract. */
function Endpoint({ e }: { e: EndpointDoc }) {
  return (
    <div id={e.id} className="apd-ep">
      <div className="apd-ep-head">
        <span className={`apd-method ${e.method === 'POST' ? 'post' : 'get'}`}>{e.method}</span>
        <span className="mono apd-path">{e.path}</span>
        <span className="st mut" title={SCOPE_OF.get(e.scope) ?? e.scope}>{e.scope}</span>
      </div>
      <p className="apd-sum">{e.summary}</p>
      {e.params && (
        <>
          {e.paramsLabel && <div className="apd-label">{e.paramsLabel}</div>}
          <table className="table">
            <tbody>
              {e.params.map(([n, t, d]) => (
                <tr key={n}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{n}</td><td style={{ whiteSpace: 'nowrap' }}>{t}</td><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {e.sample && <pre className="mono" style={pre}>{e.sample}</pre>}
      {e.note && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{e.note}</p>}
    </div>
  );
}

/** The index at the top: every endpoint, grouped as the page is. */
const INDEX: { title: string; anchor: string; items: [string, string, string][] }[] = [
  { title: 'Print forms', anchor: 'print-forms', items: [['POST', '/print-forms', 'print-forms']] },
  { title: 'Your records', anchor: 'records', items: [
    ['GET', '/prints', 'prints'], ['GET', '/prints/detail', 'print-detail'], ['GET', '/prints/pdf', 'print-pdf'], ['GET', '/allotment', 'allotment'],
  ] },
  { title: 'IPO data', anchor: 'ipo-data', items: [
    ['GET', '/ipos', 'ipos'], ['GET', '/ipos/{symbol}', 'ipo'], ['GET', '/ipos/{symbol}/subscription', 'subscription'], ['GET', '/ipos/{symbol}/gmp', 'gmp'],
  ] },
  { title: 'Bids', anchor: 'bids', items: [
    ['POST', '/bids', 'bid-place'], ['POST', '/bids/modify', 'bid-modify'], ['POST', '/bids/cancel', 'bid-cancel'], ['POST', '/bids/upi', 'bid-upi'],
    ['GET', '/bids', 'bid-read'], ['GET', '/bids/summary', 'bid-summary'], ['GET', '/bids/limits', 'bid-limits'], ['POST', '/test/simulate', 'test-mode'],
  ] },
  { title: 'Webhooks', anchor: 'webhooks', items: [['POST', 'to your server', 'webhooks']] },
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
      <PageHead title="Partner API" sub="Print ASBA forms, read your records and allotment results, read IPO data, and place bids — over one authenticated API." />

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Endpoints</div><div className="d">Base URL <span className="mono">{API_BASE}</span>. Every path below starts with <span className="mono">/partner/v1</span>.</div></div>
        <div className="apd-index">
          {INDEX.map((g) => (
            <div key={g.anchor}>
              <a className="apd-index-t" href={`#${g.anchor}`}>{g.title}</a>
              {g.items.map(([m, p, id]) => (
                <a key={id + p} className="apd-index-i" href={`#${id}`}>
                  <span className={`apd-method ${m === 'POST' ? 'post' : 'get'}`}>{m}</span> <span className="mono">{p}</span>
                </a>
              ))}
            </div>
          ))}
        </div>
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Authentication</div></div>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>
          Every call carries the header <span className="mono">X-Api-Key: keyId.secret</span>. Create and revoke keys on{' '}
          <a href="/admin/partner-api/keys">My API Keys</a>. The secret is shown once at creation — store it in your secret
          manager. A revoked key fails with <span className="mono">401</span> immediately. All traffic is HTTPS-only, and every
          call — including a refused one — appears in your <a href="/admin/partner-api/calls">API Calls</a> report.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>
          A key is <b>live</b> or <b>test</b>. A test key behaves the same on every endpoint except bids, which go to a simulator
          and never reach an exchange. A key can be limited to some of your scopes, and to a list of server addresses — a live
          key needs that list before it can place or read bids.
        </p>
      </div></div>

      {/* The scope list is shared with the API's guard, so this table cannot
          promise an endpoint the guard does not know about. */}
      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head">
          <div className="t">Scopes — what a key can call</div>
          <div className="d">
            The operator switches scopes on for your account; each key can then be limited further on{' '}
            <a href="/admin/partner-api/keys">My API Keys</a>. A key with no scopes of its own can use everything your account has.
            Full request and response details for every endpoint are in the <a href="/partner-api#list-prints">API reference</a>.
          </div>
        </div>
        <table className="table" style={{ marginTop: 10 }}>
          <thead><tr><th>Scope</th><th>Endpoints</th><th>What it is for</th></tr></thead>
          <tbody>
            {PARTNER_SCOPE_META.map((s) => (
              <tr key={s.key}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{s.key}</td>
                <td className="mono" style={{ fontSize: 12.5 }}>{s.endpoints.map((e) => <div key={e}>{e}</div>)}</td>
                <td style={{ fontSize: 13.5 }}>{s.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>

      <div id="print-forms" className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Print forms</div><div className="d">You send FINAL, pre-computed data for up to your per-call limit of applicants; we store it and return the prefilled ASBA forms as one PDF, printed exactly as sent.</div></div>
        <div className="apd-ep-head" style={{ marginTop: 10 }}>
          <span className="apd-method post">POST</span>
          <span className="mono apd-path">/partner/v1/print-forms</span>
          <span className="st mut">print-forms</span>
        </div>
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
        <div className="fs-head"><div className="t">Print forms — response</div><div className="d">Form numbers allocate from the SAME per-IPO series as Investoyard&apos;s own prints — sequential and reconciliation-safe.</div></div>
        <pre className="mono" style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 14, fontSize: 12, overflowX: 'auto', marginTop: 12 }}>{SAMPLE_RESPONSE}</pre>
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Print forms — from the command line</div></div>
        <pre className="mono" style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 14, fontSize: 12, overflowX: 'auto', marginTop: 12 }}>{SAMPLE_CURL}</pre>
      </div></div>

      <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head">
          <div className="t">Print forms — try it here <span className="st ok" style={{ marginLeft: 8 }}>dry-run</span></div>
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

      {/* ── Your records ── */}
      <div id="records" className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Your records</div><div className="d">The forms you printed, the same PDF again, and allotment results. PAN, client ID and bank account are masked in every read — even details you sent us yourself — so a leaked key cannot read them back.</div></div>
        {READ_ENDPOINTS.slice(0, 4).map((e) => <Endpoint key={e.id} e={e} />)}
      </div></div>

      {/* ── IPO data ── */}
      <div id="ipo-data" className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">IPO data</div><div className="d">The catalogue our own site shows. Subscription and GMP are available on request.</div></div>
        {READ_ENDPOINTS.slice(4).map((e) => <Endpoint key={e.id} e={e} />)}
      </div></div>

      {/* ── Bids ── */}
      <div id="bids" className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head">
          <div className="t">Bids</div>
          <div className="d">UPI bids for your clients, placed under our exchange membership. Live bidding is switched on per account, for named IPOs, within a cap per bid, bids per day and rupees per day.</div>
        </div>
        <div className="banner warn" style={{ margin: '10px 0' }}>
          Live bidding is not open yet. Build and test with a <b>test key</b>: its bids go to a simulator and never reach an exchange.
        </div>
        <div id="bid-place" className="apd-ep">
          <div className="apd-ep-head">
            <span className="apd-method post">POST</span>
            <span className="mono apd-path">/partner/v1/bids</span>
            <span className="st mut">bids:write</span>
          </div>
          <p className="apd-sum">
            Up to {PARTNER_BID_BATCH_MAX} bids per call, <b>all or nothing</b>: every bid is checked first, and if any fails none is
            placed and every problem is listed with its position. A placed bid is sent to the exchange within seconds.
          </p>
          <pre className="mono" style={pre}>{BID_REQUEST}</pre>
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
            <tbody>{BID_FIELDS.map(([n, t, d]) => <tr key={n}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{n}</td><td style={{ whiteSpace: 'nowrap' }}>{t}</td><td>{d}</td></tr>)}</tbody>
          </table>
          <pre className="mono" style={pre}>{BID_RESPONSE}</pre>
        </div>
        {BID_CHANGES.map((e) => <Endpoint key={e.id} e={e} />)}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}><b>Statuses:</b> {BID_STATUSES}.</p>
      </div></div>

      {/* ── Test mode ── */}
      <div id="test-mode" className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head">
          <div className="t">Test mode</div>
          <div className="d">
            Bids from a test key get the same checks, responses and webhooks as live ones, but they go to a simulator, are accepted
            for any IPO in the catalogue (open or not), get application numbers starting <span className="mono">TEST</span>, and are
            invisible to live keys. Move a test bid on with:
          </div>
        </div>
        <pre className="mono" style={pre}>{SIMULATE}</pre>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>A full cycle: place → <span className="mono">bid.sent</span> → mandate_accepted → allotted → refund.</p>
      </div></div>

      {/* ── Webhooks ── */}
      <div id="webhooks" className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head">
          <div className="t">Webhooks</div>
          <div className="d">
            Set an https endpoint on <a href="/admin/partner-api/webhooks">Webhooks</a>. Whenever one of your bids changes we send a
            signed <span className="mono">POST</span> with the event and the bid&apos;s current state. Events: {WEBHOOK_EVENTS}.
          </div>
        </div>
        <pre className="mono" style={pre}>{WEBHOOK_SAMPLE}</pre>
        <div className="apd-label" style={{ marginTop: 14 }}>Check the signature</div>
        <pre className="mono" style={pre}>{WEBHOOK_VERIFY}</pre>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 10 }}>
          Answer with any 2xx within 10 seconds. Anything else is retried after 1 minute, 5 minutes, 30 minutes, then 2, 6, 12 and
          24 hours, and then marked failed — you can send it again from the Webhooks page. A delivery can arrive more than once or
          out of order: use <span className="mono">X-Investoyard-Delivery</span> to ignore repeats and treat the bid&apos;s
          <span className="mono"> status</span> as the truth. <span className="mono">GET /bids</span> is always the backup.
        </p>
      </div></div>

      <div id="errors" className="card" style={{ marginBottom: 18 }}><div className="card-pad">
        <div className="fs-head"><div className="t">Errors</div></div>
        <table className="table" style={{ marginTop: 10 }}>
          <thead><tr><th style={{ width: 80 }}>Status</th><th>Meaning</th></tr></thead>
          <tbody>{ERRORS.map(([c, m]) => <tr key={c}><td className="mono">{c}</td><td>{m}</td></tr>)}</tbody>
        </table>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Notes: you own the correctness of quantities/amounts and your clients&apos; consent; Investoyard prints what you send.
          Client PII is stored encrypted under your account only. IP allowlists and scopes are set per key on My API Keys.
        </p>
      </div></div>
    </div>
  );
}
