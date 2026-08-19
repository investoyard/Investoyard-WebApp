'use client';
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

async function req<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const b = await res.json(); if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
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
export const requestOtp = (mobile: string) => post<{ requestId: string }>('/auth/otp/request', { mobile });
export const verifyOtp = (requestId: string, otp: string) =>
  post<{ accessToken: string; user: ConsumerUser }>('/auth/otp/verify', { requestId, otp });

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
/** Deletes when the applicant has no applications; otherwise deactivates (history kept). */
export const deleteProfile = (id: string) =>
  authedConsumer<{ deleted?: boolean; deactivated?: boolean }>(`/profiles/${id}`, { method: 'DELETE' });

// ---- applications ----
export interface CreateApplicationInput {
  investorProfileId: string;
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
}
export const listApplications = () => authedConsumer<ApiApplication[]>('/applications', { method: 'GET' });

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
