/**
 * The Partner bid API's rules, pure and tested (Phase 2, 2026-11-20).
 *
 * A partner sends final bid terms for a client we have never met. Everything
 * our own apply screen enforces is enforced here too — on the server, before
 * anything is written — because a partner integration is exactly the caller
 * that never sees our screen. Kept in shared-types so the API applies these
 * rules and the docs can quote them from one place.
 *
 * WHAT A UPI BID CAN BE. The mandate is capped at ₹5 lakh (`UPI_MANDATE_MAX`),
 * so a big-HNI bid (above ₹10 lakh) can never go by UPI, and a small-HNI bid
 * lives between ₹2 lakh and ₹5 lakh. Anything larger goes through print forms
 * and the applicant's own bank. That is a rule about UPI, not about this API.
 */
import { RETAIL_MAX_AMOUNT, UPI_MANDATE_MAX } from './issueRules';
import { minApplicationLots } from './minApplication';

/* No policyholder: that quota is deliberately off the bid rail (the apply
   screen, the bid engine and allotment matching know only employee and
   shareholder), and `applicantType` cannot store it. */
export const PARTNER_BID_CATEGORIES = ['retail', 'shni', 'bhni', 'shareholder', 'employee'] as const;
export type PartnerBidCategory = (typeof PARTNER_BID_CATEGORIES)[number];

/** A reserved quota is valid only when the issue offers it. */
const RESERVED: readonly PartnerBidCategory[] = ['shareholder', 'employee'];

/** Most bids one call may carry, all or nothing. */
export const PARTNER_BID_BATCH_MAX = 25;

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const UPI_PATTERN = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/;
/** The partner's own identifier for one bid — what makes a retried call safe. */
export const ORDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export interface PartnerBidInput {
  orderId?: string;
  consentRef?: string;
  fullName?: string;
  pan?: string;
  depository?: string;
  dpId?: string;
  clientId?: string;
  upiId?: string;
  category?: string;
  lots?: number;
  atCutoff?: boolean;
  price?: number | null;
}

export interface PartnerBidIpo {
  lotSize: number | null;
  priceBandMin: number | null;
  priceBandMax: number | null;
  sme: boolean;
  reservations: readonly string[];
}

export interface PartnerBidTerms {
  category: PartnerBidCategory;
  /** our own applicantType for the application row */
  applicantType: 'individual' | 'shareholder' | 'employee';
  lots: number;
  qty: number;
  atCutoff: boolean;
  /** the bid price; null at cut-off */
  price: number | null;
  /** rupees — at the cap price when bidding at cut-off */
  amount: number;
}

export type PartnerBidCheck = { ok: true; terms: PartnerBidTerms } | { ok: false; problems: string[] };

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Check one bid and work out its terms. Every problem is reported, not just
 * the first, so a partner fixes a payload in one round trip.
 *
 * The CATEGORY must agree with the AMOUNT, and that is checked rather than
 * inferred: a partner that sends `shni` for a ₹1.8 lakh bid has a bug, and
 * quietly re-filing it as retail would hide it.
 */
