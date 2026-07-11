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
