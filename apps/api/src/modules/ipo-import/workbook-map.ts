/**
 * Column mapping for the operator's data-entry workbook
 * (Investoyard-Data-Entry-Template.xlsx / -Prefilled.xlsx).
 *
 * Sheet layout produced by that template:
 *   row 1 = section bands · row 2 = HEADERS · row 3 = grey EXAMPLE row · row 4+ = data
 * Rows whose first cell reads "EXAMPLE" are ignored wherever they appear.
 */

export const HEADER_ROW = 2;   // 1-indexed
export const FIRST_DATA_ROW = 4;

export interface ParsedIpo {
  row: number;
  symbol: string;
  name: string;
  type: 'mainboard' | 'sme';
  isin?: string;
  logoUrl?: string;
  registrar?: string;
  priceBandMin?: number;
  priceBandMax?: number;
  lotSize?: number;
  minAmount?: number;
  issueSizeCr?: number;
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
  gmp?: number;
  listingGainPct?: number;
  reservations: string[];
  documents: { type: string; url: string }[];
  extra: Record<string, any>;
  errors: string[];
}

export interface ParsedFinancial { row: number; symbol: string; period: string; [k: string]: any }
export interface ParsedAnchor { row: number; symbol: string; name: string; amount?: number; shares?: number }
export interface ParsedPeer { row: number; symbol: string; name: string; pe?: number; eps?: number; ronw?: number }

/** IPO sheet: header text → where the value lands. */
export const IPO_COLUMNS: Record<string, { field: string; kind: 'str' | 'num' | 'int' | 'date' | 'bool'; into?: 'extra' }> = {
  'Symbol *': { field: 'symbol', kind: 'str' },
  'Company name *': { field: 'name', kind: 'str' },
  'Board *': { field: 'type', kind: 'str' },
  'Exchanges * (comma-sep)': { field: 'exchanges', kind: 'str', into: 'extra' },
  'ISIN': { field: 'isin', kind: 'str' },
  // The workbook's "Sector / Industry" column carries the exchanges' fine
  // Basic Industry ("Ferro & Silica Manganese"), so it lands in `industry`.
  // The broad `sector` is derived from it against the Sector master, never
  // typed here — see scripts/seed-sectors.js.
  'Sector / Industry': { field: 'industry', kind: 'str', into: 'extra' },
  Industry: { field: 'industry', kind: 'str', into: 'extra' },
  'Company website': { field: 'website', kind: 'str', into: 'extra' },
  'Incorporation year': { field: 'incorporationYear', kind: 'int', into: 'extra' },
  'Logo URL': { field: 'logoUrl', kind: 'str' },

  'Issue type *': { field: 'issueType', kind: 'str', into: 'extra' },
  'Face value (₹)': { field: 'faceValue', kind: 'num', into: 'extra' },
  'Price band min (₹) *': { field: 'priceBandMin', kind: 'num' },
  'Price band max (₹) *': { field: 'priceBandMax', kind: 'num' },
  'Lot size (shares) *': { field: 'lotSize', kind: 'int' },
  'Min amount (₹)': { field: 'minAmount', kind: 'num' },
  'Total issue size (₹ Cr) *': { field: 'issueSizeCr', kind: 'num' },
  'Total issue (shares)': { field: 'totalShares', kind: 'int', into: 'extra' },
  'Fresh issue (₹ Cr)': { field: 'freshIssueCr', kind: 'num', into: 'extra' },
  'Fresh issue (shares)': { field: 'freshIssueShares', kind: 'int', into: 'extra' },
  'OFS portion (₹ Cr)': { field: 'ofsCr', kind: 'num', into: 'extra' },
  'OFS portion (shares)': { field: 'ofsShares', kind: 'int', into: 'extra' },
  'Retail discount (₹)': { field: 'retailDiscount', kind: 'num', into: 'extra' },
  'Employee discount (₹)': { field: 'employeeDiscount', kind: 'num', into: 'extra' },
  'Market-maker portion (shares, SME only)': { field: 'marketMakerShares', kind: 'int', into: 'extra' },
  'Pre-issue shares': { field: 'preIssueShares', kind: 'int', into: 'extra' },
  'Post-issue shares': { field: 'postIssueShares', kind: 'int', into: 'extra' },

  'Anchor bid date': { field: 'anchorBidDate', kind: 'date', into: 'extra' },
  'Open date *': { field: 'openDate', kind: 'date' },
  'Close date *': { field: 'closeDate', kind: 'date' },
  'Allotment date': { field: 'allotmentDate', kind: 'date' },
  'Refund initiation': { field: 'refundDate', kind: 'date', into: 'extra' },
  'Demat credit': { field: 'dematDate', kind: 'date', into: 'extra' },
  'Listing date': { field: 'listingDate', kind: 'date' },

  'Lead managers (comma-sep)': { field: 'leads', kind: 'str', into: 'extra' },
  'Registrar': { field: 'registrar', kind: 'str' },
  'Promoters (comma-sep)': { field: 'promoters', kind: 'str', into: 'extra' },
  'Promoter holding pre-issue (%)': { field: 'promoterPre', kind: 'num', into: 'extra' },
  'Promoter holding post-issue (%)': { field: 'promoterPost', kind: 'num', into: 'extra' },

  'About the company': { field: 'companyDescription', kind: 'str', into: 'extra' },
  'Strengths (one per line)': { field: 'companyStrength', kind: 'str', into: 'extra' },
  'Risks (one per line)': { field: 'companyRisks', kind: 'str', into: 'extra' },
  'Objects of the issue': { field: 'objectsOfIssue', kind: 'str' },

  'GMP before listing (₹)': { field: 'gmp', kind: 'num' },
  'Listing price NSE (₹)': { field: 'nseListingPrice', kind: 'num', into: 'extra' },
  'Listing price BSE (₹)': { field: 'bseListingPrice', kind: 'num', into: 'extra' },
  'Listing gain (%)': { field: 'listingGainPct', kind: 'num' },
};

