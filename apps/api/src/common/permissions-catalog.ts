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
 * ONE PERM PER CHILD MENU (operator's rule, 2026-09-08). The earlier
 * "one perm covers all child menus" grouping (masters.manage, providers.manage,
 * partner-api.reports.view) hid useful separations behind a single tick —
 * a partner staff was either given everything under a menu or nothing, and
 * a role editor could not see which children a permission actually unlocked.
 * Every child menu now carries its own perm; ensure-roles backfills the
 * split so existing role rows keep their previous coverage.
 *
 * Keys are the STABLE identity — never rename them. Role rows in the DB
 * validate against VALID_PERMISSIONS below; a rename would silently strip
 * that permission off every role that held it.
 */
export const PERMISSION_CATALOG = [
  // Dashboard
  { key: 'dashboard.view',                 label: 'Dashboard',                                                                                    group: 'Dashboard' },

  // IPO Management (one per child)
  { key: 'ipos.view',                      label: 'IPO List',                                                                                     group: 'IPO Management' },
  { key: 'ipos.manage',                    label: 'Add New IPO · edit existing IPOs',                                                             group: 'IPO Management' },
  { key: 'ipos.import',                    label: 'Import from Excel',                                                                            group: 'IPO Management' },
  { key: 'ipos.operations',                label: 'IPO Operations (Start Bid / Start Print / Is Active toggles)',                                 group: 'IPO Management' },
  { key: 'gmp.log.view',                   label: 'GMP Log & Contributors',                                                                       group: 'IPO Management' },
  { key: 'gmp.feed.view',                  label: 'GMP Feed',                                                                                     group: 'IPO Management' },
  { key: 'gmp.submit',                     label: 'Enter GMP values (via /gmp/entry — separate from admin sidebar)',                              group: 'IPO Management' },

  // Applications (bids.view = read list; bids.manage = row actions on Bidding Report)
  { key: 'bids.view',                      label: 'View Applications',                                                                            group: 'Applications' },
  { key: 'bids.manage',                    label: 'Edit / cancel / refresh / rebid on Bidding Report',                                            group: 'Applications' },

  // Bidding & Exchange (one per child)
  { key: 'rails.manage',                   label: 'Exchange Rails',                                                                               group: 'Bidding & Exchange' },
  { key: 'bidding.report.view',            label: 'Bidding Report',                                                                               group: 'Bidding & Exchange' },
  { key: 'bidding.summary.view',           label: 'Bidding Summary',                                                                              group: 'Bidding & Exchange' },

  // Clients
  { key: 'clients.view',                   label: 'View Clients (investors)',                                                                     group: 'Clients' },
  { key: 'clients.manage',                 label: 'Add / edit / delete Clients (hard-delete is superadmin-only)',                                 group: 'Clients' },

  // Partners / Branches (one per child)
  { key: 'tenants.manage',                 label: 'Partners & Branches',                                                                          group: 'Partners / Branches' },
  { key: 'tenants.applications.review',    label: 'Partner Applications (review · approve · reject)',                                             group: 'Partners / Branches' },

  // Reports
  { key: 'reports.view',                   label: 'Reports',                                                                                      group: 'Reports' },

  // Banners
  { key: 'banners.manage',                 label: 'Banners',                                                                                      group: 'Banners' },

  // News & Updates
  { key: 'news.manage',                    label: 'News & Updates',                                                                               group: 'News & Updates' },

  // Allotment (one per child)
  { key: 'allotment.view',                 label: 'Allotment List',                                                                               group: 'Allotment' },
  { key: 'allotment.manage',               label: 'Import Allotment files',                                                                       group: 'Allotment' },

  // Partner API (Docs stays open — every operator, including partners, may reference it — one perm per remaining child)
  { key: 'partner-api.keys.manage',        label: 'My API Keys',                                                                                  group: 'Partner API' },
  { key: 'partner-api.calls.view',         label: 'API Calls report',                                                                             group: 'Partner API' },
  { key: 'partner-api.prints.view',        label: 'Print Report',                                                                                 group: 'Partner API' },

  // Masters (one per child menu)
  { key: 'masters.registrars.manage',      label: 'Registrars',                                                                                   group: 'Masters' },
  { key: 'masters.lead-managers.manage',   label: 'Lead Managers',                                                                                group: 'Masters' },
  { key: 'masters.relationships.manage',   label: 'Relationships',                                                                                group: 'Masters' },
  { key: 'masters.upi-handles.manage',     label: 'UPI Handles',                                                                                  group: 'Masters' },
  { key: 'masters.anchors.manage',         label: 'Anchor Investors',                                                                             group: 'Masters' },
  { key: 'masters.sectors.manage',         label: 'Sectors',                                                                                      group: 'Masters' },
  { key: 'masters.exchanges.manage',       label: 'Exchanges',                                                                                    group: 'Masters' },
  { key: 'masters.ipo-category.manage',    label: 'IPO Category (referenced from IPO Management sidebar)',                                        group: 'Masters' },

  // User Management (Users + Roles & Permissions + Audit Trail all live under this menu)
  { key: 'users.view',                     label: 'Users',                                                                                        group: 'User Management' },
  { key: 'users.manage',                   label: 'Add / edit Users',                                                                             group: 'User Management' },
  { key: 'roles.view',                     label: 'Roles & Permissions (view)',                                                                   group: 'User Management' },
  { key: 'roles.manage',                   label: 'Roles & Permissions (edit — only a superadmin can create a role granting * or scope=all)',    group: 'User Management' },
  { key: 'audit.view',                     label: 'Audit Trail',                                                                                  group: 'User Management' },

  // System Settings (one per child menu)
  { key: 'providers.manage',               label: 'Provider Keys (SMS · Email · WhatsApp · other credentials)',                                   group: 'System Settings' },
  { key: 'templates.manage',               label: 'Message Templates',                                                                            group: 'System Settings' },
  { key: 'messages.view',                  label: 'Message Log',                                                                                  group: 'System Settings' },
  { key: 'chatbot.manage',                 label: 'Chatbot Flow',                                                                                 group: 'System Settings' },
] as const;

export const VALID_PERMISSIONS = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));
export const ROLE_SCOPES = ['own', 'subtree', 'all'] as const;

