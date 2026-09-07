/**
 * Parse the NSE PREANCHOR / Security Parameters PDF into a JSON payload the
 * IPO entry form can consume field-for-field.
 *
 * PARSER DESIGN
 * -------------
 * The layout is stable across issues — NSE emits the same rows in the same
 * order — so this walks the extracted rows once, keying off known labels.
 * Every extractor is intentionally forgiving: a field the layout doesn't have
 * that day returns `undefined`, and the review UI shows "not found" rather
 * than blocking.
 *
 * Every value is TRIMMED to what the form expects — digits for numeric fields,
 * an ISO date for dates, a bare name for intermediaries — so the operator can
 * accept without post-editing.
 */
import { extractPdfText, findRow, valueAfterLabel, Row } from './extract-text';

export interface ParsedPreanchor {
  symbol?: string;
  name?: string;
  faceValue?: number;
  /**
   * mainboard / sme, from the doc title.
   * The first row of every NSE Security Parameters PDF names the segment
   * in parentheses: "…- EQ (Mainboard) IPO" or "…- EQ (SME) IPO". This
   * used to be a manual pick even though the PREANCHOR itself is explicit.
   */
  type?: 'mainboard' | 'sme';
  /**
   * NSE / BSE flags for the two exchange checkboxes.
   * Mainboard IPOs list dual (SEBI requires it); SME issues on an NSE
   * PREANCHOR are NSE Emerge and list on NSE only. Not extracted from the
   * document text — derived from `type`. The operator can still uncheck one.
   */
  exNse?: boolean;
  exBse?: boolean;
  /** ₹ Cr — converted from the doc's rupees/million/crore, whichever it uses */
  issueSizeCr?: number;
  /** Fresh issue amount in ₹ Cr — pulled from the same Issue size row. */
  freshIssueCr?: number;
  /** OFS amount in ₹ Cr — only present if the issue has an OFS component. */
  ofsCr?: number;
  priceBandMin?: number;
  priceBandMax?: number;
  lotSize?: number;
  tickSize?: number;
  /** the raw name extracted from the PDF. The endpoint enriches this into a
   *  master-matched ResolvedName before it reaches the client. */
  registrar?: string;
  leadManagers?: string[];
  sponsorBank?: string;
  /**
   * datetime-local strings ("YYYY-MM-DDTHH:MM"). PSL's bidding runs 10:00–17:00;
   * we combine the Issue Period dates with the times off the Bidding Timings
   * row so the form's datetime-local inputs actually accept the values —
   * plain YYYY-MM-DD strings get silently rejected by a datetime-local input.
   */
  openDate?: string;
  closeDate?: string;
  qibCloseDate?: string;
  upiMandateCutoff?: string;
  /**
   * Computed T+3 estimates. PREANCHOR does not carry these — they arrive in
   * the IPO Note. Auto-computed so the early-publish window (between
   * PREANCHOR and Note) has usable dates rather than blanks. The modal
   * warns these are estimates.
   */
  allotmentDate?: string;
  refundDate?: string;
  dematDate?: string;
  listingDate?: string;
  /**
   * Reservation share counts as printed on PREANCHOR page 2 — at the LOWER
   * price band, per the doc's own footnote. Feeds the Phase-B override
   * boxes so the record shows the NSE figures rather than our lot-floored
   * derivation.
   */
  reservation?: {
    qib?: number;
    hni?: number;      // NIB Big (above ₹10 L)
    hni2?: number;     // NIB Small (₹2–10 L)
    retail?: number;
    total?: number;
  };
  /** for the operator's information — not entered as a field today */
  subCategories?: string;
  upiSubCategories?: string;
  /** raw for debugging / the review UI */
  _raw?: { warnings: string[] };
}

