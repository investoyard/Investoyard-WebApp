/**
 * Parse the Anchor Investor Intimation Letter into the roster the form
 * already accepts (`extra.anchors` — array of { name, shares, pct, amount })
 * plus the allocation-level totals (`anchorShares`, `anchorPrice`).
 *
 * PARSER SHAPE
 * ------------
 * Same framework as PREANCHOR (extract-text.ts). Different problem though —
 * this is a table, not a labelled form. The header sentence carries the two
 * totals ("finalized the allocation of X Equity Shares … Allocation Price of
 * ₹ Y per Equity Share"); the roster is one row per investor with four
 * numbers in a fixed order: shares, %, price, total ₹.
 *
 * We match the numeric tail with a regex — that pattern is what makes an
 * anchor row an anchor row — and take the text before it as the name. When
 * the name wraps (long fund names like "MOTILAL OSWAL DIGITAL INDIA FUND"
 * split across two rows), the numeric row can appear alone; we look one row
 * back and one row forward for the name text.
 *
 * We do NOT try to correct extraction artefacts like "IDPITER" for "JUPITER"
 * (character-substitution in some font subsets). The review UI shows what the
 * parser saw and the operator corrects it before saving — a silent auto-fix
 * would be worse than a visible wrong letter.
 */
import { extractPdfText, Row } from './extract-text';

export interface ParsedAnchorInvestor {
  name: string;
  shares: number;
  /** percentage of the anchor portion */
  pct: number;
  /** the allocation price for this row — should equal `allocationPrice` above */
  price: number;
  /** total ₹ = shares × price */
  amount: number;
  /** Master-matched canonical, filled by the parse endpoint after the parser
   *  itself has run — the parser stays pure and doesn't touch the DB. */
  master?: { id: string; name: string };
}

export interface ParsedAnchor {
  /** total anchor shares allocated (from the header sentence) */
  totalShares?: number;
  /** the allocation price the book struck at */
  allocationPrice?: number;
  /** ISO date the anchor investors bid — usually stated in the letter's
   *  header ("Anchor Investor Bidding Date …" / "allocation to Anchor
   *  Investors on …"). Left undefined when the header phrase is absent
   *  (form falls back to openDate − 1 business day). */
  anchorDate?: string;
  /** the roster in the order it appears in the letter */
  investors: ParsedAnchorInvestor[];
  _raw?: { warnings: string[] };
}

/** DD-MM-YYYY OR "15 October, 2025" / "15th October 2025" → ISO. Returns
 *  undefined when nothing recognisable is in the input. */
function extractIsoDate(text: string): string | undefined {
  const dm = text.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  const MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const wm = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)[,\s]+(\d{4})/i);
  if (wm) {
    const mm = MONTHS[wm[2].toLowerCase()];
    if (mm) return `${wm[3]}-${mm}-${wm[1].padStart(2, '0')}`;
  }
  return undefined;
}

/** Number-first from a comma-formatted string. */
const num = (s: string): number => Number(s.replace(/,/g, ''));

/**
 * A row is a data row when its tail matches `shares  %  price  total`. The
 * matches allow decimals in the price (429.00) and total (44,00,01,276.00),
 * and the shares/percentage are always whole/decimal. Anchoring at end of
 * string (`$`) is what stops us from matching the paragraph "allocation of
 * 53,21,739 Equity Shares…" as a roster row.
 */
const TAIL = /(\d[\d,]*)\s+(\d+(?:\.\d+)?)%\s+([\d,]+\.\d{1,2})\s+([\d,]+\.\d{1,2})\s*$/;

/**
 * Some rows carry ONLY the numeric tail — the row above (and possibly the
 * row below) holds the fund name. Combine up to two adjacent rows so the
 * regex sees the full tail even if the row order is off.
 */
/**
 * Strip the leading Sr No, in any of the forms the letters actually use:
 * "1.  MOTILAL …", "10) …", or bare "2   IDPITER …" — the "." or ")" is
 * inconsistently present in the extraction and gets dropped by some subset
 * fonts. The 2+ spaces after the digit is what distinguishes an Sr No from
 * a name that legitimately begins with a digit (e.g. "3M Corp") — the Sr No
 * sits in its own column, so there is always a column gap after it.
 */
function stripSrNo(name: string): string {
  return name.replace(/^\s*\d{1,3}(?:[.)])?\s{2,}/, '').trim();
}

/** A name matches another when they normalise to the same key. */
function normName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 30);
}

