/**
 * BseIbbsAdapter — domestic BSE Limited iBBS HTTP API
 * -------------------------------------------------------------
 * Source: "BSE iBBS HTTP Communication API (With REST ENDPOINTS) v1.05.5"
 *         + "iBBS HTTP Message API v1.03.5" (reads/subscription/callbacks).
 *
 * Base URL (operator enters it on the credential):
 *   UAT   https://uat.bseindia.in/ibbsapi/ibbsapiservice.svc
 *   PROD  https://ibbsapi.bseindia.com/IBBSAPI/IBBSAPISERVICE.SVC
 *
 * Every request carries FOUR case-sensitive headers: Membercode, Login, Token,
 * and **Checksum** (this is what makes BSE different from NSE v1). The Checksum is
 * base64( AES-256-GCM( SHA256(payload) ) ) using an AES key BSE provisions per
 * member (cred.checksumKey). For POST the payload is the JSON body; for GET it is
 * Membercode+Login+Token.
 *
 * ⚠️ STILL GATED (confirmed = false): the doc specifies the checksum ALGORITHM but
 * not the exact GCM nonce/IV framing, so submit/master/fetch throw until we
 * validate `checksum()` against BSE's reference sample on UAT and flip the flag.
 * The bid PAYLOAD shapes below are verified against the v1.05.5 samples.
 */
import { bseChecksum } from './bse-checksum';
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

/**
 * Endpoint paths on the iBBS bidding service. All routes are versioned
 * under /v1/ (confirmed against sir's working C# 2026-09-10 for /v1/login).
 * The order and bulk-order endpoints are set to the same prefix; if BSE
 * ever splits them off in a future doc revision we'll adjust here.
 */
const PATHS = {
  login: `/v1/login`,
  ipoorder: `/v1/ipoorder`,
  ipoorderbulk: `/v1/ipoorderbulk`,
};

/** action codes (doc §Bid Json): n=new, m=modify, d=cancel */
const ACTION: Record<BidSubmission['activity'], string> = { new: 'n', modify: 'm', cancel: 'd' };

export class BseIbbsAdapter implements RailAdapter {
  readonly exchange = 'BSE_IBBS' as const;

  /** flip to true once `checksum()` is validated against the BSE reference sample on UAT */
  private readonly confirmed = false;

