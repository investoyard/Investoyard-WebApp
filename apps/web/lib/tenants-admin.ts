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
export const updateTenant = (slug: string, body: Partial<{ name: string; status: string; brandColor: string; goldColor: string; logoUrl: string; customDomain: string; profile: Record<string, any>; commissionRate: number | null }>) =>
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
  id: string; name?: string; mobileMasked?: string; email?: string; status: string;
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
  extra?: Record<string, any>; // operator-extended fields (categoryName, issueType, …)
}
export interface IpoDoc { type: string; url: string; summary?: string }
export interface IpoWrite {
  symbol?: string; name?: string; type?: string; status?: string;
  priceBandMin?: number; priceBandMax?: number; lotSize?: number; minAmount?: number;
  issueSizeCr?: number; registrar?: string; isin?: string; objectsOfIssue?: string; logoUrl?: string;
  openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string;
  reservations?: string[]; documents?: IpoDoc[]; gmp?: number; listingGainPct?: number;
  autoPollSubscription?: boolean;
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
  baseType?: string;            // ipo-categories: 'mainboard' | 'sme'
  categoryId?: string | null;   // issue-types → IpoCategoryMaster
  category?: MasterRow | null;  // issue-types (joined)
  allowMultiple?: boolean;      // relationships: repeatable per account
  active: boolean;
}
export type MasterKind = 'lead-managers' | 'registrars' | 'ipo-categories' | 'issue-types' | 'relationships' | 'upi-handles';
export const fetchMaster = (kind: MasterKind) => authed<MasterRow[]>(`${API}/admin/masters/${kind}`, { method: 'GET' });
export const createMaster = (kind: MasterKind, body: Partial<MasterRow>) =>
  authed<MasterRow>(`${API}/admin/masters/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const updateMaster = (kind: MasterKind, id: string, body: Partial<MasterRow>) =>
  authed<MasterRow>(`${API}/admin/masters/${kind}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

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
export const testRail = (id: string) =>
  authed<{ ok: boolean; outcome: 'connected' | 'rejected' | 'unreachable' | 'incomplete' | 'invalid_secret'; note: string }>(
    `${API}/admin/rails/${id}/test`, { method: 'POST' });
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
