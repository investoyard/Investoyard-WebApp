/**
 * NSE e-IPO callback DTOs + status enums.
 * Source: NSE WEB API v1.20.5, "Chapter 4 — Callback APIs".
 *
 * These endpoints are EXPOSED BY us (the member system) and CALLED BY the
 * NSE host to push DP-verification + UPI-payment status. We respond with
 * { status: "success" } or { status: "failed", reason }.
 */

/** dpVerStatusFlag: P=Pending, S=Success, F=Failed */
export type DpVerStatusFlag = 'P' | 'S' | 'F';

/** upiPaymentStatusFlag (from sponsor bank, per doc) */
export enum UpiPaymentStatus {
  REQUEST_SENT = 0,
  REQUEST_FAILED = 1,
  ACCEPTED_BY_SPONSOR_BANK = 10,
  REJECTED_INVALID_UPI = 11,
  REJECTED_BY_SPONSOR_BANK = 12,
  REJECTED_UPI2_NOT_SUPPORTED = 13,
  REJECTED_BY_INVESTOR_BANK = 21,
  REJECTED_TECHNICAL = 22,
  REJECTED_BY_INVESTOR = 31,
  ACCEPTED_BY_INVESTOR = 100,
  BLOCK_RELEASED = 110, // due to cancellation of order
}

export interface AppDpStatusRequest {
  symbol: string;
  applicationNumber: string;
  dpVerStatusFlag: DpVerStatusFlag;
  dpVerFailCode?: string | null;
  dpVerReason?: string | null;
}

export interface AppPayStatusRequest {
  symbol: string;
  applicationNumber: string;
  upiPaymentStatusFlag: number; // UpiPaymentStatus
  upiAmtBlocked?: number;
  upiPayReason?: string | null;
}

export interface NotificationRequest {
  symbol?: string;
  applicationNumber?: string;
  [k: string]: unknown;
}

export interface CallbackAck {
  status: 'success' | 'failed';
  reason?: string;
}

/** Our internal application status (subset relevant to callbacks). */
export type ApplicationStatus =
  | 'submitted'
  | 'dp_verified'
  | 'dp_failed'
  | 'mandate_pending'
  | 'upi_blocked'
  | 'confirmed'
  | 'rejected'
  | 'released';

/** Map a UPI payment status code → our application status + whether it's terminal-failure. */
export function mapUpiStatus(code: number): { status: ApplicationStatus; failed: boolean } {
  switch (code) {
    case UpiPaymentStatus.REQUEST_SENT:
      return { status: 'mandate_pending', failed: false };
    case UpiPaymentStatus.ACCEPTED_BY_SPONSOR_BANK:
      return { status: 'mandate_pending', failed: false };
    case UpiPaymentStatus.ACCEPTED_BY_INVESTOR:
      return { status: 'upi_blocked', failed: false }; // funds blocked → confirmed application
    case UpiPaymentStatus.BLOCK_RELEASED:
      return { status: 'released', failed: false };
    case UpiPaymentStatus.REQUEST_FAILED:
    case UpiPaymentStatus.REJECTED_INVALID_UPI:
    case UpiPaymentStatus.REJECTED_BY_SPONSOR_BANK:
    case UpiPaymentStatus.REJECTED_UPI2_NOT_SUPPORTED:
    case UpiPaymentStatus.REJECTED_BY_INVESTOR_BANK:
    case UpiPaymentStatus.REJECTED_TECHNICAL:
    case UpiPaymentStatus.REJECTED_BY_INVESTOR:
      return { status: 'rejected', failed: true };
    default:
      return { status: 'mandate_pending', failed: false };
  }
}

/**
 * The exchange's OWN wording per UPI payment code — verbatim from NSE WEB API
 * v1.20.5, the `upiPaymentStatusFlag` table on `/v1/apppaystatus`.
 *
 * This exists because `mapUpiStatus` is deliberately lossy: eleven codes
 * collapse onto five of our statuses, and the three that matter most to an
 * investor all land on `rejected`. "Rejected by Investor" (they declined the
 * mandate themselves), "Rejected due to invalid UPI" (a fixable typo) and
 * "Rejected by Sponsor Bank" are three different things to do next, and our
 * status cannot tell them apart. So the sentence is stored alongside the status
 * rather than derived from it.
 *
 * VERBATIM, not paraphrased — including the spec's own capitalisation. This is
 * what `Application.upiStatusText` is defined to hold, and the operator reads
 * it on the Bidding Report to reconcile against the exchange's own screen.
 *
 * NSE's vocabulary. BSE's per-bid pull (`ipoupistatus`) is not implemented; when
 * it is, confirm its codes against this table instead of assuming they match —
 * only the NSE adapter populates `upiPaymentStatus` today.
 */
export const UPI_STATUS_LABEL: Record<number, string> = {
  [UpiPaymentStatus.REQUEST_SENT]: 'Request Sent',
  [UpiPaymentStatus.REQUEST_FAILED]: 'Request Failed',
  [UpiPaymentStatus.ACCEPTED_BY_SPONSOR_BANK]: 'Request Accepted By Sponsor Bank',
  [UpiPaymentStatus.REJECTED_INVALID_UPI]: 'Rejected due to invalid UPI',
  [UpiPaymentStatus.REJECTED_BY_SPONSOR_BANK]: 'Rejected by Sponsor Bank',
  [UpiPaymentStatus.REJECTED_UPI2_NOT_SUPPORTED]:
    'Block/Release Request Rejected Due To UPI 2.0 Not Being Supported By Investor Bank',
  [UpiPaymentStatus.REJECTED_BY_INVESTOR_BANK]: 'Rejected by Investor Bank',
  [UpiPaymentStatus.REJECTED_TECHNICAL]:
    'Block/Release Request Rejected By Client Bank Due To Technical Reason',
  [UpiPaymentStatus.REJECTED_BY_INVESTOR]: 'Rejected by Investor',
  [UpiPaymentStatus.ACCEPTED_BY_INVESTOR]: 'Accepted by Investor',
  [UpiPaymentStatus.BLOCK_RELEASED]: 'Block Released (Due to cancellation of order)',
};

/**
 * The exchange's sentence for a code, or NULL for one we do not know.
 *
 * Null rather than a stringified code or an invented phrase: an unknown code is
 * a gap in this table, and showing an investor `"47"` reads as a fault in the
 * app while a guessed sentence could be wrong about their money. `mapUpiStatus`
 * already keeps an unknown code non-terminal, so the bid is unaffected — the UI
 * simply falls back to our own status line.
 */
export function upiStatusLabel(code: number): string | null {
  return UPI_STATUS_LABEL[code] ?? null;
}

/** Map a DP verification flag → our application status. */
export function mapDpStatus(flag: DpVerStatusFlag): ApplicationStatus {
  switch (flag) {
    case 'S':
      return 'dp_verified';
    case 'F':
      return 'dp_failed';
    case 'P':
    default:
      return 'submitted';
  }
}