  private url(cred: MemberCredential, path: string) {
    return `${cred.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private assertConfirmed(op: string) {
    if (!this.confirmed) {
      throw new RailError(
        `BseIbbsAdapter.${op} is gated — validate checksum() against the BSE reference sample on UAT, then set confirmed=true`,
        this.exchange,
        'NOT_CONFIRMED',
      );
    }
  }

  /**
   * BSE request Checksum = base64( AES-256-GCM( SHA256(payload) ) ), keyed by the
   * per-member AES key (cred.checksumKey, base64). Output framing = base64(iv | ciphertext | tag).
   * ⚠️ CONFIRM the nonce framing + output layout against BSE's reference sample before enabling.
   */
  /**
   * BSE derives the AES key from a hardcoded "IBBS" password on the live
   * service (confirmed against sir's working C# reference 2026-09-10), so
   * `cred.checksumKey` is OPTIONAL. When it is set, bseChecksum treats it
   * as an override — reserved for a future per-member key. Empty → the
   * default "IBBS" recipe.
   */
  private checksum(payload: string, cred: MemberCredential): string {
    return bseChecksum(payload, cred.checksumKey ?? '');
  }

  private authHeaders(session: AuthSession, cred: MemberCredential, payload: string): Record<string, string> {
    return {
      Membercode: cred.memberCode,
      Login: cred.loginId,
      Token: session.token,
      Checksum: this.checksum(payload, cred),
    };
  }

  async login(cred: MemberCredential): Promise<AuthSession> {
    if (!cred.ibbsId) throw new RailError('BSE iBBS login requires ibbsId', this.exchange, 'VALIDATION');
    const body = { membercode: cred.memberCode, loginid: cred.loginId, password: cred.password, ibbsid: cred.ibbsId };
    // Sir's working C# (2026-09-10) sends ONLY the Checksum header on login —
    // no Membercode/Login headers, and no Token (of course; this is the call
    // that mints it). The earlier Membercode/Login pair here was inferred
    // from the "authenticated call" shape below and shouldn't apply to /v1/login.
    const res = await httpJson<any>(this.url(cred, PATHS.login), {
      method: 'POST',
      exchange: this.exchange,
      headers: { Checksum: this.checksum(JSON.stringify(body), cred) },
      body,
    });
    const token = res?.token;
    if (!token || String(res?.errorcode ?? '') !== '0') {
      throw new RailError(res?.message ?? 'BSE login failed', this.exchange, res?.errorcode, undefined, res);
    }
    return { token: String(token), memberCode: cred.memberCode, loginId: cred.loginId };
  }

  /** /ipoorder payload (v1.05.5 §Place IPO Order — lowercase fields). */
  private toIpoOrderPayload(req: BidSubmission) {
    const isUpi = !!req.upi;
    return {
      scripid: req.symbol,
      applicationno: req.applicationNumber ?? '',
      category: req.category, // e.g. "ind" (individual); "RIC" for rights
      applicantname: req.applicantName ?? '',
      depository: req.depository, // "cdsl" | "nsdl"
      dpid: req.depository === 'CDSL' ? '0' : req.dpId, // CDSL → 0, NSDL → 8-char DP id
      clientbenfid: req.clientBenId, // CDSL 16-char, NSDL 8-char
      chequereceivedflag: 'n',
      chequeamount: '',
      panno: req.pan,
      // member-UPI → "8888"; member-ASBA → RBI/bank code (via asbaBlockRef bank ctx); banks → "0"
      bankname: isUpi ? '8888' : '',
      // member-UPI → "UPIIDL"; member-ASBA → location code; banks → "0"
      location: isUpi ? 'UPIIDL' : '',
      accountnumber_upiid: isUpi ? req.upi : (req.bankAccount ?? ''),
      ifsccode: req.ifsc ?? '',
      referenceno: req.asbaBlockRef ?? '',
      asba_upiid: isUpi ? '1' : '0', // 0=ASBA, 1=UPI bid, 2=others(bank users)
      bids: req.bids.map((b) => ({
        bidid: req.activity === 'new' ? '0' : (req.bidReferenceNumber ?? '0'),
        quantity: String(b.quantity),
        rate: b.atCutOff ? '0' : String(b.price ?? 0),
        cuttoffflag: b.atCutOff ? '1' : '0',
        orderno: b.remark ?? req.clientRef, // vendor's unique id
        actioncode: ACTION[req.activity],
      })),
    };
  }

  private parseIpoOrderResponse(req: BidSubmission, res: any): BidResult {
    // success: statuscode "00" (+ per-bid errorcode "0"); failure carries errorcode/errormessage
    const statuscode = String(res?.statuscode ?? '');
    const ok = statuscode === '00' || statuscode === '0';
    return {
      clientRef: req.clientRef,
      ok,
      applicationNumber: res?.applicationno,
      bidIds: (res?.bids ?? []).map((b: any) => b.bidid).filter((x: any) => x && x !== '0'),
      errorCode: res?.errorcode != null ? String(res.errorcode) : (ok ? undefined : statuscode),
      message: res?.statusmessage ?? res?.errormessage ?? res?.message,
      raw: res,
    };
  }

  private async postSigned<T = any>(cred: MemberCredential, session: AuthSession, path: string, body: unknown): Promise<T> {
    const payload = JSON.stringify(body);
    return httpJson<T>(this.url(cred, path), {
      method: 'POST',
      exchange: this.exchange,
      headers: this.authHeaders(session, cred, payload),
      body,
    });
  }

  async submitBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    this.assertConfirmed('submitBid');
    const res = await this.postSigned(cred, session, PATHS.ipoorder, this.toIpoOrderPayload(req));
    return this.parseIpoOrderResponse(req, res);
  }

  async submitBidsBulk(reqs: BidSubmission[], session: AuthSession, cred: MemberCredential): Promise<BidResult[]> {
    this.assertConfirmed('submitBidsBulk');
    // v1.05.5 §IPO Bulk Order API — many applications in one /ipoorderbulk call.
    const res = await this.postSigned<any>(cred, session, PATHS.ipoorderbulk, {
      orders: reqs.map((r) => this.toIpoOrderPayload(r)),
    });
    const rows: any[] = res?.orders ?? res?.data ?? (Array.isArray(res) ? res : []);
    return reqs.map((r, i) => this.parseIpoOrderResponse(r, rows[i] ?? res));
  }

  modifyBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    return this.submitBid({ ...req, activity: 'modify' }, session, cred);
  }

  cancelBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    return this.submitBid({ ...req, activity: 'cancel' }, session, cred);
  }

  // Reads live on the Message API (v1.03.5): openissue / orderdownload / allotment.
  // Wired in the BSE subscription/reconcile phase; gated until confirmed.
  async getIpoMaster(): Promise<IpoMasterEntry[]> {
    this.assertConfirmed('getIpoMaster');
    return [];
  }
  async fetchTransactions(_w: TimeWindow): Promise<TransactionRecord[]> {
    this.assertConfirmed('fetchTransactions');
    return [];
  }
  async getAllotment(_w: TimeWindow): Promise<AllotmentRecord[]> {
    this.assertConfirmed('getAllotment');
    return [];
  }
}
