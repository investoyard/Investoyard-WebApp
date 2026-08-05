/**
 * NseEipoAdapter
 * -------------------------------------------------------------
 * Implements RailAdapter against the NSE e-IPO WEB API.
 * Verified source: "NSEIL Initial Public Offering System — WEB API
 * Protocol, Version 1.20.6, June 2026".
 *
 * Investoyard logs in as a MEMBER (the empaneled member's credentials)
 * and submits UPI-ASBA retail bids with upiFlag = 'Y'. Per the doc, the
 * ASBA block-ref is "Non-Mandatory in case of UPI & Non-3-in-1 bid".
 *
 * Endpoints used (base: https://<baseUrl>/<version>/...):
 *   POST /login                         → token (sent as Authorization header)
 *   GET  /v1/ipomaster                  → IPO master data
 *   POST /v1/transactions/add           → place/modify/cancel application + bids
 *   POST /v1/transactions/addbulk       → bulk (≤100) — family group
 *   POST /v1/transactions/fetch         → application status
 *   GET  /v1/allotment/{from}/{to}      → allotment
 *
 * NOTE: a few exact paths (login route, ipomaster verb) are taken from the
 * doc's protocol summary; confirm against your member copy and adjust the
 * constants below if needed — they are isolated for one-line edits.
 */
import { httpJson } from './http';
import {
  AllotmentRecord,
  AuthSession,
  BidResult,
  BidSubmission,
  IpoMasterEntry,
  MemberCredential,
  RailAdapter,
  RailError,
  TimeWindow,
  TransactionRecord,
} from './rail-adapter.types';

const VERSION = 'v1';

const PATHS = {
  // v1.20.6 §login + Appendix C: the route is version-prefixed (/v1/login).
  login: `/${VERSION}/login`,
  ipomaster: `/${VERSION}/ipomaster`,
  add: `/${VERSION}/transactions/add`,
  addbulk: `/${VERSION}/transactions/addbulk`,
  fetch: `/${VERSION}/transactions/fetch`,
  allotment: (w: TimeWindow) => `/${VERSION}/allotment/${w.from}/${w.to}`,
  holidaymaster: (from: string, to: string) => `/${VERSION}/holidaymaster/${from}/${to}`,
};

/** One NSE trading-holiday row (v1.20.6 §holidaymaster). Dates are "dd-MM-yyyy". */
export interface HolidayEntry {
  date: string;
  desc?: string;
  segments: string[]; // segmentEligibility, e.g. ["Equity","SME","FPO"]
}

const ACTIVITY_CODE: Record<BidSubmission['activity'], string> = {
  new: 'new',
  modify: 'modify',
  cancel: 'cancel',
};

export class NseEipoAdapter implements RailAdapter {
  readonly exchange = 'NSE_EIPO' as const;

