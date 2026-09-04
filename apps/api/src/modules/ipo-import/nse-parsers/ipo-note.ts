/**
 * Parse an Axis-format IPO Note into the form fields it fills.
 *
 * PARSER SCOPE
 * ------------
 * Focused on what the IPO Note carries that PREANCHOR does NOT:
 *
 *   • Exact allotment / refund / demat / listing dates — the "Indicative
 *     Timetable" table on page 2. These OVERWRITE the T+3 estimates the
 *     PREANCHOR parser (Phase C.1) computes: the Note is the authoritative
 *     source once the merchant banker has published it.
 *
 *   • Post-issue implied market cap range.
 *
 *   • Three-year financial highlights — Equity Share Capital, Reserves,
 *     Net Worth, Total Borrowings, Revenue, Revenue Growth %, EBITDA,
 *     EBITDA Margin %, Net Profit, Net Profit Margin %, EPS, ROCE / RONW,
 *     NAV, three cash-flow rows. Rendered as an HTML table into
 *     `companyFinancials` — the form already treats that field as
 *     rich-text.
 *
 * The parser deliberately does NOT overwrite fields sir has already got
 * from PREANCHOR (symbol, name, price band, lot, lead managers,
 * registrar). PREANCHOR is authoritative for those (it is the exchange's
 * own document); the IPO Note re-states them and would only introduce
 * disagreements. If the operator wants those replaced they can be added
 * to the modal later; for now the review UI just leaves them alone.
 *
 * LAYOUT ASSUMPTIONS
 * ------------------
 * Verified against four Axis Notes (PSL / ESDS / Priority Jewels / Deepa)
 * — every one shares the same section headers and label vocabulary on
 * page 2. Other merchant bankers (JM, Nuvama, Kotak, ICICI) use their own
 * house styles and would need a separate parser; sir confirmed this is
 * Axis-specific.
 */
import { extractPdfText, Row } from './extract-text';

export interface ParsedIpoNoteFinancial {
  /** row label as printed — "Revenue from operations", etc. */
  label: string;
  /** period-end values in the order the table lists them, newest first */
  values: (string | null)[];
}

export interface ParsedIpoNote {
  /** exact dates from the Indicative Timetable — these OVERWRITE C.1 estimates */
  allotmentDate?: string;
  refundDate?: string;
  dematDate?: string;
  listingDate?: string;
  /** Post-issue implied market cap RANGE — usually "₹4,406 Cr – ₹4,604 Cr" */
  marketCap?: { min?: number; max?: number };
  /** period labels in the order the financial table lists them ("Mar' 2026", "Mar' 2025", ...) */
  financialPeriods?: string[];
  /** 3-year financial highlights, one row per line */
  financials?: ParsedIpoNoteFinancial[];
  /** rendered HTML table for form.companyFinancials — kept small and inline */
  financialsHtml?: string;
  _raw?: { warnings: string[] };
}

/* ── date parsers ────────────────────────────────────────────────────────
   The Indicative Timetable uses DD-MM-YYYY consistently across the four
   files we tested. If a future issue's Note uses a different format, add
   a parser branch here rather than making the regex looser — a permissive
   date regex is the fastest way to a wrong date. */