/** Number-first from a string, returning null when nothing sensible is there. */
const num = (s: string | undefined | null): number | null => {
  if (!s) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

/**
 * Convert "6800 million" or "Rs. 680 crore" or "1,69,99,99,392" to ₹ Cr.
 *
 * NSE files use every unit — million, crore, or raw rupees — and sometimes
 * mix them within one document. We normalise to Cr because that is what the
 * form's issueSizeCr field wants.
 */
function amountToCr(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = num(s);
  if (n == null) return undefined;
  const lower = s.toLowerCase();
  if (/\bmillion\b|\bmn\b/.test(lower)) return Math.round(n / 10 * 100) / 100;      // 1 Cr = 10 million
  if (/\bcrore\b|\bcr\b/.test(lower)) return Math.round(n * 100) / 100;
  // bare number — assume raw rupees. 1 Cr = 1e7 rupees.
  return Math.round((n / 1e7) * 100) / 100;
}

/**
 * "Rs. 546/- to Rs. 575/- per Equity Share" → { min: 546, max: 575 }.
 * Also handles "Rs.546 - Rs.575" and "546-575".
 */
function priceBand(s: string | undefined): { min?: number; max?: number } {
  if (!s) return {};
  const nums = (String(s).match(/\d[\d,.]*/g) ?? []).map((x) => Number(x.replace(/,/g, '')));
  if (nums.length >= 2) return { min: nums[0], max: nums[1] };
  if (nums.length === 1) return { min: nums[0] };
  return {};
}

/** "31-Aug-2026" or "02-Sep-2026 (upto 4:00 P.M.)" → "2026-08-31". */
function isoDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})/);
  if (!m) return undefined;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const mi = months.indexOf(m[2].slice(0, 3).toLowerCase());
  if (mi < 0) return undefined;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}

/**
 * Combine an ISO date with a "(upto 4:00 P.M.)" or "(upto 5:00 P.M.)" suffix
 * into an ISO-local datetime the form's datetime-local input accepts.
 */
