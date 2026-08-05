'use client';
/**
 * Investoyard web — client-side mock store (localStorage-backed).
 * Stands in for the live API until it's hosted: auth (OTP), investor profiles
 * (self + family), applications, and the watchlist. One source of truth for the
 * apply / account / portfolio screens. Replace with real API calls for production.
 */
import { useSyncExternalStore } from 'react';
import type { Depository } from '@investoyard/shared-types';
import { getConsumerToken, listWatchlist, addWatchlist, removeWatchlist } from './consumer-api';
import { getIpoDetail } from './api';

export type Relationship = 'self' | 'spouse' | 'child' | 'parent' | 'sibling' | 'other';

export type KycStatus = 'unverified' | 'verified';

export interface Profile {
  id: string;
  relationship: Relationship;
  fullName: string;
  pan: string;            // stored masked-ish for demo
  depository: Depository;
  dpId: string;
  clientId: string;
  upiId?: string;
  bankAccount?: string;
  ifsc?: string;
  nominee?: string;
  kycStatus?: KycStatus;  // demo KYC state (PAN + demat verification)
  consent: boolean;
}

export type AppStatus =
  | 'draft' | 'submitted' | 'dp_verified' | 'dp_failed'
  | 'mandate_pending' | 'upi_blocked' | 'confirmed'
  | 'allotted' | 'not_allotted' | 'released' | 'rejected' | 'failed';

export type InvestorCategory = 'Retail' | 'sNII' | 'bNII';

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
  // lifecycle / allotment outcome (filled as the application progresses)
  amountBlocked?: number;
  amountReleased?: number;
  allottedShares?: number;
  listingGainPct?: number;
  // live subscription for this application's category (while the IPO is open)
  categorySubscribedTimes?: number;
  allotmentOddsPct?: number;
  /** While 'submitted': applicant details still blocking the exchange bid (from the API). */
  missingDetails?: string[];
}

interface State {
  mobile: string | null;          // null = signed out
  profiles: Profile[];
  applications: Application[];
  watchlist: string[];            // ipo symbols
}

const KEY = 'investoyard.web.v1';
const empty: State = { mobile: null, profiles: [], applications: [], watchlist: [] };

