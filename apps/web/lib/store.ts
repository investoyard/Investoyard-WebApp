'use client';
import type { DematAccountView } from '@investoyard/shared-types';
/**
 * Investoyard web — the small amount of client state the API cannot hold.
 *
 * WHAT THIS IS NOT ANY MORE. Until 2026-10-20 this file was a localStorage
 * MOCK of the whole product: `signIn()` minted three fake applicants ("Rahul
 * Sharma", PAN ABCDE1234F, a fake NSDL demat, kycStatus verified) into every
 * browser that logged in, `placeApplication()` fabricated an application with
 * a real-looking IY… number, and the portfolio walked a fake lifecycle with a
 * fake allotment and a fake listing gain. It caused three of sir's eight
 * reports in one round:
 *
 *   • the header avatar read "RS" for every customer for ever, because it was
 *     reading Rahul Sharma while the account page read the real API;
 *   • a signed-in customer whose `getIpoDetail()` call merely FAILED fell
 *     through to the fabricated path, was told the application was placed, and
 *     it existed nowhere — the identical fault removed from mobile 2026-10-09;
 *   • nothing could honestly be marked verified while a demo profile claimed
 *     to be already.
 *
 * So the standing rule is now true of this surface too: no mock fallbacks, no
 * synthesised data, an empty state is honest. The API owns applicants and
 * applications. What is left here is the two things a browser legitimately
 * keeps for itself.
 */
import { useSyncExternalStore } from 'react';
import type { Depository } from '@investoyard/shared-types';
import { getConsumerToken, listWatchlist, addWatchlist, removeWatchlist, type ApiProfile } from './consumer-api';
import { getIpoDetail } from './api';

export type Relationship = 'self' | 'spouse' | 'child' | 'parent' | 'sibling' | 'other';

export type KycStatus = 'unverified' | 'verified';

/**
 * An applicant as the screens use it — the shape `mapApiProfile` maps the API
 * row into. There is no local writer any more.
 */
export interface Profile {
  id: string;
  relationship: Relationship;
  fullName: string;
  pan: string;
  depository: Depository;
  dpId: string;
  clientId: string;
  /** Every demat on this applicant, default first — carried through from the
   *  API so the apply picker reads the same list the profile screen shows. */
  demats?: DematAccountView[];
  upiId?: string;
  bankAccount?: string;
  ifsc?: string;
  nominee?: string;
  kycStatus?: KycStatus;
  consent: boolean;
}

/**
 * Map a masked API applicant into the `Profile` shape the screens render.
 *
 * It lives here, beside the type it produces, because TWO surfaces need it —
 * the apply wizard and the portfolio's PAN cross-check — and a copy in each
 * is how two readings of one API row drift apart.
 */
export function mapApiProfile(p: ApiProfile): Profile {
  return {
    id: p.id,
    relationship: p.relationship as Relationship,
    fullName: p.fullName,
    pan: p.pan,
    depository: p.depository as Depository,
    dpId: p.dpId,
    clientId: p.clientId,
    /* Carried through so the picker reads the same list the profile screen
       shows. Without this the type would compile and the picker would never
       appear — a field on the type that nothing populates. */
    demats: p.demats,
    upiId: p.hasUpi ? 'upi-verified' : undefined,
    bankAccount: p.hasBank ? 'set' : undefined,
    ifsc: p.ifsc,
    kycStatus: (p.kycStatus as KycStatus) ?? 'unverified',
    consent: true,
  };
}

export type AppStatus =
  | 'draft' | 'submitted' | 'dp_verified' | 'dp_failed'
  | 'mandate_pending' | 'upi_blocked' | 'confirmed'
  | 'allotted' | 'not_allotted' | 'released' | 'rejected' | 'failed';

export type InvestorCategory = 'Retail' | 'sNII' | 'bNII';

