/**
 * Resolving a stored intermediary NAME to a master row.
 *
 * IPOs snapshot the registrar and lead managers as text, on purpose: a 2016
 * issue genuinely had Karvy as its registrar, and rewriting that to KFin would
 * state a firm that did not exist at the time. So the stored name stays
 * truthful and resolution happens on the way OUT — for dropdowns, filters and
 * reports.
 *
 * Two mechanisms, and the split matters:
 *
 *   normalise()  handles the same firm spelled differently — case, spacing,
 *                punctuation, "Pvt" vs "Private", and the suffix noise every
 *                Indian company name carries. No judgement involved.
 *
 *   ALIASES      handles a firm that CHANGED ITS NAME, where the old and new
 *                share no words at all and no amount of normalising will
 *                connect them. Each entry is a fact about the market, not a
 *                spelling rule, so each is listed and attributed.
 */

/**
 * Suffix and filler words that carry no identity.
 *
 * The run-together forms are listed too. Operators type "PrivateLimited" and
 * "PvtLtd" without the space, and a `\b`-anchored alternation treats those as
 * one unknown word rather than two suffixes — which is enough to stop a name
 * matching its own master.
 */
const NOISE = /\b(PRIVATELIMITED|PVTLTD|PRIVATELTD|LIMITED|LIMTED|LTD|PVT|PRIVATE|PRIAVTE|P|CO|COMPANY|CORPORATE|SERVICES|SERVICE|TECHNOLOGIES|TECHNOLOGY|INDIA|INDIAN|THE|AND)\b/g;

/**
 * A name reduced to something comparable. Deliberately aggressive: it must pull
 * "Link Intime India Pvt. Ltd.", "Linkintime India Private Limited" and
 * "LINK INTIME INDIA PRIVATE LIMITED" onto the same string.
 */
export function normalise(name: unknown): string {
  return String(name ?? '')
    .toUpperCase()
    .replace(/\(.*?\)/g, ' ')        // "(formerly known as …)" is not identity
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Renames and the misspellings that normalising cannot reach.
 *
 * Keyed by the NORMALISED stored name, valued with the normalised master name.
 * Confirmed by the operator (2026-08-31): Link Intime is now MUFG Intime, and
 * Karvy became KFin Technologies.
 */
export const MASTER_ALIASES: Record<string, string> = {
  // ── renames ──────────────────────────────────────────────────────────────
  LINKINTIME: 'MUFGINTIME',      // Link Intime India → MUFG Intime India
  KARVYCOMPUTERSHARE: 'KFIN',    // Karvy Computershare → KFin Technologies
  KARVYCOMPUTERSHARE2: 'KFIN',   // "Karvy Computer Share" normalises apart
  KARVYFINTECH: 'KFIN',          // Karvy Fintech → KFin Technologies
  KARVY: 'KFIN',

  // ── misspellings in the source data that normalising cannot repair ───────
  LINKINIME: 'MUFGINTIME',       // "Link Inime India Private limited"
  BISHARE: 'BIGSHARE',           // "Bishare Services Private Limited"
  BIGSHARES: 'BIGSHARE',
  KFINTECHNOLOGIES: 'KFIN',
  PURVASHAREREGISTRY: 'PURVASHAREGISTRY',
  PURVASHAREGISTRY1: 'PURVASHAREGISTRY',
  ALANKITASSIGNMENT: 'ALANKITASSIGNMENTS',
};

export interface MasterLike { name: string; shortCode?: string | null }

/**
 * Resolve a stored name to one of `masters`, or null.
 *
 * Tries the exact normalised form, then the alias table, then a containment
 * check for the cases where one side carries extra words the other does not.
 * Containment is last and requires 5+ characters, so short names cannot
 * collide with everything.
 */
export function resolveMaster<T extends MasterLike>(stored: unknown, masters: T[]): T | null {
  const want = normalise(stored);
  if (!want) return null;

  const byNorm = new Map<string, T>();
  for (const m of masters) byNorm.set(normalise(m.name), m);

  const exact = byNorm.get(want);
  if (exact) return exact;

  const aliased = MASTER_ALIASES[want];
  if (aliased && byNorm.get(aliased)) return byNorm.get(aliased)!;

  if (want.length >= 5) {
    for (const [key, m] of byNorm) {
      if (key.length >= 5 && (key.startsWith(want) || want.startsWith(key))) return m;
    }
  }
  return null;
}
