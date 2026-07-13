'use client';
/**
 * Investoyard admin — client-side mock RBAC store (localStorage).
 * Roles + permissions, users, IPOs and bids management. SuperAdmin can create
 * custom roles and grant any permission. Replace with the real API for production.
 */
import { useSyncExternalStore } from 'react';

/* ----------------------------------------------------------- permissions */
export const PERMISSIONS = [
  { key: 'dashboard.view', label: 'View dashboard', group: 'General' },
  { key: 'users.view', label: 'View users', group: 'Users' },
  { key: 'users.manage', label: 'Create / edit users', group: 'Users' },
  { key: 'roles.view', label: 'View roles', group: 'Roles & permissions' },
  { key: 'roles.manage', label: 'Create / edit roles & permissions', group: 'Roles & permissions' },
  { key: 'ipos.view', label: 'View IPOs', group: 'IPOs' },
  { key: 'ipos.manage', label: 'Create / edit IPOs', group: 'IPOs' },
  { key: 'bids.view', label: 'View bids', group: 'Bids' },
  { key: 'bids.manage', label: 'Manage bids', group: 'Bids' },
  { key: 'reports.view', label: 'View reports', group: 'Reports' },
  { key: 'audit.view', label: 'View audit log', group: 'Audit' },
  { key: 'rails.manage', label: 'Configure exchange APIs (NSE/BSE)', group: 'Exchange rails' },
  { key: 'tenants.manage', label: 'Manage tenants & white-label settings', group: 'Tenants' },
  { key: 'settings.manage', label: 'Manage settings', group: 'Settings' },
  { key: 'providers.manage', label: 'Manage provider keys (SMS / push)', group: 'Settings' },
] as const;
export type Permission = (typeof PERMISSIONS)[number]['key'];
export const ALL_PERMS: Permission[] = PERMISSIONS.map((p) => p.key);

/* ----------------------------------------------------------- types */
export interface Role { id: string; name: string; system?: boolean; permissions: Permission[]; }
export interface AdminUser { id: string; name: string; email: string; roleId: string; status: 'active' | 'disabled'; createdAt: string; }
export interface AdminIpo { id: string; symbol: string; name: string; type: 'mainboard' | 'sme'; status: 'upcoming' | 'open' | 'closed' | 'listed'; priceBandMin: number; priceBandMax: number; lotSize: number; openDate: string; closeDate: string; }
export interface AdminBid { id: string; applicationNumber: string; ipoSymbol: string; ipoName: string; userName: string; pan: string; category: 'Retail' | 'sNII' | 'bNII'; lots: number; amount: number; method: 'upi' | 'pdf'; status: string; createdAt: string; }
export interface AuditEntry { id: string; actor: string; action: string; target?: string; at: string; }
export interface Settings {
  appName: string; supportEmail: string; defaultRail: 'NSE' | 'BSE';
  gmpVisible: boolean; upiCap: number; familyApplications: boolean; maintenance: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  appName: 'Investoyard', supportEmail: 'support@investoyard.com', defaultRail: 'NSE',
  gmpVisible: true, upiCap: 500000, familyApplications: true, maintenance: false,
};

export type RailKey = 'nse' | 'bse';
export interface RailConfig {
  enabled: boolean; env: 'UAT' | 'PROD'; baseUrl: string;
  memberCode: string; loginId: string; password: string;
  subBrokerCode: string; ibbsId: string; webhookUrl: string;
  status: 'connected' | 'not_connected';
}
export const DEFAULT_RAILS: Record<RailKey, RailConfig> = {
  nse: { enabled: true, env: 'UAT', baseUrl: 'https://uat.nseindia.com/eipo/v1', memberCode: '', loginId: '', password: '', subBrokerCode: '', ibbsId: '', webhookUrl: 'https://api.investoyard.com/api/rail/callbacks/nse', status: 'not_connected' },
  bse: { enabled: false, env: 'UAT', baseUrl: '', memberCode: '', loginId: '', password: '', subBrokerCode: '', ibbsId: '', webhookUrl: 'https://api.investoyard.com/api/rail/callbacks/bse', status: 'not_connected' },
};

