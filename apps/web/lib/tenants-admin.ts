'use client';
/**
 * Admin API client for the live tenant tree + settings cascade (apps/api).
 * This is the first admin surface backed by the real API rather than the mock store.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export interface AdminTenant {
  id: string; slug: string; name: string;
  type: 'platform' | 'direct' | 'partner' | 'branch';
  parentId: string | null;
  customDomain?: string; brandColor?: string; status: string;
  flags: Record<string, any>;
}
export interface Feature {
  key: string; label: string; description?: string;
  valueType: 'boolean' | 'number' | 'string'; defaultValue: any; isPublic: boolean;
}
export interface ResolvedSetting { value: any; locked: boolean; source: string }
export type Resolved = Record<string, ResolvedSetting>;

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const b = await res.json(); if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/**
 * Admin API session. The settings writes require `tenants.manage`, so we obtain a
 * real JWT for an admin user. DEV: signs in as the seeded Platform Admin via the OTP
 * stub (123456); PROD: replace with proper admin SSO / login.
 */
const ADMIN_MOBILE = process.env.NEXT_PUBLIC_ADMIN_MOBILE ?? '9000000001';
let cachedToken: string | null = null;

async function adminToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  try { const s = sessionStorage.getItem('iy_admin_token'); if (s) return (cachedToken = s); } catch { /* ignore */ }
  const rq = await fetch(`${API}/auth/otp/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: ADMIN_MOBILE }) }).then(j<{ requestId: string }>);
  const vr = await fetch(`${API}/auth/otp/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: rq.requestId, otp: '123456' }) }).then(j<{ accessToken: string }>);
  cachedToken = vr.accessToken;
  try { sessionStorage.setItem('iy_admin_token', cachedToken); } catch { /* ignore */ }
  return cachedToken;
}

async function authed<T>(url: string, init: RequestInit): Promise<T> {
  const doFetch = async () => fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await adminToken()}` } });
  let res = await doFetch();
  if (res.status === 401) { cachedToken = null; try { sessionStorage.removeItem('iy_admin_token'); } catch {} res = await doFetch(); }
  return j<T>(res);
}

export const fetchTree = () => fetch(`${API}/tenants/tree`).then(j<AdminTenant[]>);
export const fetchCatalog = () => fetch(`${API}/settings/catalog`).then(j<Feature[]>);
export const fetchResolved = (slug: string) =>
  fetch(`${API}/settings/${slug}`).then(j<{ tenant: { id: string; slug: string; name: string }; settings: Resolved }>);

export const setOverride = (slug: string, key: string, value: any, locked: boolean) =>
  authed<Resolved>(`${API}/settings/${slug}/${key}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, locked }),
  });

export const clearOverride = (slug: string, key: string) =>
  authed<Resolved>(`${API}/settings/${slug}/${key}`, { method: 'DELETE' });

/* -------------------------------------------------- admin: roles & operators */
export interface Role { id: string; name: string; scope: string; permissions: string[]; isSystem: boolean }
export interface Member {
  membershipId: string; userId: string; mobile: string; name?: string;
  userStatus: string; status: string; roleName: string; roleScope: string;
  tenantSlug: string; tenantName: string; createdAt: string;
}

