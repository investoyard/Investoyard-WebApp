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
 * real operator JWT (username+password login — see lib/operator.ts).
 */
import { getOperatorToken, clearOperator } from './operator';

async function adminToken(): Promise<string> {
  const t = getOperatorToken();
  if (!t) throw new Error('Not signed in');
  return t;
}

async function authed<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await adminToken()}` } });
  if (res.status === 401) {
    // Token expired/invalid — drop it and bounce to the login screen.
    clearOperator();
    if (typeof window !== 'undefined') window.location.href = '/admin/login';
    throw new Error('Session expired');
  }
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

/* -------------------------------------------------- admin: partners / branches */
export interface RegisterTenantBody {
  kind: 'partner' | 'whitelabel' | 'branch'; name: string; slug: string; parentSlug?: string;
  brandColor?: string; goldColor?: string; logoUrl?: string; customDomain?: string;
  adminName: string; adminUsername: string; adminPassword?: string;
}
export interface RegisterTenantResult {
  tenant: { slug: string; name: string; type: string; customDomain?: string; whitelabel?: boolean };
  admin: { username: string; name: string; temporaryPassword?: string };
}
export const registerTenant = (body: RegisterTenantBody) =>
  authed<RegisterTenantResult>(`${API}/admin/tenants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* -------------------------------------------------- admin: operator users */
export interface Operator {
  id: string; username: string; name: string; status: 'active' | 'inactive';
  tenant: { slug: string; name: string; type: string };
  roles: { tenantSlug: string; tenantName: string; role: string; scope: string }[];
  createdAt: string;
}
export const fetchOperators = () => authed<Operator[]>(`${API}/admin/operators`, { method: 'GET' });
export const createOperator = (body: { username: string; name: string; password?: string; tenantSlug: string; roleName: string }) =>
  authed<{ id: string; username: string; name: string; temporaryPassword?: string }>(`${API}/admin/operators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateOperator = (id: string, body: { name?: string; status?: 'active' | 'inactive'; roleName?: string; password?: string }) =>
  authed<{ ok: boolean }>(`${API}/admin/operators/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  logoUrl?: string;
}
export interface IpoDoc { type: string; url: string; summary?: string }
export interface IpoWrite {
  symbol?: string; name?: string; type?: string; status?: string;
  priceBandMin?: number; priceBandMax?: number; lotSize?: number; minAmount?: number;
  issueSizeCr?: number; registrar?: string; isin?: string; objectsOfIssue?: string; logoUrl?: string;
  openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string;
  reservations?: string[]; documents?: IpoDoc[]; gmp?: number; listingGainPct?: number;
}
/** Full record for the edit form (from GET /ipos/:id). */
export interface AdminIpoDetail {
  id: string; symbol: string; name: string; type: 'mainboard' | 'sme'; status: string;
  priceBandMin?: number; priceBandMax?: number; lotSize?: number; minAmount?: number; issueSizeCr?: number;
  registrar?: string; isin?: string; logoUrl?: string; objectsOfIssue?: string;
  openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string;
  reservations?: string[]; documents?: IpoDoc[]; gmp?: number; listingGainPct?: number;
}
export const fetchIpo = (id: string) => fetch(`${API}/ipos/${id}`).then(j<AdminIpoDetail>);
export const deleteIpo = (id: string) => authed<{ deleted: boolean }>(`${API}/ipos/${id}`, { method: 'DELETE' });

/** Upload an image (logo) — returns an absolute URL served by the API. */
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/admin/upload`, { method: 'POST', headers: { Authorization: `Bearer ${getOperatorToken()}` }, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
  return (await res.json()).url as string;
}

/* -------------------------------------------------- admin: applications (bids) */
export interface AdminApplication {
  id: string; tenantSlug: string; ipoSymbol: string; ipoName: string;
  applicantName?: string; mobileMasked?: string; category: string; applicantType: string;
  batchId?: string; // family/bulk batches share one id
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

export interface ProviderConfig {
  provider: string; enabled: boolean; settings: Record<string, any>; secretKeys: string[];
}
export const fetchProviders = () => authed<ProviderConfig[]>(`${API}/admin/providers`, { method: 'GET' });
export const saveProvider = (
  provider: string,
  body: { enabled?: boolean; settings?: Record<string, any>; secrets?: Record<string, string> },
) => authed<ProviderConfig>(`${API}/admin/providers/${provider}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

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
export interface AllotmentImportResult { ipo: string; lines: number; updated: number; notFound: string[]; errors: string[] }
export const importAllotments = (symbol: string, csv: string) =>
  authed<AllotmentImportResult>(`${API}/admin/allotments/${symbol}/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }),
  });
export const recordAllotment = (id: string, allottedLots: number) =>
  authed<any>(`${API}/applications/${id}/allotment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allottedLots }) });

export const fetchIpos = () => fetch(`${API}/ipos`).then(j<AdminIpo[]>);
export const createIpo = (body: IpoWrite) =>
  authed<AdminIpo>(`${API}/ipos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateIpo = (id: string, body: IpoWrite) =>
  authed<AdminIpo>(`${API}/ipos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
