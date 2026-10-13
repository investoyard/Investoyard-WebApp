/**
 * May this investor ask the sponsor bank to release their blocked funds?
 *
 * The scenario (sir's requirement 1): a UPI mandate blocked money, allotment
 * happened, the investor was not allotted — or was allotted less than they bid
 * for — and the balance has not come back. SEBI expects the sponsor bank to
 * unblock by T+1 after allotment; when it does not, the investor currently has
 * nowhere to go but their own bank's branch.
 *
 * THIS IS AN OUTWARD-FACING EMAIL TO A THIRD PARTY, which is why the rules are
 * tighter than a normal UI guard and live here with tests rather than inside a
 * handler. Three things have to be true, and one has to be false:
 *
 *  1. Money is actually blocked. Without `amountBlocked` there is nothing to
 *     ask about, and a bank that receives a request for a bid it never blocked
 *     learns to ignore us.
 *  2. Allotment has HAPPENED. Before that the block is correct and expected —
 *     an unblock request during bidding is simply wrong, and this is the guard
 *     most likely to be hit, because an anxious investor will try.
 *  3. The grace period has passed. SEBI's own timeline gives the bank until
 *     T+1; emailing on allotment day is chasing a bank that is not yet late.
 *  4. The money has NOT already come back.
 *
 * Deliberately NOT a function of category: a stuck block is a stuck block.
 */

/** Hours after allotment before the bank counts as late. SEBI's unblock is T+1. */
export const UNBLOCK_GRACE_HOURS = 24;

/** One request per application per this many hours — see `mayRequestUnblock`. */
export const UNBLOCK_COOLDOWN_HOURS = 24;

export interface UnblockInput {
  status?: string | null;
  /** rupees the bank is holding; 0/absent ⇒ nothing to ask about */
  amountBlocked?: number | null;
  /** rupees already released back */
  refundAmount?: number | null;
  /** what the allotted shares actually cost */
  allottedAmount?: number | null;
  /** the issue's allotment date (ISO or Date) */
  allotmentDate?: string | Date | null;
  /** when this investor last sent one, for the cooldown */
  lastRequestedAt?: string | Date | null;
  /** injectable for tests */
  now?: Date;
}

export interface UnblockVerdict {
  ok: boolean;
  reason?: string;
  /** rupees that should have come back — what the email asks about */
  stuckAmount?: number;
  /** when the cooldown lets them try again */
  retryAfter?: Date;
}

export function mayRequestUnblock(input: UnblockInput): UnblockVerdict {
  const now = input.now ?? new Date();
  const status = String(input.status ?? '').trim().toLowerCase();
  const blocked = num(input.amountBlocked);
  const refunded = num(input.refundAmount);
  const allotted = num(input.allottedAmount);

  if (status === 'cancelled' || status === 'withdrawn' || status === 'rejected' || status === 'failed') {
    return { ok: false, reason: 'This application did not go through, so there is no allotment to unblock against. If money is still blocked, contact your bank.' };
  }
  if (blocked <= 0) {
    return { ok: false, reason: 'No funds were blocked against this application, so there is nothing for the sponsor bank to release.' };
  }

  const allotmentAt = toDate(input.allotmentDate);
  if (!allotmentAt) {
    return { ok: false, reason: 'This issue has no allotment date yet, so the block is not overdue.' };
  }
  if (allotmentAt.getTime() > now.getTime()) {
    return { ok: false, reason: 'Allotment has not happened yet — your funds stay blocked until then. This is normal.' };
  }

  /* The bank is not late until the grace period is up. Saying WHEN they can ask
     is the difference between a guard and a brush-off. */
  const dueAt = new Date(allotmentAt.getTime() + UNBLOCK_GRACE_HOURS * 3_600_000);
  if (dueAt.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: `Banks have until ${UNBLOCK_GRACE_HOURS} hours after allotment to release unblocked funds. You can raise this after that if the money has not come back.`,
      retryAfter: dueAt,
    };
  }

  /* What is actually stuck: blocked, less whatever the allotted shares cost,
     less anything already released. A partial allotment is the case this has to
     get right — the investor is owed the difference, not the whole block. */
  const stuck = round2(blocked - allotted - refunded);
  if (stuck <= 0) {
    return { ok: false, reason: 'Your blocked funds have already been released or used for your allotment, so there is nothing outstanding.' };
  }

  const last = toDate(input.lastRequestedAt);
  if (last) {
    const nextAt = new Date(last.getTime() + UNBLOCK_COOLDOWN_HOURS * 3_600_000);
    if (nextAt.getTime() > now.getTime()) {
      return {
        ok: false,
        reason: `You have already sent an unblock request for this application. Give the bank ${UNBLOCK_COOLDOWN_HOURS} hours to respond before sending another.`,
        retryAfter: nextAt,
        stuckAmount: stuck,
      };
    }
  }

  return { ok: true, stuckAmount: stuck };
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const toDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
