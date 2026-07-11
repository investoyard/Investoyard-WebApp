import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { IpoListItem, IpoDetail, ApplicationView, CreateApplicationInput, CreateBulkApplicationInput, ConsentNotice, ConsentView, NotificationView } from '@investoyard/shared-types';

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

export async function getIpos(): Promise<IpoListItem[]> {
  try {
    const res = await fetch(`${API_BASE}/ipos`);
    if (!res.ok) return MOCK;
    return (await res.json()) as IpoListItem[];
  } catch {
    return MOCK;
  }
}

export async function getIpo(symbol: string): Promise<IpoDetail | undefined> {
  try {
    const res = await fetch(`${API_BASE}/ipos/by-symbol/${encodeURIComponent(symbol)}`);
    if (res.ok) return (await res.json()) as IpoDetail;
  } catch {}
  // offline/dev fallback
  return MOCK.find((i) => i.symbol.toLowerCase() === symbol.toLowerCase());
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