interface State {
  currentUserId: string | null;
  roles: Role[];
  users: AdminUser[];
  ipos: AdminIpo[];
  bids: AdminBid[];
  settings: Settings;
  rails: Record<RailKey, RailConfig>;
  audit: AuditEntry[];
}

/* ----------------------------------------------------------- seed */
const rid = () => Math.random().toString(36).slice(2, 9);

const R_SUPER = 'role_super', R_ADMIN = 'role_admin', R_USER = 'role_user';
const U_SUPER = 'usr_super';

function seed(): State {
  const roles: Role[] = [
    { id: R_SUPER, name: 'SuperAdmin', system: true, permissions: [...ALL_PERMS] },
    { id: R_ADMIN, name: 'Admin', system: true, permissions: ['dashboard.view', 'users.view', 'users.manage', 'ipos.view', 'ipos.manage', 'bids.view', 'bids.manage', 'reports.view', 'audit.view'] },
    { id: R_USER, name: 'User', system: true, permissions: ['dashboard.view', 'bids.view'] },
  ];
  const users: AdminUser[] = [
    { id: U_SUPER, name: 'Aarav Mehta', email: 'superadmin@investoyard.com', roleId: R_SUPER, status: 'active', createdAt: '2026-05-01' },
    { id: rid(), name: 'Priya Nair', email: 'admin@investoyard.com', roleId: R_ADMIN, status: 'active', createdAt: '2026-05-04' },
    { id: rid(), name: 'Rohan Das', email: 'ops@investoyard.com', roleId: R_ADMIN, status: 'active', createdAt: '2026-05-09' },
    { id: rid(), name: 'Sneha Rao', email: 'sneha@investoyard.com', roleId: R_USER, status: 'active', createdAt: '2026-05-15' },
    { id: rid(), name: 'Vikram Shah', email: 'vikram@investoyard.com', roleId: R_USER, status: 'disabled', createdAt: '2026-05-22' },
  ];
  const ipos: AdminIpo[] = [
    { id: rid(), symbol: 'ACME', name: 'Acme Technologies Ltd', type: 'mainboard', status: 'open', priceBandMin: 100, priceBandMax: 105, lotSize: 142, openDate: '2026-06-20', closeDate: '2026-06-22' },
    { id: rid(), symbol: 'NIMBUS', name: 'Nimbus Renewables Ltd', type: 'mainboard', status: 'open', priceBandMin: 312, priceBandMax: 328, lotSize: 45, openDate: '2026-06-21', closeDate: '2026-06-23' },
    { id: rid(), symbol: 'VERDANT', name: 'Verdant Agritech Ltd', type: 'sme', status: 'open', priceBandMin: 90, priceBandMax: 95, lotSize: 1200, openDate: '2026-06-20', closeDate: '2026-06-22' },
    { id: rid(), symbol: 'HELIOS', name: 'Helios Financial Services Ltd', type: 'mainboard', status: 'upcoming', priceBandMin: 440, priceBandMax: 462, lotSize: 32, openDate: '2026-06-27', closeDate: '2026-07-01' },
    { id: rid(), symbol: 'ZETA', name: 'Zeta Foods Ltd', type: 'mainboard', status: 'listed', priceBandMin: 220, priceBandMax: 230, lotSize: 65, openDate: '2026-06-05', closeDate: '2026-06-09' },
  ];
  const bidSeed: [string, string, string, string, AdminBid['category'], number, number, AdminBid['method'], string][] = [
    ['ACME', 'Acme Technologies Ltd', 'Sneha Rao', 'ABCDE1234F', 'Retail', 13, 193830, 'upi', 'allotted'],
    ['ACME', 'Acme Technologies Ltd', 'Vikram Shah', 'FGHIJ5678K', 'sNII', 20, 298200, 'upi', 'upi_blocked'],
    ['NIMBUS', 'Nimbus Renewables Ltd', 'Rohan Das', 'KLMNO9012P', 'Retail', 5, 73800, 'upi', 'not_allotted'],
    ['VERDANT', 'Verdant Agritech Ltd', 'Priya Nair', 'PQRST3456U', 'Retail', 1, 114000, 'upi', 'upi_blocked'],
    ['ACME', 'Acme Technologies Ltd', 'Rohan Das', 'UVWXY7890Z', 'bNII', 80, 1192800, 'pdf', 'submitted'],
    ['NIMBUS', 'Nimbus Renewables Ltd', 'Sneha Rao', 'ABCDE1234F', 'Retail', 13, 191880, 'upi', 'allotted'],
    ['ZETA', 'Zeta Foods Ltd', 'Vikram Shah', 'FGHIJ5678K', 'Retail', 4, 92000, 'upi', 'not_allotted'],
    ['VERDANT', 'Verdant Agritech Ltd', 'Sneha Rao', 'ABCDE1234F', 'sNII', 3, 342000, 'upi', 'mandate_pending'],
    ['HELIOS', 'Helios Financial Services Ltd', 'Priya Nair', 'PQRST3456U', 'Retail', 1, 14784, 'upi', 'submitted'],
    ['ACME', 'Acme Technologies Ltd', 'Priya Nair', 'PQRST3456U', 'Retail', 10, 149100, 'upi', 'allotted'],
  ];
  const bids: AdminBid[] = bidSeed.map(([sym, nm, user, pan, cat, lots, amt, method, status], i) => ({
    id: rid(), applicationNumber: 'IY' + (100000000 + i * 4213731), ipoSymbol: sym, ipoName: nm,
    userName: user, pan, category: cat, lots, amount: amt, method, status,
    createdAt: `2026-06-2${(i % 3) + 1}`,
  }));
  const audit: AuditEntry[] = [
    { id: rid(), actor: 'Aarav Mehta', action: 'Created role', target: 'SuperAdmin', at: '2026-05-01T09:00:00Z' },
    { id: rid(), actor: 'Aarav Mehta', action: 'Created user', target: 'Priya Nair', at: '2026-05-04T11:20:00Z' },
    { id: rid(), actor: 'Priya Nair', action: 'Created IPO', target: 'ACME', at: '2026-06-18T08:45:00Z' },
    { id: rid(), actor: 'Priya Nair', action: 'Changed bid status', target: 'IY100000000 → allotted', at: '2026-06-21T14:20:00Z' },
    { id: rid(), actor: 'Aarav Mehta', action: 'Updated settings', at: '2026-06-22T08:05:00Z' },
    { id: rid(), actor: 'Aarav Mehta', action: 'Disabled user', target: 'Vikram Shah', at: '2026-06-22T16:30:00Z' },
  ];
  return {
    currentUserId: U_SUPER, roles, users, ipos, bids,
    settings: { ...DEFAULT_SETTINGS },
    rails: { nse: { ...DEFAULT_RAILS.nse }, bse: { ...DEFAULT_RAILS.bse } },
    audit,
  };
}

