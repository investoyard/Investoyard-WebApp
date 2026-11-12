/**
 * The issue size, in CRORE — one resolver, because the field it reads means
 * different things on different surfaces.
 *
 * THE FIELD CALLED `issueSize` IS NOT A NUMBER IN THE BROWSER. The /ipos list
 * endpoint serves it ALREADY FORMATTED — "₹30,213 Cr" — so `Number()` is NaN
 * on every record and a naive read renders a dash under the label. The COLUMN
 * behind it is rupees, which is what every note about it describes; what
 * reaches the browser is not the column. `issueSizeCr` is the number.
 *
 * Resolved in that order, with the formatted string parsed only as a last
 * resort and CARRYING ITS OWN UNIT: a value with "Cr" on it is crore, a bare
 * numeric string is the rupee column. Getting that backwards is a 10^7 error.
 *
 * IT LIVES HERE RATHER THAN IN A COMPONENT because it was written inside
 * `FeaturedIpoModal.tsx`, where nothing else could reach it and no test could
 * run against it — the shape that has already cost this codebase four readers
 * of `sharesUpper` disagreeing about a convention and three mappers into
 * `computeIssue`. The second caller is what forced the move: a copy of a
 * resolver whose own docblock warns about a 10^7 error is not a copy to make.
 */

type AnySized = {
  issueSize?: unknown;
  issueSizeCr?: unknown;
  extra?: { issueSizeCr?: unknown } | null;
} | null | undefined;

/** Crore, rounded, or null when the record carries no usable figure. */
export function issueSizeCrore(ipo: AnySized): number | null {
  const cr = Number((ipo as { issueSizeCr?: unknown })?.issueSizeCr ?? ipo?.extra?.issueSizeCr);
  if (Number.isFinite(cr) && cr > 0) return Math.round(cr);

  const raw = ipo?.issueSize;
  /* a NUMBER here is the rupee column, so it divides by a crore */
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw / 1e7);
  if (typeof raw === 'string') {
    const n = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    /* THE UNIT COMES FROM THE STRING, never from where it was read */
    return /cr/i.test(raw) ? Math.round(n) : Math.round(n / 1e7);
  }
  return null;
}

/** "₹48 Cr", or null — the form a dense table wants. */
export function issueSizeLabel(ipo: AnySized): string | null {
  const cr = issueSizeCrore(ipo);
  return cr == null ? null : `₹${cr.toLocaleString('en-IN')} Cr`;
}