/** An application as the screens use it — again, mapped from the API. */
export interface Application {
  id: string;
  ipoSymbol: string;
  ipoName: string;
  profileId: string;
  profileName: string;
  // applicant snapshot (what was actually submitted — for cross-check)
  pan?: string;
  depository?: Depository;
  dpId?: string;
  clientId?: string;
  upiId?: string;
  lots: number;
  shares: number;
  pricePerShare: number;
  atCutoff: boolean;
  category: InvestorCategory;
  amount: number;
  method: 'upi' | 'pdf';
  status: AppStatus;
  applicationNumber: string;
  createdAt: string;
  // lifecycle / allotment outcome, as the rail and the registrar report it
  amountBlocked?: number;
  amountReleased?: number;
  allottedShares?: number;
  listingGainPct?: number;
  categorySubscribedTimes?: number;
  allotmentOddsPct?: number;
  /** The two dates the investor is waiting on (YYYY-MM-DD). */
  allotmentDate?: string;
  listingDate?: string;
  /** While 'submitted': applicant details still blocking the exchange bid. */
  missingDetails?: string[];
  /** The exchange's own UPI sentence + when it was observed. */
  upiStatusText?: string;
  upiStatusAt?: string;
  /** When the depository confirmed this applicant's demat and PAN. */
  dpVerifiedAt?: string;
  /** Sponsor-bank unblock request state (see mayRequestUnblock). */
  unblockAvailable?: boolean;
  unblockReason?: string;
  unblockStuckAmount?: number;
  unblockRequestedAt?: string;
}

interface State {
  /** null = signed out. The reactive "is anyone here" signal for the chrome. */
  mobile: string | null;
  /**
   * The ACCOUNT HOLDER's own name, for the header avatar.
   *
   * It lives here rather than being read from `getConsumerUser()` because the
   * header has to re-render when it changes and a bare localStorage read does
   * not notify. It is the account's name and never an applicant's: the avatar
   * used to take the initials of the first applicant profile, which is how a
   * demo person's initials ended up on every signed-in header.
   */
  name: string | null;
  /** IPO symbols. Optimistic locally, authoritative on the server. */
  watchlist: string[];
}

const KEY = 'investoyard.web.v1';
const empty: State = { mobile: null, name: null, watchlist: [] };

let state: State = empty;
let loaded = false;
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === 'undefined') return empty;
  if (loaded) return state;
  try {
    const raw = window.localStorage.getItem(KEY);
    /* Spreading over `empty` DROPS keys this version no longer has, which is
       what retires the demo applicants and fabricated applications still sitting
       in the localStorage of anyone who signed in before today. */
    if (raw) state = { ...empty, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  loaded = true;
  return state;
}

function persist() {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  persist();
}

/* ----------------------------------------------------------- actions */
export const store = {
  load,
  /** Records who is signed in. Creates nothing — the API owns applicants. */
  signIn(mobile: string, name?: string | null) {
    load();
    set({ mobile, name: name ?? null });
    void store.syncWatchlist();
  },
  signOut() { set({ mobile: null, name: null }); },
  /**
   * Takes the account holder's name from the server (SessionCheck, once per
   * page load). The server is authoritative, so this OVERWRITES rather than
   * filling a gap: a name corrected in admin must win over what a browser
   * wrote down at sign-in. No-op when signed out, so a stale name cannot
   * reappear beside an empty session.
   */
  adoptName(name: string | null) {
    load();
    if (!state.mobile || state.name === name) return;
    set({ name });
  },
  toggleWatch(symbol: string) {
    load();
    const has = state.watchlist.includes(symbol);
    set({ watchlist: has ? state.watchlist.filter((s) => s !== symbol) : [...state.watchlist, symbol] }); // optimistic
    // Sync to the server watchlist for real (live-catalog) IPOs when signed in.
    if (typeof window !== 'undefined' && getConsumerToken()) {
      getIpoDetail(symbol)
        .then((d) => { if (d?.live && d.id) (has ? removeWatchlist(d.id) : addWatchlist(d.id)).catch(() => {}); })
        .catch(() => { /* keep local */ });
    }
  },
  /** Load the server watchlist (symbols) for a signed-in user; no-op otherwise. */
  async syncWatchlist() {
    if (typeof window === 'undefined' || !getConsumerToken()) return;
    try {
      const items = await listWatchlist();
      const symbols = items.map((i) => i.ipo?.symbol).filter((s): s is string => !!s);
      load();
      set({ watchlist: symbols });
    } catch { /* keep local */ }
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot() { return load(); },
};

/* ----------------------------------------------------------- hook */
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.snapshot()),
    () => selector(empty),
  );
}

/** Everything an applicant needs before a bid can be built from them. */
export function profileReady(p: Profile): boolean {
  return Boolean(p.fullName && p.pan && p.dpId && p.clientId && p.upiId && p.consent);
}
