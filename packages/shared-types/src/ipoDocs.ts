/**
 * Offer-document types: which are public, and what to call them.
 *
 * TWO SURFACES RENDER THESE AND BOTH GOT IT WRONG IN THEIR OWN WAY, which is
 * why it lives here:
 *
 *  • Web printed `d.type` raw, so a row stored as `"rhp"` read as lowercase
 *    "rhp" beside one stored as `"RHP"` from the admin form.
 *  • Mobile kept a FOUR-ENTRY label map and used it as the FILTER, so a
 *    document typed `Financials` or `Other` was dropped from the page
 *    altogether rather than shown with a plain label.
 *
 * The admin form offers RHP · DRHP · Prospectus · Anchor allocation ·
 * Financials · Other (`DOC_TYPES` in IpoForm.tsx), and the Excel importer and
 * older records carry lowercase variants. An UNKNOWN type is labelled, never
 * dropped: the operator attached it deliberately, and an investor is better
 * served by a row they can open than by silence.
 */

/** Types that are OURS, not the issuer's — ASBA print blanks the operator uploads. */
const INTERNAL_PREFIX = 'asba_form';

/**
 * Is this document for the public detail page?
 *
 * The internal ASBA blanks are operator assets used by the print engine and
 * must never appear on a public page. One predicate so the section gate, the
 * nav entry and the list cannot disagree about what is publishable.
 */
export function isPublicDoc(d: { type?: string | null; url?: string | null }): boolean {
  if (!d?.url) return false;
  return !String(d.type ?? '').toLowerCase().startsWith(INTERNAL_PREFIX);
}

/** Exact labels for the types we know; anything else is title-cased. */
const KNOWN: Record<string, string> = {
  rhp: 'RHP',
  drhp: 'DRHP',
  prospectus: 'Prospectus',
  'anchor allocation': 'Anchor allocation',
  anchor: 'Anchor allocation',
  financials: 'Financials',
  other: 'Other document',
  rhpaddendum: 'RHP addendum',
  'rhp addendum': 'RHP addendum',
  addendum: 'Addendum',
};

/**
 * What to show the reader for a stored document type.
 *
 * `RHP` and `DRHP` stay upper-case because they are acronyms and that is how
 * every offer document, exchange page and investor refers to them — title-case
 * "Rhp" would read as a typo.
 */
export function docLabel(type?: string | null): string {
  const raw = String(type ?? '').trim();
  if (!raw) return 'Document';
  const k = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (KNOWN[k]) return KNOWN[k];
  // Unknown: title-case each word, but keep an all-caps token as an acronym.
  return k
    .split(' ')
    .map((w) => (raw.includes(w.toUpperCase()) && w.length <= 5 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