  private url(cred: MemberCredential, path: string) {
    return `${cred.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private authHeaders(session: AuthSession): Record<string, string> {
    // v1.20.6 §"Basic Security (v1)": the login token is sent in the
    // "Access-Token" header on every subsequent call (NOT Authorization).
    return { 'Access-Token': session.token };
  }

  async login(cred: MemberCredential): Promise<AuthSession> {
    const res = await httpJson<any>(this.url(cred, PATHS.login), {
      method: 'POST',
      exchange: this.exchange,
      body: {
        memberCode: cred.memberCode,
        loginId: cred.loginId,
        password: cred.password,
      },
    });
    const token = res?.token ?? res?.Token;
    if (!token) {
      // Login failure carries status:"failed" + a "reason" string (v1.20.6 §login).
      const reason = res?.reason ?? 'Login did not return a token';
      throw new RailError(reason, this.exchange, res?.errorCode, undefined, res);
    }
    return { token, memberCode: cred.memberCode, loginId: cred.loginId };
  }

  async getIpoMaster(session: AuthSession, cred: MemberCredential): Promise<IpoMasterEntry[]> {
    const res = await httpJson<any>(this.url(cred, PATHS.ipomaster), {
      method: 'GET',
      exchange: this.exchange,
      headers: this.authHeaders(session),
    });
    const rows: any[] = res?.data ?? res?.ipos ?? (Array.isArray(res) ? res : []);
    return rows.map((r) => ({
      symbol: r.symbol,
      name: r.name ?? r.companyName,
      issueType: r.issueType,
      openDate: r.openDate ?? r.biddingStartDate,
      closeDate: r.closeDate ?? r.biddingEndDate,
      priceMin: num(r.priceBandLow ?? r.minPrice),
      priceMax: num(r.priceBandHigh ?? r.maxPrice),
      lotSize: num(r.lotSize ?? r.marketLot),
      categories: (r.categoryDetails ?? r.categories ?? []).map((c: any) => ({
        code: c.category ?? c.code,
        label: c.label ?? c.description,
        // Shares reserved/offered for this category — the denominator for
        // "times subscribed". Field name varies by host build; probe the common
        // spellings and confirm the exact key against your UAT ipomaster copy.
        offered: num(
          c.offeredQuantity ?? c.offered ?? c.sharesOffered ?? c.quantityOffered ??
          c.noOfSharesOffered ?? c.reservedQuantity ?? c.offerQuantity,
        ),
      })),
      raw: r,
    }));
  }

  /** Build the NSE transactions/add request body for one applicant. */
  private toAddPayload(req: BidSubmission, cred: MemberCredential) {
    if (!req.upi && !req.bankAccount) {
      throw new RailError('Either upi (UPI flow) or bankAccount (ASBA) is required', this.exchange, 'VALIDATION');
    }
    const upiFlag = req.upi ? 'Y' : 'N';
    return {
      symbol: req.symbol,
      applicationNumber: req.applicationNumber ?? '',
      category: req.category,
      clientName: req.applicantName ?? '',
      depository: req.depository,
      dpId: req.dpId,
      clientBenId: req.clientBenId,
      nonASBA: false,
      pan: req.pan,
      referenceNumber: req.asbaBlockRef ?? '', // optional for UPI
      upiFlag,
      upi: req.upi ?? '',
      bankAccount: req.bankAccount ?? '',
      ifsc: req.ifsc ?? '',
      subBrokerCode: cred.subBrokerCode ?? '',
      bids: req.bids.map((b) => ({
        activityType: ACTIVITY_CODE[req.activity],
        bidReferenceNumber: req.bidReferenceNumber ?? '',
        quantity: b.quantity,
        atCutOff: b.atCutOff,
        price: b.atCutOff ? undefined : b.price,
        amount: b.amount,
        remark: b.remark ?? req.clientRef,
      })),
    };
  }

  private parseAddResponse(req: BidSubmission, res: any): BidResult {
    // v1.20.6 §transactions/add response: success is signalled by
    // status:"success" (lowercase); failure by status:"failed" + reasonCode/reason.
    // Fall back to the legacy errorCode==0 convention when no "status" is present
    // (older hosts / mocks) so we stay robust across environments.
    const statusStr = String(res?.status ?? '').toLowerCase();
    const ok =
      statusStr === 'success' ||
      (res?.status == null && (res?.errorCode === '0' || res?.errorCode === 0));
    const errorCode = res?.reasonCode ?? res?.errorCode ?? res?.statusCode;
    return {
      clientRef: req.clientRef,
      ok,
      applicationNumber: res?.applicationNumber,
      bidIds: (res?.bids ?? []).map((b: any) => b.bidReferenceNumber ?? b.bidId).filter(Boolean),
      errorCode: errorCode != null ? String(errorCode) : undefined,
      message: res?.reason ?? res?.message ?? res?.statusMessage,
      raw: res,
    };
  }

  async submitBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    const res = await httpJson<any>(this.url(cred, PATHS.add), {
      method: 'POST',
      exchange: this.exchange,
      headers: this.authHeaders(session),
      body: this.toAddPayload(req, cred),
    });
    return this.parseAddResponse(req, res);
  }

  async submitBidsBulk(reqs: BidSubmission[], session: AuthSession, cred: MemberCredential): Promise<BidResult[]> {
    if (reqs.length > 100) {
      throw new RailError('addbulk supports a maximum of 100 records per call', this.exchange, 'RATE_LIMIT');
    }
    const res = await httpJson<any>(this.url(cred, PATHS.addbulk), {
      method: 'POST',
      exchange: this.exchange,
      headers: this.authHeaders(session),
      body: reqs.map((r) => this.toAddPayload(r, cred)),
    });
    const rows: any[] = res?.data ?? (Array.isArray(res) ? res : []);
    // align responses to requests by index (and/or by remark/clientRef when present)
    return reqs.map((r, i) => this.parseAddResponse(r, rows[i] ?? res));
  }

  modifyBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    return this.submitBid({ ...req, activity: 'modify' }, session, cred);
  }

  cancelBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    return this.submitBid({ ...req, activity: 'cancel' }, session, cred);
  }

  async fetchTransactions(window: TimeWindow, session: AuthSession, cred: MemberCredential): Promise<TransactionRecord[]> {
    const res = await httpJson<any>(this.url(cred, PATHS.fetch), {
      method: 'POST',
      exchange: this.exchange,
      headers: this.authHeaders(session),
      body: { fromTime: window.from, toTime: window.to },
    });
    const rows: any[] = res?.data ?? (Array.isArray(res) ? res : []);
    return rows.map((r) => ({
      applicationNumber: r.applicationNumber,
      symbol: r.symbol,
      status: r.status,
      dpVerificationStatus: r.dpVerStatusFlag,
      upiPaymentStatus: r.upiPaymentStatusFlag,
      amountBlocked: num(r.upiAmtBlocked),
      raw: r,
    }));
  }

  async getAllotment(window: TimeWindow, session: AuthSession, cred: MemberCredential): Promise<AllotmentRecord[]> {
    const res = await httpJson<any>(this.url(cred, PATHS.allotment(window)), {
      method: 'GET',
      exchange: this.exchange,
      headers: this.authHeaders(session),
    });
    const rows: any[] = res?.data ?? (Array.isArray(res) ? res : []);
    return rows.map((r) => ({
      applicationNumber: r.applicationNumber,
      symbol: r.symbol,
      allottedQty: num(r.allottedQty ?? r.allotmentQty),
      amountDebited: num(r.amountDebited),
      status: r.status,
      raw: r,
    }));
  }

  /** NSE trading-holiday calendar for a date range (dates "dd-MM-yyyy"). Used to pause polling on market holidays. */
  async getHolidayMaster(from: string, to: string, session: AuthSession, cred: MemberCredential): Promise<HolidayEntry[]> {
    const res = await httpJson<any>(this.url(cred, PATHS.holidaymaster(from, to)), {
      method: 'GET',
      exchange: this.exchange,
      headers: this.authHeaders(session),
    });
    const rows: any[] = res?.data ?? (Array.isArray(res) ? res : []);
    return rows.map((r) => ({
      date: r.date,
      desc: r.desc,
      segments: r.segmentEligibility ?? r.segments ?? [],
    }));
  }
}

function num(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
