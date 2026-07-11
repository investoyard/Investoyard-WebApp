/**
 * Minimal JSON HTTP helper for rail adapters.
 * Node 18+ (global fetch). Swap for axios/got in the app if preferred.
 */
import { Exchange, RailError } from './rail-adapter.types';

export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** for RailError context */
  exchange: Exchange;
}

export async function httpJson<T = any>(url: string, opts: HttpOptions): Promise<T> {
  const { method = 'GET', headers = {}, body, timeoutMs = 15_000, exchange } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new RailError(`Non-JSON response (${res.status})`, exchange, undefined, res.status, text);
    }
    if (!res.ok) {
      throw new RailError(
        `HTTP ${res.status} from ${url}`,
        exchange,
        json?.errorcode ?? json?.errorCode,
        res.status,
        json,
      );
    }
    return json as T;
  } catch (err) {
    if (err instanceof RailError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new RailError(`Request timed out after ${timeoutMs}ms`, exchange, 'TIMEOUT');
    }
    throw new RailError((err as Error)?.message ?? 'Network error', exchange, 'NETWORK', undefined, err);
  } finally {
    clearTimeout(timer);
  }
}
