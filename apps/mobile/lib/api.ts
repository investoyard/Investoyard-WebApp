import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { IpoDetail, ApplicationView, CreateApplicationInput, CreateBulkApplicationInput, ConsentNotice, ConsentView, NotificationView, ProfileView, Depository } from '@investoyard/shared-types';
import { enrich, type IpoFull } from './ipoCalc';
import { UPI_MANDATE_MAX } from '@investoyard/shared-types';

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

export const API_BASE = resolveApiBase();

/* ---- the bank / branch / pincode directory ---------------------------
 * Reference data for the applicant form. PUBLIC — a person filling in their
 * first applicant has no profile yet, and none of this is about them.
 *
 * EVERY ONE OF THESE RETURNS EMPTY RATHER THAN THROWING, and the form reads
 * that as "no directory" and falls back to a plain text field. The masters
 * are filled by a separate import, so between a deploy and that import the
 * tables are empty — and a picker with nothing in it would make the bank
 * fields unfillable on the one screen an applicant cannot avoid.
 * ------------------------------------------------------------------- */

export interface BankOption { id: string; name: string; major?: boolean }
export interface BranchRow {
  id: string; ifsc: string; branch: string;
  city: string | null; district: string | null; state: string | null;
  bank: { id: string; name: string };
}
export interface PincodeRow { pincode: string; city: string | null; state: string | null; ambiguous: boolean }

async function dirGet<T>(path: string, signal?: AbortSignal, fallback?: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal });
    if (!res.ok) return fallback as T;
    /* READ AS TEXT, because Nest sends an EMPTY BODY for a `null` handler
       result rather than the string "null" — `res.json()` then throws
       "Unexpected end of JSON input". An unknown pincode is exactly that,
       and it is a normal answer on a field queried while someone types, so
       it must not travel as an exception. Verified live: /pincode/999999
       answers 200 with zero bytes. */
    const body = await res.text();
    if (!body) return fallback as T;
    return JSON.parse(body) as T;
  } catch {
    /* An ABORT lands here, and that is correct: the caller superseded this
       query a keystroke ago and is not waiting for it. So does a network
       failure — the form falls back to a plain text field either way. */
    return fallback as T;
  }
}

/** ~1,350 rows — loaded whole and filtered in memory, as web does. */
export const fetchBanks = () => dirGet<BankOption[]>('/profiles/banks', undefined, []);

/** States and UTs — a closed set of 36, so the form offers a real picker. */
export const fetchStates = () => dirGet<{ name: string; code: string | null }[]>('/profiles/states', undefined, []);

/**
 * Branch search. BANK-SCOPED and capped server-side — 1.82 lakh rows is not
 * something to pull to a phone. A pasted IFSC resolves exactly without a
 * bank, which is why `bankId` is optional: someone holding the code should
 * not have to find their bank in a list first.
 */
export function searchBranches(bankId: string | undefined, q: string, signal?: AbortSignal) {
  const qs: string[] = [];
  if (bankId) qs.push(`bankId=${encodeURIComponent(bankId)}`);
  if (q) qs.push(`q=${encodeURIComponent(q)}`);
  return dirGet<BranchRow[]>(`/profiles/bank-branches?${qs.join('&')}`, signal, []);
}

/**
 * City SUGGESTIONS, derived from the pincode directory rather than a master
 * of their own, so they can never disagree with what a pincode fills in. The
 * field still accepts a typed value the directory has never heard of — a
 * closed list could make a valid application unfillable, because the
 * registrar matches what the applicant’s BANK holds, not what we imported.
 */
export function searchCities(q: string, state?: string, signal?: AbortSignal) {
  const qs: string[] = [];
  if (q) qs.push(`q=${encodeURIComponent(q)}`);
  if (state) qs.push(`state=${encodeURIComponent(state)}`);
  return dirGet<{ city: string; state: string | null }[]>(`/profiles/cities?${qs.join('&')}`, signal, []);
}

/** Null for a pincode we do not carry — not an error; this runs while typing. */
export const lookupPincode = (pin: string, signal?: AbortSignal) =>
  dirGet<PincodeRow | null>(`/profiles/pincode/${encodeURIComponent(pin)}`, signal, null);


// The API's list endpoint returns full detail rows (same serializer as by-symbol),
// so cards can show subscription/reservation/lot expanders without a second fetch.
/**
 * The catalogue, WITH whether we actually reached the server.
 *
 * `getIpos()` collapses a network failure and an empty catalogue into the
 * same `[]`, so a screen cannot tell "no IPOs today" from "the API is
 * unreachable" - which is exactly what happened on 2026-10-26, when two test
 * devices showed an empty home screen and the only way to tell was the IIS
 * access log. A non-200 counts as unreachable too: a 502 is not an empty
 * catalogue.
 */
