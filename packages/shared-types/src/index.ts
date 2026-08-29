/**
 * @investoyard/shared-types — one contract for api, web, and mobile.
 * View/DTO types only (no server internals), plus the pure bid engine
 * (packages/shared-types/src/bidEngine.ts) shared by every apply surface.
 * Keep in sync with the API responses.
 */

export * from './bidEngine';
export * from './glossary';
export * from './format';
export * from './issueRules';
export * from './computeIssue';
export * from './stage';
export * from './holidays';

export type IpoType = 'mainboard' | 'sme';
export type IpoStatus = 'upcoming' | 'open' | 'closed' | 'listed' | 'withdrawn';
export type Depository = 'NSDL' | 'CDSL';
export type ApplyMethod = 'native' | 'pdf';

export type ApplicationStatus =
  | 'draft' | 'submitted' | 'dp_verified' | 'dp_failed' | 'mandate_pending'
  | 'upi_blocked' | 'confirmed' | 'allotted' | 'not_allotted' | 'released'
  | 'rejected' | 'failed';

export interface IpoListItem {
  id: string;
  symbol: string;
  name: string;
  type: IpoType;
  status: IpoStatus;
  openDate?: string;
  closeDate?: string;
  priceBandMin?: number;
  priceBandMax?: number;
  lotSize?: number;
  minAmount?: number;
  /** overall subscription (× times), for the list signal */
  subscriptionTimes?: number;
  /** grey-market premium per share (unofficial — always render with disclaimer) */
  gmp?: number;
  /** GMP as % of upper price band (semantic up/down color) */
  gmpPct?: number;
  listingGainPct?: number;
}

export interface IpoDetail extends IpoListItem {
  about?: string;
  objectsOfIssue?: string;
  issueSize?: string;
  registrar?: string;
  listingDate?: string;
  allotmentDate?: string;
  subscription?: SubscriptionRow[];
  /** when the live subscription figures were last refreshed by the NSE poller */
  subscriptionAsOf?: string;
  /** admin per-IPO switch for the live subscription poller */
  autoPollSubscription?: boolean;
  financials?: { label: string; value: string }[];
  documents?: { type: string; url: string }[];
  /** SME issues — per the Mar-2025 ICDR norms */
  smeCompliance?: { meetsNorms?: boolean; ebitdaTest?: boolean; ofsPct?: number; gcpPct?: number };
  /** Reserved applicant quotas this issue offers, e.g. ["shareholder","employee"]. */
  reservations?: string[];
}

export type ConsentType = 'service' | 'marketing' | 'data_sharing_rail' | 'analytics';

/** A versioned consent notice the client must show before capturing consent (DPDP). */
export interface ConsentNotice {
  type: ConsentType;
  version: string;
  summary: string;
}

/** One family member's bid inside a bulk apply. */
export interface BulkApplicant {
  investorProfileId: string;
  lots: number;
  atCutoff?: boolean;
  bidPrice?: number;
  applicantType?: ApplicantCategory;
}

/** Family / group apply — submitted to the rail as ONE addbulk call (≤100). */
export interface CreateBulkApplicationInput {
  ipoId: string;
  category: string;
  applicants: BulkApplicant[];
  applyMethod: 'native';
  dataSharingConsent: boolean;
  consentNoticeVersion?: string;
}

/** An in-app / push notification (allotment, listing, status). */
export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

/** A recorded consent (grant/withdraw history) — the DPDP data-principal view. */
export interface ConsentView {
  id: string;
  type: ConsentType;
  noticeVersion: string;
  grantedAt: string;
  withdrawnAt: string | null;
  active: boolean;
  channel?: string;
}

export interface IpoGmpView {
  value?: number;
  trend?: 'up' | 'down' | 'flat';
  asOf?: string;
  disclaimer: string;
}

export interface SubscriptionRow {
  category: 'qib' | 'nii' | 'retail' | 'employee' | 'total';
  /** number of applications/bids in this category (from NSE catwise) */
  bidCount?: number;
  /** subscription by APPLICATIONS (bids ÷ max allottees) — retail allotment-odds driver */
  applicationsSubscribed?: number;
  timesSubscribed: number;
  asOf: string;
}

export interface ProfileView {
  id: string;
  relationship: 'self' | 'spouse' | 'child' | 'mother' | 'father' | 'parent' | 'sibling' | 'other';
  fullName: string;
  pan: string;            // masked
  depository: Depository;
  dpId: string;
  clientId: string;
  hasUpi: boolean;
  hasBank: boolean;
  kycStatus: 'unverified' | 'verified' | 'failed';
}

export interface ApplicationView {
  id: string;
  ipoId: string;
  ipoSymbol?: string;
  ipoName?: string;
  status: ApplicationStatus;
  applyMethod: ApplyMethod;
  applicantType?: ApplicantCategory;
  amount: number;
  applicationNumber?: string;
  amountBlocked?: number;
  /** Allotment result (populated after the registrar's allotment is recorded). */
  allottedLots?: number;
  allottedAmount?: number;
  refundAmount?: number;
  allottedAt?: string;
  /** Listing-day P&L on the allotted shares (only once the IPO is listed & allotted). */
  ipoStatus?: IpoStatus;
  listingGainPct?: number;
  listingGain?: number;
  /** Live subscription for this application's category (shares basis), while the IPO is open. */
  categorySubscribedTimes?: number;
  /** Estimated retail allotment odds %, derived from by-applications subscription (retail only). */
  allotmentOddsPct?: number;
  /** While 'submitted': applicant details still blocking the exchange bid (UPI / demat). */
  missingDetails?: string[];
}

export type ApplicantCategory = 'individual' | 'shareholder' | 'employee';

export interface CreateApplicationInput {
  investorProfileId: string;
  ipoId: string;
  category: string;
  applicantType?: ApplicantCategory;
  lots: number;
  atCutoff: boolean;
  bidPrice?: number;
  applyMethod: ApplyMethod;
  /** DPDP: the applicant's explicit consent to share their financial data with the
   *  partner rail/merchant-banker for THIS application. Required to submit. */
  dataSharingConsent: boolean;
  consentNoticeVersion?: string;
}
