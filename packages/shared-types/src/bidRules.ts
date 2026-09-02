/**
 * Who may change a bid once it is placed — SEBI ICDR, not our preference.
 *
 * A Retail Individual Investor may revise a bid up OR down, and may withdraw
 * it, right up to the issue close. A Non-Institutional Investor and a QIB may
 * revise only UPWARD and may not withdraw at all. That single rule governs both
 * the Edit button (Retail gets no floor, HNI is floored at its current
 * quantity) and the Cancel button (blocked for NII/QIB once the bid is at the
 * exchange).
 *
 * It lives here rather than in either app because both need it and they must
 * not disagree: the admin screen reads it to disable a control, and the API
 * reads it to refuse the request. A guard enforced only in the UI is not a
 * guard.
 *
 * NOTE: a bid that never reached the exchange is OUR record and nothing else.
 * Cancelling one is housekeeping, allowed for every category — see
 * `mayCancel()`, which takes that into account and is the function callers
 * should use.
 */

export type BidRights = {
  /** may revise the quantity downward */
  mayLower: boolean;
  /** may withdraw the bid outright */
  mayWithdraw: boolean;
  /** the wording shown when an action is refused */
  reason?: string;
};

/**
 * Category strings reach us in several shapes — our own bid engine writes
 * `retail` / `shni` / `bhni`, the exchanges answer with `IND` / `NII` / `QIB`,
 * and the live table currently holds both `Retail` and `IND`. Normalise before
 * deciding anything.
 */
export function normaliseBidCategory(category: string | null | undefined): string {
  const c = String(category ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!c) return '';
  if (['retail', 'rii', 'ind', 'individual', 'r'].includes(c)) return 'retail';
  if (['shni', 'snii', 'hni2', 'nii', 'nib', 'hni', 'bhni', 'bnii'].includes(c)) return 'nii';
  if (['qib', 'anchor'].includes(c)) return 'qib';
  if (['shareholder', 'employee', 'emp', 'sh'].includes(c)) return 'reserved';
  return c;
}

const INSTITUTIONAL_REFUSAL =
  'SEBI does not permit an HNI or QIB bid to be lowered or withdrawn once it is with the exchange. '
  + 'It may only be revised upward.';

/**
 * What this category is allowed to do.
 *
 * `reserved` — the shareholder and employee portions — is treated as retail
 * here. Those portions are reserved for individuals, and SEBI's restriction is
 * aimed at QIB and NII. **Worth a counsel confirmation** before it decides a
 * real cancellation; it is called out rather than buried because getting it
 * wrong in the permissive direction lets through something the exchange will
 * refuse.
 */
export function bidRights(category: string | null | undefined): BidRights {
  const c = normaliseBidCategory(category);
  if (c === 'nii' || c === 'qib') {
    return { mayLower: false, mayWithdraw: false, reason: INSTITUTIONAL_REFUSAL };
  }
  // retail, the reserved portions, and anything unrecognised
  return { mayLower: true, mayWithdraw: true };
}

/**
 * May this quantity change be made?
 *
 * Raising is always allowed. Lowering is the regulated direction, and only for
 * a bid that is actually at the exchange — see `mayCancel` for why that
 * distinction matters.
 */
export function mayReviseTo(
  category: string | null | undefined,
  currentQty: number,
  nextQty: number,
  atExchange = true,
): { ok: boolean; reason?: string } {
  if (!(nextQty > 0)) return { ok: false, reason: 'Enter a quantity greater than zero.' };
  if (nextQty >= currentQty) return { ok: true };
  if (!atExchange) return { ok: true };
  const r = bidRights(category);
  return r.mayLower ? { ok: true } : { ok: false, reason: r.reason };
}

/**
 * May this bid be cancelled?
 *
 * The operator's rule, and the reason this takes `atExchange`: a bid we have
 * not posted yet exists only in our database, so withdrawing it is our own
 * bookkeeping and no regulation applies. Once it is with the exchange the
 * category decides.
 */
export function mayCancel(
  category: string | null | undefined,
  atExchange: boolean,
): { ok: boolean; reason?: string } {
  if (!atExchange) return { ok: true };
  const r = bidRights(category);
  return r.mayWithdraw ? { ok: true } : { ok: false, reason: r.reason };
}