export type IposResult =
  | { ok: true; ipos: IpoFull[] }
  | { ok: false; reason: 'unreachable' };

export async function getIposResult(): Promise<IposResult> {
  try {
    const res = await fetch(`${API_BASE}/ipos`);
    if (!res.ok) {
      /* A STATUS means we reached something and it refused us - a Cloudflare
         challenge (403/503) looks nothing like a dead network, and only the
         status tells them apart. */
      if (__DEV__) console.warn(`[api] GET ${API_BASE}/ipos -> HTTP ${res.status} ${res.statusText}`);
      return { ok: false, reason: 'unreachable' };
    }
    return { ok: true, ipos: ((await res.json()) as IpoDetail[]).map(enrich) };
  } catch (e: any) {
    /* NO status means the request never completed: DNS, TLS trust, a blocked
       port, or a dropped connection. React Native reports most of these as the
       same "Network request failed", so the message is the only clue there is. */
    if (__DEV__) console.warn(`[api] GET ${API_BASE}/ipos FAILED before any response: ${e?.message ?? e}`);
    return { ok: false, reason: 'unreachable' };
  }
}

/**
 * Unchanged contract, on purpose. Callers that do not care about reachability
 * keep working exactly as before rather than being made to handle a throw they
 * were never written for.
 */
export async function getIpos(): Promise<IpoFull[]> {
  const r = await getIposResult();
  return r.ok ? r.ipos : [];
}

export async function getIpo(symbol: string): Promise<IpoFull | undefined> {
  try {
    const res = await fetch(`${API_BASE}/ipos/by-symbol/${encodeURIComponent(symbol)}`);
    if (res.ok) return enrich((await res.json()) as IpoDetail);
  } catch {}
  return undefined;
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

/**
 * The outcome of asking for a code.
 *
 * `no_account` and `have_account` are the WRONG-DOOR answers, and they now
 * arrive BEFORE an SMS is sent. Until this existed a new customer paid for a
 * code, typed it, and only then learned they had to sign up.
 */
export type OtpRequestResult =
  | { ok: true; requestId: string; channel?: string }
  | { ok: false; reason: 'no_account' | 'have_account' | 'unreachable' | 'refused'; message?: string };

/**
 * `intent` tells the server which door we are at. It is optional server-side,
 * so an older build that omits it keeps the old flow.
 */
export async function requestOtp(mobile: string, intent?: 'signin' | 'signup'): Promise<{ requestId: string; channel?: string }> {
  const r = await requestOtpResult(mobile, intent);
  if (r.ok) return { requestId: r.requestId, channel: r.channel };
  if (r.reason === 'unreachable') {
    /* No offline fallback. A `mock-` requestId opened the OTP screen on a
       request the server never saw, and the code below then accepted 123456
       against it — a login with no account behind it. */
    throw new Error('Could not reach Investoyard. Check your connection and try again.');
  }
  throw new Error(r.message ?? 'Could not send the code.');
}

/** The three-way form, for the login screen which needs to branch on it. */
export async function requestOtpResult(mobile: string, intent?: 'signin' | 'signup'): Promise<OtpRequestResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent ? { mobile, intent } : { mobile }),
    });
  } catch { return { ok: false, reason: 'unreachable' }; }
  if (res.ok) {
    const j = await res.json().catch(() => null);
    return j?.requestId ? { ok: true, requestId: j.requestId, channel: j.channel } : { ok: false, reason: 'refused' };
  }
  const b = await res.json().catch(() => null);
  const message = typeof b?.message === 'string' ? b.message : undefined;
  if (res.status === 404 || b?.code === 'NO_ACCOUNT') return { ok: false, reason: 'no_account', message };
  if (res.status === 409 || b?.code === 'HAVE_ACCOUNT') return { ok: false, reason: 'have_account', message };
  return { ok: false, reason: 'refused', message };
}

/**
 * The outcome of verifying an OTP, as three different things rather than one
 * null.
 *
 * It used to return `null` for every failure, so the screen said "Invalid
 * code" whether the code was wrong, the server was unreachable, or — once
 * signup became explicit — the number simply had no account yet. Telling a
 * NEW user that their correct OTP was invalid is the worst of those three.
 */
export type VerifyResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'no_account' | 'bad_otp' | 'unreachable'; message?: string };

/**
 * `name` is sent only when signing UP; an unknown mobile without it is refused.
 *
 * NO client-side `123456`. The server decides, and in production only the real
 * OTP is accepted (`SmsService`); an earlier version minted a `mock-token`
 * whenever the API was merely unreachable, so every authed screen then failed
 * one by one instead of the login saying what was wrong.
 */