export function checkPartnerBid(b: PartnerBidInput, ipo: PartnerBidIpo): PartnerBidCheck {
  const p: string[] = [];

  if (!ORDER_ID_PATTERN.test(str(b.orderId))) p.push('orderId is required: up to 64 letters, digits, dot, dash, underscore or colon.');
  if (!str(b.consentRef)) p.push('consentRef is required — your reference for the client\'s instruction and consent to this bid.');
  if (!str(b.fullName)) p.push('fullName is required.');

  const pan = str(b.pan).toUpperCase();
  if (!PAN_PATTERN.test(pan)) p.push('pan must be a valid PAN (five letters, four digits, one letter).');

  const dep = str(b.depository).toUpperCase();
  const dpId = str(b.dpId).toUpperCase();
  const clientId = str(b.clientId);
  if (dep === 'NSDL') {
    if (!/^IN[0-9]{6}$/.test(dpId)) p.push('dpId must be IN followed by six digits for an NSDL demat.');
    if (!/^[0-9]{8}$/.test(clientId)) p.push('clientId must be eight digits for an NSDL demat.');
  } else if (dep === 'CDSL') {
    // A CDSL demat has NO DP ID — its 16 digits are the whole identifier.
    if (!/^[0-9]{16}$/.test(clientId)) p.push('clientId must be the sixteen-digit demat number for a CDSL demat.');
  } else {
    p.push('depository must be NSDL or CDSL.');
  }

  if (!UPI_PATTERN.test(str(b.upiId))) p.push('upiId must look like name@handle.');

  const terms = checkPartnerBidTerms(b, ipo);
  if (p.length) return { ok: false, problems: terms.ok ? p : [...p, ...terms.problems] };
  return terms;
}

/**
 * The terms half alone — category, lots, price and the amount they make. Used
 * on its own by a MODIFY, where the client's identity was checked when the bid
 * was placed and only the terms change.
 */
export function checkPartnerBidTerms(
  b: Pick<PartnerBidInput, 'category' | 'lots' | 'atCutoff' | 'price'>,
  ipo: PartnerBidIpo,
): PartnerBidCheck {
  const p: string[] = [];
  const category = str(b.category).toLowerCase() as PartnerBidCategory;
  const known = (PARTNER_BID_CATEGORIES as readonly string[]).includes(category);
  if (!known) p.push(`category must be one of ${PARTNER_BID_CATEGORIES.join(', ')}.`);
  if (known && RESERVED.includes(category) && !ipo.reservations.includes(category)) {
    p.push(`This IPO does not offer a ${category} reservation.`);
  }
  if (category === 'bhni') {
    p.push(`A big-HNI bid is above ₹10 lakh, and a UPI mandate is capped at ${inr(UPI_MANDATE_MAX)}. Use print forms for it.`);
  }

  const lotSize = Number(ipo.lotSize) || 0;
  const cap = Number(ipo.priceBandMax) || Number(ipo.priceBandMin) || 0;
  const floor = Number(ipo.priceBandMin) || cap;
  if (lotSize <= 0 || cap <= 0) p.push('This IPO has no lot size or price set yet, so it cannot take bids.');

  const lots = Number(b.lots);
  if (!Number.isInteger(lots) || lots < 1) p.push('lots must be a whole number of at least 1.');

  const atCutoff = b.atCutoff === true;
  const price = atCutoff ? null : Number(b.price);
  const individual = category === 'retail' || RESERVED.includes(category);
  if (atCutoff && known && !individual) p.push('Only a retail or reserved-quota bid may be placed at the cut-off price.');
  if (!atCutoff) {
    if (!Number.isFinite(price) || (price as number) <= 0) {
      p.push('price is required unless atCutoff is true.');
    } else if (cap > 0 && ((price as number) < floor || (price as number) > cap)) {
      p.push(`price must be within the price band, ${inr(floor)} to ${inr(cap)}.`);
    }
  }

  if (p.length) return { ok: false, problems: p };

  const qty = lots * lotSize;
  const amount = qty * (atCutoff ? cap : (price as number));
  const minLots = minApplicationLots(category === 'shni' ? 'hni2' : category, { lotSize, priceCap: cap, sme: ipo.sme });
  if (minLots > 0 && lots < minLots) p.push(`A ${category} bid on this IPO needs at least ${minLots} lot(s).`);

  /*
   * SME AND MAINBOARD DIFFER IN KIND. An SME individual bids EXACTLY the
   * minimum — two lots under the post-2024 framework, which is usually above
   * ₹2 lakh — and anything larger is an HNI bid. So on SME the individual check
   * is the lot count and the ₹2 lakh line does not apply; on mainboard retail
   * is a range up to ₹2 lakh and small-HNI starts above it.
   */
  if (category === 'retail' && ipo.sme && minLots > 0 && lots !== minLots) {
    p.push(`An individual bid on an SME IPO is exactly ${minLots} lots; a larger bid is an shni bid.`);
  }
  if (category === 'retail' && !ipo.sme && amount > RETAIL_MAX_AMOUNT) {
    p.push(`A retail bid may be at most ${inr(RETAIL_MAX_AMOUNT)}; this one is ${inr(amount)}. Send it as shni if it is meant to be larger.`);
  }
  if (category === 'shareholder' && amount > RETAIL_MAX_AMOUNT) {
    p.push(`A shareholder-quota bid may be at most ${inr(RETAIL_MAX_AMOUNT)}; this one is ${inr(amount)}.`);
  }
  if (category === 'shni' && !ipo.sme && amount <= RETAIL_MAX_AMOUNT) {
    p.push(`A small-HNI bid must be above ${inr(RETAIL_MAX_AMOUNT)}; this one is ${inr(amount)}. Send it as retail.`);
  }
  if (amount > UPI_MANDATE_MAX) {
    p.push(`A UPI mandate is capped at ${inr(UPI_MANDATE_MAX)}; this bid is ${inr(amount)}. Use print forms for it.`);
  }
  if (p.length) return { ok: false, problems: p };

  return {
    ok: true,
    terms: {
      category,
      applicantType: RESERVED.includes(category) ? (category as 'shareholder' | 'employee') : 'individual',
      lots, qty, atCutoff, price, amount,
    },
  };
}

