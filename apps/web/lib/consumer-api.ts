'use client';
import type { DematAccountView } from '@investoyard/shared-types';
/**
 * Consumer (B2C investor) API client + session. Separate from the operator session
 * (lib/operator.ts) — a customer signs in with mobile + OTP and gets their own JWT.
 * The token is used for the investor endpoints (profiles, applications, watchlist).
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const TKEY = 'investoyard.consumer.token';
const UKEY = 'investoyard.consumer.user';

export interface ConsumerUser { id: string; mobile: string; name?: string | null; tenantId?: string | null }

export function getConsumerToken(): string | null {
  try { return localStorage.getItem(TKEY); } catch { return null; }
}
export function getConsumerUser(): ConsumerUser | null {
  try { const v = localStorage.getItem(UKEY); return v ? (JSON.parse(v) as ConsumerUser) : null; } catch { return null; }
}
export function setConsumerSession(token: string, user: ConsumerUser) {
  try { localStorage.setItem(TKEY, token); localStorage.setItem(UKEY, JSON.stringify(user)); } catch { /* ignore */ }
}
export function clearConsumerSession() {
  try { localStorage.removeItem(TKEY); localStorage.removeItem(UKEY); } catch { /* ignore */ }
}

/** An error from the API, carrying what the UI needs to branch on. */
export interface ApiError extends Error { status?: number; code?: string }

/** The server's reply when the mobile has no account yet — route to signup. */
export const isNoAccount = (e: unknown): boolean =>
  (e as ApiError)?.code === 'NO_ACCOUNT' || (e as ApiError)?.status === 404;

async function req<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  const body = await res.text();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const b = JSON.parse(body);
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message;
      if (typeof b?.code === 'string') code = b.code;
    } catch { /* ignore */ }
    /* The STATUS and any server code ride along on the error. Callers used to
       get a bare string, so the only way to tell "no such account" from "the
       OTP was wrong" was to match on wording — which breaks the moment the
       wording is edited or translated. */
    const err = new Error(msg) as ApiError;
    err.status = res.status;
    if (code) err.code = code;
    throw err;
  }
  // Nest sends an EMPTY body when a handler returns null (and for 204) — not the
  // string "null" — so res.json() threw "Unexpected end of JSON input" on the
  // partner apply screen for anyone without an application yet. An empty 200
  // means "no content", so read it as null rather than an error.
  return (body ? JSON.parse(body) : null) as T;
}
const post = <T>(path: string, body: any) =>
  req<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Authenticated request with the consumer JWT (for profiles / applications, wired next). */
export function authedConsumer<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = getConsumerToken();
  if (!t) throw new Error('Not signed in');
  return req<T>(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } });
}

// ---- consents ----
/** Record a standalone consent (e.g. the GMP disclaimer) against the signed-in user. */
export const grantConsent = (type: string, noticeVersion: string) =>
  authedConsumer<{ id: string }>('/consents', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, noticeVersion }),
  });

// ---- auth (OTP) ----
/**
 * Is this stored session still backed by a real, active account?
 *
 * THE SESSION USED TO BE WHATEVER localStorage SAID. Nothing ever asked the
 * server, so an account deleted or suspended in admin went on rendering every
 * signed-in option until the token expired — up to 30 days (operator report,
 * 2026-10-20). The server half of that is fixed in JwtAuthGuard; this is what
 * makes the browser notice.
 *
 * IT REPORTS THREE STATES, NOT TWO, AND THAT IS THE WHOLE POINT. Only an
 * explicit rejection from the server means the account is gone. A timeout, a
 * dropped connection or a 5xx must leave the session exactly as it was —
 * signing someone out because their train went into a tunnel would be a worse
 * bug than the one being fixed.
 */
export async function checkConsumerSession(): Promise<'ok' | 'gone' | 'unknown'> {
  const t = getConsumerToken();
  if (!t) return 'ok'; // nothing to validate
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) return 'ok';
    // 401 the guard refused it · 404 the user row is gone · 403 not active
    if (res.status === 401 || res.status === 403 || res.status === 404) return 'gone';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Which sign-in methods this site can honour. Public — it describes the SITE,
 * not an account. The login screen reads it so it never offers a door that
 * cannot open: WhatsApp needs a Meta-approved template, and without one every
 * send is rejected, leaving someone waiting for a code that was never coming.
 */
