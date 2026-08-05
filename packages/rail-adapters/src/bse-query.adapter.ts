/**
 * BseQueryAdapter — BSE iBBS **Message API** (reads/subscription).
 * Source: "iBBS HTTP Message API v1.03.5".
 *
 * Separate service from the bidding API, same login + Checksum auth:
 *   UAT  https://uat.bseindia.in/ibbsmsgapi/iBBSWebBroadcastApi.svc
 *   (derived from the bidding baseUrl by swapping the service segment)
 *
 * Category-wise subscription comes from POST /demandschedule
 *   req  { symbol, issuetype }
 *   res  [{ symbol, totalapplication, category, subcategory, type:'P'|'C', qty }]
 *
 * ⚠️ GATED like the bidding adapter — needs the BSE checksum validated + UAT creds.
 * `getDemandSchedule` throws until we confirm; the poller catches and falls back to
 * NSE-only, so a missing/failing BSE side never breaks combined subscription.
 */
import { bseChecksum } from './bse-checksum';
import { httpJson } from './http';
import { MemberCredential, RailError } from './rail-adapter.types';

/** One category/sub-category demand row from /demandschedule. */
export interface BseDemandRow {
  category: string;      // IND / QIB / NIB / …
  subCategory?: string;  // RII / OTHER / …
  quantity: number;      // demanded shares
  applications?: number; // totalapplication for the row
  atCutoff?: boolean;    // type: 'C' = cutoff, 'P' = price
}

const EXCHANGE = 'BSE_IBBS' as const;
const MSG_LOGIN = `/login`;
const MSG_DEMAND = `/v1/demandschedule`; // CONFIRM version segment against UAT

/** default equity book-building issue type (doc Annexure-I: "BB"). */
const DEFAULT_ISSUE_TYPE = 'BB';

export class BseQueryAdapter {
  readonly exchange = EXCHANGE;

  /** Confirmed only once the checksum + endpoint paths are validated on UAT. */
  private readonly confirmed = false;

  /** Derive the Message-API base from the bidding baseUrl (same host, different service). */
  msgBaseUrl(cred: MemberCredential): string {
    const base = cred.baseUrl.replace(/\/$/, '');
    const swapped = base.replace(/\/ibbsapi\/ibbsapiservice\.svc$/i, '/ibbsmsgapi/iBBSWebBroadcastApi.svc');
    return swapped;
  }

  private checksum(payload: string, cred: MemberCredential): string {
    if (!cred.checksumKey) throw new RailError('BSE checksum key not configured', EXCHANGE, 'CONFIG');
    return bseChecksum(payload, cred.checksumKey);
  }

  /** Message-API login → token (separate session from the bidding API). */
  async login(cred: MemberCredential): Promise<string> {
    if (!cred.ibbsId) throw new RailError('BSE message login requires ibbsId', EXCHANGE, 'VALIDATION');
    const body = { membercode: cred.memberCode, loginid: cred.loginId, password: cred.password, ibbsid: cred.ibbsId };
    const res = await httpJson<any>(`${this.msgBaseUrl(cred)}${MSG_LOGIN}`, {
      method: 'POST',
      exchange: EXCHANGE,
      headers: { Membercode: cred.memberCode, Login: cred.loginId, Checksum: this.checksum(JSON.stringify(body), cred) },
      body,
    });
    const token = res?.token;
    if (!token || String(res?.errorcode ?? '') !== '0') {
      throw new RailError(res?.message ?? 'BSE message login failed', EXCHANGE, res?.errorcode, undefined, res);
    }
    return String(token);
  }

  /** Category-wise demand schedule for one open issue. */
  async getDemandSchedule(symbol: string, token: string, cred: MemberCredential, issueType = DEFAULT_ISSUE_TYPE): Promise<BseDemandRow[]> {
    if (!this.confirmed) {
      throw new RailError('BseQueryAdapter.getDemandSchedule is gated — validate checksum + paths on UAT', EXCHANGE, 'NOT_CONFIRMED');
    }
    const body = { symbol, issuetype: issueType };
    const payload = JSON.stringify(body);
    const res = await httpJson<any>(`${this.msgBaseUrl(cred)}${MSG_DEMAND}`, {
      method: 'POST',
      exchange: EXCHANGE,
      headers: { Membercode: cred.memberCode, Login: cred.loginId, Token: token, Checksum: this.checksum(payload, cred) },
      body,
    });
    const rows: any[] = Array.isArray(res) ? res : (res?.data ?? []);
    return rows
      .filter((r) => r && r.category)
      .map((r) => ({
        category: r.category,
        subCategory: r.subcategory ?? r.subCategory,
        quantity: num(r.qty) ?? 0,
        applications: num(r.totalapplication),
        atCutoff: String(r.type ?? '').toUpperCase() === 'C',
      }));
  }
}

function num(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
