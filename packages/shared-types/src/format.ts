/**
 * Presentation helpers shared by web AND mobile — one implementation so the two
 * surfaces never drift on how a company name or a domain term is written.
 */

/* ── company / person name casing ─────────────────────────────────────────── */

const KEEP_UPPER = new Set([
  'IPO', 'SME', 'NBFC', 'IT', 'BPO', 'KPO', 'FMCG', 'NSE', 'BSE', 'PSU', 'LLP',
  'AMC', 'API', 'EV', 'CNG', 'LPG', 'PVC', 'TMT', 'RMC', 'MEP', 'HVAC', 'EPC',
  'AI', 'ML', 'HR', 'CA', 'CS', 'USA', 'UK', 'UAE', 'R&D', 'A&M', 'S&P',
  'ABC', 'ITC', 'IOC', 'IEX', 'IRB', 'IFB', 'ABB', 'AIA', 'EIH', 'EID', 'ADF',
  // vowel-carrying acronyms the no-vowel rule below can't catch
  'SBI', 'LIC', 'IDBI', 'ICICI', 'IRFC', 'IREDA', 'IRCTC', 'IOB', 'IOL', 'IFCI',
  'ONGC', 'GAIL', 'BEML', 'NHPC', 'SJVN', 'MOIL', 'KIOCL', 'RITES', 'NALCO',
  'HUDCO', 'IIFL', 'UTI', 'PFC', 'REC', 'NBCC', 'MMTC', 'BEL', 'HAL', 'BOI',
]);
/** Honorifics keep sentence case, not the acronym treatment. */
const HONORIFIC: Record<string, string> = {
  'mr': 'Mr', 'mr.': 'Mr.', 'mrs': 'Mrs', 'mrs.': 'Mrs.', 'ms': 'Ms', 'ms.': 'Ms.',
  'dr': 'Dr', 'dr.': 'Dr.', 'shri': 'Shri', 'smt': 'Smt', 'smt.': 'Smt.', 'kum': 'Kum',
};
/** ALL-CAPS tokens with no vowels are acronyms (HDFC, TCS, NTPC, RVNL, PNB…). */
const isAcronym = (w: string) => w.length >= 2 && w.length <= 5 && !/[aeiouy]/.test(w);
const LOWER_WORDS = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an', '&']);
const SUFFIX_CASE: Record<string, string> = {
  'ltd': 'Ltd', 'ltd.': 'Ltd.', 'limited': 'Limited', 'pvt': 'Pvt', 'pvt.': 'Pvt.',
  'private': 'Private', 'inc': 'Inc', 'inc.': 'Inc.', 'llp': 'LLP', 'plc': 'PLC',
  'co': 'Co', 'co.': 'Co.', 'corp': 'Corp', 'corp.': 'Corp.',
};

/**
 * Company and applicant names arrive from registrars/exchanges in ALL CAPS
 * ("MOLBIO DIAGNOSTICS LTD"). Render them in Title Case, preserving genuine
 * acronyms and initials, and lower-casing the small connecting words a copy
 * editor would. Names already written in mixed case are returned untouched.
 */
export function titleCase(name?: string | null): string {
  if (!name) return '';
  const raw = String(name).trim();
  // A name already carrying mixed case was authored deliberately — leave it alone.
  if (/[a-z]/.test(raw) && /[A-Z]/.test(raw)) return raw;
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      const bare = word.replace(/[^a-z0-9&.]/gi, '');
      if (HONORIFIC[word]) return HONORIFIC[word];
      if (SUFFIX_CASE[word]) return SUFFIX_CASE[word];
      if (KEEP_UPPER.has(bare.toUpperCase()) || isAcronym(bare.replace(/\./g, ''))) return word.toUpperCase();
      // initials like "j.k." or "m/s" keep their shape, upper-cased
      if (/^([a-z]\.){2,}$/.test(word) || /^[a-z]\/[a-z]$/.test(word)) return word.toUpperCase();
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      // capitalise the first LETTER (names may start with digits: "5paisa" → "5Paisa")
      // and each part of a hyphen/slash compound ("agri-tech" → "Agri-Tech").
      let seenFirst = false;
      return word.replace(/(^|[-/(]|\d)([a-z])/g, (m: string, sep: string, ch: string) => {
        const atStart = sep === '' || /\d/.test(sep);
        if (atStart && seenFirst) return m; // only the first letter after digits
        if (atStart) seenFirst = true;
        return sep + ch.toUpperCase();
      });
    })
    .join(' ');
}

/**
 * Title Case WITHOUT the trailing corporate suffix — for dense surfaces where
 * width is scarce: cards, banner slides, comparison tables.
 *
 * Nearly every registrar name ends in "LIMITED", which costs a line of card
 * width and tells the reader nothing they didn't assume. The full legal name
 * stays on the IPO detail page, where identity (and SEO) matter.
 *
 * Only a TRAILING suffix is removed, so a company whose name merely contains
 * the word ("Limited Liability Partners Ltd" → "Limited Liability Partners")
 * keeps it. A name that is nothing but the suffix is returned unchanged.
 */
export function shortName(name?: string | null): string {
  const full = titleCase(name);
  if (!full) return '';
  const cut = full.replace(/[\s,]+(?:(?:Pvt|Private)\.?\s+)?(?:Ltd|Limited)\.?$/i, '').trim();
  return cut || full;
}

/* ── domain vocabulary ────────────────────────────────────────────────────── */

/**
 * The words the product uses for IPO concepts. Defined once so web and mobile
 * (and any future surface) speak identically — "Offer Price", never a mix of
 * "price band" / "issue price" / "offer price" across screens.
 */
export const LABEL = {
  offerPrice: 'Offer Price',
  lotSize: 'Lot Size',
  issueSize: 'Issue Size',
  minApplication: 'Min Application',
  minApplicationLong: 'Minimum Application',
  lotDetails: 'Lot Details',
  reservation: 'Reservation',
  keyDates: 'Key Dates',
  subscription: 'Subscription',
  subscribed: 'Subscribed',
  liveSubscription: 'Live Subscription',
  allotmentStatus: 'Allotment Status',
  checkAllotment: 'Check Allotment',
  listingPerformance: 'Listing Performance',
  listingGain: 'Listing Gain',
  openingSoon: 'Opening Soon',
  gmp: 'GMP',
  gmpLong: 'Grey Market Premium',
  issueDetails: 'Issue Details',
  applyNow: 'Apply Now',
  preApply: 'Pre Apply',
  printForms: 'Print Forms',
  remindMe: 'Remind Me',
} as const;

/** Investor-category display names (SEBI vocabulary). */
export const CATEGORY_LABEL: Record<string, string> = {
  qib: 'QIB',
  nii: 'NII',
  hni: 'B-HNI',
  hni2: 'S-HNI',
  snii: 'S-HNI',
  bnii: 'B-HNI',
  retail: 'Retail',
  employee: 'Employee',
  shareholder: 'Shareholder',
  other: 'Other',
  total: 'Total',
};

/** Demand in plain words, calibrated per board (SME runs an order hotter). */
export function demandWord(subX: number, sme: boolean): string {
  const th = sme ? [1, 10, 50] : [1, 3, 10];
  if (subX < th[0]) return 'Building up';
  if (subX < th[1]) return 'Steady demand';
  if (subX < th[2]) return 'Strong demand';
  return 'Exceptional demand';
}
