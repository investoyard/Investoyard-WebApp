import { Injectable } from '@nestjs/common';

/** Where a user is in a guided flow, keyed by their WhatsApp number. */
export interface WaSession {
  state:
    | 'browse'          // shown an IPO list
    | 'ipo_menu'        // shown an IPO's [Subscription][GMP][Apply]
    | 'apply_otp'       // waiting for the SMS code
    | 'apply_profile'   // waiting for applicant selection
    | 'apply_lots'      // waiting for a lot count
    | 'apply_confirm';  // waiting for Confirm/Cancel
  ipo?: string;         // selected symbol
  ipoId?: string;       // resolved server IPO id (for apply)
  lotSize?: number;
  price?: number;       // per-share (upper band, cut-off)
  userId?: string;      // resolved registered investor
  tenantId?: string;    // their home tenant (for the application)
  profileId?: string;   // chosen applicant
  lots?: number;
  otp?: string;         // pending SMS code
  otpExp?: number;
  at: number;           // last touched (for TTL)
}

const TTL_MS = 20 * 60 * 1000; // 20 min — abandoned flows expire

/**
 * In-memory per-user session store for the guided (multi-level) WhatsApp flow.
 * Single-instance (matches the current deployment). Swap to Redis for multi-instance.
 */
@Injectable()
export class WhatsappSessionService {
  private readonly map = new Map<string, WaSession>();

  get(from: string): WaSession | null {
    this.sweep();
    const s = this.map.get(from);
    if (!s) return null;
    if (Date.now() - s.at > TTL_MS) { this.map.delete(from); return null; }
    return s;
  }

  set(from: string, patch: Partial<WaSession> & { state: WaSession['state'] }): WaSession {
    const cur = this.map.get(from);
    const next: WaSession = { ...(cur ?? {}), ...patch, at: Date.now() } as WaSession;
    this.map.set(from, next);
    return next;
  }

  clear(from: string): void {
    this.map.delete(from);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.map) if (now - v.at > TTL_MS) this.map.delete(k);
  }
}