export interface Permission { key: string; label: string; group: string }
export const fetchRoles = () => authed<Role[]>(`${API}/admin/roles`, { method: 'GET' });
export const fetchPermissions = () => authed<Permission[]>(`${API}/admin/permissions`, { method: 'GET' });
export const createRole = (body: { name: string; scope: string; permissions: string[] }) =>
  authed<Role>(`${API}/admin/roles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateRole = (id: string, body: { scope?: string; permissions?: string[] }) =>
  authed<Role>(`${API}/admin/roles/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteRole = (id: string) => authed<any>(`${API}/admin/roles/${id}`, { method: 'DELETE' });
export const fetchMembers = (slug: string) => authed<Member[]>(`${API}/admin/members/${slug}`, { method: 'GET' });
export const addMember = (slug: string, body: { mobile: string; name?: string; roleName: string }) =>
  authed<Member>(`${API}/admin/members/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateMember = (slug: string, membershipId: string, patch: { roleName?: string; status?: 'active' | 'inactive' }) =>
  authed<Member>(`${API}/admin/members/${slug}/${membershipId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });

/* -------------------------------------------------- admin: IPO catalog (global) */
export interface AdminIpo {
  id: string; symbol: string; name: string; type: 'mainboard' | 'sme';
  status: 'upcoming' | 'open' | 'closed' | 'listed' | 'withdrawn';
  priceBandMin?: number; priceBandMax?: number; lotSize?: number; issueSize?: string;
  openDate?: string; closeDate?: string; registrar?: string; gmp?: number; reservations?: string[];
}
export interface IpoWrite {
  symbol?: string; name?: string; type?: string; status?: string;
  priceBandMin?: number; priceBandMax?: number; lotSize?: number; minAmount?: number;
  issueSizeCr?: number; registrar?: string; openDate?: string; closeDate?: string;
  reservations?: string[]; gmp?: number; listingGainPct?: number;
}

/* -------------------------------------------------- admin: applications (bids) */
export interface AdminApplication {
  id: string; tenantSlug: string; ipoSymbol: string; ipoName: string;
  applicantName?: string; mobileMasked?: string; category: string; applicantType: string;
  lots: number; amount: number; status: string; allottedLots?: number; refundAmount?: number; appliedAt: string;
}
export const fetchApplications = (slug: string) => authed<AdminApplication[]>(`${API}/admin/applications/${slug}`, { method: 'GET' });

export interface AdminReport {
  scope: { slug: string; name: string };
  totals: { applications: number; amount: number; byStatus: Record<string, number> };
  allotment: { allotted: number; notAllotted: number; pending: number; allotmentRate: number | null; totalRefund: number; totalAllottedAmount: number };
  byIpo: { symbol: string; name: string; applications: number; amount: number; allotted: number }[];
}
export const fetchReports = (slug: string) => authed<AdminReport>(`${API}/admin/reports/${slug}`, { method: 'GET' });

export interface AdminDashboard {
  scope: { slug: string; name: string };
  counts: { tenants: number; operators: number; iposOpen: number; iposTotal: number; applications: number; amount: number; allotmentRate: number | null; blocked: number };
  byStatus: Record<string, number>;
  topIpos: { symbol: string; name: string; applications: number; amount: number; allotted: number }[];
  openIpos: { symbol: string; name: string; status: string; type: string; closeDate: string | null; band: string | null }[];
}
export const fetchDashboard = (slug: string) => authed<AdminDashboard>(`${API}/admin/dashboard/${slug}`, { method: 'GET' });

/** Fetch the report CSV (authenticated) and trigger a browser download. */
export async function downloadReportCsv(slug: string): Promise<void> {
  const res = await fetch(`${API}/admin/reports/${slug}/export`, { headers: { Authorization: `Bearer ${await adminToken()}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `investoyard-${slug}-applications.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface AuditEntry {
  id: string; at: string; actorMobile?: string; action: string;
  targetType?: string; targetLabel?: string; tenantSlug?: string;
}
export const fetchAudit = () => authed<AuditEntry[]>(`${API}/admin/audit`, { method: 'GET' });

export interface SystemStatus {
  database: 'up' | 'down'; redis: 'up' | 'down' | 'disabled';
  queue: string; sms: string; vault: string; node: string; uptimeSec: number;
}
export const fetchStatus = () => authed<SystemStatus>(`${API}/admin/status`, { method: 'GET' });

export interface RailCred {
  id: string; exchange: 'NSE_EIPO' | 'BSE_IBBS'; memberName: string; memberType: string;
  loginId: string; memberCode: string; subBrokerCode?: string; baseUrl: string;
  env: 'live' | 'uat'; active: boolean; passwordSet: boolean; ibbsIdSet: boolean;
}
export const fetchRails = () => authed<RailCred[]>(`${API}/admin/rails`, { method: 'GET' });
export const createRail = (body: any) =>
  authed<{ id: string }>(`${API}/admin/rails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateRail = (id: string, body: any) =>
  authed<{ updated: boolean }>(`${API}/admin/rails/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const testRail = (id: string) =>
  authed<{ ok: boolean; outcome: 'connected' | 'rejected' | 'unreachable' | 'incomplete' | 'invalid_secret'; note: string }>(
    `${API}/admin/rails/${id}/test`, { method: 'POST' });
export const recordAllotment = (id: string, allottedLots: number) =>
  authed<any>(`${API}/applications/${id}/allotment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allottedLots }) });

export const fetchIpos = () => fetch(`${API}/ipos`).then(j<AdminIpo[]>);
export const createIpo = (body: IpoWrite) =>
  authed<AdminIpo>(`${API}/ipos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateIpo = (id: string, body: IpoWrite) =>
  authed<AdminIpo>(`${API}/ipos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