/**
 * BACKFILL MAP — when a role row still holds one of these legacy broad
 * permissions, ensure-roles adds the children they used to cover, so a
 * pre-split role keeps its previous menu coverage after the perm catalog
 * narrowed. Two rules:
 *
 *   - REDEFINED broad key (`ipos.manage`, `tenants.manage`, `rails.manage`,
 *     `providers.manage`) — its meaning narrowed to one child, so it STAYS
 *     in the catalog. Backfill adds the OTHER children on top. A second run
 *     is a set-union no-op.
 *   - REMOVED broad key (`masters.manage`, `partner-api.reports.view`) — no
 *     longer a valid catalog perm. Backfill expands then drops the key.
 *
 * ensure-roles decides drop-vs-keep by checking VALID_PERMISSIONS: a key
 * still in the catalog is kept, a key not in it is dropped.
 */
export const LEGACY_PERM_EXPANSIONS: Record<string, string[]> = {
  'masters.manage': [
    'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.relationships.manage',
    'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
    'masters.exchanges.manage', 'masters.ipo-category.manage',
  ],
  'partner-api.reports.view': [
    'partner-api.keys.manage', 'partner-api.calls.view', 'partner-api.prints.view',
  ],
  'providers.manage': [
    'templates.manage', 'messages.view', 'chatbot.manage',
  ],
  'ipos.manage': [
    'ipos.import', 'ipos.operations', 'gmp.log.view', 'gmp.feed.view',
  ],
  'rails.manage': [
    'bidding.report.view', 'bidding.summary.view',
  ],
  'tenants.manage': [
    'tenants.applications.review',
  ],
};
