import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { IpoDetail, ApplicationView, CreateApplicationInput, CreateBulkApplicationInput, ConsentNotice, ConsentView, NotificationView, ProfileView, Depository } from '@investoyard/shared-types';
import { enrich, type IpoFull } from './ipoCalc';

/**
 * Resolve the API base URL.
 *  1. EXPO_PUBLIC_API_URL wins (set it in apps/mobile/.env for a fixed host).
 *  2. Otherwise derive the dev machine's LAN IP from Expo's host URI so a
 *     physical phone in Expo Go reaches the API without hand-editing an IP
 *     ("localhost" on the phone would resolve to the phone itself).
 *  3. Fall back to localhost (simulator / web).
 */
function resolveApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const host = hostUri ? String(hostUri).split(':')[0] : null; // e.g. "192.168.1.5"
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:3000/api`;
  return 'http://localhost:3000/api';
}

const API_BASE = resolveApiBase();

const MOCK: IpoDetail[] = [
  {
    id: '1', symbol: 'ACME', name: 'Acme Technologies Ltd', type: 'mainboard', status: 'open',
    openDate: '2026-06-20', closeDate: '2026-06-22', allotmentDate: '2026-06-25', listingDate: '2026-06-27',
    priceBandMin: 100, priceBandMax: 105, lotSize: 142, minAmount: 14910, issueSize: '₹500 Cr', registrar: 'Link Intime',
    subscriptionTimes: 12.4, gmp: 18, gmpPct: 17.1,
    about: 'Acme Technologies is a cloud infrastructure company serving enterprise customers across India and South-East Asia.',
    subscription: [
      { category: 'qib', timesSubscribed: 24.1, asOf: '' },
      { category: 'nii', timesSubscribed: 9.8, asOf: '' },
      { category: 'retail', timesSubscribed: 6.2, asOf: '' },
      { category: 'total', timesSubscribed: 12.4, asOf: '' },
    ],
  },
  {
    id: '2', symbol: 'BETA', name: 'Beta Industries Ltd', type: 'sme', status: 'upcoming',
    openDate: '2026-06-26', closeDate: '2026-06-28', listingDate: '2026-07-03',
    priceBandMin: 55, priceBandMax: 58, lotSize: 2000, minAmount: 116000, issueSize: '₹42 Cr',
    gmp: 6, gmpPct: 10.3, about: 'Beta Industries manufactures precision auto components for OEMs.',
    smeCompliance: { meetsNorms: true, ebitdaTest: true, ofsPct: 18, gcpPct: 9 },
  },
  {
    id: '3', symbol: 'ZETA', name: 'Zeta Foods Ltd', type: 'mainboard', status: 'listed',
    openDate: '2026-06-05', closeDate: '2026-06-09', listingDate: '2026-06-13',
    priceBandMin: 220, priceBandMax: 230, lotSize: 65, minAmount: 14950, listingGainPct: 14.2, subscriptionTimes: 48.7,
  },
];

// The API's list endpoint returns full detail rows (same serializer as by-symbol),
// so cards can show subscription/reservation/lot expanders without a second fetch.
export async function getIpos(): Promise<IpoFull[]> {
  try {
    const res = await fetch(`${API_BASE}/ipos`);
    if (!res.ok) return MOCK.map(enrich);
    return ((await res.json()) as IpoDetail[]).map(enrich);
  } catch {
    return MOCK.map(enrich);
  }
}

export async function getIpo(symbol: string): Promise<IpoFull | undefined> {
  try {
    const res = await fetch(`${API_BASE}/ipos/by-symbol/${encodeURIComponent(symbol)}`);
    if (res.ok) return enrich((await res.json()) as IpoDetail);
  } catch {}
  // offline/dev fallback
  const m = MOCK.find((i) => i.symbol.toLowerCase() === symbol.toLowerCase());
  return m ? enrich(m) : undefined;
}

/** Record a standalone consent (e.g. the GMP disclaimer) for the signed-in user. */
export async function grantConsent(token: string, type: string, noticeVersion: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/consents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, noticeVersion }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getConsentNotices(): Promise<ConsentNotice[]> {
  try {
    const res = await fetch(`${API_BASE}/consent-notices`);
    if (res.ok) return (await res.json()) as ConsentNotice[];
  } catch {}
  return [];
}

export async function requestOtp(mobile: string): Promise<{ requestId: string }> {
  try {
    const res = await fetch(`${API_BASE}/auth/otp/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile }),
    });
    if (res.ok) return res.json();
  } catch {}
  return { requestId: `mock-${mobile}` }; // offline/dev fallback (use OTP 123456)
}

