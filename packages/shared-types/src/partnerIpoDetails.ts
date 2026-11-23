/**
 * What a partner is told about an IPO beyond its columns (2026-11-23).
 *
 * Until this date the partner API's `details` object was every OPERATIONAL and
 * CONTENT key of the record's `extra` — which handed partners our own
 * operating data: the form-number series and which member they belong to, the
 * ASBA template file names, the Start Bid / Start Print switches, the raw
 * reservation table with our provenance stamps, and four blocks of detail-page
 * HTML. Operator decision: "give only the required detail".
 *
 * So this is an ALLOW-LIST, not a block-list. A key reaches a partner only by
 * being named below, so nothing added to an IPO record later can leak through
 * — the same rule `cleanRich` follows for link protocols. Values are also
 * normalised: numbers stored as strings become numbers, the bidding times carry
 * the India offset, and the importer's flat Fresh/OFS keys are folded in.
 *
 * No partner had called the IPO endpoints when this replaced the old shape
 * (SIHL's 4,911 calls were all print-forms), so the renames broke nobody.
 */
import { offerLegFrom } from './operationalContract';

export interface PartnerIpoDetails {
  faceValue?: number;
  sector?: string;
  industry?: string;
  /** book_built | fixed_price */
  mechanism?: string;
  tickSize?: number;
  /** final price once the issue is priced */
  finalIssuePrice?: number;
  /** rupees off the price per share, for the categories that get one */
  discounts?: { retail?: number; employee?: number; shareholder?: number };
  totalShares?: number;
  freshIssue?: { basis: 'shares' | 'amount'; value: number };
  offerForSale?: { basis: 'shares' | 'amount'; value: number };
  /** ISO with the India offset, e.g. 2026-11-19T10:00:00+05:30 */
  biddingOpensAt?: string;
  biddingClosesAt?: string;
  upiMandateCutoff?: string;
  /** YYYY-MM-DD */
  anchorDate?: string;
  refundDate?: string;
  dematDate?: string;
  leadManagers?: string[];
  sponsorBanks?: string;
  registrarContact?: { url?: string; email?: string; phone?: string };
  companyWebsite?: string;
  promoters?: string;
  listingPrice?: { nse?: number; bse?: number };
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s ? s : undefined;
};
const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
/** A datetime-local value typed as India time → ISO with the offset; a bare date stays a date. */
const istInstant = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2})?)?/.exec(s);
  if (!m) return undefined;
  return m[2] ? `${m[1]}T${m[2]}:00+05:30` : m[1];
};
const dayOnly = (v: unknown): string | undefined => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(v) ?? '');
  return m ? m[1] : undefined;
};
/** Drop undefined members; an empty object becomes undefined. */
function compact<T extends Record<string, unknown>>(o: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length ? (out as T) : undefined;
}

export function partnerIpoDetails(extra: Record<string, unknown> | null | undefined): PartnerIpoDetails {
  const x = (extra ?? {}) as Record<string, any>;
  const leads = Array.isArray(x.leads) ? x.leads.map(str).filter((s): s is string => !!s) : [];
  return compact({
    faceValue: num(x.faceValue),
    sector: str(x.sector),
    industry: str(x.industry),
    mechanism: str(x.mechanism),
    tickSize: num(x.tickSize),
    finalIssuePrice: num(x.finalIssuePrice),
    discounts: compact({ retail: num(x.retailDiscount), employee: num(x.employeeDiscount), shareholder: num(x.shareholderDiscount) }),
    totalShares: num(x.totalShares),
    freshIssue: offerLegFrom(x, 'fresh'),
    offerForSale: offerLegFrom(x, 'ofs'),
    biddingOpensAt: istInstant(x.openDate),
    biddingClosesAt: istInstant(x.closeDate),
    upiMandateCutoff: istInstant(x.upiMandateCutoff),
    anchorDate: dayOnly(x.anchorDate),
    refundDate: dayOnly(x.refundDate),
    dematDate: dayOnly(x.dematDate),
    leadManagers: leads.length ? leads : undefined,
    sponsorBanks: str(x.sponsorBank),
    registrarContact: compact({ url: str(x.registrarUrl), email: str(x.registrarEmail), phone: str(x.registrarPhone) }),
    companyWebsite: str(x.companyWebsite),
    promoters: str(x.companyPromoter),
    listingPrice: compact({ nse: num(x.nseListingPrice), bse: num(x.bseListingPrice) }),
  }) ?? {};
}