/* ----------------------------------------------------------- store */
const KEY = 'investoyard.admin.v2';
let state: State = seed();
let loaded = false;
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === 'undefined') return state;
  if (loaded) return state;
  try { const raw = window.localStorage.getItem(KEY); if (raw) state = { ...seed(), ...JSON.parse(raw) }; } catch { /* ignore */ }
  loaded = true;
  return state;
}
function persist() { try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } listeners.forEach((l) => l()); }
function set(next: Partial<State>) { state = { ...state, ...next }; persist(); }

function logAction(action: string, target?: string) {
  const actor = state.users.find((u) => u.id === state.currentUserId)?.name ?? 'System';
  const entry: AuditEntry = { id: rid(), actor, action, target, at: new Date().toISOString() };
  state = { ...state, audit: [entry, ...state.audit].slice(0, 300) };
  persist();
}

export const admin = {
  load,
  signInEmail(email: string) {
    load();
    const u = state.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.status === 'active');
    if (!u) return false;
    set({ currentUserId: u.id }); logAction('Signed in');
    return true;
  },
  signInAs(userId: string) { load(); set({ currentUserId: userId }); logAction('Signed in'); },
  signOut() { logAction('Signed out'); set({ currentUserId: null }); },

  createRole(name: string, permissions: Permission[]) { load(); set({ roles: [...state.roles, { id: rid(), name, permissions }] }); logAction('Created role', name); },
  updateRole(id: string, patch: Partial<Role>) { load(); const nm = state.roles.find((r) => r.id === id)?.name; set({ roles: state.roles.map((r) => (r.id === id ? { ...r, ...patch } : r)) }); logAction('Updated role', patch.name ?? nm); },
  deleteRole(id: string) {
    load();
    const role = state.roles.find((r) => r.id === id);
    if (role?.system) return;
    if (state.users.some((u) => u.roleId === id)) return; // don't delete a role in use
    set({ roles: state.roles.filter((r) => r.id !== id) }); logAction('Deleted role', role?.name);
  },

  createUser(u: Omit<AdminUser, 'id' | 'createdAt'>) { load(); set({ users: [...state.users, { ...u, id: rid(), createdAt: new Date().toISOString().slice(0, 10) }] }); logAction('Created user', u.name); },
  updateUser(id: string, patch: Partial<AdminUser>) { load(); const nm = state.users.find((x) => x.id === id)?.name; set({ users: state.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }); logAction('Updated user', patch.name ?? nm); },
  toggleUser(id: string) { load(); const u = state.users.find((x) => x.id === id); const next = u?.status === 'active' ? 'disabled' : 'active'; set({ users: state.users.map((x) => (x.id === id ? { ...x, status: x.status === 'active' ? 'disabled' : 'active' } : x)) }); logAction(next === 'disabled' ? 'Disabled user' : 'Enabled user', u?.name); },

  createIpo(i: Omit<AdminIpo, 'id'>) { load(); set({ ipos: [...state.ipos, { ...i, id: rid() }] }); logAction('Created IPO', i.symbol); },
  updateIpo(id: string, patch: Partial<AdminIpo>) { load(); const sym = state.ipos.find((x) => x.id === id)?.symbol; set({ ipos: state.ipos.map((x) => (x.id === id ? { ...x, ...patch } : x)) }); logAction('Updated IPO', patch.symbol ?? sym); },
  deleteIpo(id: string) { load(); const sym = state.ipos.find((x) => x.id === id)?.symbol; set({ ipos: state.ipos.filter((x) => x.id !== id) }); logAction('Deleted IPO', sym); },

  setBidStatus(id: string, status: string) { load(); const b = state.bids.find((x) => x.id === id); set({ bids: state.bids.map((x) => (x.id === id ? { ...x, status } : x)) }); logAction('Changed bid status', b ? `${b.applicationNumber} → ${status.replace(/_/g, ' ')}` : status); },

  updateSettings(patch: Partial<Settings>) { load(); set({ settings: { ...state.settings, ...patch } }); logAction('Updated settings'); },

  updateRail(which: RailKey, patch: Partial<RailConfig>) { load(); set({ rails: { ...state.rails, [which]: { ...state.rails[which], ...patch } } }); logAction(`Updated ${which.toUpperCase()} API config`); },
  testRail(which: RailKey) {
    load();
    const r = state.rails[which];
    const ok = r.enabled && !!r.baseUrl && !!r.memberCode && !!r.loginId && !!r.password;
    set({ rails: { ...state.rails, [which]: { ...r, status: ok ? 'connected' : 'not_connected' } } });
    logAction(`Tested ${which.toUpperCase()} connection`, ok ? 'connected' : 'failed');
    return ok;
  },

  resetDemo() { state = seed(); persist(); },

  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot() { return load(); },
};

/* ----------------------------------------------------------- hook + helpers */
export function useAdmin<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(admin.subscribe, () => selector(admin.snapshot()), () => selector(state));
}

export function currentUser(s: State): AdminUser | undefined { return s.users.find((u) => u.id === s.currentUserId); }
export function roleOf(s: State, u?: AdminUser): Role | undefined { return u ? s.roles.find((r) => r.id === u.roleId) : undefined; }
export function can(s: State, perm: Permission): boolean {
  const role = roleOf(s, currentUser(s));
  return !!role && role.permissions.includes(perm);
}
export function roleName(s: State, roleId: string): string { return s.roles.find((r) => r.id === roleId)?.name ?? '—'; }