/** The bucket a PAN may hold ONE live bid in: public, or each reserved quota. */
export const panBucketOf = (category: string): string =>
  RESERVED.includes(category as PartnerBidCategory) ? category : 'public';

/* ── Webhooks ──────────────────────────────────────────────────────────── */

export const PARTNER_WEBHOOK_EVENTS = [
  'bid.accepted',          // we have it, checked, and queued to send
  'bid.sent',              // the exchange accepted it
  'bid.funds_blocked',     // the investor approved the UPI mandate
  'bid.demat_verified',    // the depository confirmed the demat and PAN
  'bid.rejected',          // the exchange, the depository or the investor refused it
  'bid.instruction_refused', // a modify or cancel was refused; the bid stands as it was
  'bid.cancelled',
  'bid.allotment',         // allotted or not allotted
  'bid.refund',            // money released
  'bid.status',            // any other change
] as const;
export type PartnerWebhookEvent = (typeof PARTNER_WEBHOOK_EVENTS)[number];

/**
 * Which webhook a status-event row produces. The webhook stream is built from
 * `ApplicationStatusEvent` rows — every path that changes a bid writes one —
 * so a new code path that changes a status is covered without remembering to
 * fire a webhook from it.
 */
export function bidWebhookEvent(status: string, detail?: Record<string, unknown> | null): PartnerWebhookEvent {
  const d = detail ?? {};
  if (d.refused === true) return 'bid.instruction_refused';
  // A modify, cancel or UPI restatement that reached the exchange is not the
  // bid being sent again — it carries the bid's current status, which would
  // otherwise read as a second `bid.sent`.
  if (d.sent === true) return d.action == null || d.action === 'new' ? 'bid.sent' : 'bid.status';
  switch (status) {
    case 'submitted': return d.queued === true ? 'bid.accepted' : 'bid.status';
    case 'mandate_pending': return 'bid.sent';
    case 'upi_blocked':
    case 'confirmed': return 'bid.funds_blocked';
    case 'dp_verified': return 'bid.demat_verified';
    case 'rejected':
    case 'failed':
    case 'dp_failed': return 'bid.rejected';
    case 'cancelled': return 'bid.cancelled';
    case 'allotted':
    case 'not_allotted': return 'bid.allotment';
    case 'released': return 'bid.refund';
    default: return 'bid.status';
  }
}
