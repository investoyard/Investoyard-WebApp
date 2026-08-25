/**
 * Canonical permission catalog (server-owned). The admin role editor renders these
 * as checkboxes, and role writes are validated against them — a role can only grant
 * a known permission.
 */
export const PERMISSION_CATALOG = [
  { key: 'dashboard.view', label: 'View dashboard', group: 'General' },
  { key: 'users.view', label: 'View users', group: 'Users' },
  { key: 'users.manage', label: 'Create / edit users', group: 'Users' },
  { key: 'roles.view', label: 'View roles', group: 'Roles & permissions' },
  { key: 'roles.manage', label: 'Create / edit roles', group: 'Roles & permissions' },
  { key: 'ipos.view', label: 'View IPOs', group: 'IPOs' },
  { key: 'ipos.manage', label: 'Create / edit IPOs', group: 'IPOs' },
  { key: 'gmp.submit', label: 'Enter GMP values', group: 'IPOs' },
  { key: 'bids.view', label: 'View bids', group: 'Bids' },
  { key: 'bids.manage', label: 'Manage bids / allotment', group: 'Bids' },
  { key: 'clients.view', label: 'View clients (investors)', group: 'Clients' },
  { key: 'clients.manage', label: 'Create / edit clients', group: 'Clients' },
  { key: 'reports.view', label: 'View reports', group: 'Reports' },
  { key: 'audit.view', label: 'View audit log', group: 'Audit' },
  { key: 'rails.manage', label: 'Configure exchange APIs (NSE/BSE)', group: 'Exchange rails' },
  { key: 'tenants.manage', label: 'Manage tenants & white-label settings', group: 'Tenants' },
  { key: 'settings.manage', label: 'Manage settings', group: 'Settings' },
  { key: 'providers.manage', label: 'Manage provider keys (SMS / push)', group: 'Settings' },
] as const;

export const VALID_PERMISSIONS = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));
export const ROLE_SCOPES = ['own', 'subtree', 'all'] as const;