export async function parseAnchor(pdf: Uint8Array | Buffer): Promise<ParsedAnchor> {
  const doc = await extractPdfText(pdf);
  const rows = doc.flat;
  const warnings: string[] = [];

  const out: ParsedAnchor = { investors: [], _raw: { warnings } };

  /* ── header: total anchor shares + allocation price ───────────────────── */

  // The header sentence usually spans 2-3 rows. Join the first 25 rows into
  // one string for the regex — the letters we have both have this well
  // inside that window.
  const header = rows.slice(0, 25).map((r) => r.text).join(' ');
  const totalMatch = header.match(/allocation of\s+([\d,]+)\s+Equity Shares/i);
  if (totalMatch) out.totalShares = num(totalMatch[1]);
  else warnings.push('Could not read the total allocated shares — check the header paragraph.');

  // The rupee symbol renders as "₹" in some PDFs and as "~" or nothing in
  // subset fonts, so we tolerate any of them and even a bare number.
  const priceMatch = header.match(/Allocation Price of\s*[~₹]?\s*(\d+(?:\.\d+)?)/i);
  if (priceMatch) out.allocationPrice = num(priceMatch[1]);
  else warnings.push('Could not read the allocation price — check the header paragraph.');

  // Anchor date — the letters phrase it as either
  //   "Anchor Investor Bidding Date … 15-10-2025"
  //   "allocation of … Equity Shares … on 15th October, 2025 to the Anchor Investors"
  // Search a slightly wider window (whole doc) because some letters push
  // this line below the 25-row header.
  const fullHead = rows.slice(0, 80).map((r) => r.text).join(' ');
  const dateCtx = fullHead.match(/Anchor(?:\s+Investor)?\s+(?:Bidding|Bid)\s*Date[^.\n]{0,60}/i)
    ?? fullHead.match(/on\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+[,\s]+\d{4})\s+to\s+(?:the\s+)?Anchor/i)
    ?? fullHead.match(/Anchor[^.\n]{0,120}?(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i);
  if (dateCtx) {
    const iso = extractIsoDate(dateCtx[0]);
    if (iso) out.anchorDate = iso;
    else warnings.push('Found the anchor-date phrase but could not read the date — check the header.');
  }

  /* ── roster rows ─────────────────────────────────────────────────────── */

  /*
   * The letter often carries the same table more than once — one copy per
   * exchange (BSE + NSE + a summary), or a second listing after "Confirmed
   * Anchor". Every appearance passes the numeric-tail test, so a naïve pass
   * multiplies the roster. Deduplicate by (normalised name, share count).
   */
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const m = row.text.match(TAIL);
    if (!m) continue;

    // Text BEFORE the numeric tail is the name candidate on this row
    const before = row.text.slice(0, row.text.length - m[0].length).trim();
    let name = stripSrNo(before);

    /*
     * If the name candidate is empty (or just a stray "SUB-CATEGORIES" label
     * fragment), the fund name lives on the row above and possibly the row
     * BELOW too — long fund names that wrap the row above the numbers can
     * have a "part 2" underneath, e.g. QUANT MUTUAL FUND … / <numbers> /
     * SHORT FUND. Look one row back, then one row forward, joining anything
     * that looks like text rather than a table header.
     */
    if (!name || name.length < 3) {
      const above = i > 0 ? stripSrNo(rows[i - 1].text) : '';
      const below = i < rows.length - 1 ? stripSrNo(rows[i + 1].text) : '';
      // treat a row as name-continuation when it has no digits and no ':'
      const looksLikeName = (s: string) => !!s && !/\d/.test(s) && !/[:=]/.test(s);
      if (looksLikeName(above) && looksLikeName(below)) name = `${above} ${below}`.replace(/\s+/g, ' ').trim();
      else if (looksLikeName(above)) name = above;
      else if (looksLikeName(below)) name = below;
      // fall through: name stays empty and the row is skipped
    }

    if (!name) { warnings.push(`Row with tail "${m[0]}" had no name — skipped.`); continue; }

    const shares = num(m[1]);
    const key = `${normName(name)}:${shares}`;
    if (seen.has(key)) continue;                 // silent — every letter has duplicates
    seen.add(key);

    /*
     * Stop once the running total has caught up with the header. The letters
     * repeat the table across the BSE and NSE addressees, and extractor
     * artefacts ("FLEX!" for "FLEXI", a truncated share count) dodge the
     * (name, shares) dedup — but they only ever appear in the SECOND copy.
     * Cutting off once the sum matches the authoritative header total drops
     * both duplicate copies AND the noisy tail rows in one line.
     *
     * Only applied when totalShares is known — if the header sentence failed
     * to parse we keep everything and let the operator review it.
     */
    const runningTotal = out.investors.reduce((a, x) => a + x.shares, 0) + shares;
    if (out.totalShares != null && runningTotal > out.totalShares) {
      // this row would push us OVER the header — it's a duplicate/noise; stop
      break;
    }

    out.investors.push({
      name,
      shares,
      pct: Number(m[2]),
      price: Number(m[3].replace(/,/g, '')),
      amount: num(m[4]),
    });

    if (out.totalShares != null && runningTotal === out.totalShares) break;
  }

  /*
   * A sanity check for the operator's benefit — if the roster's total doesn't
   * match the header, one of the two is wrong. This surfaces in the review UI
   * and the operator decides which to trust.
   */
  if (out.totalShares != null && out.investors.length) {
    const sum = out.investors.reduce((a, x) => a + x.shares, 0);
    if (Math.abs(sum - out.totalShares) > 1) {
      warnings.push(
        `Roster totals ${sum.toLocaleString('en-IN')} shares; header says ${out.totalShares.toLocaleString('en-IN')}. `
        + `A ${Math.abs(sum - out.totalShares).toLocaleString('en-IN')}-share gap needs a look.`,
      );
    }
  }

  return out;
}