let state: State = empty;
let loaded = false;
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === 'undefined') return empty;
  if (loaded) return state;
  try {
    const raw = window.localStorage.getItem(KEY);
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

const rid = () => Math.random().toString(36).slice(2, 9);
const appNo = () => 'IY' + Math.floor(100000000 + Math.random() * 899999999);

/* ----------------------------------------------------------- actions */
export const store = {
  load,
  signIn(mobile: string) {
    load();
    // Fresh users get ready-to-use demo applicants so the apply flow is walkable immediately.
    const profiles = state.profiles.length ? state.profiles : demoProfiles();
    set({ mobile, profiles });
    void store.syncWatchlist(); // pull the server watchlist for this user
  },
  /** Fill an incomplete profile with realistic sample details (demo) so it becomes selectable. */
  fillSample(id: string) {
    load();
    set({
      profiles: state.profiles.map((p) =>
        p.id === id ? { ...p, ...sampleFor(p.relationship, p.fullName) } : p,
      ),
    });
  },
  signOut() { set({ mobile: null }); },
  addProfile(p: Omit<Profile, 'id'>) {
    load();
    set({ profiles: [...state.profiles, { ...p, id: rid() }] });
  },
  updateProfile(id: string, patch: Partial<Profile>) {
    load();
    set({ profiles: state.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  },
  verifyKyc(id: string) {
    load();
    set({ profiles: state.profiles.map((p) => (p.id === id ? { ...p, kycStatus: 'verified' } : p)) });
  },
  removeProfile(id: string) {
    load();
    set({ profiles: state.profiles.filter((p) => p.id !== id) });
  },
  placeApplication(a: Omit<Application, 'id' | 'applicationNumber' | 'createdAt' | 'status'>) {
    load();
    const app: Application = {
      ...a, id: rid(), applicationNumber: appNo(),
      createdAt: new Date().toISOString(), status: 'mandate_pending',
    };
    set({ applications: [app, ...state.applications] });
    return app;
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
  /** Demo: walk an application through its lifecycle (block → allotment → listing). */
  advanceApplication(id: string) {
    load();
    set({ applications: state.applications.map((a) => (a.id === id ? advanceApp(a) : a)) });
  },
  resetApplication(id: string) {
    load();
    set({
      applications: state.applications.map((a) =>
        a.id === id
          ? { ...a, status: 'mandate_pending', amountBlocked: undefined, amountReleased: undefined, allottedShares: undefined, listingGainPct: undefined }
          : a,
      ),
    });
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

export function profileReady(p: Profile): boolean {
  return Boolean(p.fullName && p.pan && p.dpId && p.clientId && p.upiId && p.consent);
}

/* ----------------------------------------------------------- demo / sample data */
const SAMPLES: Record<string, Omit<Profile, 'id' | 'relationship' | 'consent'>> = {
  self:   { fullName: 'Rahul Sharma',  pan: 'ABCDE1234F', depository: 'NSDL', dpId: 'IN300484', clientId: '10293847', upiId: 'rahul@okhdfc',  bankAccount: '5012 3456 7890', ifsc: 'HDFC0001234', nominee: 'Anjali Sharma', kycStatus: 'verified' },
  spouse: { fullName: 'Anjali Sharma', pan: 'FGHIJ5678K', depository: 'CDSL', dpId: '12081600', clientId: '56473829', upiId: 'anjali@okaxis', bankAccount: '9120 8845 1102', ifsc: 'UTIB0000456', nominee: 'Rahul Sharma',  kycStatus: 'verified' },
  child:  { fullName: 'Aarav Sharma',  pan: 'KLMNO9012P', depository: 'NSDL', dpId: 'IN302902', clientId: '88776655', upiId: 'aarav@okicici', bankAccount: '0337 1209 6634', ifsc: 'ICIC0000789', nominee: 'Rahul Sharma',  kycStatus: 'verified' },
  parent: { fullName: 'Suresh Sharma', pan: 'PQRST3456U', depository: 'CDSL', dpId: '12033200', clientId: '44332211', upiId: 'suresh@oksbi',  bankAccount: '2271 0098 4523', ifsc: 'SBIN0001122', nominee: 'Rahul Sharma',  kycStatus: 'verified' },
};

function sampleFor(rel: Relationship, keepName?: string): Omit<Profile, 'id' | 'relationship'> {
  const s = SAMPLES[rel] ?? SAMPLES.self;
  return { ...s, fullName: keepName || s.fullName, consent: true };
}

function demoProfiles(): Profile[] {
  return [
    { id: rid(), relationship: 'self', consent: true, ...SAMPLES.self },
    { id: rid(), relationship: 'spouse', consent: true, ...SAMPLES.spouse },
    { id: rid(), relationship: 'child', consent: true, ...SAMPLES.child },
  ];
}

/* ----------------------------------------------------------- application lifecycle (demo) */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Lifecycle stage index for a status: 1 submitted · 2 blocked · 3 allotment · 4 listing. */
export function appStage(a: Application): number {
  switch (a.status) {
    case 'mandate_pending': return 1;
    case 'upi_blocked': return 2;
    case 'allotted': return a.listingGainPct != null ? 4 : 3;
    case 'not_allotted': return 3;
    default: return 1;
  }
}

/** Returns the next state in the demo lifecycle. */
function advanceApp(a: Application): Application {
  switch (a.status) {
    case 'mandate_pending':
      // mandate approved / ASBA submitted → funds blocked
      return { ...a, status: 'upi_blocked', amountBlocked: a.amount };
    case 'upi_blocked': {
      // basis of allotment — demo "lottery" (deterministic by id)
      const allotted = hashStr(a.id) % 2 === 0;
      return allotted
        ? { ...a, status: 'allotted', allottedShares: a.shares, amountBlocked: a.amount, amountReleased: 0 }
        : { ...a, status: 'not_allotted', allottedShares: 0, amountBlocked: 0, amountReleased: a.amount };
    }
    case 'allotted':
      // listing day — demo gain between roughly -12% and +28%
      return a.listingGainPct != null ? a : { ...a, listingGainPct: (hashStr(a.id + 'L') % 41) - 12 };
    default:
      return a;
  }
}