function isoFromDDMMYYYY(s: string): string | undefined {
  const m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/** Find the FIRST row whose text matches `label`, then the FIRST date
 *  in that row or the next two rows. Handles wrapped rows. */
function dateNear(rows: Row[], label: RegExp): string | undefined {
  for (let i = 0; i < rows.length; i++) {
    if (!label.test(rows[i].text)) continue;
    for (let k = 0; k < 3 && i + k < rows.length; k++) {
      const d = isoFromDDMMYYYY(rows[i + k].text);
      if (d) return d;
    }
  }
  return undefined;
}

/* ── financial-row parser ────────────────────────────────────────────────
   Each row is one label followed by three numbers (three fiscal years).
   Numbers use Indian formatting and negatives are printed as "(X)". */

/** Every plain-number metric that lives in the table — order preserved. */
const FIN_LABELS: RegExp[] = [
  /^Equity Share [Cc]apital/,
  /^Reserves\b/,
  /^Net Worth/,
  /^Total Borrowings/,
  /^Revenue from [Oo]perations/i,
  /^Revenue Growth/i,
  /^EBITDA\b(?!\s*Margin)/,
  /^EBITDA Margin/,
  /^Net Profit\b(?! Margin)/i,
  /^Net Profit\/? ?\(?Loss\)?\b(?! Margin)/i,
  /^Net Profit Margin/i,
  /^Net Profit\/? ?\(?Loss\)? Margin/i,
  /^EPS\b/i,
  /^Loss Per Share/i,
  /^R[oO][cC]?[eE]\b/,               // ROCE / RoCE / RONW / RoNW
  /^R[oO][nN][wW]\b/,
  /^NAV\b/i,
  /^Cash flow from operating/i,
  /^Cash flow from investing/i,
  /^Cash flow from financing/i,
];

const NUMBER = /\(?-?[\d,]+\.\d+%?\)?/g;

function normaliseNumber(s: string): string {
  return s.replace(/^\((.*)\)$/, '-$1').replace(/,/g, '');
}

/** Extract the three-year financial table from page 2's BRIEF FINANCIAL
 *  DETAILS section. Values are kept as strings so parentheses/percentage
 *  formatting displays as-is in the HTML render. */
function parseFinancials(rows: Row[]): { periods: string[]; rows: ParsedIpoNoteFinancial[] } | undefined {
  const startI = rows.findIndex((r) => /BRIEF FINANCIAL DETAILS/i.test(r.text));
  if (startI < 0) return undefined;

  // Period header — "As at Mar' 31, ... 2026 2025 2024" or with commas
  const years: string[] = [];
  for (let i = startI; i < Math.min(startI + 12, rows.length); i++) {
    const m = rows[i].text.match(/\b(20\d{2})\b/g);
    if (m && m.length >= 2) { years.push(...m); break; }
  }
  const periods = [...new Set(years)].slice(0, 3);   // dedup, keep first three

  const found: ParsedIpoNoteFinancial[] = [];
  const seen = new Set<string>();
  for (let i = startI; i < rows.length; i++) {
    const text = rows[i].text.trim();
    // find a matching label pattern
    const labelPattern = FIN_LABELS.find((p) => p.test(text));
    if (!labelPattern) continue;
    const label = text.match(labelPattern)![0];
    if (seen.has(label)) continue;             // already collected
    // numbers may sit on this row or wrap onto the next
    const nums: string[] = [];
    for (let k = 0; k < 2 && i + k < rows.length; k++) {
      const line = rows[i + k].text;
      const ms = line.match(NUMBER) ?? [];
      for (const m of ms) {
        // skip the label itself (a year like 2026) — pretty crude but the
        // section headers only contain plain 4-digit years without a decimal
        if (/^\d{4}$/.test(m)) continue;
        nums.push(m);
        if (nums.length >= 3) break;
      }
      if (nums.length >= 3) break;
    }
    if (!nums.length) continue;
    seen.add(label);
    found.push({
      label,
      values: nums.slice(0, 3).map(normaliseNumber),
    });
    // stop once we've hit the cash-flow financing row — anything after that
    // is footer prose that can look number-shaped
    if (/Cash flow from financing/i.test(label)) break;
  }
  return { periods, rows: found };
}

function renderFinancialsHtml(periods: string[], rows: ParsedIpoNoteFinancial[]): string {
  const cols = periods.length || rows[0]?.values.length || 3;
  const head = ['Particular', ...periods.slice(0, cols)].map((s) => `<th>${escape(s)}</th>`).join('');
  const body = rows.map((r) => {
    const cells = r.values.slice(0, cols).map((v) => `<td style="text-align:right">${escape(v ?? '—')}</td>`).join('');
    // if fewer values than columns, pad with dashes so the table stays rectangular
    const pad = Math.max(0, cols - r.values.length);
    return `<tr><th style="text-align:left">${escape(r.label)}</th>${cells}${'<td>—</td>'.repeat(pad)}</tr>`;
  }).join('');
  return `<p>Brief financial details (₹ in Cr)</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── market cap ──────────────────────────────────────────────────────── */
function parseMarketCap(rows: Row[]): ParsedIpoNote['marketCap'] {
  // Four sample formats seen across Axis Notes, all valid:
  //   "₹ 4,406 Cr - ₹ 4,604 Cr"          (PSL)
  //   "₹ 342 Cr - ₹ 360 Cr"              (Priority Jewels)
  //   "₹ 1,628 – 1,701 Cr"               (Deepa — one Cr, en-dash)
  //   "₹ 4,817 – 5,028 Cr"               (ESDS — one Cr, en-dash, on a text-wrap line)
  //
  // The line that carries the value is the FIRST one within a few rows of
  // "Post Issue Implied Market Cap:" that contains "Cr" (case-sensitive —
  // "Cr" the unit, not "cr" the word). Once we have that line we pull every
  // ₹-prefixed number OR every "number Cr" run out of it and min/max them.
  for (let i = 0; i < rows.length; i++) {
    if (!/Post Issue Implied Market Cap/i.test(rows[i].text)) continue;
    for (let k = 0; k < 4 && i + k < rows.length; k++) {
      const line = rows[i + k].text;
      if (!/\bCr\b/.test(line)) continue;
      // Match the phrase as a UNIT — a token-scavenging pass will grab
      // stray amounts from wrapping prose (ESDS row 17 has "₹472.21 crore"
      // in the sentence beside the actual cap). All three shapes below
      // start with ₹ and end at the "Cr" unit; either dash char is fine.
      // NB "crore" as a word does NOT match \bCr\b (case matters).
      const dash = '[-\\u2013\\u2014]';
      const num = '([\\d,]+(?:\\.\\d+)?)';
      const patterns: RegExp[] = [
        // ₹ X Cr - ₹ Y Cr    (PSL, Priority)
        new RegExp(`₹\\s*${num}\\s*Cr\\s*${dash}\\s*₹\\s*${num}\\s*Cr`),
        // ₹ X - Y Cr         (Deepa, ESDS — one Cr, either dash)
        new RegExp(`₹\\s*${num}\\s*${dash}\\s*${num}\\s*Cr`),
        // ₹ X Cr             (single-value fallback)
        new RegExp(`₹\\s*${num}\\s*Cr`),
      ];
      for (const p of patterns) {
        const m = p.exec(line);
        if (!m) continue;
        const nums = m.slice(1).filter(Boolean).map((s) => Number(s.replace(/,/g, '')));
        if (nums.length >= 2) return { min: Math.min(...nums), max: Math.max(...nums) };
        if (nums.length === 1) return { min: nums[0] };
      }
    }
  }
  return undefined;
}

/* ── the exported entry point ────────────────────────────────────────── */

export async function parseIpoNote(pdf: Uint8Array | Buffer): Promise<ParsedIpoNote> {
  const doc = await extractPdfText(pdf);
  const rows = doc.flat;
  const warnings: string[] = [];

  const out: ParsedIpoNote = { _raw: { warnings } };

  out.allotmentDate = dateNear(rows, /Finalisation of Basis of Allotment/i);
  out.refundDate = dateNear(rows, /Refunds\s*\/?\s*Unblocking/i);
  out.dematDate = dateNear(rows, /Credit of equity shares/i);
  out.listingDate = dateNear(rows, /Trading commences/i);

  if (!out.allotmentDate) warnings.push('Could not read the allotment date — check the Indicative Timetable.');
  if (!out.listingDate) warnings.push('Could not read the listing date — check the Indicative Timetable.');

  out.marketCap = parseMarketCap(rows);
  if (!out.marketCap) warnings.push('Could not read the market cap — the "Post Issue Implied Market Cap" row may not be present.');

  const fin = parseFinancials(rows);
  if (fin && fin.rows.length) {
    out.financialPeriods = fin.periods;
    out.financials = fin.rows;
    out.financialsHtml = renderFinancialsHtml(fin.periods, fin.rows);
  } else {
    warnings.push('Could not read the financial highlights — the BRIEF FINANCIAL DETAILS section may not be present.');
  }

  return out;
}