export async function verifyOtp(requestId: string, otp: string, name?: string): Promise<VerifyResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name ? { requestId, otp, name } : { requestId, otp }),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (res.ok) {
    const j = await res.json().catch(() => null);
    return j?.accessToken ? { ok: true, accessToken: j.accessToken } : { ok: false, reason: 'bad_otp' };
  }
  const body = await res.json().catch(() => null);
  if (res.status === 404 || body?.code === 'NO_ACCOUNT') return { ok: false, reason: 'no_account' };
  return { ok: false, reason: 'bad_otp', message: typeof body?.message === 'string' ? body.message : undefined };
}


/**
 * Which sign-in methods this site can honour. Public — it describes the SITE,
 * not an account. The login screen reads it so it never offers a door that
 * cannot open.
 *
 * UNREACHABLE FALLS BACK TO "SMS AND PASSWORD", not to nothing: the login
 * screen must still work on a flaky connection, and those two are what the
 * server always supports. WhatsApp is the one that needs confirming, so it is
 * the one left off.
 */
export interface AuthMethods { sms: boolean; whatsapp: boolean; password: boolean }
export async function getAuthMethods(): Promise<AuthMethods> {
  try {
    const res = await fetch(`${API_BASE}/auth/methods`);
    if (res.ok) return await res.json();
  } catch {}
  return { sms: true, whatsapp: false, password: true };
}

/**
 * Sign in with mobile + password.
 *
 * Same three-way result as verifyOtp, and for the same reason — but WITHOUT a
 * `no_account` case, because the server deliberately will not say. Every
 * password failure is one `bad_password` carrying the server’s own wording,
 * which already names the way out (sign in with a code, set one in profile).
 */
export type PasswordResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'bad_password' | 'rate_limited' | 'unreachable'; message?: string };
export async function passwordLogin(mobile: string, password: string): Promise<PasswordResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/password/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, password }),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (res.ok) {
    const j = await res.json().catch(() => null);
    return j?.accessToken ? { ok: true, accessToken: j.accessToken } : { ok: false, reason: 'bad_password' };
  }
  const body = await res.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message : undefined;
  return { ok: false, reason: res.status === 429 ? 'rate_limited' : 'bad_password', message };
}

// ---- the customer’s own security settings ----
export interface SecuritySettings {
  otpChannel: 'sms' | 'whatsapp';
  hasPassword: boolean;
  available: AuthMethods;
}
export async function getSecurity(token: string): Promise<SecuritySettings | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/security`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}
/** Returns the server’s message on refusal, so a rejected channel says why. */
export async function setOtpChannel(token: string, channel: 'sms' | 'whatsapp'): Promise<{ ok: boolean; message?: string }> {
  return authedPost(token, '/auth/security/otp-channel', { channel });
}
export async function setPassword(token: string, password: string): Promise<{ ok: boolean; message?: string }> {
  return authedPost(token, '/auth/security/password', { password });
}
export async function clearPassword(token: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}/auth/security/password`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { ok: true };
    const b = await res.json().catch(() => null);
    return { ok: false, message: typeof b?.message === 'string' ? b.message : undefined };
  } catch {
    return { ok: false, message: 'Could not reach Investoyard.' };
  }
}
async function authedPost(token: string, path: string, body: any): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const b = await res.json().catch(() => null);
    const m = Array.isArray(b?.message) ? b.message.join(', ') : b?.message;
    return { ok: false, message: typeof m === 'string' ? m : undefined };
  } catch {
    return { ok: false, message: 'Could not reach Investoyard.' };
  }
}

export async function createApplication(token: string, input: CreateApplicationInput): Promise<ApplicationView> {
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (res.ok) { const j = await res.json(); return j.application ?? j; }
  } catch {}
  /*
   * THROW, never a local record. This used to push a fake application into an
   * in-memory list and RETURN IT AS SUCCESS, so an investor saw "applied",
   * found the row in their list, and nothing existed anywhere. An apply that
   * did not reach the server has to fail loudly — it is money and a bid window.
   */
  throw new Error('Your application could not be submitted — please check your connection and try again.');
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

/**
 * Change the UPI ID on a placed application (requirement 2).
 *
 * Throws with the SERVER's wording on refusal — "the funds are already blocked
 * …" is the whole value of this call, and a generic failure message would lose
 * the one sentence that tells the investor what to do instead.
 */
