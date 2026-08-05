/**
 * Investoyard rail adapters — barrel + orchestrator.
 */
export * from './rail-adapter.types';
export { NseEipoAdapter } from './nse-eipo.adapter';
export type { HolidayEntry } from './nse-eipo.adapter';
export { NseQueryAdapter } from './nse-query.adapter';
export type { CatwiseRow, DemandRow } from './nse-query.adapter';
export { BseIbbsAdapter } from './bse-ibbs.adapter';
export { BseQueryAdapter } from './bse-query.adapter';
export type { BseDemandRow } from './bse-query.adapter';

// Framework-agnostic callback + submission building blocks (the NestJS
// controller stays in the app, not the shared package).
export * from './callbacks/rail-callback.dto';
export * from './callbacks/rail-callback.auth';
export { RailCallbackService } from './callbacks/rail-callback.service';
export type { ApplicationRepo, Notifier } from './callbacks/rail-callback.service';
export * from './submission/submission-worker';

import { NseEipoAdapter } from './nse-eipo.adapter';
import { BseIbbsAdapter } from './bse-ibbs.adapter';
import {
  AuthSession,
  BidResult,
  BidSubmission,
  Exchange,
  MemberCredential,
  RailAdapter,
} from './rail-adapter.types';

/** Returns the adapter for an exchange. */
export function getAdapter(exchange: Exchange): RailAdapter {
  switch (exchange) {
    case 'NSE_EIPO':
      return new NseEipoAdapter();
    case 'BSE_IBBS':
      return new BseIbbsAdapter();
    default:
      throw new Error(`No adapter for exchange ${exchange}`);
  }
}

/**
 * Thin orchestrator with a per-credential session cache.
 * The app wraps this with: queue-backed submission (closing-day bursts),
 * idempotency keys, and persistence of BidResult → `application` rows.
 */
export class RailOrchestrator {
  private sessions = new Map<string, AuthSession>();

  constructor(private resolveCredential: (id: string) => Promise<MemberCredential>) {}

  private async session(cred: MemberCredential): Promise<AuthSession> {
    const cached = this.sessions.get(cred.id);
    if (cached && (!cached.expiresAt || cached.expiresAt > Date.now() + 30_000)) return cached;
    const adapter = getAdapter(cred.exchange);
    const s = await adapter.login(cred);
    this.sessions.set(cred.id, s);
    return s;
  }

  /** Pick the member credential to submit a given IPO under (per-issue economics/coverage). */
  async submit(req: BidSubmission, memberCredentialId: string): Promise<BidResult> {
    const cred = await this.resolveCredential(memberCredentialId);
    const adapter = getAdapter(cred.exchange);
    const session = await this.session(cred);
    return adapter.submitBid(req, session, cred);
  }

  /** Family group / batch under one credential. */
  async submitBulk(reqs: BidSubmission[], memberCredentialId: string): Promise<BidResult[]> {
    const cred = await this.resolveCredential(memberCredentialId);
    const adapter = getAdapter(cred.exchange);
    const session = await this.session(cred);
    return adapter.submitBidsBulk(reqs, session, cred);
  }
}
