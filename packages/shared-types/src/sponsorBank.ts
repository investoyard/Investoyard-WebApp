/**
 * An issue's sponsor banks, from the one free-text field they have always
 * lived in (`extra.sponsorBank`).
 *
 * SEBI allows several sponsor banks per issue and real records carry three, so
 * the field is plural and has been written by hand for 60 issues in whatever
 * form the offer document used:
 *
 *   "Kotak Mahindra Bank Limited and HDFC Bank Limited"
 *   "Axis Bank Limited, HDFC Bank Limited and ICICI Bank Limited"
 *   "Axis Bank, HDFC Bank Ltd"
 *   " KOTAK BANK"                     ← leading space, caps
 *
 * This lives here because the ADMIN FORM and the UNBLOCK EMAIL must agree
 * exactly: the form ticks a box when a master name is present, and the API
 * routes the investor's request to the banks it finds. A second parser would
 * mean the form showing a bank as selected while the email never reaches it.
 *
 * KNOWN LIMIT: splitting on the word "and" would break a bank whose own name
 * contains it. No Indian sponsor bank does, and the alternative — not splitting
 * — loses the second bank on half the records. Revisit if one ever appears.
 */

/** Split the stored field into individual bank names. Order is preserved. */
export function sponsorBankNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = String(raw)
    // commas, semicolons, ampersands and a standalone "and" all separate names
    .split(/\s*(?:,|;|&|\sand\s)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue; // "Axis Bank, Axis Bank" is one bank
    seen.add(k);
    out.push(p);
  }
  return out;
}

export interface SponsorBankRow {
  name: string;
  email?: string | null;
  active?: boolean;
}

export interface SponsorBankMatch {
  /** master rows matched to this issue's names, in the issue's order */
  matched: Array<{ name: string; email: string }>;
  /** names with no ACTIVE master row at all */
  unknown: string[];
  /** names that matched a row holding no email */
  noEmail: string[];
}

/**
 * Match an issue's sponsor-bank names against the master.
 *
 * Case- and whitespace-insensitive, because the stored values were typed by
 * hand: `" KOTAK BANK"` has to find `Kotak Bank`. It does NOT guess beyond
 * that — `"KOTAK BANK"` will not match `"Kotak Mahindra Bank Limited"`, and it
 * must not: inventing a match would email a bank about an issue it never
 * sponsored. An unmatched name is REPORTED so an operator can fix the master or
 * the issue, which is a data problem with an owner rather than a silent miss.
 */
export function matchSponsorBanks(
  raw: string | null | undefined,
  master: SponsorBankRow[],
): SponsorBankMatch {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const byName = new Map<string, SponsorBankRow>();
  for (const m of master) {
    if (m.active === false) continue;
    byName.set(norm(m.name), m);
  }

  const matched: Array<{ name: string; email: string }> = [];
  const unknown: string[] = [];
  const noEmail: string[] = [];
  for (const n of sponsorBankNames(raw)) {
    const row = byName.get(norm(n));
    if (!row) { unknown.push(n); continue; }
    const email = String(row.email ?? '').trim();
    if (!email) { noEmail.push(row.name); continue; }
    matched.push({ name: row.name, email });
  }
  return { matched, unknown, noEmail };
}
