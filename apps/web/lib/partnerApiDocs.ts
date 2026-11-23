/**
 * THE PARTNER API REFERENCE, AS DATA (2026-11-23).
 *
 * Every endpoint is described ONCE here — what it does, its parameters, its
 * request body, real example responses and what the fields mean — and the API
 * Docs page renders it. The code samples (cURL, Node.js, Python, PHP, Java)
 * are GENERATED from the same entry, so a parameter cannot be renamed in one
 * language and not the others.
 *
 * Ids are shared with the API's Try-it runner (`partner-try.service.ts`), and
 * the scope of each endpoint must match the `@RequireScope` on its route and
 * `PARTNER_SCOPE_META` in shared-types. The example responses were captured
 * from the real endpoints on 2026-11-23 and the personal details replaced.
 */
import type { PartnerScope } from '@investoyard/shared-types';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '');

export type HttpMethod = 'GET' | 'POST';

export interface ApiParam {
  name: string;
  in: 'query' | 'path';
  type: string;
  required: boolean;
  description: string;
  /** used in the code samples and to prefill Try it */
  example?: string;
}

export interface ApiField {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface ApiResponse {
  status: number;
  /** a few words: when you get this */
  when: string;
  body: unknown;
}

export interface ApiEndpoint {
  id: string;
  group: string;
  title: string;
  method: HttpMethod;
  /** with {placeholders} for path parameters */
  path: string;
  scope: PartnerScope;
  summary: string;
  /** a longer explanation, shown under the summary */
  details?: string[];
  params?: ApiParam[];
  /** request body fields (POST) */
  bodyFields?: ApiField[];
  /** request body example (POST) */
  body?: unknown;
  responses: ApiResponse[];
  /** what the main response fields mean */
  responseFields?: ApiField[];
  /** a short line under Try it saying how it differs from a key call */
  tryNote?: string;
}

export interface ApiGroup { id: string; title: string; intro: string }

export const GROUPS: ApiGroup[] = [
  { id: 'print', title: 'Print forms', intro: 'Send your client’s final application details and get the prefilled ASBA form back as a PDF.' },
  { id: 'records', title: 'Your records', intro: 'The forms you have printed, and the same PDF again with the same form number. Personal details come back masked.' },
  { id: 'allotment', title: 'Allotment', intro: 'Whether each of your applications was allotted, once the registrar’s file is in.' },
  { id: 'ipos', title: 'IPO data', intro: 'The IPO catalogue our own site shows: dates, price band, lot size, documents, subscription and GMP.' },
  { id: 'bids', title: 'Bids', intro: 'Place, change and track UPI bids for your clients under our exchange membership.' },
  { id: 'testing', title: 'Testing', intro: 'Move a test bid through its life without an exchange.' },
];

const err = (status: number, error: string, message: string | string[]) => ({ statusCode: status, error, message });
const E403_SCOPE = (scope: string) => err(403, 'Forbidden', `This endpoint requires the "${scope}" scope. Your account does not have it enabled — contact the operator to request it.`);
const E401 = err(401, 'Unauthorized', 'Invalid or revoked API key.');

const APPLICANT_FIELDS: ApiField[] = [
  { name: 'fullName', type: 'string', description: 'Applicant’s name as it should print.' },
  { name: 'pan', type: 'string', description: 'Applicant’s PAN. Printed as sent — no format check.' },
  { name: 'depository', type: '"NSDL" | "CDSL"', description: 'Where the demat account is. If left out, treated as CDSL.' },
  { name: 'dpId', type: 'string', description: 'NSDL only: “IN” followed by 6 digits. Leave out for CDSL.' },
  { name: 'clientId', type: 'string', description: 'NSDL: 8-digit client ID. CDSL: the full 16-digit demat number.' },
  { name: 'bankAccount', type: 'string', description: 'Account the money is blocked in. Stored encrypted.' },
  { name: 'bankName · branchName', type: 'string', description: 'Printed in the bank boxes of the form.' },
  { name: 'address · city · state · pincode', type: 'string', description: 'Printed on forms that have an address block.' },
  { name: 'email · mobile', type: 'string', description: 'Printed on forms that have contact boxes.' },
  { name: 'familyGroup', type: 'string', description: 'A grouping label printed in the form’s group box.' },
  { name: 'lots · shareQty', type: 'integer', description: 'Your final figures — printed exactly as sent, never recalculated.' },
  { name: 'sharePrice · amount', type: 'number', description: 'Price per share and total amount in rupees, printed as sent.' },
  { name: 'category', type: '"Retail" | "sHNI" | "bHNI" | "Shareholder" | "Employee"', description: 'With the amount, picks the form: up to ₹5 lakh the normal form, above ₹5 lakh the syndicate form, the shareholder form for the shareholder quota.' },
];

const BID_FIELDS: ApiField[] = [
  { name: 'orderId', type: 'string', required: true, description: 'Your own unique id for the bid (letters, digits, . _ : - , up to 64). Sending the same orderId again returns the same bid and places nothing new.' },
  { name: 'consentRef', type: 'string', required: true, description: 'Your reference for the client’s instruction and consent. We store it with the bid.' },
  { name: 'fullName · pan', type: 'string', required: true, description: 'The applicant’s own. One public bid per PAN per IPO across every channel, plus one per reserved quota.' },
  { name: 'depository', type: '"NSDL" | "CDSL"', required: true, description: 'Where the demat account is.' },
  { name: 'dpId · clientId', type: 'string', required: true, description: 'NSDL: dpId “IN” + 6 digits and an 8-digit clientId. CDSL: no dpId; clientId is the 16-digit demat number.' },
  { name: 'upiId', type: 'string', required: true, description: 'The applicant’s own UPI ID. The mandate request is sent there.' },
  { name: 'category', type: '"retail" | "shni" | "shareholder" | "employee"', required: true, description: 'Must agree with the amount: retail up to ₹2 lakh (SME: exactly the minimum lots), shni above ₹2 lakh. Every bid is at most ₹5 lakh, the UPI limit — bigger HNI applications go through print forms.' },
  { name: 'lots', type: 'integer', required: true, description: 'At least the category’s minimum for this IPO.' },
  { name: 'atCutoff', type: 'boolean', description: 'Bid at the cut-off price. Retail and reserved quotas only.' },
  { name: 'price', type: 'number', description: 'Your bid price, inside the price band. Send this or atCutoff.' },
];

const REF_PARAMS: ApiField[] = [
  { name: 'ref', type: 'string', description: 'The bid’s ref from the place response. Send ref or orderId.' },
  { name: 'orderId', type: 'string', description: 'Your orderId for the bid. Send ref or orderId.' },
  { name: 'consentRef', type: 'string', required: true, description: 'Your reference for the client’s instruction to make this change.' },
];

const SAMPLE_BID_ROW = {
  ref: '5b38c1f0-2e9a-4d7b-9a51-0c6f2b8e4a17', orderId: 'ORD-2026-000123', mode: 'test', ipoSymbol: 'ARDEE',
  category: 'retail', lots: 2, qty: 24, atCutoff: true, price: null, amount: 26856,
  applicationNumber: 'TESTMWSZIAJF0', status: 'upi_blocked', upiStatus: 'Mandate accepted', reason: null,
  amountBlocked: 26856, allotment: null, placedAt: '2026-11-23T08:08:57.000Z', updatedAt: '2026-11-23T08:09:31.000Z',
};

const SAMPLE_IPO = {
  symbol: 'ARDEE', name: 'Ardee Engineering Limited', board: 'mainboard', instrument: 'ipo', status: 'open',
  exchanges: ['NSE', 'BSE'], openDate: '2026-11-19', closeDate: '2026-11-23', allotmentDate: '2026-11-24', listingDate: '2026-11-26',
  priceBandMin: 129, priceBandMax: 136, lotSize: 110, issueSizeCr: 900.5, isin: 'INE000A01014', registrar: 'Kfin Technologies Ltd.',
  logoUrl: `${API_BASE}/uploads/…`, objectsOfIssue: '<ul><li>…</li></ul>', reservations: ['shareholder'],
  documents: [{ type: 'rhp', url: `${API_BASE}/uploads/…` }],
  details: { sector: 'Industrials', industry: 'Engineering', leads: ['…'], faceValue: '2', mechanism: 'book_built', refundDate: '2026-11-25', dematDate: '2026-11-25', '…': '…' },
};

export const ENDPOINTS: ApiEndpoint[] = [
  /* ── Print forms ─────────────────────────────────────────────── */
  {
    id: 'print-forms', group: 'print', title: 'Print ASBA forms', method: 'POST', path: '/partner/v1/print-forms', scope: 'print-forms',
    summary: 'Send the final details of one or more applicants for an IPO and get back their prefilled ASBA forms merged into one PDF.',
    details: [
      'Everything you send is printed exactly as sent — we do not check or correct the values. A field you leave out prints blank.',
      'Each applicant gets a form number from the IPO’s own series, so the numbers are sequential and safe to reconcile. Keep the applicationRef we return: you need it to fetch the form again or read its allotment.',
      'Printing must be switched on for the IPO. You can send up to your per-call limit of applicants (25 unless we have raised it).',
    ],
    bodyFields: [
      { name: 'ipoSymbol', type: 'string', required: true, description: 'The IPO symbol, for example “ARDEE”. Not case-sensitive.' },
      { name: 'applicants', type: 'array', required: true, description: 'One entry per applicant. Every field inside is optional — see below.' },
      ...APPLICANT_FIELDS.map((f) => ({ ...f, name: `applicants[].${f.name}` })),
    ],
    body: {
      ipoSymbol: 'ARDEE',
      applicants: [{
        fullName: 'Rakesh Kumar', pan: 'ABCDE1234F', depository: 'NSDL', dpId: 'IN301234', clientId: '12345678',
        bankAccount: '004501234567', bankName: 'HDFC Bank', branchName: 'Andheri West',
        address: 'Flat 402, Sunrise Apartments, Link Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400053',
        email: 'rakesh.kumar@example.com', mobile: '9876543210',
        lots: 2, shareQty: 220, sharePrice: 136, amount: 29920, category: 'Retail',
      }],
    },
    responses: [
      { status: 201, when: 'The forms were printed.', body: {
        ipoSymbol: 'ARDEE', batchId: '1f7c2a9e-…',
        applications: [{ applicationRef: '8a2e5d10-…', formNo: '78067992', fullName: 'Rakesh Kumar', category: 'Retail', lots: 2, amount: 29920 }],
        filename: 'ARDEE_78067992.pdf', pdfBase64: 'JVBERi0xLjcK…',
      } },
      { status: 400, when: 'Printing is not switched on for the IPO, there are more applicants than your limit, or the body is malformed.', body: err(400, 'Bad Request', 'Form printing is not enabled for ARDEE yet.') },
      { status: 404, when: 'No IPO with that symbol.', body: err(404, 'Not Found', 'IPO \'ARDEX\' not found.') },
    ],
    responseFields: [
      { name: 'batchId', type: 'string', description: 'Identifies this call. Use it to list just these prints later.' },
      { name: 'applications[].applicationRef', type: 'string', description: 'Our id for the application. Keep it.' },
      { name: 'applications[].formNo', type: 'string', description: 'The form number printed on the PDF.' },
      { name: 'filename · pdfBase64', type: 'string', description: 'The PDF, base64-encoded. Decode and save it under filename.' },
    ],
    tryNote: 'Try it is a dry run: the form number prints as TEST, nothing is stored and no form number is used up.',
  },

  /* ── Your records ────────────────────────────────────────────── */
  {
    id: 'prints', group: 'records', title: 'List your prints', method: 'GET', path: '/partner/v1/prints', scope: 'prints:read',
    summary: 'The forms your account has printed, newest first. Only your own.',
    params: [
      { name: 'ipoSymbol', in: 'query', type: 'string', required: false, description: 'Only prints for this IPO.', example: 'ARDEE' },
      { name: 'batchId', in: 'query', type: 'string', required: false, description: 'Only the applications from one print-forms call.' },
      { name: 'from', in: 'query', type: 'YYYY-MM-DD', required: false, description: 'Printed on or after this date (India time).' },
      { name: 'to', in: 'query', type: 'YYYY-MM-DD', required: false, description: 'Printed on or before this date (India time).' },
      { name: 'page', in: 'query', type: 'integer', required: false, description: 'Page number, from 1.', example: '1' },
      { name: 'per', in: 'query', type: 'integer', required: false, description: 'Rows per page. Default 50, at most 200.', example: '20' },
    ],
    responses: [
      { status: 200, when: 'A page of your prints.', body: {
        total: 4376, page: 1, per: 20,
        rows: [{ applicationRef: '04601953-61b4-…', batchId: 'e5195329-d980-…', formNo: '78067992', ipoSymbol: 'ARDEE', printedAt: '2026-11-23T06:43:30.000Z', keyId: 'pk_c903ad39c99d', fullName: 'Rakesh Kumar', panMasked: 'ABC****4F', category: 'Retail', lots: 1, shareQty: 110, amount: 14960 }],
      } },
      { status: 403, when: 'Your account does not have Print records switched on.', body: E403_SCOPE('prints:read') },
    ],
    responseFields: [
      { name: 'total', type: 'integer', description: 'How many prints match, across all pages.' },
      { name: 'rows[].panMasked', type: 'string', description: 'The PAN with its middle hidden. We never return a full PAN.' },
      { name: 'rows[].keyId', type: 'string', description: 'Which of your API keys made the print.' },
    ],
  },
  {
    id: 'print-detail', group: 'records', title: 'Get one print', method: 'GET', path: '/partner/v1/prints/detail', scope: 'prints:read',
    summary: 'One print with its demat, bank and bid details. The client ID and bank account come back masked to their last four digits.',
    params: [
      { name: 'ref', in: 'query', type: 'string', required: true, description: 'The applicationRef from print-forms or List your prints.', example: '04601953-61b4-45fe-ae74-029d9f446466' },
    ],
    responses: [
      { status: 200, when: 'The print.', body: {
        applicationRef: '04601953-61b4-…', batchId: 'e5195329-…', formNo: '78067992', ipoSymbol: 'ARDEE', printedAt: '2026-11-23T06:43:30.000Z',
        keyId: 'pk_c903ad39c99d', fullName: 'Rakesh Kumar', panMasked: 'ABC****4F', category: 'Retail', lots: 1, shareQty: 110, amount: 14960,
        applicant: { depository: 'NSDL', dpId: 'IN300343', clientIdMasked: '•••• 5761', bankName: 'HDFC Bank', branchName: 'Andheri West', bankAccountMasked: '•••• 1453', familyGroup: '' },
        bid: { sharePrice: 136, shareQty: 110, lots: 1, amount: 14960 },
      } },
      { status: 404, when: 'No print of yours has that ref.', body: err(404, 'Not Found', 'No print with that applicationRef for your account.') },
    ],
  },
  {
    id: 'print-pdf', group: 'records', title: 'Download a form again', method: 'GET', path: '/partner/v1/prints/pdf', scope: 'prints:read',
    summary: 'The same form again, with the same form number, filled from the details you sent the first time.',
    details: ['Use this when a PDF is lost. Calling print-forms again would create a second application and use up a new form number.'],
    params: [
      { name: 'ref', in: 'query', type: 'string', required: true, description: 'The applicationRef of the print.', example: '04601953-61b4-45fe-ae74-029d9f446466' },
    ],
    responses: [
      { status: 200, when: 'The PDF.', body: { applicationRef: '04601953-61b4-…', formNo: '78067992', filename: 'ARDEE_78067992.pdf', pdfBase64: 'JVBERi0xLjcK…' } },
      { status: 404, when: 'No print of yours has that ref.', body: err(404, 'Not Found', 'No print with that applicationRef for your account.') },
    ],
  },

  /* ── Allotment ───────────────────────────────────────────────── */
  {
    id: 'allotment', group: 'allotment', title: 'Get allotment results', method: 'GET', path: '/partner/v1/allotment', scope: 'allotment:read',
    summary: 'The allotment result of your own applications — all of them for one IPO, or one by its ref.',
    details: ['Results appear once we have the registrar’s file, normally on the allotment date. We only look up your own applications, not other PANs.'],
    params: [
      { name: 'ipoSymbol', in: 'query', type: 'string', required: false, description: 'All your applications for this IPO. Send this or ref.', example: 'ARDEE' },
      { name: 'ref', in: 'query', type: 'string', required: false, description: 'One application by its applicationRef. Send this or ipoSymbol.' },
      { name: 'page', in: 'query', type: 'integer', required: false, description: 'Page number, from 1.' },
      { name: 'per', in: 'query', type: 'integer', required: false, description: 'Rows per page. Default 50, at most 200.' },
    ],
    responses: [
      { status: 200, when: 'Your results.', body: {
        ipoSymbol: 'ARDEE', allotmentDate: '2026-11-24', registrarFileReceived: true, total: 1324, page: 1, per: 50,
        rows: [{ applicationRef: '983ace03-…', formNo: '200600001', applicationNumber: null, ipoSymbol: 'ARDEE', fullName: 'Rakesh Kumar', panMasked: 'ABC****4F', appliedLots: 1, result: 'allotted', reason: null, allottedLots: 1, allottedShares: 110, allottedAmount: 14960, refundAmount: 0, recordedAt: '2026-11-24T12:10:00.000Z', registrarFileReceived: true }],
      } },
      { status: 404, when: 'No application of yours with that ref, or no IPO with that symbol.', body: err(404, 'Not Found', 'No application with that applicationRef for your account.') },
    ],
    responseFields: [
      { name: 'rows[].result', type: 'string', description: 'allotted · not_allotted (not picked) · rejected (the registrar’s reason is in reason) · pending (nothing recorded yet).' },
      { name: 'rows[].allottedLots · allottedShares', type: 'integer', description: 'null while pending.' },
      { name: 'rows[].allottedAmount · refundAmount', type: 'number', description: 'Rupees. null while pending.' },
      { name: 'registrarFileReceived', type: 'boolean', description: 'true with a result of pending means the file is in but this application could not be matched — send us its applicationRef.' },
    ],
  },

  /* ── IPO data ────────────────────────────────────────────────── */
  {
    id: 'ipos', group: 'ipos', title: 'List IPOs', method: 'GET', path: '/partner/v1/ipos', scope: 'ipos:read',
    summary: 'The IPO catalogue, newest first, with each issue’s dates, price band, lot size and documents.',
    params: [
      { name: 'status', in: 'query', type: 'string', required: false, description: 'upcoming · open · closed · listed · withdrawn. Worked out from the issue dates, the same way our own site does.', example: 'open' },
      { name: 'board', in: 'query', type: 'string', required: false, description: 'mainboard or sme.' },
      { name: 'instrument', in: 'query', type: 'string', required: false, description: 'ipo, fpo, reit or invit.' },
      { name: 'limit', in: 'query', type: 'integer', required: false, description: 'How many to return, 1–200. Default 50.', example: '10' },
      { name: 'offset', in: 'query', type: 'integer', required: false, description: 'How many to skip, for paging.' },
    ],
    responses: [
      { status: 200, when: 'A page of IPOs.', body: { total: 2, limit: 10, offset: 0, ipos: [SAMPLE_IPO] } },
    ],
    responseFields: [
      { name: 'ipos[].status', type: 'string', description: 'upcoming · open · closed · listed · withdrawn.' },
      { name: 'ipos[].priceBandMin · priceBandMax', type: 'number', description: 'Rupees per share. Equal for a fixed-price issue.' },
      { name: 'ipos[].issueSizeCr', type: 'number', description: 'Issue size in crore rupees.' },
      { name: 'ipos[].documents', type: 'array', description: 'RHP, DRHP and blank ASBA forms, each with a download URL.' },
      { name: 'ipos[].details', type: 'object', description: 'Further issue details as we hold them: sector, industry, lead managers, face value, refund and demat dates, and more.' },
    ],
  },
  {
    id: 'ipo', group: 'ipos', title: 'Get one IPO', method: 'GET', path: '/partner/v1/ipos/{symbol}', scope: 'ipos:read',
    summary: 'One IPO with the same fields as List IPOs.',
    params: [
      { name: 'symbol', in: 'path', type: 'string', required: true, description: 'The IPO symbol.', example: 'ARDEE' },
    ],
    responses: [
      { status: 200, when: 'The IPO.', body: SAMPLE_IPO },
      { status: 404, when: 'No published IPO with that symbol.', body: err(404, 'Not Found', 'No published IPO with symbol \'ARDEX\'.') },
    ],
  },
  {
    id: 'subscription', group: 'ipos', title: 'Get subscription', method: 'GET', path: '/partner/v1/ipos/{symbol}/subscription', scope: 'subscription:read',
    summary: 'How many times each category is subscribed, as last read from the exchanges.',
    details: ['We read the exchanges every minute while an issue is open, and every 5 seconds in its last 90 minutes.'],
    params: [
      { name: 'symbol', in: 'path', type: 'string', required: true, description: 'The IPO symbol.', example: 'ARDEE' },
    ],
    responses: [
      { status: 200, when: 'The latest figures.', body: {
        symbol: 'ARDEE', asOf: '2026-11-23T11:30:05.000Z',
        categories: [{ category: 'qib', timesSubscribed: 3.42, asOf: '2026-11-23T11:30:05.000Z' }, { category: 'retail', timesSubscribed: 4.12, asOf: '2026-11-23T11:30:05.000Z' }],
      } },
      { status: 403, when: 'Your account does not have Subscription switched on.', body: E403_SCOPE('subscription:read') },
    ],
    responseFields: [
      { name: 'categories[].category', type: 'string', description: 'qib · hni (above ₹10 lakh) · hni2 (₹2–10 lakh) · nii (both) · retail · employee · shareholder · total.' },
      { name: 'categories[].timesSubscribed', type: 'number', description: 'Shares bid divided by shares offered in that category.' },
    ],
  },
  {
    id: 'gmp', group: 'ipos', title: 'Get Grey Market Premium', method: 'GET', path: '/partner/v1/ipos/{symbol}/gmp', scope: 'gmp:read',
    summary: 'The latest Grey Market Premium for an IPO, always with its disclaimer.',
    details: ['GMP is unofficial and unregulated. Show the disclaimer wherever you show the figure.'],
    params: [
      { name: 'symbol', in: 'path', type: 'string', required: true, description: 'The IPO symbol.', example: 'ARDEE' },
    ],
    responses: [
      { status: 200, when: 'The latest GMP. gmp is null when we have none.', body: { symbol: 'ARDEE', gmp: 24, trend: null, asOf: '2026-11-23T09:15:00.000Z', disclaimer: 'Grey Market Premium is an unofficial, unregulated indicator…' } },
      { status: 403, when: 'Your account does not have GMP switched on.', body: E403_SCOPE('gmp:read') },
    ],
  },

  /* ── Bids ────────────────────────────────────────────────────── */
  {
    id: 'bid-place', group: 'bids', title: 'Place bids', method: 'POST', path: '/partner/v1/bids', scope: 'bids:write',
    summary: 'Place up to 25 UPI bids for one IPO. All or nothing: if any bid has a problem, none is placed and every problem is listed.',
    details: [
      'A placed bid is sent to the exchange within seconds. The investor then gets a UPI mandate request on their UPI app; follow the bid with Get bids or webhooks.',
      'With a test key your bids go to a simulator and never reach an exchange. Live bidding is switched on per account, for named IPOs, within limits.',
    ],
    bodyFields: [
      { name: 'ipoSymbol', type: 'string', required: true, description: 'The IPO symbol.' },
      { name: 'bids', type: 'array', required: true, description: '1 to 25 bids.' },
      ...BID_FIELDS.map((f) => ({ ...f, name: `bids[].${f.name}` })),
    ],
    body: {
      ipoSymbol: 'ARDEE',
      bids: [{
        orderId: 'ORD-2026-000123', consentRef: 'CONSENT-88412', fullName: 'Rakesh Kumar', pan: 'ABCDE1234F',
        depository: 'NSDL', dpId: 'IN301234', clientId: '12345678', upiId: 'rakesh@okhdfcbank',
        category: 'retail', lots: 1, atCutoff: true,
      }],
    },
    responses: [
      { status: 201, when: 'Every bid was accepted.', body: { ipoSymbol: 'ARDEE', mode: 'test', batchId: 'c0d46973-…', bids: [{ orderId: 'ORD-2026-000123', ref: '5b38c1f0-…', applicationNumber: 'TESTMWSZIAJF0', status: 'submitted', amount: 13428, replayed: false }] } },
      { status: 400, when: 'At least one bid has a problem; none was placed.', body: { statusCode: 400, error: 'Bad Request', message: 'No bid was placed. Fix these and send the whole batch again.', problems: ['bids[0] (ORD-2026-000123): pan must be a valid PAN (five letters, four digits, one letter).'] } },
      { status: 409, when: 'That PAN already has a live application for this IPO in the same quota.', body: err(409, 'Conflict', 'ORD-2026-000124: This PAN already has a retail/HNI application for this IPO — one public application per PAN (a shareholder/employee quota bid, where offered, is separate).') },
    ],
    responseFields: [
      { name: 'bids[].ref', type: 'string', description: 'Our id for the bid. Use it, or your orderId, in every later call.' },
      { name: 'bids[].applicationNumber', type: 'string', description: 'The application number at the exchange. Test bids start with TEST.' },
      { name: 'bids[].replayed', type: 'boolean', description: 'true when this orderId was already placed — nothing new was created.' },
    ],
    tryNote: 'Try it runs in test mode: bids go to the simulator and never reach an exchange. A new orderId and PAN are filled in each time.',
  },
  {
    id: 'bid-modify', group: 'bids', title: 'Change a bid', method: 'POST', path: '/partner/v1/bids/modify', scope: 'bids:write',
    summary: 'Change the lots and price of a bid. An HNI bid already at the exchange may only be raised, never lowered.',
    bodyFields: [
      ...REF_PARAMS,
      { name: 'lots', type: 'integer', required: true, description: 'The new number of lots.' },
      { name: 'atCutoff · price', type: 'boolean · number', description: 'Cut-off, or a new price inside the band.' },
    ],
    body: { orderId: 'ORD-2026-000123', consentRef: 'CONSENT-88413', lots: 2, atCutoff: true },
    responses: [
      { status: 201, when: 'The change was accepted.', body: { ref: '5b38c1f0-…', orderId: 'ORD-2026-000123', category: 'retail', applicantType: 'individual', lots: 2, qty: 24, atCutoff: true, price: null, amount: 26856, operationId: '1136b892-…' } },
      { status: 404, when: 'No bid of yours with that ref or orderId.', body: err(404, 'Not Found', 'No live bid with that orderId for your account.') },
    ],
    tryNote: 'Try it runs in test mode, so it can only change test bids.',
  },
  {
    id: 'bid-cancel', group: 'bids', title: 'Cancel a bid', method: 'POST', path: '/partner/v1/bids/cancel', scope: 'bids:write',
    summary: 'Withdraw a bid. Once at the exchange, only retail and reserved-quota bids may be withdrawn.',
    bodyFields: REF_PARAMS,
    body: { orderId: 'ORD-2026-000123', consentRef: 'CONSENT-88414' },
    responses: [
      { status: 201, when: 'The bid was cancelled.', body: { ref: '5b38c1f0-…', orderId: 'ORD-2026-000123', status: 'cancelled', operationId: 'abfc99fa-…' } },
      { status: 404, when: 'No bid of yours with that ref or orderId.', body: err(404, 'Not Found', 'No live bid with that orderId for your account.') },
    ],
    tryNote: 'Try it runs in test mode, so it can only cancel test bids.',
  },
  {
    id: 'bid-upi', group: 'bids', title: 'Change the UPI ID', method: 'POST', path: '/partner/v1/bids/upi', scope: 'bids:write',
    summary: 'Send the mandate to a different UPI ID. Refused once the money is blocked, because the block sits behind the old UPI ID.',
    bodyFields: [...REF_PARAMS, { name: 'upiId', type: 'string', required: true, description: 'The new UPI ID.' }],
    body: { orderId: 'ORD-2026-000123', consentRef: 'CONSENT-88415', upiId: 'rakesh.kumar@okicici' },
    responses: [
      { status: 201, when: 'The UPI ID was changed.', body: { ref: '5b38c1f0-…', orderId: 'ORD-2026-000123', restatedAtExchange: false } },
      { status: 400, when: 'The money is already blocked.', body: err(400, 'Bad Request', 'The funds are already blocked against the current UPI ID, and a block cannot be moved to another ID. Withdraw this application and apply again if you need to use a different UPI ID.') },
    ],
    responseFields: [{ name: 'restatedAtExchange', type: 'boolean', description: 'true when the bid was already at the exchange and the change was sent there too.' }],
    tryNote: 'Try it runs in test mode, so it can only change test bids.',
  },
  {
    id: 'bid-read', group: 'bids', title: 'Get bids', method: 'GET', path: '/partner/v1/bids', scope: 'bids:read',
    summary: 'One bid with its full history (by ref or orderId), or a page of your bids.',
    details: ['A key sees only bids in its own mode: a test key sees test bids, a live key live ones.'],
    params: [
      { name: 'ref', in: 'query', type: 'string', required: false, description: 'One bid by its ref, with history.' },
      { name: 'orderId', in: 'query', type: 'string', required: false, description: 'One bid by your orderId, with history.' },
      { name: 'ipoSymbol', in: 'query', type: 'string', required: false, description: 'A page of bids for this IPO.', example: 'ARDEE' },
      { name: 'status', in: 'query', type: 'string', required: false, description: 'Only bids in this status.' },
      { name: 'page', in: 'query', type: 'integer', required: false, description: 'Page number, from 1.' },
      { name: 'per', in: 'query', type: 'integer', required: false, description: 'Rows per page. Default 50, at most 200.' },
    ],
    responses: [
      { status: 200, when: 'One bid (with ref or orderId).', body: { ...SAMPLE_BID_ROW, history: [{ event: 'bid.accepted', status: 'submitted', at: '2026-11-23T08:08:57.000Z' }, { event: 'bid.sent', status: 'mandate_pending', at: '2026-11-23T08:09:02.000Z' }, { event: 'bid.funds_blocked', status: 'upi_blocked', at: '2026-11-23T08:09:31.000Z' }] } },
      { status: 404, when: 'No bid of yours with that ref or orderId.', body: err(404, 'Not Found', 'No live bid with that orderId for your account.') },
    ],
    responseFields: [
      { name: 'status', type: 'string', description: 'submitted (queued) · mandate_pending (waiting for the investor) · upi_blocked (money blocked) · dp_verified · confirmed · allotted · not_allotted · released (refunded) · cancelled · rejected · failed.' },
      { name: 'upiStatus', type: 'string', description: 'The exchange’s own wording for the UPI mandate.' },
      { name: 'reason', type: 'string', description: 'Why a bid was rejected or failed.' },
      { name: 'history[]', type: 'array', description: 'Every change, oldest first, named as the matching webhook event.' },
    ],
  },
  {
    id: 'bid-summary', group: 'bids', title: 'Bid totals for an IPO', method: 'GET', path: '/partner/v1/bids/summary', scope: 'bids:read',
    summary: 'How many bids and how many rupees you have in each status, for one IPO.',
    params: [{ name: 'ipoSymbol', in: 'query', type: 'string', required: true, description: 'The IPO symbol.', example: 'ARDEE' }],
    responses: [
      { status: 200, when: 'Your totals.', body: { ipoSymbol: 'ARDEE', mode: 'test', byStatus: [{ status: 'upi_blocked', bids: 12, amount: 161136 }, { status: 'mandate_pending', bids: 3, amount: 40284 }], total: { bids: 15, amount: 201420 } } },
    ],
  },
  {
    id: 'bid-limits', group: 'bids', title: 'Your live bidding limits', method: 'GET', path: '/partner/v1/bids/limits', scope: 'bids:read',
    summary: 'Whether live bidding is open for your account, for which IPOs, the limits per bid and per day, and what you have used today.',
    responses: [
      { status: 200, when: 'Your limits.', body: { liveOpen: true, enabled: true, ipoSymbols: ['ARDEE'], maxAmountPerBid: 200000, maxBidsPerDay: 500, maxAmountPerDay: 5000000, usedToday: { bids: 42, amount: 612400 } } },
    ],
    responseFields: [
      { name: 'liveOpen', type: 'boolean', description: 'Whether live bidding is open on our side at all.' },
      { name: 'enabled', type: 'boolean', description: 'Whether live bidding is switched on for your account.' },
      { name: 'ipoSymbols', type: 'array', description: 'The only IPOs you may bid on live. Empty means none.' },
    ],
  },

  /* ── Testing ─────────────────────────────────────────────────── */
  {
    id: 'simulate', group: 'testing', title: 'Simulate the next step', method: 'POST', path: '/partner/v1/test/simulate', scope: 'bids:write',
    summary: 'Move a TEST bid to its next step — the investor accepting the mandate, allotment, refund — and get the same webhooks a live bid would.',
    details: ['Test keys only. A full cycle: place → sent → mandate_accepted → allotted → refund.'],
    bodyFields: [
      { name: 'ref · orderId', type: 'string', required: true, description: 'Which test bid. Send either.' },
      { name: 'event', type: 'string', required: true, description: 'mandate_accepted · mandate_rejected · exchange_rejected · allotted · not_allotted · refund.' },
      { name: 'allottedLots', type: 'integer', description: 'With allotted: how many lots were allotted. Defaults to all of them.' },
    ],
    body: { orderId: 'ORD-2026-000123', event: 'mandate_accepted' },
    responses: [
      { status: 201, when: 'The bid moved on. Returns the bid as Get bids would.', body: { ...SAMPLE_BID_ROW, history: ['…'] } },
      { status: 400, when: 'That step does not follow from the bid’s current status.', body: err(400, 'Bad Request', 'allotted needs the bid to be upi_blocked or confirmed or dp_verified; it is submitted.') },
    ],
  },
];

export const ERRORS: { status: number; title: string; meaning: string }[] = [
  { status: 400, title: 'Bad Request', meaning: 'The request was not accepted. For bids, problems lists every bid and every reason — fix them all and send the batch again.' },
  { status: 401, title: 'Unauthorized', meaning: 'The X-Api-Key header is missing, malformed, wrong or revoked, or your account is not active.' },
  { status: 403, title: 'Forbidden', meaning: 'API access is not enabled for your account, the endpoint needs an API group your account or key does not have (the message says which), the key is used from an address outside its allowlist, or a live bid is outside your limits.' },
  { status: 404, title: 'Not Found', meaning: 'No IPO with that symbol, or no record of yours with that ref or orderId.' },
  { status: 409, title: 'Conflict', meaning: 'That PAN already has a live application for this IPO in the same quota, or the orderId was used for a different IPO.' },
  { status: 500, title: 'Server error', meaning: 'Something failed on our side. The call is logged — retry, and send us the time and keyId if it continues.' },
];

export const WEBHOOK_EVENTS = ['bid.accepted', 'bid.sent', 'bid.funds_blocked', 'bid.demat_verified', 'bid.rejected', 'bid.instruction_refused', 'bid.cancelled', 'bid.allotment', 'bid.refund', 'bid.status'];

export const WEBHOOK_SAMPLE = {
  id: '7c1d9e2a-…', event: 'bid.funds_blocked', occurredAt: '2026-11-23T10:38:27.162Z', mode: 'live',
  data: { ref: '5b38c1f0-…', orderId: 'ORD-2026-000123', ipoSymbol: 'ARDEE', status: 'upi_blocked', applicationNumber: '48313001', amount: 13428, upiStatus: 'Mandate accepted', reason: null, allotment: null },
};

export const WEBHOOK_VERIFY = `import crypto from 'node:crypto';

// Use the RAW request body, before any JSON parsing.
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;   // refuse anything older than 5 minutes
  return fresh && expected.length === v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`;

/* ── Code samples, generated from an endpoint ─────────────────────────────── */

export const LANGS = [
  { id: 'curl', label: 'cURL' },
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
  { id: 'java', label: 'Java' },
] as const;
export type Lang = (typeof LANGS)[number]['id'];

const KEY = 'YOUR_KEY_ID.YOUR_SECRET';

/** The full URL with example values filled in. */
export function exampleUrl(ep: ApiEndpoint, values?: Record<string, string>): string {
  const v = (p: ApiParam) => values?.[p.name] ?? p.example ?? '';
  let path = ep.path;
  for (const p of ep.params ?? []) if (p.in === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(v(p) || p.name));
  const qs = (ep.params ?? [])
    .filter((p) => p.in === 'query' && (p.required || v(p)))
    .map((p) => `${p.name}=${encodeURIComponent(v(p) || `<${p.name}>`)}`)
    .join('&');
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

const json = (b: unknown, indent = 2) => JSON.stringify(b, null, indent);
const indentBy = (s: string, n: number) => s.split('\n').map((l, i) => (i === 0 ? l : ' '.repeat(n) + l)).join('\n');

export function codeSample(lang: Lang, ep: ApiEndpoint): string {
  const url = exampleUrl(ep);
  const post = ep.method === 'POST';
  const body = post ? json(ep.body ?? {}) : '';
  switch (lang) {
    case 'curl':
      return post
        ? `curl -X POST "${url}" \\\n  -H "X-Api-Key: ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`
        : `curl "${url}" \\\n  -H "X-Api-Key: ${KEY}"`;
    case 'node':
      return post
        ? `const res = await fetch("${url}", {\n  method: "POST",\n  headers: {\n    "X-Api-Key": process.env.INVESTOYARD_API_KEY,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${indentBy(body, 2)}),\n});\nconst data = await res.json();\nif (!res.ok) throw new Error(data.message);\nconsole.log(data);`
        : `const res = await fetch("${url}", {\n  headers: { "X-Api-Key": process.env.INVESTOYARD_API_KEY },\n});\nconst data = await res.json();\nif (!res.ok) throw new Error(data.message);\nconsole.log(data);`;
    case 'python':
      return post
        ? `import os, requests\n\nres = requests.post(\n    "${url}",\n    headers={"X-Api-Key": os.environ["INVESTOYARD_API_KEY"]},\n    json=${indentBy(pyLiteral(ep.body ?? {}), 4)},\n    timeout=60,\n)\nres.raise_for_status()\nprint(res.json())`
        : `import os, requests\n\nres = requests.get(\n    "${url}",\n    headers={"X-Api-Key": os.environ["INVESTOYARD_API_KEY"]},\n    timeout=30,\n)\nres.raise_for_status()\nprint(res.json())`;
    case 'php':
      return `<?php\n$ch = curl_init("${url}");\ncurl_setopt_array($ch, [\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => [\n    "X-Api-Key: " . getenv("INVESTOYARD_API_KEY"),${post ? '\n    "Content-Type: application/json",' : ''}\n  ],${post ? `\n  CURLOPT_POST => true,\n  CURLOPT_POSTFIELDS => <<<'JSON'\n${body}\nJSON,` : ''}\n]);\n$response = curl_exec($ch);\n$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\ncurl_close($ch);\n$data = json_decode($response, true);`;
    case 'java':
      return `import java.net.URI;\nimport java.net.http.*;\n\nHttpClient client = HttpClient.newHttpClient();\nHttpRequest request = HttpRequest.newBuilder()\n    .uri(URI.create("${url}"))\n    .header("X-Api-Key", System.getenv("INVESTOYARD_API_KEY"))${post ? `\n    .header("Content-Type", "application/json")\n    .POST(HttpRequest.BodyPublishers.ofString("""\n${indentBy(body, 8).replace(/^/, '        ')}\n        """))` : '\n    .GET()'}\n    .build();\nHttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.statusCode() + " " + response.body());`;
  }
}

/** A JSON value written as a Python literal (True/False/None). */
function pyLiteral(v: unknown): string {
  return json(v).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None');
}

export const prettyJson = json;