export async function verifyOtp(requestId: string, otp: string): Promise<{ accessToken: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/otp/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, otp }),
    });
    if (res.ok) return res.json();
  } catch {}
  return otp === '123456' ? { accessToken: 'mock-token' } : null; // dev fallback
}

// In-memory demo store of applications (until the live API/DB is wired).
const localApplications: ApplicationView[] = [];

export async function createApplication(token: string, input: CreateApplicationInput): Promise<ApplicationView> {
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (res.ok) { const j = await res.json(); return j.application ?? j; }
  } catch {}
  // dev fallback — record locally
  const app: ApplicationView = {
    id: `local-${localApplications.length + 1}`, ipoId: input.ipoId, status: 'mandate_pending',
    applyMethod: input.applyMethod, amount: 0,
  };
  localApplications.unshift(app);
  return app;
}

/** Family / group apply — the whole batch goes to the exchange as ONE bulk call. */
export async function createBulkApplication(token: string, input: CreateBulkApplicationInput): Promise<{ count: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/applications/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (res.ok) return res.json();
  } catch {}
  return null;
}

/** Withdraw a bid (SEBI: allowed while the issue is open). */
export async function withdrawApplication(token: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/applications/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listApplications(token: string): Promise<ApplicationView[]> {
  try {
    const res = await fetch(`${API_BASE}/applications`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return res.json();
  } catch {}
  return localApplications;
}

export async function registerDevice(token: string, deviceToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/devices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web', token: deviceToken }),
    });
  } catch {}
}

export async function getNotifications(token: string): Promise<NotificationView[]> {
  try {
    const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return (await res.json()) as NotificationView[];
  } catch {}
  return [];
}

export async function markNotificationRead(token: string, id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
  } catch {}
}

export async function listConsents(token: string): Promise<ConsentView[]> {
  try {
    const res = await fetch(`${API_BASE}/consents`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return (await res.json()) as ConsentView[];
  } catch {}
  return [];
}

export async function withdrawConsent(token: string, type: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/consents/${type}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Investor profiles (PII vault) ─────────────────────────────────────────────
// These MUST persist server-side: apply sends the server profile UUID as
// `investorProfileId`, so unlike the demo stores above there is no local fallback
// — a failed create throws so the UI can surface the reason (e.g. duplicate PAN).

export interface CreateProfileInput {
  relationship: string;
  fullName: string;
  pan: string;
  depository: Depository;
  dpId: string;
  clientId: string;
  upiId?: string;
  bankAccount?: string;
  ifsc?: string;
  dateOfBirth?: string;
  bankName?: string;
  branchName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
  mobile?: string;
}

/** Allowed UPI handles (the part after '@') — admin-managed master; empty on failure. */
export async function getUpiHandles(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/profiles/upi-handles`);
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

/** Operator's UPI-mandate cap (tenant feature setting) — ₹5,00,000 default. */
export async function getUpiCap(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/tenants`);
    if (res.ok) {
      const list = await res.json();
      const cap = Number(list?.[0]?.flags?.upiCap);
      if (Number.isFinite(cap) && cap > 0) return cap;
    }
  } catch {}
  return 500000;
}

/** Prefilled ASBA form PDF (one application, or a merged family set) as base64. */
export async function fetchAsbaFormsBase64(token: string, ids: string[]): Promise<string | null> {
  try {
    const res = ids.length === 1
      ? await fetch(`${API_BASE}/applications/${ids[0]}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      : await fetch(`${API_BASE}/applications/forms/pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids }),
        });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => { const s = String(r.result ?? ''); resolve(s.includes(',') ? s.split(',')[1] : null); };
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface RelationshipOption { name: string; allowMultiple: boolean }
/** Public list of applicant relationship options (admin-managed master). */
export async function getRelationships(): Promise<RelationshipOption[]> {
  try {
    const res = await fetch(`${API_BASE}/profiles/relationships`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function listProfiles(token: string): Promise<ProfileView[]> {
  try {
    const res = await fetch(`${API_BASE}/profiles`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return (await res.json()) as ProfileView[];
  } catch {}
  return [];
}

export async function createProfile(token: string, input: CreateProfileInput): Promise<ProfileView> {
  const res = await fetch(`${API_BASE}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `Could not save (HTTP ${res.status})`;
    try {
      const b = await res.json();
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as ProfileView;
}

/** Partial edit — omitted fields keep their values; PAN/bank/UPI replaced only when non-empty. */
export async function updateProfile(token: string, id: string, input: Partial<CreateProfileInput>): Promise<ProfileView> {
  const res = await fetch(`${API_BASE}/profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `Could not save (HTTP ${res.status})`;
    try {
      const b = await res.json();
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as ProfileView;
}

export async function deleteProfile(token: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/profiles/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}