function isoDatetime(s: string | undefined): string | undefined {
  const date = isoDate(s);
  if (!date) return undefined;
  const t = s!.match(/(\d{1,2}):(\d{2})\s*(A\.?M|P\.?M)/i);
  if (!t) return `${date}T17:00`;                             // NSE's closing hour, sensible default
  let h = Number(t[1]); const mm = Number(t[2]); const ampm = t[3].replace(/\./g, '').toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${date}T${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Split "Axis Capital Limited and IIFL Capital Services Limited" on " and ". */
function splitLeads(s: string | undefined): string[] | undefined {
  if (!s) return undefined;
  return s.split(/\s+and\s+|,\s*/g).map((x) => x.trim()).filter(Boolean);
}

/**
 * Take the value after a label. Where the label ends the row (rare), also
 * look at the next row — some PREANCHOR issues (older format) wrap
 * long labels onto two lines and the value lands underneath.
 */
function labelValue<R extends Row>(rows: R[], label: string | RegExp): string | undefined {
  // findRow takes plain Row — every subtype (e.g. `Row & { pageIndex }`) is a
  // Row, so this cast is safe; the return still comes from the input array
  const row = findRow(rows as unknown as Row[], label) as R | undefined;
  if (!row) return undefined;
  const v = valueAfterLabel(row.text, label);
  if (v) return v;
  const i = (rows as Row[]).indexOf(row);
  return i >= 0 && i + 1 < rows.length ? rows[i + 1].text.trim() : undefined;
}

export async function parsePreanchor(pdf: Uint8Array | Buffer): Promise<ParsedPreanchor> {
  const doc = await extractPdfText(pdf);
  const rows = doc.flat;
  const warnings: string[] = [];

  const out: ParsedPreanchor = { _raw: { warnings } };

  out.symbol = labelValue(rows, 'Security symbol')?.split(/\s+/)[0]?.toUpperCase();
  out.name = labelValue(rows, 'Company Name');

  /*
   * Segment (Mainboard / SME) — the doc title itself carries it in
   * parentheses. "Security Parameters – X Limited – EQ (Mainboard) IPO"
   * for Mainboard, "…(SME) IPO" for SME issues. Reading the title is
   * simpler than deriving from issue size and can never disagree with
   * the exchange's own labeling.
   */
  {
    const titleRow = rows.find((r) => /Security Parameters\b/i.test(r.text));
    const m = titleRow?.text.match(/\(\s*(mainboard|sme)\s*\)/i);
    if (m) {
      out.type = m[1].toLowerCase() as 'mainboard' | 'sme';
      // Dual-listing is mandatory for Mainboard; SME on an NSE PREANCHOR
      // is NSE Emerge (BSE SME wouldn't produce an NSE PREANCHOR).
      out.exNse = true;
      out.exBse = out.type === 'mainboard';
    } else {
      warnings.push('Could not read the segment (Mainboard / SME) — check the document title.');
    }
  }

  /*
   * Issue size can wrap: "Initial Public offer comprising Fresh issue of
   * aggregating up to Rs." on one row, "6800 million" on the next. Read the
   * label row then look up to two rows down for the number-with-unit.
   *
   * We also parse the Fresh Issue and Offer for Sale amounts out of the
   * same block. The wording varies:
   *   "Fresh issue of aggregating up to Rs. 6800 million"                 (PSL — pure Fresh)
   *   "Fresh issue … Rs. X million and Offer for Sale of … Rs. Y million" (mixed)
   *   "Offer for Sale of aggregating up to Rs. X million"                 (pure OFS, rare)
   * Both amounts are optional; if either is present it becomes an override
   * on the form's Fresh/OFS block, so the operator does not type them
   * again. Ignoring an OFS row would default it to zero and misrepresent
   * the issue.
   */
  {
    const row = findRow(rows as unknown as Row[], 'Issue size');
    if (row) {
      const i = (rows as unknown as Row[]).indexOf(row);
      const combined = [rows[i]?.text, rows[i + 1]?.text, rows[i + 2]?.text, rows[i + 3]?.text]
        .filter(Boolean).join(' ');
      out.issueSizeCr = amountToCr(combined);
      if (out.issueSizeCr == null) warnings.push('Could not read the issue size — check the "Issue size" row.');
      const parts = parseFreshOfs(combined);
      out.freshIssueCr = parts.freshCr;
      out.ofsCr = parts.ofsCr;
    }
  }

  out.faceValue = num(labelValue(rows, 'Face Value')) ?? undefined;

  {
    const band = priceBand(labelValue(rows, /Price\s+(Range|Band)/i));
    out.priceBandMin = band.min;
    out.priceBandMax = band.max;
  }

  out.lotSize = num(labelValue(rows, 'Lot size')) ?? undefined;
  out.tickSize = num(labelValue(rows, 'Tick size')) ?? undefined;
  out.registrar = labelValue(rows, 'Registrar to Issue');
  out.leadManagers = splitLeads(labelValue(rows, 'Book Running Lead Managers'));
  out.sponsorBank = labelValue(rows, 'Sponsor Bank');
  out.subCategories = labelValue(rows, /^Subcategories\b/);
  out.upiSubCategories = labelValue(rows, /Sub[-\s]*Categories applicable for UPI/i);

  /*
   * The Issue Period is a single-row range: "31-Aug-2026 to 02-Sep-2026".
   * We split on "to" and treat each half. Then we look at the Bidding Timings
   * row to pull the open/close times ("10.00 A.M. to 5.00 P.M.") and stitch
   * them onto the dates — the form's inputs are datetime-local and silently
   * REJECT a plain YYYY-MM-DD value, so returning bare dates for open/close
   * would leave both fields blank in the browser (the bug sir hit).
   */
  {
    const period = labelValue(rows, 'Issue Period');
    if (period) {
      const [a, b] = period.split(/\s+to\s+/i);
      const openIso = isoDate(a);
      const closeIso = isoDate(b);
      if (!openIso || !closeIso) warnings.push('Could not read the Issue Period dates.');

      const timings = labelValue(rows, 'Bidding Timings') ?? '10.00 A.M. to 5.00 P.M.';
      const [openTime, closeTime] = parseTimeRange(timings);
      out.openDate = openIso ? `${openIso}T${openTime}` : undefined;
      out.closeDate = closeIso ? `${closeIso}T${closeTime}` : undefined;

      // Computed T+3 dates — SEBI schedule, allotment on T+1 business days,
      // refund/demat on T+2, listing on T+3. The modal marks these as
      // computed so the operator knows they are estimates, and the IPO Note
      // parser overwrites them with exact figures when it runs.
      if (closeIso) {
        out.allotmentDate = addBusinessDays(closeIso, 1);
        out.refundDate = addBusinessDays(closeIso, 2);
        out.dematDate = addBusinessDays(closeIso, 2);
        out.listingDate = addBusinessDays(closeIso, 3);
      }
    }
  }

  out.qibCloseDate = isoDatetime(labelValue(rows, /QIB and NIB Closure Date/i));
  out.upiMandateCutoff = isoDatetime(labelValue(rows, /Cut[-\s]*off time for UPI Mandate/i));

  out.reservation = parseReservationShares(rows);

  return out;
}

/**
 * Pull the Fresh Issue and Offer for Sale amounts out of the Issue size
 * block. The block reads variations like:
 *   "Fresh issue of aggregating up to Rs. 6800 million"                 (PSL — pure Fresh)
 *   "Fresh issue … Rs. X million and Offer for Sale of … Rs. Y million" (mixed)
 * We use amount-then-unit windows to keep the two figures from swapping
 * with the total issue size that also appears in the same paragraph.
 */
function parseFreshOfs(text: string): { freshCr?: number; ofsCr?: number } {
  const out: { freshCr?: number; ofsCr?: number } = {};
  // Fresh issue: the amount right after "Fresh issue" up to the next
  // sentence-ish break or the word "Offer".
  const fresh = text.match(/Fresh\s*(?:Issue|issue)[^.]*?Rs\.?\s*([\d,]+(?:\.\d+)?)\s*(million|mn|crore|cr)?/i);
  if (fresh) {
    const amount = `${fresh[1]} ${fresh[2] ?? 'million'}`;
    out.freshCr = amountToCr(amount);
  }
  // OFS: same shape after "Offer for Sale".
  const ofs = text.match(/Offer\s*for\s*Sale[^.]*?Rs\.?\s*([\d,]+(?:\.\d+)?)\s*(million|mn|crore|cr)?/i);
  if (ofs) {
    const amount = `${ofs[1]} ${ofs[2] ?? 'million'}`;
    out.ofsCr = amountToCr(amount);
  }
  return out;
}

/**
 * "10.00 A.M. to 5.00 P.M." → ["10:00", "17:00"]. Defaults if either half is
 * missing or the row is absent — every book-built issue bids 10-17.
 */
function parseTimeRange(s: string): [string, string] {
  const parts = s.split(/\s+to\s+/i);
  const to24 = (t: string | undefined, def: string): string => {
    if (!t) return def;
    const m = t.match(/(\d{1,2})[.:](\d{2})\s*(A\.?M|P\.?M)/i);
    if (!m) return def;
    let h = Number(m[1]); const mm = m[2]; const ampm = m[3].replace(/\./g, '').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${mm}`;
  };
  return [to24(parts[0], '10:00'), to24(parts[1], '17:00')];
}

/**
 * Add N business days (skip Sat/Sun). Deliberately does NOT reach into the
 * NSE holiday calendar — HOLIDAYS in shared-types is populated for a rolling
 * window and would go silent outside it, and this is an estimate the modal
 * calls out anyway. If the estimate is off by one for a specific issue's
 * holiday, the operator adjusts by hand or the IPO Note overwrites it.
 */
function addBusinessDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let added = 0;
  while (added < days) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    const dow = dt.getUTCDay();  // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) added++;
  }
  return dt.toISOString().slice(0, 10);
}

/**
 * Reservation share counts from page 2's category table.
 *
 * The table wraps oddly — rows are visually a single line but the extractor
 * emits them as several. We key off the label uniquely present in each row
 * (" QIB " / "NIB (Above" / "NIB (Between" / " Retail " / "Total Issue size")
 * and pick the FIRST comma-formatted number in the row or in the next few
 * rows — the number the label refers to always appears within three rows of
 * the label. Returns undefined for any category the parser cannot find.
 */
function parseReservationShares(rows: Row[]): NonNullable<ParsedPreanchor['reservation']> | undefined {
  const shares = /\d{1,3}(?:,\d{2,3})+/;   // Indian comma format, at least one grouping
  const nearNumber = (i: number): number | undefined => {
    for (let k = 0; k < 3 && i + k < rows.length; k++) {
      const m = rows[i + k].text.match(shares);
      if (m) return Number(m[0].replace(/,/g, ''));
    }
    return undefined;
  };
  const findNear = (label: RegExp): number | undefined => {
    for (let i = 0; i < rows.length; i++) if (label.test(rows[i].text)) return nearNumber(i);
    return undefined;
  };

  const out: NonNullable<ParsedPreanchor['reservation']> = {};
  // QIB row typically reads "1  QIB  93,40,660  No" — restrict to a
  // whitespace-bounded " QIB " so "QIB Portion" further down doesn't match.
  const qib = findNear(/\sQIB\s/);
  const hni = findNear(/NIB\s*\(Above/i);          // NIB Big
  const hni2 = findNear(/NIB\s*\(Between/i);       // NIB Small
  const retail = findNear(/\sRetail\s/);
  const total = findNear(/Total Issue size/i);
  if (qib) out.qib = qib;
  if (hni) out.hni = hni;
  if (hni2) out.hni2 = hni2;
  if (retail) out.retail = retail;
  if (total) out.total = total;
  return Object.keys(out).length ? out : undefined;
}
