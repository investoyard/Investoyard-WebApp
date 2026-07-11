/**
 * Investoyard — Rail Adapter shared types & interface
 * -------------------------------------------------------------
 * One interface, multiple exchange rails (NSE e-IPO, BSE iBBS).
 * The orchestrator selects an adapter and parameterizes it with the
 * MemberCredential of the broker/merchant-banker we procure under
 * (the "same API, just enter the member's credentials" model).
 *
 * Verified against: NSE EIPO-WEB API Protocol v1.20.5 (Sep 2025).
 * BSE: structural template from India INX iBBS v1.1 — confirm against
 *      the domestic BSE Limited iBBS doc (member-gated).
 */

export type Exchange = 'NSE_EIPO' | 'BSE_IBBS';

export type Depository = 'NSDL' | 'CDSL';

/** Credentials of the member/merchant-banker we submit bids under. Secrets live in the vault; pass refs/resolved values at runtime only. */
export interface MemberCredential {
  id: string;
  exchange: Exchange;
  memberName: string;            // Axis Capital, Nuvama, JM Financial…
  loginId: string;
  memberCode: string;
  password: string;              // resolved from vault at call time
  ibbsId?: string;               // BSE/iBBS only
  subBrokerCode?: string;        // NSE: populated when logged in as a member
  baseUrl: string;               // env-specific (Live / UAT)
  env: 'live' | 'uat';
}

export interface AuthSession {
  token: string;
  memberCode: string;
  loginId: string;
  expiresAt?: number;            // epoch ms, if the rail returns/advertises one
}

/** One applicant's bid on one IPO (self or a family member). */
export interface BidSubmission {
  /** our internal id, echoed into rail `remark` for reconciliation */
  clientRef: string;
  activity: 'new' | 'modify' | 'cancel';
  /** required for modify/cancel */
  bidReferenceNumber?: string;

  // IPO
  symbol: string;
  category: string;              // category code from ipomaster
  applicationNumber?: string;    // physical-form no.; optional for native

  // Applicant (always the applicant's OWN identity — never third-party)
  applicantName?: string;
  pan: string;
  depository: Depository;
  dpId: string;
  clientBenId: string;

  // Payment — UPI/ASBA
  upi?: string;                  // investor UPI id (UPI flow)
  asbaBlockRef?: string;         // optional for UPI; required for some ASBA modes
  bankAccount?: string;          // non-UPI ASBA (bank login)
  ifsc?: string;

  // Bids (one application may carry multiple price/qty bids)
  bids: Bid[];
}

export interface Bid {
  quantity: number;
  atCutOff: boolean;
  price?: number;                // required iff atCutOff = false
  amount: number;
  remark?: string;               // we put our bid UID here
}

export interface BidResult {
  clientRef: string;
  ok: boolean;
  applicationNumber?: string;
  bidIds?: string[];             // exchange-generated bid ids
  errorCode?: string;
  message?: string;
  raw?: unknown;
}

export interface IpoMasterEntry {
  symbol: string;
  name?: string;
  issueType?: string;            // IPO / SME / FPO / RIGHTS …
  openDate?: string;
  closeDate?: string;
  priceMin?: number;
  priceMax?: number;
  lotSize?: number;
  categories?: { code: string; label?: string }[];
  raw?: unknown;
}

export interface TransactionRecord {
  applicationNumber: string;
  symbol: string;
  status?: string;
  dpVerificationStatus?: string; // from callback / fetch
  upiPaymentStatus?: string;     // from callback / fetch
  amountBlocked?: number;
  raw?: unknown;
}

export interface AllotmentRecord {
  applicationNumber: string;
  symbol: string;
  allottedQty?: number;
  amountDebited?: number;
  status?: 'allotted' | 'not_allotted' | 'partial' | string;
  raw?: unknown;
}

export interface TimeWindow {
  from: string;                  // format per rail (e.g. yyyymmddHHMMSS)
  to: string;
}

/** Common interface every exchange rail implements. */
export interface RailAdapter {
  readonly exchange: Exchange;

  login(cred: MemberCredential): Promise<AuthSession>;
  getIpoMaster(session: AuthSession, cred: MemberCredential): Promise<IpoMasterEntry[]>;

  /** Native apply — one applicant. */
  submitBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult>;
  /** Family / batch — many applicants in one call (rail-capped, e.g. NSE ≤100). */
  submitBidsBulk(reqs: BidSubmission[], session: AuthSession, cred: MemberCredential): Promise<BidResult[]>;

  modifyBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult>;
  cancelBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult>;

  fetchTransactions(window: TimeWindow, session: AuthSession, cred: MemberCredential): Promise<TransactionRecord[]>;
  getAllotment(window: TimeWindow, session: AuthSession, cred: MemberCredential): Promise<AllotmentRecord[]>;
}

/** Thrown on rail/transport/business errors so the orchestrator can fall back to PDF. */
export class RailError extends Error {
  constructor(
    message: string,
    readonly exchange: Exchange,
    readonly code?: string,
    readonly httpStatus?: number,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'RailError';
  }
}
