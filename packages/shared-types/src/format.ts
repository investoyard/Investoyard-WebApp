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

/**
 * Public URL for an IPO. Prefer the SEO-friendly slug when present; fall
 * back to the raw SYMBOL for legacy rows the backfill hasn't reached
 * (both routes still 200 on the site — the static export emits both).
 * Kept as a helper so every internal-link builder speaks the same URL.
 */
export function ipoUrl(ipo: { symbol?: string | null; slug?: string | null }): string {
  const h = ipo?.slug || ipo?.symbol || '';
  return h ? `/ipos/${h}` : '/ipos';
}

/**
 * SEO-friendly URL slug for an IPO. Derives from the shortened company name
 * (Limited/Pvt Ltd stripped) plus an `-ipo` suffix so Google indexes the
 * keyword. Lowercase, hyphenated, alphanumeric-only — safe as a URL segment.
 *
 *   "Glasswall Technologies Limited"  → "glasswall-technologies-ipo"
 *   "ARDEE Industries Ltd"            → "ardee-industries-ipo"
 *   "5Paisa Capital Limited"          → "5paisa-capital-ipo"
 *
 * Returns an empty string when the input is empty. The `-ipo` suffix is
 * appended UNCONDITIONALLY (fine even for FPOs / REITs — the search
 * queries the operator wants to rank on all use "IPO").
 */
export function ipoSlug(name?: string | null): string {
  const short = shortName(name);
  if (!short) return '';
  const base = short.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return base ? `${base}-ipo` : '';
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
  /**
   * The customer-facing short label, operator's choice (2026-09-02) when the
   * explorer layout became the home page. Read it from here on BOTH surfaces —
   * web and mobile must never disagree on vocabulary.
   *
   * `gmpLong` deliberately stays "Grey Market Premium": the friendly label is
   * what a reader scans, but the disclaimer has to name the thing for what it
   * is — unofficial and unregulated. The `/gmp` URLs, the SEO copy and the FAQ
   * headings keep GMP too; that is the term people actually search for.
   */
  gmp: 'Exp. Premium',
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

/**
 * Exchange platform names.
 *
 * The DATABASE stores the platform's real name; every SURFACE shows the name
 * investors recognise. NSE's SME platform is officially **NSE Emerge**, but
 * "NSE SME" is what the general investor reads without pausing — so the record
 * stays accurate and the label stays familiar (operator decision, 2026-08-31).
 * BSE's platform is genuinely called BSE SME, so it needs no translation.
 *
 * Before this existed the literal 'NSE SME' was retyped at six sites while the
 * admin form labelled the same toggle 'NSE Emerge' — the form and the site
 * disagreed about what an issue was listed on. Write through EXCHANGES, render
 * through exchangeLabel(), and never hand-type either string again.
 */
export const EXCHANGES = {
  nse: 'NSE',
  bse: 'BSE',
  /** stored value for NSE's SME platform — displayed as 'NSE SME' */
  nseSme: 'NSE Emerge',
  bseSme: 'BSE SME',
} as const;

/** The exchange list an issue is stored with, given its board. */
export function exchangesFor(sme: boolean, nse: boolean, bse: boolean): string[] {
  const out: string[] = [];
  if (nse) out.push(sme ? EXCHANGES.nseSme : EXCHANGES.nse);
  if (bse) out.push(sme ? EXCHANGES.bseSme : EXCHANGES.bse);
  return out;
}

/** Stored exchange value → the label shown to investors. Idempotent: a legacy
 *  row still holding 'NSE SME' passes through unchanged. */
export function exchangeLabel(v: string): string {
  const s = String(v ?? '').trim();
  return s === EXCHANGES.nseSme ? 'NSE SME' : s;
}

/** A stored exchange list, joined for display. */
export function exchangeLabels(list?: readonly string[] | null, sep = ' · '): string {
  return (list ?? []).map(exchangeLabel).filter(Boolean).join(sep);
}
