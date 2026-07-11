/**
 * BseIbbsAdapter  ⚠️ TEMPLATE — confirm against the DOMESTIC BSE Limited iBBS API doc
 * -------------------------------------------------------------
 * Structural template derived from the India INX iBBS API for IPO (v1.1),
 * which is the same iBBS system family as domestic BSE (https://ibbs.bseindia.com).
 *
 * The India INX doc is BSE's INTERNATIONAL exchange (GIFT City); the domestic
 * BSE Limited iBBS API is member-gated and must be obtained via BSE membership.
 * The shapes below (login: membercode/loginid/password/ibbsid → token;
 * POST /ipoorder with a bids[] array) are expected to match closely, but:
 *
 *   TO CONFIRM against the domestic doc:
 *   - base URL + api version segment
 *   - exact field names/casing (lowercase in India INX, e.g. "panno", "accountnumber_upiid")
 *   - domestic category codes (India INX used "IPODOM")
 *   - drop NOSTRO/SWIFT international fields (not used domestically)
 *   - UPI/ASBA field semantics (asba_upiid flag, location/bankCode usage)
 *   - status/allotment endpoints (India INX doc shown here only covers login + ipoorder)
 *
 * Marked methods throw NotConfirmed until validated, so it can't silently
 * submit against unverified assumptions in production.
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

const PATHS = {
  login: `/login`,
  ipoorder: `/ipoorder`,
  // TO CONFIRM: domestic BSE status/allotment/master endpoints
};

export class BseIbbsAdapter implements RailAdapter {
  readonly exchange = 'BSE_IBBS' as const;

  /** flip to true once validated against the domestic BSE iBBS doc + UAT */
  private readonly confirmed = false;

  private url(cred: MemberCredential, path: string) {
    return `${cred.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private assertConfirmed(op: string) {
    if (!this.confirmed) {
      throw new RailError(
        `BseIbbsAdapter.${op} not confirmed against the domestic BSE iBBS doc — obtain the member spec, validate on UAT, then set confirmed=true`,
        this.exchange,
        'NOT_CONFIRMED',
      );
    }
  }

  async login(cred: MemberCredential): Promise<AuthSession> {
    if (!cred.ibbsId) {
      throw new RailError('BSE iBBS login requires ibbsId', this.exchange, 'VALIDATION');
    }
    const res = await httpJson<any>(this.url(cred, PATHS.login), {
      method: 'POST',
      exchange: this.exchange,
      body: {
        membercode: cred.memberCode,
        loginid: cred.loginId,
        password: cred.password,
        ibbsid: cred.ibbsId,
      },
    });
    // India INX returns errorcode "0" + token on success.
    const token = res?.token;
    if (!token || (res?.errorcode != null && String(res.errorcode) !== '0')) {
      throw new RailError('Login failed / no token', this.exchange, res?.errorcode, undefined, res);
    }
    return { token: String(token), memberCode: cred.memberCode, loginId: cred.loginId };
  }

  /** India INX /ipoorder payload shape (lowercase fields). Confirm domestic field names. */
  private toIpoOrderPayload(req: BidSubmission) {
    const isUpi = !!req.upi;
    return {
      scripid: req.symbol,
      applicationno: req.applicationNumber ?? '',
      category: req.category, // domestic code TBD (India INX used "IPODOM")
      applicantname: req.applicantName ?? '',
      depository: req.depository,
      dpid: req.dpId,
      clientbenfid: req.clientBenId,
      chequereceivedflag: 'n',
      chequeamount: '',
      panno: req.pan,
      bankname: '',
      location: isUpi ? 'UPIIDL' : '',
      accountnumber_upiid: isUpi ? req.upi : (req.bankAccount ?? ''),
      ifsccode: req.ifsc ?? '',
      referenceno: req.asbaBlockRef ?? '',
      asba_upiid: '1',
      bids: req.bids.map((b) => ({
        bidid: req.activity === 'new' ? '' : (req.bidReferenceNumber ?? ''),
        quantity: String(b.quantity),
        rate: b.atCutOff ? '0' : String(b.price ?? 0),
        cuttoffflag: b.atCutOff ? '1' : '0',
        orderno: b.remark ?? req.clientRef,
        actioncode: req.activity === 'new' ? 'n' : req.activity === 'modify' ? 'm' : 'd',
      })),
    };
  }

  private parseIpoOrderResponse(req: BidSubmission, res: any): BidResult {
    const ok = res?.statuscode === '0' || res?.statuscode === 0;
    return {
      clientRef: req.clientRef,
      ok: !!ok,
      applicationNumber: res?.applicationno,
      bidIds: (res?.bids ?? []).map((b: any) => b.bidid).filter(Boolean),
      errorCode: res?.statuscode != null ? String(res.statuscode) : undefined,
      message: res?.statusmessage ?? res?.message,
      raw: res,
    };
  }

  async submitBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    this.assertConfirmed('submitBid');
    const res = await httpJson<any>(this.url(cred, PATHS.ipoorder), {
      method: 'POST',
      exchange: this.exchange,
      headers: { Token: session.token, Membercode: cred.memberCode, Login: cred.loginId },
      body: this.toIpoOrderPayload(req),
    });
    return this.parseIpoOrderResponse(req, res);
  }

  async submitBidsBulk(reqs: BidSubmission[], session: AuthSession, cred: MemberCredential): Promise<BidResult[]> {
    this.assertConfirmed('submitBidsBulk');
    // India INX doc shows single-order /ipoorder; domestic bulk/file-upload TBD.
    // Until confirmed, fan out sequentially (or use the file-upload utility BSE provides).
    const out: BidResult[] = [];
    for (const r of reqs) out.push(await this.submitBid(r, session, cred));
    return out;
  }

  modifyBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    return this.submitBid({ ...req, activity: 'modify' }, session, cred);
  }

  cancelBid(req: BidSubmission, session: AuthSession, cred: MemberCredential): Promise<BidResult> {
    return this.submitBid({ ...req, activity: 'cancel' }, session, cred);
  }

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
