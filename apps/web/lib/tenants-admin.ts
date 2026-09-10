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
  const body = await res.text();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const b = JSON.parse(body); if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  // an empty 200 (Nest returns one for a null handler result, and for 204) is
  // "no content", not a parse error — see the note in consumer-api.ts
  return (body ? JSON.parse(body) : null) as T;
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
  profile?: Record<string, any>; // full empanelment form (JM/Nuvama) + document URLs
  commissionRate?: number; // % commission on this channel's bids
}
export interface RegisterTenantResult {
  tenant: { slug: string; name: string; type: string; code?: string; customDomain?: string; whitelabel?: boolean };
  admin: { username: string; name: string; temporaryPassword?: string };
}
export const registerTenant = (body: RegisterTenantBody) =>
  authed<RegisterTenantResult>(`${API}/admin/tenants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export interface PartnerRow {
  id: string; slug: string; name: string; type: 'partner' | 'branch'; status: string;
  whitelabel: boolean; parent?: { slug: string; name: string };
  code?: string; commissionRate?: number;
  customDomain?: string; applicantType?: string; city?: string;
  branches: number; operators: number; createdAt: string;
}
export const fetchTenants = () => authed<PartnerRow[]>(`${API}/admin/tenants`, { method: 'GET' });

export interface PartnerDetail {
  id: string; slug: string; name: string; type: string; status: string;
  parent?: { slug: string; name: string }; whitelabel: boolean;
  code?: string; commissionRate?: number;
  brandColor?: string; goldColor?: string; logoUrl?: string; customDomain?: string;
  profile: Record<string, any>;
  /** Partner API operator controls (Phase D). Default 25 for a new partner,
   *  clamped to 1..500 by the server. */
  partnerMaxApplicantsPerCall?: number;
  /** Scope keys this tenant may call on /partner/v1. Empty = inherit from
   *  parent (branches). Defaults for a new partner: print-forms + ipos:read. */
  partnerApiScopes?: string[];
  counts: { branches: number; users: number; operators: number };
  createdAt: string;
}
export const fetchTenant = (slug: string) => authed<PartnerDetail>(`${API}/admin/tenants/${slug}`, { method: 'GET' });

/* ---- partner API keys (white-label Print-PDF API) ---- */
export interface PartnerApiKeyRow {
  id: string; keyId: string; label?: string | null; active: boolean;
  createdAt: string; revokedAt?: string | null; lastUsedAt?: string | null;
}
export const listPartnerKeys = (tenantId: string) =>
  authed<PartnerApiKeyRow[]>(`${API}/admin/partner-keys/${tenantId}`, { method: 'GET' });
/** Returns { keyId, secret, apiKey } — the secret is shown ONCE, never retrievable again. */
export const createPartnerKey = (tenantId: string, label?: string) =>
  authed<{ keyId: string; secret: string; apiKey: string }>(`${API}/admin/partner-keys/${tenantId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
  });
export const revokePartnerKey = (id: string) =>
  authed<{ revoked: boolean }>(`${API}/admin/partner-keys/${id}`, { method: 'DELETE' });

