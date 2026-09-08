/**
 * Canonical permission catalog (server-owned). The admin role editor renders
 * these as checkboxes, and role writes are validated against them — a role
 * can only grant a known permission.
 *
 * Ordering + group names + labels are chosen to mirror the admin sidebar
 * top-to-bottom, so an operator ticking a checkbox knows exactly which menu
 * (or child menu) the permission unlocks. Change a menu label in
 * apps/web/app/admin/layout.tsx? Update the matching label here too.
 *
 * Keys are the STABLE identity — never rename them. Role rows in the DB
 * validate against VALID_PERMISSIONS below; a rename would silently strip
 * that permission off every role that held it.
 */
export const PERMISSION_CATALOG = [
  // Dashboard
  { key: 'dashboard.view',             label: 'Dashboard',                                                                                    group: 'Dashboard' },

  // IPO Management
  { key: 'ipos.view',                  label: 'View IPOs (IPO List, GMP Log, GMP Feed, IPO Category)',                                        group: 'IPO Management' },
  { key: 'ipos.manage',                label: 'Add / edit / import IPOs · IPO Operations',                                                    group: 'IPO Management' },
  { key: 'gmp.submit',                 label: 'Enter GMP values (via /gmp/entry — separate from admin sidebar)',                              group: 'IPO Management' },

  // Applications (bids.view = read applications list; bids.manage = row actions on Bidding Report)
  { key: 'bids.view',                  label: 'View Applications',                                                                            group: 'Applications' },
  { key: 'bids.manage',                label: 'Edit / cancel / refresh / rebid on Bidding Report',                                            group: 'Applications' },

  // Bidding & Exchange
  { key: 'rails.manage',               label: 'Exchange Rails · Bidding Report · Bidding Summary',                                            group: 'Bidding & Exchange' },

  // Clients
  { key: 'clients.view',               label: 'View Clients (investors)',                                                                     group: 'Clients' },
  { key: 'clients.manage',             label: 'Add / edit / delete Clients (hard-delete is superadmin-only)',                                 group: 'Clients' },

  // Partners / Branches
  { key: 'tenants.manage',             label: 'Partners & Branches · Partner Applications review',                                            group: 'Partners / Branches' },

  // Reports
  { key: 'reports.view',               label: 'Reports',                                                                                      group: 'Reports' },

  // Banners
  { key: 'banners.manage',             label: 'Banners',                                                                                      group: 'Banners' },

  // News & Updates
  { key: 'news.manage',                label: 'News & Updates',                                                                               group: 'News & Updates' },

  // Allotment
  { key: 'allotment.view',             label: 'Allotment List',                                                                               group: 'Allotment' },
  { key: 'allotment.manage',           label: 'Import Allotment files',                                                                       group: 'Allotment' },

  // Partner API (Docs stays open — every operator, including partners, may reference it)
  { key: 'partner-api.reports.view',   label: 'My API Keys · API Calls · Print Report',                                                       group: 'Partner API' },

  // Masters (single perm covers Registrars, Lead Managers, Relationships, UPI Handles, Anchors, Sectors, Exchanges)
  { key: 'masters.manage',             label: 'Masters (Registrars, Lead Managers, Relationships, UPI Handles, Anchors, Sectors, Exchanges)', group: 'Masters' },

  // User Management (Users + Roles & Permissions + Audit Trail all live under this menu)
  { key: 'users.view',                 label: 'Users',                                                                                        group: 'User Management' },
  { key: 'users.manage',               label: 'Add / edit Users',                                                                             group: 'User Management' },
  { key: 'roles.view',                 label: 'Roles & Permissions (view)',                                                                   group: 'User Management' },
  { key: 'roles.manage',               label: 'Roles & Permissions (edit — only a superadmin can create a role granting * or scope=all)',    group: 'User Management' },
  { key: 'audit.view',                 label: 'Audit Trail',                                                                                  group: 'User Management' },

  // System Settings (Provider Keys + Message Templates + Message Log + Chatbot Flow all gate on providers.manage)
  { key: 'providers.manage',           label: 'Provider Keys · Message Templates · Message Log · Chatbot Flow',                               group: 'System Settings' },
] as const;

export const VALID_PERMISSIONS = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));
export const ROLE_SCOPES = ['own', 'subtree', 'all'] as const;
