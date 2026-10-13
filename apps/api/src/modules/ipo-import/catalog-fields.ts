/**
 * ONE definition of the catalog's reviewable fields.
 *
 * The review workbook is exported from this map and read back through it, so the
 * two can never drift into disagreeing about what a column means. Each entry
 * says how to READ the value off an Ipo row and how to WRITE it back.
 *
 * Deliberately NOT updatable here:
 *   Symbol      the key rows are matched on — change it and the row is an orphan
 *   Board       structural; changing it silently re-rules every derived figure
 *   Published   publishing is an operator action, not a spreadsheet cell
 */

export type Scalar = string | number | null;

export interface CatalogField {
  header: string;
  read: (ipo: any, extra: any) => Scalar;
  /** mutate the pending patch. `extra` is a working copy that the caller persists. */
  write: (patch: any, extra: any, value: string) => void;
  kind: 'str' | 'num' | 'int' | 'date' | 'list';
  /** worth chasing — a blank here is a real gap rather than a normal absence */
  core?: boolean;
}

const s = (v: any) => (v == null ? '' : String(v).trim());
const n = (v: any) => { const x = Number(String(v ?? '').replace(/[^\d.\-]/g, '')); return Number.isFinite(x) ? x : null; };
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const isoDate = (v: string) => {
  const t = s(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T00:00:00Z`);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z');
};
const listOf = (v: string) => s(v).split(',').map((x) => x.trim()).filter(Boolean);

/** a reservation cell lives at extra.shareResv[key] = { on, pct } */
const resv = (key: string, header: string, core = false): CatalogField => ({
  header, kind: 'num', core,
  read: (_i, x) => x?.shareResv?.[key]?.pct ?? '',
  write: (_p, x, v) => {
    const val = n(v);
    if (val == null) return;
    x.shareResv = { ...(x.shareResv ?? {}) };
    x.shareResv[key] = { on: val > 0, pct: String(val) };
  },
});

/** a subscription cell lives at extra.finalSub[key] */
const sub = (key: string, header: string): CatalogField => ({
  header, kind: 'num',
  read: (_i, x) => x?.finalSub?.[key] ?? '',
  write: (_p, x, v) => { const val = n(v); if (val != null) { x.finalSub = { ...(x.finalSub ?? {}) }; x.finalSub[key] = val; } },
});

/** a plain extra.* string/number */
const ex = (key: string, header: string, kind: CatalogField['kind'] = 'str', core = false): CatalogField => ({
  header, kind, core,
  read: (_i, x) => x?.[key] ?? '',
  write: (_p, x, v) => { const val = kind === 'num' || kind === 'int' ? n(v) : s(v); if (val !== '' && val != null) x[key] = val; },
});

export const CATALOG_FIELDS: CatalogField[] = [
  { header: 'Company name *', kind: 'str', read: (i) => i.name, write: (p, _x, v) => { if (s(v)) p.name = s(v); } },
  { header: 'ISIN', kind: 'str', core: true, read: (i) => i.isin ?? '', write: (p, _x, v) => { if (s(v)) p.isin = s(v).toUpperCase(); } },
  // Two levels of one classification, not two competing ideas: many industries
  // roll up into one sector. Both are exported so the operator can see and
  // correct the roll-up the seed script produced.
  ex('sector', 'Sector (broad)', 'str', true),
  ex('industry', 'Industry (detailed)', 'str', true),
  ex('companyWebsite', 'Company website'),
  { header: 'Logo URL', kind: 'str', read: (i) => i.logoUrl ?? '', write: (p, _x, v) => { if (s(v)) p.logoUrl = s(v); } },
  ex('issueType', 'Issue type *'),
  ex('faceValue', 'Face value (₹)', 'num'),

  { header: 'Price band min (₹) *', kind: 'num', core: true, read: (i) => (i.priceBandMin == null ? '' : Number(i.priceBandMin)), write: (p, _x, v) => { const q = n(v); if (q != null) p.priceBandMin = q; } },
  { header: 'Price band max (₹) *', kind: 'num', core: true, read: (i) => (i.priceBandMax == null ? '' : Number(i.priceBandMax)), write: (p, _x, v) => { const q = n(v); if (q != null) p.priceBandMax = q; } },
  { header: 'Lot size (shares) *', kind: 'int', core: true, read: (i) => i.lotSize ?? '', write: (p, _x, v) => { const q = n(v); if (q != null) p.lotSize = Math.round(q); } },
  { header: 'Min amount (₹)', kind: 'num', read: (i) => (i.minAmount == null ? '' : Number(i.minAmount)), write: (p, _x, v) => { const q = n(v); if (q != null) p.minAmount = q; } },
  // the sheet speaks ₹ Cr; the column stores RUPEES. Mixing them is a 10^7 error.
  {
    header: 'Total issue size (₹ Cr) *', kind: 'num', core: true,
    read: (i) => (i.issueSize == null ? '' : Math.round((Number(i.issueSize) / 1e7) * 100) / 100),
    write: (p, _x, v) => { const q = n(v); if (q != null) p.issueSizeCr = q; },
  },
  // The count the offer document prints, and the one every category divides
  // out of. Core: without it the split is reconstructed from a ₹ figure that is
  // itself rounded, at a price that is a guess until the issue prices.
  ex('totalShares', 'Total issue size (shares)', 'int', true),
  ex('freshIssueCr', 'Fresh issue (₹ Cr)', 'num'),
  ex('freshIssueShares', 'Fresh issue (shares)', 'int'),
  ex('ofsCr', 'OFS portion (₹ Cr)', 'num'),
  ex('ofsShares', 'OFS portion (shares)', 'int'),

  resv('qib', 'QIB reservation (%)', true),
  resv('hni', 'NII reservation (%)', true),
  resv('retail', 'Retail reservation (%)', true),
  resv('employee', 'Employee reservation (%)'),
  resv('shareholder', 'Shareholder reservation (%)'),

  ex('anchorDate', 'Anchor bid date', 'date'),
  // The anchor book as ALLOTTED. Both columns or neither: the count is struck
  // at this price, not at the issue price, so it means nothing on its own.
  ex('anchorShares', 'Anchor shares allotted', 'int'),
  ex('anchorPrice', 'Anchor allocation price (₹)', 'num'),
  ex('sponsorBank', 'Sponsor bank(s)'),
  { header: 'Open date *', kind: 'date', core: true, read: (i) => day(i.openDate), write: (p, _x, v) => { const d = isoDate(v); if (d) p.openDate = d; } },
  { header: 'Close date *', kind: 'date', core: true, read: (i) => day(i.closeDate), write: (p, _x, v) => { const d = isoDate(v); if (d) p.closeDate = d; } },
  { header: 'Allotment date', kind: 'date', read: (i) => day(i.allotmentDate), write: (p, _x, v) => { const d = isoDate(v); if (d) p.allotmentDate = d; } },
  { header: 'Listing date', kind: 'date', core: true, read: (i) => day(i.listingDate), write: (p, _x, v) => { const d = isoDate(v); if (d) p.listingDate = d; } },

  { header: 'Lead managers (comma-sep)', kind: 'list', core: true, read: (_i, x) => (Array.isArray(x?.leads) ? x.leads.join(', ') : ''), write: (_p, x, v) => { const l = listOf(v); if (l.length) x.leads = l; } },
  { header: 'Registrar', kind: 'str', core: true, read: (i) => i.registrar ?? '', write: (p, _x, v) => { if (s(v)) p.registrar = s(v); } },

  { header: 'Objects of the issue', kind: 'str', core: true, read: (i) => strip(i.objectsOfIssue), write: (p, _x, v) => { if (s(v)) p.objectsOfIssue = s(v); } },
  { header: 'About the company', kind: 'str', core: true, read: (_i, x) => strip(x?.companyDescription), write: (_p, x, v) => { if (s(v)) x.companyDescription = s(v); } },

  sub('qib', 'QIB (×)'),
  sub('nii', 'NII total (×)'),
  sub('retail', 'Retail (×)'),
  { ...sub('total', 'Total (×)'), core: true },

  ex('nseListingPrice', 'Listing price NSE (₹)', 'num'),
  { header: 'Listing gain (%)', kind: 'num', core: true, read: (i) => (i.listingGainPct == null ? '' : Number(i.listingGainPct)), write: (p, _x, v) => { const q = n(v); if (q != null) p.listingGainPct = q; } },

  { header: 'RHP URL', kind: 'str', read: (i) => docUrl(i, 'rhp'), write: (p, _x, v) => { if (s(v)) (p.__docs ??= {}).rhp = s(v); } },
  { header: 'DRHP URL', kind: 'str', read: (i) => docUrl(i, 'drhp'), write: (p, _x, v) => { if (s(v)) (p.__docs ??= {}).drhp = s(v); } },
];

function strip(html: any): string {
  return html ? String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) : '';
}
function docUrl(ipo: any, type: string): string {
  return (ipo.documents ?? []).find((d: any) => d.type === type)?.url ?? '';
}

/** Headers written by the export, in order. Symbol leads — it is the match key. */
export const EXPORT_HEADERS = ['Symbol *', 'Board *', ...CATALOG_FIELDS.map((f) => f.header), 'Published (Y/N)'];

/** Two values are "the same" if they read the same after light normalisation. */
export function sameValue(a: Scalar, b: string, kind: CatalogField['kind']): boolean {
  const A = s(a), B = s(b);
  if (A === '' && B === '') return true;
  if (kind === 'num' || kind === 'int') { const x = n(A), y = n(B); return x != null && y != null && Math.abs(x - y) < 0.005; }
  if (kind === 'date') return A.slice(0, 10) === B.slice(0, 10);
  if (kind === 'list') return A.toLowerCase().replace(/\s+/g, '') === B.toLowerCase().replace(/\s+/g, '');
  return A.toLowerCase() === B.toLowerCase();
}