/* ---- news / blog posts ---- */
export interface PostRow {
  id: string; slug: string; title: string; excerpt?: string | null; body: string;
  coverUrl?: string | null; ipoSymbol?: string | null; tags: string[];
  status: 'draft' | 'published'; publishedAt?: string | null; author?: string | null;
  createdAt: string; updatedAt: string;
}
export const fetchPosts = () => authed<PostRow[]>(`${API}/admin/posts`, { method: 'GET' });
export const createPost = (body: Partial<PostRow>) =>
  authed<PostRow>(`${API}/admin/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updatePost = (id: string, body: Partial<PostRow>) =>
  authed<PostRow>(`${API}/admin/posts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deletePost = (id: string) =>
  authed<{ deleted: boolean }>(`${API}/admin/posts/${id}`, { method: 'DELETE' });

/* ---- homepage banners (admin-managed carousel slides) ---- */
export interface BannerRow {
  id: string; title: string; subtitle?: string | null; imageUrl?: string | null;
  linkUrl?: string | null; ctaLabel?: string | null; active: boolean; sortOrder: number;
  startsAt?: string | null; endsAt?: string | null; createdAt: string;
}
export const fetchBanners = () => authed<BannerRow[]>(`${API}/admin/banners`, { method: 'GET' });
export const createBanner = (body: Partial<BannerRow>) =>
  authed<BannerRow>(`${API}/admin/banners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateBanner = (id: string, body: Partial<BannerRow>) =>
  authed<BannerRow>(`${API}/admin/banners/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteBanner = (id: string) =>
  authed<{ deleted: boolean }>(`${API}/admin/banners/${id}`, { method: 'DELETE' });

/* ---- partner API reports (platform: all partners · partner login: own data) ---- */
export interface PartnerApiCallRow {
  at: string; partner: string; partnerSlug: string; keyId: string; endpoint: string;
  ipoSymbol?: string | null; applicants?: number | null; status: 'ok' | 'error';
  httpStatus: number; error?: string | null; durationMs?: number | null;
}
export interface PartnerPrintRow {
  at: string; partner: string; partnerSlug: string; ipoSymbol: string; applicant: string;
  pan: string; category: string; lots: number; amount: number;
  formNo?: string | null; batchId?: string | null; applicationRef: string;
}
export interface PartnerReport<T> { total: number; page: number; per: number; scoped: boolean; rows: T[] }
const qstr = (q: Record<string, any>) =>
  Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
export const fetchPartnerApiCalls = (q: { tenantId?: string; days?: number; page?: number }) =>
  authed<PartnerReport<PartnerApiCallRow>>(`${API}/admin/partner-api/calls?${qstr(q)}`, { method: 'GET' });
export const fetchPartnerApiPrints = (q: { tenantId?: string; days?: number; page?: number }) =>
  authed<PartnerReport<PartnerPrintRow>>(`${API}/admin/partner-api/prints?${qstr(q)}`, { method: 'GET' });
/** Download the prints report as CSV (browser save dialog). */
export async function exportPartnerApiPrintsCsv(q: { tenantId?: string; days?: number }) {
  const token = await adminToken();
  const res = await fetch(`${API}/admin/partner-api/prints/export?${qstr(q)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `partner-prints-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
export const updateTenant = (slug: string, body: Partial<{
  name: string; status: string; brandColor: string; goldColor: string; logoUrl: string;
  customDomain: string; profile: Record<string, any>; commissionRate: number | null;
  partnerMaxApplicantsPerCall: number;
  partnerApiScopes: string[];
}>) =>
  authed<{ ok: boolean }>(`${API}/admin/tenants/${slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* -------------------------------------------------- admin: WhatsApp chatbot flow (Level 1) */
export type BotAction = 'open' | 'upcoming' | 'listed' | 'gmp' | 'text';
export interface BotMenuItem { key: string; label: string; keywords: string[]; action: BotAction; text?: string }
export interface BotFaq { keywords: string[]; answer: string }
export interface BotFlow { guidedFlows?: boolean; greeting: string; closing: string; fallback: string; menu: BotMenuItem[]; faqs: BotFaq[] }

export const fetchBotFlow = () => authed<BotFlow>(`${API}/admin/chatbot`, { method: 'GET' });
export const saveBotFlow = (flow: BotFlow) =>
  authed<BotFlow>(`${API}/admin/chatbot`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flow) });
export const testBot = (message: string) =>
  authed<{ reply: string }>(`${API}/admin/chatbot/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });

/** Download the partner's pre-filled Business Associate Empanelment Form (PDF). */
export async function downloadEmpanelmentPdf(slug: string): Promise<void> {
  const res = await fetch(`${API}/admin/tenants/${slug}/empanelment.pdf`, { headers: { Authorization: `Bearer ${await adminToken()}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `investoyard-empanelment-${slug}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------- admin: clients (investors) */
export interface ClientRow {
  id: string; name?: string;
  /** Full 10-digit mobile — only present for superadmin + admin (clients.manage) callers */
  mobile?: string;
  /** Masked form ("98****1234") — always present when the user has a mobile */
  mobileMasked?: string;
  email?: string; status: string;
  tenant: { slug: string; name: string; type: string };
  profiles: number; applications: number; kyc: { verified: number; total: number }; createdAt: string;
}
export const fetchClients = (opts: { tenant?: string; q?: string } = {}) => {
  const p = new URLSearchParams();
  if (opts.tenant) p.set('tenant', opts.tenant);
  if (opts.q) p.set('q', opts.q);
  const qs = p.toString();
  return authed<ClientRow[]>(`${API}/admin/clients${qs ? `?${qs}` : ''}`, { method: 'GET' });
};
export interface ClientProfile {
  id: string; fullName: string; relationship: string; kycStatus: string;
  depository: string; dpId: string; clientId?: string; panMasked?: string; ifsc?: string; dateOfBirth?: string;
}
export interface ClientDetail {
  id: string; name?: string; email?: string; mobileMasked?: string; status: string;
  tenant: { slug: string; name: string }; marketingConsent: boolean; createdAt: string;
  profiles: ClientProfile[];
  applications: { id: string; ipoSymbol?: string; ipoName?: string; category: string; lots: number; amount: number; status: string; allottedLots?: number; appliedAt: string }[];
}
export const fetchClient = (id: string) => authed<ClientDetail>(`${API}/admin/clients/${id}`, { method: 'GET' });
export const createClient = (body: { mobile: string; name?: string; email?: string; tenantSlug: string }) =>
  authed<{ id: string }>(`${API}/admin/clients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateClient = (id: string, body: { name?: string; email?: string; status?: 'active' | 'suspended' }) =>
  authed<{ ok: boolean }>(`${API}/admin/clients/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
/** Hard delete — superadmin only. Removes the client and every child that
 *  carries their data (applications, profiles, bid ops, watchlist,
 *  consents, device tokens, memberships, GMP contributor row).
 *  Irreversible. An audit-log row is written before the delete. */
export const hardDeleteClient = (id: string) =>
  authed<{ ok: boolean; deletedId: string; appliedApplications: number }>(
    `${API}/admin/clients/${id}`, { method: 'DELETE' });
export interface AddProfileBody {
  fullName: string; relationship?: string; pan: string; dateOfBirth?: string;
  depository: 'NSDL' | 'CDSL'; dpId: string; clientId: string; bankAccount?: string; ifsc?: string; upi?: string;
}
export const addClientProfile = (id: string, body: AddProfileBody) =>
  authed<{ id: string }>(`${API}/admin/clients/${id}/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Upload a KYC/empanelment document (PDF or image) — returns { url, name }. */
export async function uploadDoc(file: File): Promise<{ url: string; name: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/admin/upload/doc`, { method: 'POST', headers: { Authorization: `Bearer ${getOperatorToken()}` }, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
  const b = await res.json();
  return { url: b.url as string, name: (b.name as string) ?? file.name };
}

/** Upload a PDF (ASBA blank form) under ipos.manage. */
export async function uploadPdf(file: File): Promise<{ url: string; name: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/admin/upload/pdf`, { method: 'POST', headers: { Authorization: `Bearer ${getOperatorToken()}` }, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
  const b = await res.json();
  return { url: b.url as string, name: (b.name as string) ?? file.name };
}

/* -------------------------------------------------- admin: operator users */
export interface Operator {
  id: string; username: string; name: string; email?: string; mobile?: string; status: 'active' | 'inactive';
  tenant: { slug: string; name: string; type: string };
  roles: { tenantSlug: string; tenantName: string; role: string; scope: string }[];
  createdAt: string;
}
export const fetchOperators = () => authed<Operator[]>(`${API}/admin/operators`, { method: 'GET' });
export const createOperator = (body: { username: string; name: string; password?: string; tenantSlug: string; roleName: string; email?: string; mobile?: string }) =>
  authed<{ id: string; username: string; name: string; temporaryPassword?: string }>(`${API}/admin/operators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateOperator = (id: string, body: { name?: string; status?: 'active' | 'inactive'; roleName?: string; password?: string; email?: string; mobile?: string }) =>
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
  openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string;
  registrar?: string; gmp?: number; reservations?: string[];
  logoUrl?: string;
  autoPollSubscription?: boolean;
  hidden?: boolean; // bulk-imported, not yet published to the public site
  extra?: Record<string, any>; // operator-extended fields (categoryName, issueType, …)
}
export interface IpoDoc { type: string; url: string; summary?: string }
export interface IpoWrite {
  symbol?: string; name?: string; type?: string; status?: string;
  /** ipo | fpo | reit | invit — the offer kind, not the board */
  instrument?: string;
  priceBandMin?: number; priceBandMax?: number; lotSize?: number; minAmount?: number;
  issueSizeCr?: number; registrar?: string; isin?: string; objectsOfIssue?: string; logoUrl?: string;
  openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string;
  reservations?: string[]; documents?: IpoDoc[]; gmp?: number; listingGainPct?: number;
  autoPollSubscription?: boolean;
  /** which exchanges the issue lists on — chosen by staff, not inferred from the board */
  exchanges?: string[];
  extra?: Record<string, any>;
}
/** Full record for the edit form (from GET /ipos/:id). */
export interface AdminIpoDetail {
  id: string; symbol: string; name: string; type: 'mainboard' | 'sme'; status: string;
  priceBandMin?: number; priceBandMax?: number; lotSize?: number; minAmount?: number; issueSizeCr?: number;
  registrar?: string; isin?: string; logoUrl?: string; objectsOfIssue?: string;
  openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string;
  reservations?: string[]; documents?: IpoDoc[]; gmp?: number; listingGainPct?: number;
  autoPollSubscription?: boolean; subscriptionAsOf?: string;
  exchanges?: string[];
  extra?: Record<string, any>;
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
  id: string; tenantSlug: string; tenantName?: string; partnerCode?: string;
  ipoSymbol: string; ipoName: string;
  applicantName?: string; mobileMasked?: string; category: string; applicantType: string;
  batchId?: string; // family/bulk batches share one id
  lots: number; amount: number; status: string; allottedLots?: number; refundAmount?: number;
  allotmentReason?: string; // registrar's rejection reason (imported allotment file)
  commissionRate?: number; commissionAmount: number; appliedAt: string;
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
  counts: {
    tenants: number; operators: number; partners: number; branches: number; clients: number;
    iposOpen: number; iposTotal: number; iposUpcoming: number; iposClosed: number;
    applications: number; amount: number; allotmentRate: number | null; blocked: number; refunds: number;
  };
  byStatus: Record<string, number>;
  topIpos: { symbol: string; name: string; applications: number; amount: number; allotted: number }[];
  topPartners: { code: string; name: string; applications: number; amount: number }[];
  partnerStatus: { active: number; suspended: number };
  trend7: { date: string; count: number }[];
  livePerformance: { symbol: string; name: string; status: string; type: string; band: string | null; gmp: number | null; subscription: number | null }[];
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
  provider: string; enabled: boolean; exists?: boolean; settings: Record<string, any>; secretKeys: string[];
}
export const fetchProviders = () => authed<ProviderConfig[]>(`${API}/admin/providers`, { method: 'GET' });
export const saveProvider = (
  provider: string,
  body: { enabled?: boolean; settings?: Record<string, any>; secrets?: Record<string, string> },
) => authed<ProviderConfig>(`${API}/admin/providers/${provider}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

// ── per-tenant (white-label) providers + message templates ──
export const fetchTenantProviders = (slug: string) =>
  authed<ProviderConfig[]>(`${API}/admin/tenants/${slug}/providers`, { method: 'GET' });
export const saveTenantProvider = (
  slug: string, provider: string,
  body: { enabled?: boolean; settings?: Record<string, any>; secrets?: Record<string, string> },
) => authed<ProviderConfig>(`${API}/admin/tenants/${slug}/providers/${provider}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
/** Clear a tenant's own provider config → re-inherits the platform default. */
export const resetTenantProvider = (slug: string, provider: string) =>
  authed<{ deleted: boolean }>(`${API}/admin/tenants/${slug}/providers/${provider}`, { method: 'DELETE' });
/** Fire a real test SMS/email through the scope's effective config. */
export const testTenantProvider = (slug: string, provider: string, to: string) =>
  authed<{ sent: boolean; dev?: boolean; error?: string }>(`${API}/admin/tenants/${slug}/providers/${provider}/test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }),
  });

export interface MessageKeySpec {
  channel: 'sms' | 'email' | 'whatsapp'; key: string; label: string; vars: string[];
  id?: string; description?: string | null; system?: boolean; // present when served from the DB catalog
}
export interface MessageTemplate {
  id: string; tenantId: string; channel: string; key: string; locale: string; enabled: boolean;
  dltTemplateId?: string | null; senderId?: string | null; body?: string | null; subject?: string | null; bodyHtml?: string | null;
}
export const fetchTemplateCatalog = () => authed<{ keys: MessageKeySpec[] }>(`${API}/admin/templates`, { method: 'GET' });

// ── masters: lead managers + registrars ──
export interface MasterRow {
  id: string; name: string; shortCode: string;
  contactPerson?: string | null; mobile?: string | null; email?: string | null; phone?: string | null;
  gstin?: string | null; address1?: string | null; address2?: string | null;
  city?: string | null; state?: string | null; pincode?: string | null;
  allotmentUrl?: string | null; // registrars only
  /** how many IPOs resolve to this row — registrars and lead managers only */
  ipoCount?: number;
  baseType?: string;            // ipo-categories: 'mainboard' | 'sme'
  categoryId?: string | null;   // issue-types → IpoCategoryMaster
  category?: MasterRow | null;  // issue-types (joined)
  allowMultiple?: boolean;      // relationships: repeatable per account
  type?: string | null;         // anchors: Mutual Fund | FPI | Insurance | AIF | Other
  notes?: string | null;        // anchors
  industries?: string[];        // sectors: the Basic-Industry values rolling up here
  active: boolean;
}
export type MasterKind = 'lead-managers' | 'registrars' | 'ipo-categories' | 'issue-types' | 'relationships' | 'upi-handles' | 'anchors' | 'sectors';
export const fetchMaster = (kind: MasterKind) => authed<MasterRow[]>(`${API}/admin/masters/${kind}`, { method: 'GET' });
export const createMaster = (kind: MasterKind, body: Partial<MasterRow>) =>
  authed<MasterRow>(`${API}/admin/masters/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateMaster = (kind: MasterKind, id: string, body: Partial<MasterRow>) =>
  authed<MasterRow>(`${API}/admin/masters/${kind}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteMaster = (kind: MasterKind, id: string) =>
  authed<{ deleted: boolean; name: string }>(`${API}/admin/masters/${kind}/${id}`, { method: 'DELETE' });

/** Platform oversight: per-white-label-partner integration status. */
export interface IntegrationStatus { slug: string; name: string; code?: string; providers: string[]; templates: string[] }
export const fetchIntegrationsOverview = () => authed<IntegrationStatus[]>(`${API}/admin/integrations/overview`, { method: 'GET' });
export const fetchTenantTemplates = (slug: string) =>
  authed<MessageTemplate[]>(`${API}/admin/tenants/${slug}/templates`, { method: 'GET' });
export const saveTenantTemplate = (slug: string, body: Partial<MessageTemplate> & { channel: string; key: string }) =>
  authed<MessageTemplate>(`${API}/admin/tenants/${slug}/templates`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
/** Remove a template row: tenant override → re-inherits platform; platform → drops that locale variant. */
/** The platform's content for a template key/locale — powers 'Copy from platform'. */
export const fetchPlatformTemplate = (channel: string, key: string, locale = 'en') =>
  authed<MessageTemplate | null>(`${API}/admin/templates/resolve?channel=${encodeURIComponent(channel)}&key=${encodeURIComponent(key)}&locale=${encodeURIComponent(locale)}`, { method: 'GET' });
export const deleteTenantTemplate = (slug: string, q: { channel: string; key: string; locale?: string }) =>
  authed<{ deleted: boolean }>(
    `${API}/admin/tenants/${slug}/templates?channel=${encodeURIComponent(q.channel)}&key=${encodeURIComponent(q.key)}&locale=${encodeURIComponent(q.locale ?? 'en')}`,
    { method: 'DELETE' },
  );

// ── message-type catalog CRUD (platform admin) ──
export const createMessageType = (body: { channel: string; key: string; label: string; description?: string; vars?: string[] }) =>
  authed<MessageKeySpec>(`${API}/admin/templates/types`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateMessageType = (id: string, body: { label?: string; description?: string; vars?: string[] }) =>
  authed<MessageKeySpec>(`${API}/admin/templates/types/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteMessageType = (id: string) =>
  authed<{ deleted: boolean }>(`${API}/admin/templates/types/${id}`, { method: 'DELETE' });

export interface SystemStatus {
  database: 'up' | 'down'; redis: 'up' | 'down' | 'disabled';
  queue: string; sms: string; vault: string; node: string; uptimeSec: number;
}
export const fetchStatus = () => authed<SystemStatus>(`${API}/admin/status`, { method: 'GET' });

export interface RailCred {
  id: string; exchange: 'NSE_EIPO' | 'BSE_IBBS'; memberName: string; memberType: string;
  loginId: string; memberCode: string; subBrokerCode?: string; baseUrl: string;
  env: 'live' | 'uat'; active: boolean; subscriptionUse?: boolean; passwordSet: boolean; ibbsIdSet: boolean; checksumKeySet?: boolean;
}
export const fetchRails = () => authed<RailCred[]>(`${API}/admin/rails`, { method: 'GET' });
export const createRail = (body: any) =>
  authed<{ id: string }>(`${API}/admin/rails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateRail = (id: string, body: any) =>
  authed<{ updated: boolean }>(`${API}/admin/rails/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deleteRail = (id: string) =>
  authed<{ deleted: boolean; memberName: string }>(`${API}/admin/rails/${id}`, { method: 'DELETE' });
export type RailTestOutcome = 'connected' | 'rejected' | 'unreachable' | 'incomplete' | 'invalid_secret';
export interface RailTestResult {
  ok: boolean;
  outcome: RailTestOutcome;
  note: string;
  /** First few chars of the session token when `outcome === 'connected'`. */
  tokenPreview?: string;
  /** Human-readable ms round-trip when the adapter returned a timing. */
  durationMs?: number;
}
export const testRail = (id: string) =>
  authed<RailTestResult>(`${API}/admin/rails/${id}/test`, { method: 'POST' });
/** Run a live NSE subscription sweep now (all open IPOs). */
export const pollSubscription = () =>
  authed<{ open: number; updated: number; reason?: string }>(`${API}/admin/rails/subscription/poll`, { method: 'POST' });
/** Refresh one IPO's subscription now. */
export const pollSubscriptionIpo = (ipoId: string) =>
  authed<{ ok: boolean; changed?: boolean; reason?: string }>(`${API}/admin/rails/subscription/poll/${ipoId}`, { method: 'POST' });
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
/** IPO Operations quick controls — server merges into `extra`, nothing else touched. */
export interface IpoOps { startBid?: boolean; startPrint?: boolean; autoPollSubscription?: boolean; bidMember?: string }
export const updateIpoOps = (id: string, body: IpoOps) =>
  authed<{ id: string; startBid: boolean; startPrint: boolean; autoPollSubscription: boolean; bidMember: string | null }>(
    `${API}/ipos/${id}/ops`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* -------------------------------------------------- admin: registrar allotment imports */
export interface AllotmentImportRow {
  id: string; ipoId: string; fileName: string; fileSize: number; format: string;
  status: 'processing' | 'done' | 'failed'; stage?: string | null;
  totalRows: number; imported: number; allotted: number; matched: number;
  error?: string | null; createdAt: string; finishedAt?: string | null;
}
export interface AllotmentRecordRow {
  id: number; applicationNo: string; pan: string; dpClientId?: string | null;
  category?: string | null; name?: string | null; appliedShares: number; amount: number;
  allottedShares: number; allottedAmount: number; refundAmount: number; reason?: string | null;
}
export interface AllotmentArchiveInfo { fileName: string; rows: number; fileSize: number; createdAt: string }
export interface AllotmentSummary {
  total: number; allotted: number; notAllotted: number;
  archive?: AllotmentArchiveInfo | null; lastImport?: AllotmentImportRow | null;
}

/** Upload a registrar allottee file (DBF/XLSB/XLSX/CSV, <=100 MB) with progress. */
export function uploadAllotmentFile(ipoId: string, file: File, onProgress?: (pct: number) => void): Promise<AllotmentImportRow> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/admin/allotment/imports`);
    xhr.setRequestHeader('Authorization', `Bearer ${getOperatorToken()}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed - network error.'));
    const fd = new FormData();
    fd.append('ipoId', ipoId);
    fd.append('file', file);
    xhr.send(fd);
  });
}
export const fetchAllotmentImports = (ipoId?: string) =>
  authed<AllotmentImportRow[]>(`${API}/admin/allotment/imports${ipoId ? `?ipoId=${ipoId}` : ''}`, { method: 'GET' });
export const fetchAllotmentImport = (id: string) =>
  authed<AllotmentImportRow>(`${API}/admin/allotment/imports/${id}`, { method: 'GET' });
export const fetchAllotmentSummary = (ipoId: string) =>
  authed<AllotmentSummary>(`${API}/admin/allotment/summary?ipoId=${ipoId}`, { method: 'GET' });
export const searchAllotmentRecords = (q: {
  ipoId: string; pan?: string; amountOp?: string; amount?: number | string;
  amountField?: string; status?: string; page?: number;
}) => authed<{ total: number; page: number; pageSize: number; rows: AllotmentRecordRow[] }>(
  `${API}/admin/allotment/records?${qstr(q)}`, { method: 'GET' });
export const archiveAllotment = (ipoId: string) =>
  authed<AllotmentArchiveInfo | null>(`${API}/admin/allotment/archive/${ipoId}`, { method: 'POST' });
export const restoreAllotment = (ipoId: string) =>
  authed<{ restored: number }>(`${API}/admin/allotment/restore/${ipoId}`, { method: 'POST' });

/* -------------------------------------------------- admin: IPO catalog import (Excel) */
export interface IpoImportPreview {
  id: string; fileName: string; createdAt: string;
  counts: {
    parsed: number; toCreate: number; skippedExisting: number; invalid: number;
    financials: number; anchors: number; peers: number; buybacks: number; ofs: number;
  };
  sample: { row: number; symbol: string; name: string; type: string; openDate?: string; issueSizeCr?: number }[];
  skipped: { row: number; symbol: string; reason: string }[];
  invalid: { row: number; symbol?: string; errors: string[] }[];
  parked: string[];
}

/** Upload the filled data-entry workbook. Validates only - nothing is written yet. */
export function uploadIpoWorkbook(file: File, onProgress?: (pct: number) => void): Promise<IpoImportPreview> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/admin/ipo-import`);
    xhr.setRequestHeader('Authorization', `Bearer ${getOperatorToken()}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed - network error.'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}
export const commitIpoImport = (id: string) =>
  authed<{ created: number; financials: number; anchors: number; peers: number }>(
    `${API}/admin/ipo-import/commit/${id}`, { method: 'POST' });
export const fetchIpoImportPending = () =>
  authed<{ catalogOnly: number }>(`${API}/admin/ipo-import/pending`, { method: 'GET' });
/** Undo an import: removes hidden, never-published rows that carry no activity. */
export const deleteImportedIpos = () =>
  authed<{ deleted: number; kept: number }>(`${API}/admin/ipo-import/delete-imported`, { method: 'POST' });
export const publishImportedIpos = (symbols: string[], published = true) =>
  authed<{ updated: number }>(`${API}/admin/ipo-import/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbols, published }),
  });
/** Admin catalog view includes bulk-imported rows; the public site never does. */
export const fetchAllIpos = () => fetch(`${API}/ipos?all=1&limit=2000`).then(j<AdminIpo[]>);

/* -------------------------------------------------- admin: GMP log + contributors */
export interface GmpLogRow {
  id: string; symbol?: string; name?: string; value: number;
  source?: string | null; by?: string | null; byId?: string | null; at: string;
}
export interface GmpContributorRow {
  id: string; userId: string; active: boolean; note?: string | null;
  createdAt: string; name?: string | null; mobile?: string | null;
}
export const fetchGmpLog = (limit = 100) =>
  authed<GmpLogRow[]>(`${API}/admin/gmp/log?limit=${limit}`, { method: 'GET' });
export const fetchGmpContributors = () =>
  authed<GmpContributorRow[]>(`${API}/admin/gmp/contributors`, { method: 'GET' });
export const addGmpContributor = (mobile: string, note?: string) =>
  authed<{ added: boolean }>(`${API}/admin/gmp/contributors`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile, note }),
  });
export const removeGmpContributor = (id: string) =>
  authed<{ removed: boolean }>(`${API}/admin/gmp/contributors/${id}`, { method: 'DELETE' });

/* -------------------------------------------------- admin: partner applications */
export interface PartnerApplicationRow {
  id: string; status: 'submitted' | 'changes_requested' | 'approved' | 'rejected';
  kind: string; legalName: string; contactName: string; mobile: string; email: string;
  city?: string | null; state?: string | null; entityType?: string | null;
  createdAt: string; reviewedAt?: string | null; tenantId?: string | null;
}
export interface PartnerApplicationDetail extends PartnerApplicationRow {
  pan?: string | null; gstin?: string | null; sebiRegNo?: string | null; arn?: string | null;
  notes?: string | null; documents: { type: string; url: string; name?: string }[];
  reviewNote?: string | null; inviteToken?: string | null; activatedAt?: string | null;
}
export const fetchPartnerApplications = (status = 'submitted') =>
  authed<PartnerApplicationRow[]>(`${API}/admin/partner-applications?status=${status}`, { method: 'GET' });
export const fetchPartnerApplication = (id: string) =>
  authed<PartnerApplicationDetail>(`${API}/admin/partner-applications/${id}`, { method: 'GET' });
export const approvePartnerApplication = (id: string, body: { kind?: string; slug?: string; parentSlug?: string; baseUrl?: string }) =>
  authed<{ ok: boolean; slug: string; code: string | null; username: string; activationLink: string; emailSent: boolean; emailDev: boolean }>(
    `${API}/admin/partner-applications/${id}/approve`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const requestPartnerChanges = (id: string, note: string) =>
  authed<{ ok: boolean }>(`${API}/admin/partner-applications/${id}/changes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
export const rejectPartnerApplication = (id: string, note: string) =>
  authed<{ ok: boolean }>(`${API}/admin/partner-applications/${id}/reject`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
/** Re-send the welcome/activation email for an approved application whose
 *  link the applicant lost. Regenerates the token, so any previous link dies. */
export const resendPartnerActivation = (id: string, baseUrl?: string) =>
  authed<{ ok: boolean; activationLink: string; emailSent: boolean; emailDev: boolean }>(
    `${API}/admin/partner-applications/${id}/resend-activation`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl }) });

/* -------------------------------------------------- message delivery log */
export interface MessageLogRow {
  id: string; channel: string; templateKey?: string | null;
  recipient: string; recipientLast4?: string | null;
  subject?: string | null; preview?: string | null;
  status: 'sent' | 'failed' | 'dev'; provider?: string | null;
  error?: string | null; isTest: boolean; createdAt: string;
}
export const fetchMessageLog = (f: { channel?: string; status?: string; q?: string; limit?: number; offset?: number } = {}) => {
  const p = new URLSearchParams();
  if (f.channel && f.channel !== 'all') p.set('channel', f.channel);
  if (f.status && f.status !== 'all') p.set('status', f.status);
  if (f.q) p.set('q', f.q);
  p.set('limit', String(f.limit ?? 150));
  if (f.offset) p.set('offset', String(f.offset));
  return authed<{ total: number; rows: MessageLogRow[] }>(`${API}/admin/message-log?${p}`, { method: 'GET' });
};
/** Send one template to a named recipient; returns the provider's answer AND the rendered body. */
export const sendTemplateTest = (body: { channel: string; key: string; to: string; tenantId?: string }) =>
  authed<{ sent: boolean; dev?: boolean; error?: string; rendered?: string; subject?: string; dltTemplateId?: string | null; senderId?: string | null }>(
    `${API}/admin/templates/test`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

/* ── GMP feed: link an IPO to its upstream row, then preview / run a sync ──
   `preview` writes NOTHING — it reports what a sync would change and which
   suggestions are still waiting on a human. Suggestions are never applied on
   their own: the wrong company's GMP on an IPO is worse than none. */
export interface GmpFeedChange {
  symbol: string; from: string; filled: string[];
  gmp?: number; skippedManual?: boolean;
}
export interface GmpFeedSuggestion {
  status?: string; gmpPct?: number | null;
  symbol: string; ourName: string; theirName: string;
  sourceId: string; gmp: number | null; datesAgree: boolean;
}
export interface GmpFeedLink {
  /** the feed's own lifecycle stage: Upcoming | Open | Closing today | Closed | Listing pending | Listed */
  status?: string; gmpPct?: number | null;
  symbol: string; ourName: string; theirName: string;
  sourceId: string; gmp: number | null; autoGmp: boolean;
}
export interface GmpFeedReport {
  dryRun: boolean; fetched: number;
  changes: GmpFeedChange[]; linked: GmpFeedLink[];
  suggestions: GmpFeedSuggestion[]; unmatched: string[];
}
export const fetchGmpFeedPreview = () =>
  authed<GmpFeedReport>(`${API}/admin/gmp-feed/preview`, { method: 'GET' });
export const runGmpFeedSync = () =>
  authed<GmpFeedReport>(`${API}/admin/gmp-feed/sync`, { method: 'POST' });
export const linkGmpFeed = (symbol: string, sourceId: string | null) =>
  authed<{ ok: boolean; symbol?: string; sourceId?: string | null; error?: string }>(
    `${API}/admin/gmp-feed/link?symbol=${encodeURIComponent(symbol)}${sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : ''}`,
    { method: 'POST' },
  );

/** The GMP feed's source URL — operator-editable so a changed upstream report
 *  is a settings edit rather than a deploy. */
export const fetchGmpFeedConfig = () =>
  authed<{ url: string | null; usingDefault: boolean }>(`${API}/admin/gmp-feed/config`, { method: 'GET' });
export const saveGmpFeedConfig = (url: string) =>
  authed<{ url: string | null }>(`${API}/admin/gmp-feed/config`, {
    // authed() does not set a content type; without this Nest never parses the
    // body and the save would silently clear the URL instead of storing it
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

/* ── masters: bulk upload ────────────────────────────────────────────────── */

export interface MasterBulkRow { row: number; data: Record<string, any> }
export interface MasterBulkPreview {
  columns: string[];
  counts: { parsed: number; toCreate: number; skipped: number; invalid: number };
  toCreate: MasterBulkRow[];
  skipped: { row: number; key: string; reason: string }[];
  invalid: { row: number; errors: string[] }[];
}

/** Step 1 — upload and validate. Writes nothing. */
export async function parseMasterBulk(kind: MasterKind, file: File): Promise<MasterBulkPreview> {
  const fd = new FormData();
  fd.append('file', file);
  // no Content-Type header: the browser must set the multipart boundary itself
  const res = await fetch(`${API}/admin/masters/${kind}/bulk/parse`, {
    method: 'POST', headers: { Authorization: `Bearer ${await adminToken()}` }, body: fd,
  });
  return j<MasterBulkPreview>(res);
}

/** Step 2 — write the rows the operator just approved. */
export const commitMasterBulk = (kind: MasterKind, rows: MasterBulkRow[]) =>
  authed<{ created: number; skipped: number; failed: { key: string; error: string }[] }>(
    `${API}/admin/masters/${kind}/bulk`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) },
  );

/** The blank template. Auth-guarded, so it is fetched and saved rather than linked. */
export async function downloadMasterTemplate(kind: MasterKind): Promise<void> {
  const res = await fetch(`${API}/admin/masters/${kind}/bulk/template`, {
    headers: { Authorization: `Bearer ${await adminToken()}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = `${kind}-template.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Pull live GMP now — appends a timestamped reading per linked IPO. */
export const refreshGmpFeed = () =>
  authed<GmpFeedReport>(`${API}/admin/gmp-feed/refresh-gmp`, { method: 'POST' });

/* ── catalog UPDATE: fill gaps on IPOs that already exist ─────────────────── */

export interface CatalogCellChange { symbol: string; field: string; from: string; to: string }
export interface CatalogUpdatePreview {
  id: string;
  counts: { rows: number; matched: number; unknown: number; fills: number; conflicts: number; ipos: number };
  fillsByField: { field: string; count: number }[];
  fillSample: CatalogCellChange[];
  conflicts: CatalogCellChange[];
  unknown: string[];
}

/** Step 1 — diff the reviewed workbook against the catalog. Writes nothing. */
export async function previewCatalogUpdate(file: File): Promise<CatalogUpdatePreview> {
  const fd = new FormData();
  fd.append('file', file);
  // no Content-Type: the browser must set the multipart boundary itself
  const res = await fetch(`${API}/admin/ipo-import/update/preview`, {
    method: 'POST', headers: { Authorization: `Bearer ${await adminToken()}` }, body: fd,
  });
  return j<CatalogUpdatePreview>(res);
}

/** Step 2 — apply every fill plus the approved conflicts, keyed "SYMBOL|Field". */
export const commitCatalogUpdate = (id: string, approve: string[]) =>
  authed<{ ipos: number; cells: number; skippedConflicts: number; failed: { symbol: string; error: string }[] }>(
    `${API}/admin/ipo-import/update/commit/${id}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve }) },
  );

/* ── Bidding Report ─────────────────────────────────────────────────────── */

export interface BidRow {
  id: string;
  appNo: string | null;
  name: string;
  pan: string;
  demat: string | null;
  depository: string | null;
  qty: number;
  price: number | null;
  atCutoff: boolean;
  rejection: string | null;
  upiStatus: string | null;
  upiStatusAt: string | null;
  bidNumber: string | null;
  status: string;
  category: string;
  rail: string | null;
  ipoSymbol: string | null;
  ipoName: string | null;
  member: string | null;
  memberCode: string | null;
  /** the newest ledger operation — what the action buttons may do next */
  lastOp: { action: string; state: string; reason: string | null; at: string } | null;
  createdAt: string;
}

export interface BidReportFilters {
  ipoId?: string; memberCredentialId?: string; status?: string; category?: string;
  rail?: string; from?: string; to?: string; q?: string;
  sort?: string; dir?: 'asc' | 'desc'; page?: number; per?: number;
}

export const fetchBidReport = (f: BidReportFilters = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v));
  const qs = p.toString();
  return authed<{ total: number; page: number; per: number; pages: number; rows: BidRow[] }>(
    `${API}/admin/bidding/report${qs ? `?${qs}` : ''}`, { method: 'GET' });
};

export const fetchBidFacets = () =>
  authed<{
    ipos: { id: string; symbol: string; name: string }[];
    members: { id: string; label: string; exchange: string }[];
    statuses: { value: string; count: number }[];
    categories: { value: string; count: number }[];
  }>(`${API}/admin/bidding/facets`, { method: 'GET' });

/** Revise a bid's quantity. The server enforces the ICDR direction rule. */
export const editBid = (id: string, qty: number, price?: number) =>
  authed<{ ok: boolean; operationId: string; state: string; qty: number }>(
    `${API}/admin/bidding/${id}/edit`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty, price }) },
  );

/**
 * Withdraw a bid. Refused for HNI/QIB once the bid is at the exchange.
 *
 * Sends an explicit `{}` rather than no body at all: IIS answers a POST with no
 * Content-Length with a 411 before the request ever reaches Nest, which would
 * surface as a mystery failure that only happens in production. Verified
 * against the live server — no body 411, `{}` 401.
 */
export const cancelBid = (id: string) =>
  authed<{ ok: boolean; operationId: string; state: string }>(
    `${API}/admin/bidding/${id}/cancel`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );

/**
 * Pull the exchange's latest status for ONE bid, immediately. Returns the
 * refreshed values so the row can update without reloading the whole
 * page. A refresh with no exchange record yet is not an error — the
 * server returns the current stored values with `refreshedAt` stamped.
 */
export const refreshBid = (id: string) =>
  authed<{
    applicationId: string;
    status: string;
    reason: string | null;
    amountBlocked: number | null;
    upiStatusText: string | null;
    refreshedAt: string;
  }>(`${API}/admin/bidding/${id}/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });

/**
 * Rebid — cancel this bid and create a replacement, in one transaction.
 * `qty` and `price` are optional; omit either to keep the current value.
 * Refused for HNI/QIB once the bid is at the exchange (same rule as cancel).
 * Returns both new IDs — the cancelled application (old) and the fresh one.
 */
export const rebidBid = (id: string, qty?: number, price?: number) =>
  authed<{ ok: boolean; cancelledId: string; createdId: string; operationIds: string[] }>(
    `${API}/admin/bidding/${id}/rebid`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty, price }) },
  );

/* ── Bidding Summary — the operations matrix (IPO × member × exchange). */

export interface BidSummaryCounts {
  bidDone: number; bidPending: number; bidFailed: number;
  modifyDone: number; modifyPending: number; modifyFailed: number;
  cancelDone: number; cancelPending: number; cancelFailed: number;
  total: number;
}
export interface BidSummaryRow {
  ipoId: string; ipoSymbol: string; ipoName: string;
  memberCredentialId: string | null;
  memberCode: string;      // "BYFILE" for unposted (no member resolved yet)
  memberName: string;
  exchange: string | null; // "NSE_EIPO" | "BSE_IBBS" | null
  counts: BidSummaryCounts;
}
export interface BidSummaryFilters {
  ipoId?: string; memberCredentialId?: string; exchange?: string;
  from?: string; to?: string;
}
export const fetchBidSummary = (f: BidSummaryFilters = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v));
  const qs = p.toString();
  return authed<{ rows: BidSummaryRow[]; totals: BidSummaryCounts }>(
    `${API}/admin/bidding/summary${qs ? `?${qs}` : ''}`, { method: 'GET' });
};
export const fetchBidSummaryFacets = () =>
  authed<{
    ipos: { id: string; symbol: string; name: string }[];
    members: { id: string; label: string; exchange: string }[];
    exchanges: { value: string; label: string }[];
  }>(`${API}/admin/bidding/summary/facets`, { method: 'GET' });

/* ── NSE PREANCHOR parser ────────────────────────────────────────────────
   Uploads the exchange's Security Parameters PDF, returns the extracted
   fields for the IPO form to review before writing. The endpoint is read-
   only — nothing is persisted here. Written to the catalog only when the
   operator hits Save on the entry form. */

/** One extracted name that may or may not resolve to a master row. */
export interface ResolvedName {
  name: string;
  master?: { id: string; name: string };
}

export interface ParsedPreanchor {
  symbol?: string;
  name?: string;
  faceValue?: number;
  /** Mainboard / SME — read from the doc title's "(Mainboard)" or "(SME)". */
  type?: 'mainboard' | 'sme';
  /** Dual-listing for Mainboard; NSE-only for NSE-Emerge SME. */
  exNse?: boolean;
  exBse?: boolean;
  issueSizeCr?: number;
  freshIssueCr?: number;
  ofsCr?: number;
  priceBandMin?: number;
  priceBandMax?: number;
  lotSize?: number;
  tickSize?: number;
  /** enriched by the endpoint into a ResolvedName — see match() in the API */
  registrar?: ResolvedName;
  leadManagers?: ResolvedName[];
  sponsorBank?: string;
  openDate?: string;
  closeDate?: string;
  qibCloseDate?: string;
  upiMandateCutoff?: string;
  /** computed T+3 estimates — the IPO Note parser overwrites with exact dates */
  allotmentDate?: string;
  refundDate?: string;
  dematDate?: string;
  listingDate?: string;
  /** reservation share counts at the LOWER band (as PREANCHOR itself notes) */
  reservation?: { qib?: number; hni?: number; hni2?: number; retail?: number; total?: number };
  subCategories?: string;
  upiSubCategories?: string;
  _raw?: { warnings: string[] };
}

export const parsePreanchor = async (file: File): Promise<ParsedPreanchor> => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/admin/ipo-import/parse/preanchor`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await adminToken()}` },
    body: fd,
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = JSON.parse(body); msg = Array.isArray(j.message) ? j.message.join(', ') : j.message ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return body ? JSON.parse(body) : {};
};

export interface ParsedAnchorInvestor {
  name: string; shares: number; pct: number; price: number; amount: number;
  /** Master-matched canonical when the parsed name resolves to a row in
   *  the Anchor Investors master (aliases + normalisation handled by
   *  the shared `resolveMaster`). Undefined for free-text passes-through. */
  master?: { id: string; name: string };
}
export interface ParsedAnchor {
  totalShares?: number;
  allocationPrice?: number;
  /** ISO date the anchor investors bid — usually the trading day BEFORE
   *  the issue opens. Set when the intimation letter's header states it;
   *  the form falls back to openDate − 1 business day otherwise. */
  anchorDate?: string;
  investors: ParsedAnchorInvestor[];
  _raw?: { warnings: string[] };
}

export const parseAnchor = async (file: File): Promise<ParsedAnchor> => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/admin/ipo-import/parse/anchor`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await adminToken()}` },
    body: fd,
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = JSON.parse(body); msg = Array.isArray(j.message) ? j.message.join(', ') : j.message ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return body ? JSON.parse(body) : { investors: [] };
};

/**
 * Merchant banker's IPO Note (Axis format). See the parser for scope; this
 * type mirrors ParsedIpoNote in the API — kept in sync by hand because both
 * ends are strictly typed. Fields deliberately omitted (name/symbol/price
 * band/lot/leads/registrar) because PREANCHOR is authoritative for those.
 */
export interface ParsedIpoNoteFinancial {
  label: string;
  values: (string | null)[];
}
export interface ParsedIpoNote {
  /** exact dates — OVERWRITE the T+3 estimates PREANCHOR produced */
  allotmentDate?: string;
  refundDate?: string;
  dematDate?: string;
  listingDate?: string;
  /** Anchor investor bidding date when the Note's Indicative Timetable
   *  states it — usually the trading day BEFORE openDate. */
  anchorDate?: string;
  /** Fresh Issue / OFS in ₹ Cr from the Note's OFFER DETAILS block.
   *  A fallback for PREANCHOR — extracted for the 2 of 4 Notes whose
   *  format prints an OFFER DETAILS header (PSL, Deepa); the other two
   *  put the same data in an unlabelled page-1 wrap and are left blank. */
  freshIssueCr?: number;
  ofsCr?: number;
  /** post-issue implied market cap range (Cr) — display-only for now */
  marketCap?: { min?: number; max?: number };
  /** year labels in the order the table lists them ("2026", "2025", "2024") */
  financialPeriods?: string[];
  /** brief financial highlights — one label + up to 3 period values per row */
  financials?: ParsedIpoNoteFinancial[];
  /** pre-rendered HTML table that goes straight into form.companyFinancials */
  financialsHtml?: string;
  /** company prose extracted VERBATIM from the Note — the modal offers a
   *  Rewrite button per row that swaps the verbatim text for a Claude
   *  redraft in Investoyard's voice */
  companyDescriptionHtml?: string;
  companyStrengthHtml?: string;
  objectsOfIssueHtml?: string;
  /** true if admin → Integrations → Claude AI is configured — server has
   *  the API key it needs to serve /rewrite-note-field */
  canRewrite?: boolean;
  _raw?: { warnings: string[] };
}

export const parseIpoNote = async (file: File): Promise<ParsedIpoNote> => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/admin/ipo-import/parse/ipo-note`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await adminToken()}` },
    body: fd,
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = JSON.parse(body); msg = Array.isArray(j.message) ? j.message.join(', ') : j.message ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return body ? JSON.parse(body) : {};
};

/** Rewrites one prose field (description / strength / objects) via Claude,
 *  called by the IPO Note review modal per row. Returns the rewritten
 *  HTML. Requires admin → Integrations → Claude AI to be configured. */
export const rewriteNoteField = async (kind: 'description' | 'strength' | 'objects', text: string): Promise<string> => {
  const res = await fetch(`${API}/admin/ipo-import/rewrite-note-field`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await adminToken()}`,
    },
    body: JSON.stringify({ kind, text }),
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = JSON.parse(body); msg = Array.isArray(j.message) ? j.message.join(', ') : j.message ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const parsed = body ? JSON.parse(body) : {};
  return String(parsed.html ?? '');
};
