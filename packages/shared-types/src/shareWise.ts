/**
 * Share-wise row LABELS and the anchor footnote — the two pieces of wording
 * that sit on top of `subscriptionTable()`'s figures.
 *
 * WHY THEY ARE HERE RATHER THAN AT EACH RENDER SITE. `subscriptionTable`
 * deducts the anchor from QIB and has returned `anchorDeducted` / `anchorBasis`
 * since 2026-09-21, but the SENTENCE explaining that, and the `(Ex. Anchor)`
 * suffix that makes the number explain itself, were hand-written at every place
 * that drew the table — two copies on web by 2026-10-22, and mobile carried
 * NEITHER, so a phone showed a QIB book short by the anchor with nothing on the
 * screen to say why.
 *
 * This codebase has paid for that shape repeatedly: four byte-identical status
 * palettes, four readers of `sharesUpper` with two contradicting the documented
 * convention, and a fourth hand-written copy of the Application-wise row filter
 * that had already silently dropped a category from every shared image. A third
 * copy of this wording was the obvious next instalment.
 *
 * The NUMBER FORMAT is deliberately NOT fixed here. Web prints the full en-IN
 * grouping (`1,49,08,220`) in a footnote with a whole line to itself; a phone
 * has far less room and reads the compact `1.49 Cr`. The wording is the thing
 * that must not drift — how a surface writes an integer is the surface's.
 */

import type { AnchorBasis } from './ipoDerive';

/**
 * The order a Share-wise table lists its categories in.
 *
 * QIB first, then the `nii` subtotal with its two bands indented beneath it,
 * then Retail and the reserved quotas. The API returns its own order, which
 * puts the synthetic `nii` roll-up AFTER Retail — where a flat list reads it
 * as one more category rather than as the subtotal of the two rows above.
 *
 * An unknown key sorts last rather than first: a category we do not carry is
 * not a category to lead with.
 */
export const SHARE_ORDER: Record<string, number> = { qib: 0, nii: 1, hni: 2, hni2: 3, retail: 4, employee: 5, shareholder: 6, policyholder: 7 };

/** `rows` in SHARE_ORDER. Returns a new array; the input is left alone. */
export function orderShareRows<T extends { key?: string }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => (SHARE_ORDER[a.key ?? ""] ?? 99) - (SHARE_ORDER[b.key ?? ""] ?? 99));
}

/** The minimum a row needs for `shareWiseLabel` — a key and its own label. */
export interface LabelledRow {
  key?: string;
  cat: string;
}

/**
 * What this row is CALLED in a Share-wise table.
 *
 * Two substitutions, and both are about not misleading a reader comparing our
 * table against the issue's own reservation table:
 *
 *   `nii`  → "HNI". It is the API's synthetic combined bucket sitting ABOVE the
 *            two split rows, so it reads as their subtotal rather than as a
 *            third peer whose multiple cannot be reconciled with them.
 *
 *   `qib`  → "QIB (Ex. Anchor)", but ONLY when a deduction was actually taken.
 *            On a record carrying no anchor figure the Book Size IS gross and
 *            the suffix would be a lie — which is the same reason the footnote
 *            below has a third branch instead of printing "Net" unconditionally.
 */
export function shareWiseLabel(row: LabelledRow, anchorDeducted = 0): string {
  if (row.key === 'nii') return 'HNI';
  if (row.key === 'qib' && anchorDeducted > 0) return 'QIB (Ex. Anchor)';
  return row.cat;
}

/** True when the row is one of the two HNI bands nested under the `nii` subtotal. */
export function isHniSubRow(row: LabelledRow): boolean {
  return row.key === 'hni' || row.key === 'hni2';
}

/**
 * The footnote under a Share-wise table — ONE of three sentences, never a
 * generic "Net".
 *
 * THE THREE STATES ARE NOT A GRADIENT, they are different claims about what is
 * known. A deduction taken from a stated share count (or a fully-priced anchor
 * roster) is the ALLOTMENT off the intimation letter and can be checked against
 * the exchange. One taken from `anchorPct` is our own arithmetic against a
 * CEILING the issue may not have used — an anchor book can close under 60%, so
 * an estimate is an upper bound and not a figure. Saying "Net (post anchor)" for
 * both was false on five of the six issues open on 2026-09-23.
 *
 * `fmt` formats the share count; the default is the full en-IN grouping.
 */
export function anchorNote(
  anchorDeducted: number,
  anchorBasis: AnchorBasis,
  fmt: (n: number) => string = (n) => Math.round(n).toLocaleString('en-IN'),
): string {
  if (!(anchorDeducted > 0)) {
    return 'QIB Book Size is Gross — the anchor allocation is not on this record yet.';
  }
  if (anchorBasis === 'estimated') {
    return `QIB Book Size EXCLUDES the anchor portion of ${fmt(anchorDeducted)} shares, which is ESTIMATED from the reserved percentage rather than the allotment.`;
  }
  return `QIB Book Size EXCLUDES the anchor portion of ${fmt(anchorDeducted)} shares, from the actual anchor allotment.`;
}