/** Reservation percentages → the admin form's shareResv shape. */
export const RESERVATION_COLUMNS: Record<string, string> = {
  'QIB reservation (%)': 'qib',
  'NII reservation (%)': 'hni',
  'Retail reservation (%)': 'retail',
  'Employee reservation (%)': 'employee',
  'Shareholder reservation (%)': 'shareholder',
};

/** Final category-wise subscription (×) → extra.finalSub. */
export const SUBSCRIPTION_COLUMNS: Record<string, string> = {
  'QIB (×)': 'qib',
  'NII total (×)': 'nii',
  'sNII (×)': 'snii',
  'bNII (×)': 'bnii',
  'Retail (×)': 'retail',
  'Employee (×)': 'employee',
  'Shareholder (×)': 'shareholder',
  'Total (×)': 'total',
  'Total applications': 'applications',
};

/** KPI strip → extra.kpi. */
export const KPI_COLUMNS: Record<string, string> = {
  'EPS (₹)': 'eps',
  'P/E (at band max)': 'pe',
  'RoNW (%)': 'ronw',
  'ROE (%)': 'roe',
  'ROCE (%)': 'roce',
  'PAT margin (%)': 'patMargin',
  'EBITDA margin (%)': 'ebitdaMargin',
  'Price / Book': 'priceToBook',
  'Debt / Equity': 'debtToEquity',
};

/** Document URL columns → Ipo.documents rows. */
export const DOC_COLUMNS: Record<string, string> = {
  'DRHP URL': 'drhp',
  'RHP URL': 'rhp',
};

export const FINANCIAL_COLUMNS: Record<string, string> = {
  'Total assets (₹ Cr)': 'assets',
  'Revenue (₹ Cr)': 'revenue',
  'EBITDA (₹ Cr)': 'ebitda',
  'Profit after tax (₹ Cr)': 'pat',
  'Net worth (₹ Cr)': 'netWorth',
  'Reserves & surplus (₹ Cr)': 'reserves',
  'Total borrowings (₹ Cr)': 'borrowings',
};