export async function changeApplicationUpi(
  token: string,
  id: string,
  upiId: string,
): Promise<{ restatedToExchange: number; note: string }> {
  const res = await fetch(`${API_BASE}/applications/${id}/change-upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ upiId }),
  });
  if (!res.ok) {
    let msg = `Could not save (HTTP ${res.status})`;
    try {
      const b = await res.json();
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch {}
    throw new Error(msg);
  }
  const b = await res.json();
  return b?.upiChange ?? { restatedToExchange: 0, note: 'Saved.' };
}

/**
 * Ask the issue's sponsor bank(s) to release funds left blocked after allotment.
 *
 * `dev: true` means SMTP is not configured: composed and recorded, NOT
 * delivered. The caller shows the server's `note`, which says so — telling an
 * investor it was sent would leave them waiting on a reply to a mail nobody got.
 */
export async function requestUnblock(
  token: string,
  id: string,
): Promise<{ sent: boolean; dev: boolean; to: string; stuckAmount?: number; note: string }> {
  const res = await fetch(`${API_BASE}/applications/${id}/unblock-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  if (!res.ok) {
    let msg = `Could not send (HTTP ${res.status})`;
    try {
      const b = await res.json();
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function listApplications(token: string): Promise<ApplicationView[]> {
  try {
    const res = await fetch(`${API_BASE}/applications`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return res.json();
  } catch {}
  /* Empty, not a stale local store — an investor must never be shown an
     application list that is missing bids they really placed. */
  return [];
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
// `investorProfileId`, so a failed create throws and the UI surfaces the reason
// (e.g. duplicate PAN). Every other call in this file now behaves the same way
// — the demo stores and offline fallbacks this comment used to contrast against
// were removed on 2026-10-09, because each of them reported success for
// something that had not happened.

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
  return UPI_MANDATE_MAX;
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

// ── Public allotment checker (registrar-truth PAN lookup; no auth) ───────────
export interface AllotmentResult {
  applicant: string; category: string; applicantType: string;
  lots: number; status: 'allotted' | 'not_allotted' | 'processing' | 'pending';
  allottedShares: number | null;
}
export interface AllotmentCheck {
  ipo: { symbol: string; name: string; allotmentDate: string | null };
  allotmentOut: boolean;
  found: boolean;
  results: AllotmentResult[];
}
export async function checkAllotment(ipoId: string, pan: string): Promise<AllotmentCheck> {
  const res = await fetch(`${API_BASE}/allotment/check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ipoId, pan }),
  });
  if (!res.ok) {
    let msg = 'Could not check right now.';
    try { const b = await res.json(); if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message); } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as AllotmentCheck;
}

// ── News + banners (public) ──────────────────────────────────────────────────
export interface PostView {
  slug: string; title: string; excerpt?: string | null; coverUrl?: string | null;
  ipoSymbol?: string | null; tags: string[]; author?: string | null; publishedAt?: string | null;
  body?: string;
}
export async function getPosts(limit = 24, ipo?: string): Promise<PostView[]> {
  try {
    const res = await fetch(`${API_BASE}/posts?limit=${limit}${ipo ? `&ipo=${encodeURIComponent(ipo)}` : ''}`);
    if (res.ok) return (await res.json()) as PostView[];
  } catch {}
  return [];
}
export async function getPost(slug: string): Promise<PostView | null> {
  try {
    const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(slug)}`);
    if (res.ok) return (await res.json()) as PostView;
  } catch {}
  return null;
}
export interface BannerView {
  id: string; title: string; subtitle?: string | null; imageUrl?: string | null;
  linkUrl?: string | null; ctaLabel?: string | null;
}
export async function getBanners(): Promise<BannerView[]> {
  try {
    const res = await fetch(`${API_BASE}/banners`);
    if (res.ok) return (await res.json()) as BannerView[];
  } catch {}
  return [];
}

// ── Watchlist (server-side reminders driving the hourly alert sweep) ─────────
export interface WatchlistItem { id: string; ipoId: string }
export async function listWatchlist(token: string): Promise<WatchlistItem[]> {
  try {
    const res = await fetch(`${API_BASE}/watchlist`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return (await res.json()) as WatchlistItem[];
  } catch {}
  return [];
}
export async function addWatchlist(token: string, ipoId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/watchlist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ipoId }),
    });
    return res.ok;
  } catch { return false; }
}
export async function removeWatchlist(token: string, ipoId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/watchlist/${ipoId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch { return false; }
}

/**
 * Is this stored session still backed by a real, active account?
 *
 * MIRRORS `checkConsumerSession` ON WEB, and exists for the same reason: the
 * token was hydrated out of SecureStore on launch and trusted, so an account
 * deleted or suspended in admin kept the app looking signed in until the token
 * expired — up to 30 days. The enforcement is in the API (JwtAuthGuard resolves
 * the subject and requires it to be active); this is what makes the app notice.
 *
 * THREE STATES, NOT TWO. Only an explicit rejection means the account is gone.
 * A phone that is out of signal must keep its session — signing someone out on
 * a dropped request would be worse than the bug being fixed, and a phone loses
 * signal far more often than a browser does.
 */
export async function checkSession(token: string): Promise<'ok' | 'gone' | 'unknown'> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403 || res.status === 404) return 'gone';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
