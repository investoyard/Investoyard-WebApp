/**
 * NseQueryAdapter
 * -------------------------------------------------------------
 * Client for the NSE EIPO **Query Server** — a SEPARATE host from the WEB API.
 * Verified source: "API Document for NSE EIPO Query Server, v1.0.3.1, Jun 2025".
 *
 * Two read-only endpoints, HTTP **Basic** auth (no login/token):
 *   GET /mktdata/v1/demand/{symbol}   → absolute + cumulative demand at each price point
 *   GET /mktdata/v1/catwise/{symbol}  → category/sub-category wise total demand
 *
 * Auth header (doc §General Instructions):
 *   Authorization: Basic base64( "<memberCode>^<loginId>:<password>" )
 *   e.g. M001 / USER1 / Pass@123 → "Basic TTAwMV5VU0VSMTpQYXNzQDEyMw==" (asserted in spec).
 *
 * Base URL: the Query Server lives under the same member host as the WEB API,
 * at the "/mktdata" path (doc Appendix B: prod eipo.nseindia.com/eipo,
 * UAT uat-ipo.nseindia.com/eipo). So we derive it from the WEB API baseUrl by
 * appending "/mktdata" — one credential row serves both APIs.
 *
 * NOTE: the doc's method box confusingly says "POST" while the summary, the
 * "Request: Path Parameters" line and the absence of a body all describe a GET.
 * We use GET (path params only); flip to POST here if your member copy differs.
 */
import { httpJson } from './http';
import { MemberCredential, RailError } from './rail-adapter.types';

/** One row of category/sub-category demand from /catwise. */
export interface CatwiseRow {
  category: string;         // QIB / NIB / RETAIL / INDIV (SME) …
  subCategory?: string;     // IC / FII / MF / IND / CO …
  quantity: number;         // total demanded shares for the (cat, subcat)
  bidCount?: number;
}

/** One price-point row from /demand. */
export interface DemandRow {
  cutOffIndicator: boolean;
  price?: number;           // absent when cutOffIndicator = true
  absoluteQuantity: number;
  cumulativeQuantity: number;
  absoluteBidCount?: number;
  cumulativeBidCount?: number;
}

const EXCHANGE = 'NSE_EIPO' as const;

export class NseQueryAdapter {
  readonly exchange = EXCHANGE;

  /** Query Server base = WEB API base + "/mktdata" (doc Appendix B). */
  private base(cred: MemberCredential): string {
    return `${cred.baseUrl.replace(/\/+$/, '')}/mktdata`;
  }

  /** Basic auth over "<memberCode>^<loginId>:<password>". */
  authHeader(cred: MemberCredential): string {
    const raw = `${cred.memberCode}^${cred.loginId}:${cred.password}`;
    return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
  }

  private headers(cred: MemberCredential): Record<string, string> {
    return { Authorization: this.authHeader(cred), 'User-Agent': 'Investoyard/1.0' };
  }

  private assertOk(res: any, what: string): void {
    // The server returns status:"failed" + reason on business errors (HTTP 200).
    if (res?.status != null && String(res.status).toLowerCase() !== 'success') {
      throw new RailError(res?.reason ?? `${what} failed`, EXCHANGE, undefined, undefined, res);
    }
  }

  /** Category / sub-category wise total demand for an open issue. */
  async getCatwise(symbol: string, cred: MemberCredential): Promise<CatwiseRow[]> {
    const url = `${this.base(cred)}/v1/catwise/${encodeURIComponent(symbol)}`;
    const res = await httpJson<any>(url, { method: 'GET', exchange: EXCHANGE, headers: this.headers(cred) });
    this.assertOk(res, 'catwise');
    return (res?.demand ?? []).map((r: any) => ({
      category: r.category,
      subCategory: r.subCategory ?? r.subcategory,
      quantity: num(r.quantity) ?? 0,
      bidCount: num(r.bidCount),
    }));
  }

  /** Absolute + cumulative demand at each price point for an open issue. */
  async getDemand(symbol: string, cred: MemberCredential): Promise<DemandRow[]> {
    const url = `${this.base(cred)}/v1/demand/${encodeURIComponent(symbol)}`;
    const res = await httpJson<any>(url, { method: 'GET', exchange: EXCHANGE, headers: this.headers(cred) });
    this.assertOk(res, 'demand');
    return (res?.demand ?? []).map((r: any) => ({
      cutOffIndicator: !!r.cutOffIndicator,
      price: num(r.price),
      absoluteQuantity: num(r.absoluteQuantity) ?? 0,
      cumulativeQuantity: num(r.cumulativeQuantity) ?? 0,
      absoluteBidCount: num(r.absoluteBidCount),
      cumulativeBidCount: num(r.cumulativeBidCount),
    }));
  }
}

function num(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