export interface AuthMethods { sms: boolean; whatsapp: boolean; password: boolean }
export const fetchAuthMethods = () => req<AuthMethods>('/auth/methods', { method: 'GET' });

/**
 * Request an OTP. The reply says WHICH channel carried it, so the next screen
 * can name the app to look in rather than saying "check your messages".
 */
export const requestOtp = (mobile: string) => post<{ requestId: string; channel?: string }>('/auth/otp/request', { mobile });

/** Sign in with mobile + password. Opt-in; set from the customer’s own profile. */
export const passwordLogin = (mobile: string, password: string) =>
  post<{ accessToken: string; user: ConsumerUser }>('/auth/password/login', { mobile, password });

// ---- the customer’s own security settings ----
export interface SecuritySettings {
  otpChannel: 'sms' | 'whatsapp';
  hasPassword: boolean;
  available: AuthMethods;
}
export const fetchSecurity = () => authedConsumer<SecuritySettings>('/auth/security', { method: 'GET' });
export const setPassword = (password: string) =>
  authedConsumer<{ ok: boolean; hasPassword: boolean }>('/auth/security/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
export const clearPassword = () =>
  authedConsumer<{ ok: boolean; hasPassword: boolean }>('/auth/security/password', { method: 'DELETE' });
export const setOtpChannel = (channel: 'sms' | 'whatsapp') =>
  authedConsumer<{ ok: boolean; otpChannel: string }>('/auth/security/otp-channel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }) });
/**
 * Verify the OTP. `name` is sent ONLY when this is a signup: the same
 * endpoint serves both doors, and an unknown mobile without a name is
 * refused with NO_ACCOUNT rather than silently becoming an account, which is
 * what it used to do.
 */
export const verifyOtp = (requestId: string, otp: string, name?: string) =>
  post<{ accessToken: string; user: ConsumerUser }>('/auth/otp/verify', name ? { requestId, otp, name } : { requestId, otp });

// ---- investor profiles (self + family) ----
/** Admin-managed via Masters → Relationships; stored/compared lowercase. */
export type Relationship = string;
export interface RelationshipOption { name: string; allowMultiple: boolean }
/** Public list of relationship options (no auth needed). */
export const fetchRelationships = () => req<RelationshipOption[]>('/profiles/relationships', { method: 'GET' });
/** Public list of allowed UPI handles — the part after '@' (no auth needed). */
export const fetchUpiHandles = () => req<string[]>('/profiles/upi-handles', { method: 'GET' });

/* ---- public allotment check (registrar-style PAN lookup) ---- */
export interface AllotmentResult {
  applicant: string; category: string; applicantType?: string; lots: number;
  status: 'allotted' | 'not_allotted' | 'processing' | 'pending';
  allottedShares: number | null;
}
export interface AllotmentCheck {
  ipo: { symbol: string; name: string; allotmentDate: string | null };
  allotmentOut: boolean;
  found: boolean;
  results: AllotmentResult[];
}
export const checkAllotment = (ipoId: string, pan: string) =>
  req<AllotmentCheck>('/allotment/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ipoId, pan }),
  });
export type Depository = 'NSDL' | 'CDSL';

/** Masked view returned by the API — never carries raw PAN/UPI/bank. */
export interface ApiProfile {
  id: string;
  relationship: Relationship;
  fullName: string;
  pan: string;          // masked, e.g. ABC****4F
  depository: Depository;
  dpId: string;
  clientId: string;
  ifsc?: string;
  hasUpi: boolean;
  hasBank: boolean;
  kycStatus?: string;
  // contact/bank prefill fields (not vaulted) — shown in the edit form
  bankName?: string;
  branchName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
  mobile?: string;
  /** PAN is locked in the edit form once any application exists */
  hasApplications?: boolean;
  /**
   * EVERY demat on this applicant, default first — built server-side by
   * dematAccountsFor(). The depository/dpId/clientId above are the same
   * account as demats[0]; never join the two here.
   */
  demats?: DematAccountView[];
}
/** Raw input sent on create (PII encrypted server-side into the vault). */
export interface ProfileInput {
  relationship: Relationship;
  fullName: string;
  pan: string;
  dateOfBirth?: string;
  depository: Depository;
  dpId: string;
  clientId: string;
  bankAccount?: string;
  ifsc?: string;
  upiId?: string;
  bankName?: string;
  branchName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
  mobile?: string;
}

export const listProfiles = () => authedConsumer<ApiProfile[]>('/profiles', { method: 'GET' });
export const createProfile = (input: ProfileInput) =>
  authedConsumer<ApiProfile>('/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
/** Partial edit — omitted fields keep their values; PAN/bank/UPI replaced only when non-empty. */
export const updateProfile = (id: string, input: Partial<ProfileInput>) =>
  authedConsumer<ApiProfile>(`/profiles/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
/** Add an ADDITIONAL demat. Returns the whole refreshed applicant, so the caller
 *  never merges a partial response into its own copy. */
export const addDemat = (profileId: string, input: { depository: Depository; dpId?: string; clientId: string; label?: string }) =>
  authedConsumer<ApiProfile>(`/profiles/${profileId}/demat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
/** Retire one. Never a hard delete — a submitted bid names its demat to the exchange. */
export const retireDemat = (profileId: string, dematId: string) =>
  authedConsumer<ApiProfile>(`/profiles/${profileId}/demat/${dematId}`, { method: 'DELETE' });

/** Deletes when the applicant has no applications; otherwise deactivates (history kept). */
export const deleteProfile = (id: string) =>
  authedConsumer<{ deleted?: boolean; deactivated?: boolean }>(`/profiles/${id}`, { method: 'DELETE' });

// ---- applications ----
export interface CreateApplicationInput {
  investorProfileId: string;
  /** Which demat the allotment credits to. null/omitted = the applicant default. */
  dematAccountId?: string | null;
  ipoId: string;
  category: string;
  lots: number;
  atCutoff: boolean;
  bidPrice?: number;
  applyMethod: 'native' | 'pdf';
  applicantType?: 'individual' | 'shareholder' | 'employee';
  dataSharingConsent?: boolean;
  consentNoticeVersion?: string;
}
export interface CreateApplicationResult {
  application: { id: string; status?: string; createdAt?: string; amount?: number; lots?: number };
  status?: string;
  pdfUrl?: string;
}
export const createApplication = (input: CreateApplicationInput) =>
  authedConsumer<CreateApplicationResult>('/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });

export interface ApiApplication {
  id: string;
  ipoId: string;
  ipoSymbol: string;
  ipoName: string;
  status: string;
  applyMethod: 'native' | 'pdf';
  category?: string;
  lots?: number;
  shares?: number;
  profileName?: string;
  relationship?: string;
  createdAt?: string;
  amount: number;
  applicationNumber?: string;
  amountBlocked?: number;
  allottedLots?: number;
  allottedShares?: number;
  allottedAmount?: number;
  refundAmount?: number;
  allottedAt?: string;
  ipoStatus?: string;
  listingGainPct?: number;
  listingGain?: number;
  categorySubscribedTimes?: number;
  allotmentOddsPct?: number;
  /** While 'submitted': applicant details still blocking the exchange bid. */
  missingDetails?: string[];
  /** The exchange's own sentence about the UPI mandate, and when it was observed. */
  upiStatusText?: string;
  upiStatusAt?: string;
  /** Sponsor-bank unblock request — decided server-side by `mayRequestUnblock`. */
  unblockAvailable?: boolean;
  unblockReason?: string;
  unblockStuckAmount?: number;
  unblockRequestedAt?: string;
}
export const listApplications = () => authedConsumer<ApiApplication[]>('/applications', { method: 'GET' });

/**
 * Change the UPI ID on a placed application (requirement 2).
 *
 * `restatedToExchange` is how many of that APPLICANT's live bids were queued
 * for a modify — the UPI lives on the applicant, not the application, so a
 * change can reach more bids than the one the investor was looking at. Show the
 * server's `note` rather than composing your own; it is the one that knows.
 */
/**
 * Ask the issue's sponsor bank(s) to release funds left blocked after allotment.
 *
 * `dev: true` means SMTP is not configured on the server: the request was
 * composed and recorded but NOT delivered. Show that distinction — telling an
 * investor it was sent would leave them waiting on a reply to a mail nobody
 * received.
 */
export const requestUnblock = (id: string) =>
  authedConsumer<{ sent: boolean; dev: boolean; to: string; stuckAmount?: number; note: string }>(
    `/applications/${id}/unblock-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );

export const changeApplicationUpi = (id: string, upiId: string) =>
  authedConsumer<ApiApplication & {
    upiChange: { saved: boolean; restatedToExchange: number; note: string };
  }>(`/applications/${id}/change-upi`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upiId }),
  });

/** Fetch a PDF (with auth) and trigger a browser download using the server's filename. */
async function downloadPdf(path: string, method: 'GET' | 'POST', body?: any): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${getConsumerToken() ?? ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `Could not generate the form (${res.status})`); }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const filename = /filename="?([^"]+)"?/.exec(cd)?.[1] || 'asba-form.pdf';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
/** Download one applicant's prefilled ASBA form. */
export const downloadAsbaForm = (applicationId: string) => downloadPdf(`/applications/${applicationId}/pdf`, 'GET');
/** Download a merged PDF of several applications' forms (family apply). */
export const downloadAsbaForms = (ids: string[]) => downloadPdf('/applications/forms/pdf', 'POST', { ids });

// ---- watchlist ----
export interface WatchlistItem {
  id: string;
  ipoId: string;
  ipo?: { id: string; name: string; symbol: string; openDate?: string; status?: string } | null;
}
export const listWatchlist = () => authedConsumer<WatchlistItem[]>('/watchlist', { method: 'GET' });
export const addWatchlist = (ipoId: string) =>
  authedConsumer<any>('/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ipoId }) });
export const removeWatchlist = (ipoId: string) =>
  authedConsumer<any>(`/watchlist/${ipoId}`, { method: 'DELETE' });

/* ---- GMP entry (contributors + operators with gmp.submit) ---- */
export interface GmpBoardRow {
  id: string; symbol: string; name: string; type: string; status: string;
  logoUrl?: string | null; priceBandMin?: number; priceBandMax?: number;
  openDate?: string; closeDate?: string;
  currentGmp: number | null; currentBy: string | null; currentAt: string | null;
}
export const gmpAccess = () => authedConsumer<{ allowed: boolean }>('/gmp-entry/access', { method: 'GET' });
export const gmpBoard = () => authedConsumer<GmpBoardRow[]>('/gmp-entry/board', { method: 'GET' });
export const gmpSubmit = (entries: { ipoId: string; value: number }[]) =>
  authedConsumer<{ saved: number; errors: string[] }>('/gmp-entry', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
  });

/* ---- partner self-onboarding (applicant side) ---- */
export interface PartnerApplyInput {
  kind?: string; contactName: string; email: string;
  entityType?: string; legalName: string; pan?: string; gstin?: string;
  city?: string; state?: string; sebiRegNo?: string; arn?: string; notes?: string;
  documents?: { type: string; url: string; name?: string }[];
}
export interface MyPartnerApplication {
  id: string; status: 'submitted' | 'changes_requested' | 'approved' | 'rejected';
  kind: string; legalName: string; contactName: string; email: string;
  entityType?: string | null; gstin?: string | null; city?: string | null; state?: string | null;
  sebiRegNo?: string | null; arn?: string | null; notes?: string | null; panMasked?: string | null;
  documents: { type: string; url: string; name?: string }[];
  reviewNote?: string | null; createdAt: string; reviewedAt?: string | null;
}
export const submitPartnerApplication = (body: PartnerApplyInput) =>
  authedConsumer<{ id: string; status: string }>('/partner-apply', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
export const myPartnerApplication = () =>
  authedConsumer<MyPartnerApplication | null>('/partner-apply/mine', { method: 'GET' });
/** No session — the token from the approval email is the credential. */
export const activatePartner = (token: string, password: string) =>
  req<{ ok: boolean; username: string }>('/partner-activate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }),
  });
