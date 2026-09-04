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
  /** ₹ Cr — converted from the doc's rupees/million/crore, whichever it uses */
  issueSizeCr?: number;
  priceBandMin?: number;
  priceBandMax?: number;
  lotSize?: number;
  tickSize?: number;
  registrar?: string;
  /** the whole free-text list; the form splits it on ' and ' / ',' */
  leadManagers?: string[];
  sponsorBank?: string;
  openDate?: string;      // ISO
  closeDate?: string;
  qibCloseDate?: string;
  upiMandateCutoff?: string;
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
   * Issue size can wrap: "Initial Public offer comprising Fresh issue of
   * aggregating up to Rs." on one row, "6800 million" on the next. Read the
   * label row then look up to two rows down for the number-with-unit.
   */
  {
    // findRow's return type is the plain Row — treat `rows` as such for the
    // index lookup; every subtype (Row & { pageIndex }) is a Row
    const row = findRow(rows as unknown as Row[], 'Issue size');
    if (row) {
      const i = (rows as unknown as Row[]).indexOf(row);
      const combined = [rows[i]?.text, rows[i + 1]?.text, rows[i + 2]?.text].filter(Boolean).join(' ');
      out.issueSizeCr = amountToCr(combined);
      if (out.issueSizeCr == null) warnings.push('Could not read the issue size — check the "Issue size" row.');
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
   * We split on "to" and treat each half.
   */
  {
    const period = labelValue(rows, 'Issue Period');
    if (period) {
      const [a, b] = period.split(/\s+to\s+/i);
      out.openDate = isoDate(a);
      out.closeDate = isoDate(b);
      if (!out.openDate || !out.closeDate) warnings.push('Could not read the Issue Period dates.');
    }
  }

  out.qibCloseDate = isoDatetime(labelValue(rows, /QIB and NIB Closure Date/i));
  out.upiMandateCutoff = isoDatetime(labelValue(rows, /Cut[-\s]*off time for UPI Mandate/i));

  return out;
}
