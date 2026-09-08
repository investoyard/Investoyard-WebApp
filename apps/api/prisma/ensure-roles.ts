/**
 * Idempotent role bootstrap — SAFE for production (does NOT wipe data, unlike seed.ts).
 * Ensures the platform Admin + Staff operator roles exist, back-fills the granular
 * permissions introduced by the 2026-09-08 "one perm per child menu" split, and
 * removes dead perms. Run after every deploy that adds or renames a permission:
 *
 *   cd apps/api && npx ts-node prisma/ensure-roles.ts
 */
import { PrismaClient } from '@prisma/client';
import { VALID_PERMISSIONS, LEGACY_PERM_EXPANSIONS } from '../src/common/permissions-catalog';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } } });

/** Every catalog perm except the two role-editor mutations and audit
 *  (kept on Admin explicitly below). Kept in sync with the catalog. */
const ADMIN_PERMS = [
  'dashboard.view',
  'ipos.view', 'ipos.manage', 'ipos.import', 'ipos.operations',
  'gmp.log.view', 'gmp.feed.view',
  'bids.view', 'bids.manage',
  'rails.manage', 'bidding.report.view', 'bidding.summary.view',
  'clients.view', 'clients.manage',
  'tenants.manage', 'tenants.applications.review',
  'reports.view', 'banners.manage', 'news.manage',
  'allotment.view', 'allotment.manage',
  'partner-api.keys.manage', 'partner-api.calls.view', 'partner-api.prints.view',
  'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.relationships.manage',
  'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
  'masters.exchanges.manage', 'masters.ipo-category.manage',
  // Admin gets roles.view (can see who has what) but NOT roles.manage —
  // creating or editing a role is superadmin-only (see permissions-catalog).
  'users.view', 'users.manage', 'roles.view', 'audit.view',
  'providers.manage', 'templates.manage', 'messages.view', 'chatbot.manage',
];

const STAFF_PERMS = [
  'dashboard.view', 'ipos.view', 'ipos.manage', 'bids.view',
  'clients.view', 'reports.view', 'allotment.view',
];

/** Partner-tenant Admin — sensible perms for a partner or white-label
 *  admin. Kept in step with AdminService.PARTNER_ADMIN_PERMS. Notably no
 *  `tenants.manage` — that opens the platform-wide partner tree. */
const PARTNER_TENANT_ADMIN_PERMS = [
  'dashboard.view',
  'ipos.view',
  'bids.view', 'bids.manage',
  'bidding.report.view',
  'clients.view', 'clients.manage',
  'reports.view',
  'users.view', 'users.manage', 'roles.view', 'audit.view',
  'partner-api.keys.manage', 'partner-api.calls.view', 'partner-api.prints.view',
];

/** Expand any legacy broad perm on a role into its granular children.
 *  Keys still in VALID_PERMISSIONS are KEPT (redefined narrow meaning);
 *  keys no longer in the catalog are DROPPED. Idempotent set-union. */
function expandLegacy(perms: string[]): string[] {
  const s = new Set(perms);
  for (const [broad, children] of Object.entries(LEGACY_PERM_EXPANSIONS)) {
    if (s.has(broad)) {
      for (const c of children) s.add(c);
      if (!VALID_PERMISSIONS.has(broad)) s.delete(broad);
    }
  }
  return [...s];
}

async function main() {
  const platform = await prisma.tenant.findFirst({ where: { type: 'platform' }, select: { id: true } });
  if (!platform) throw new Error('No platform tenant found — run against a live/seeded DB.');

  for (const [name, permissions, scope] of [['Admin', ADMIN_PERMS, 'all'], ['Staff', STAFF_PERMS, 'all']] as const) {
    const existing = await prisma.role.findFirst({ where: { tenantId: platform.id, name } });
    if (existing) {
      await prisma.role.update({ where: { id: existing.id }, data: { permissions, scope, isSystem: true } });
      console.log(`updated platform role: ${name}`);
    } else {
      await prisma.role.create({ data: { tenantId: platform.id, name, scope, permissions, isSystem: true } });
      console.log(`created platform role: ${name}`);
    }
  }

  // Back-fill clients.* onto existing partner/branch Admin roles that predate it.
  const tenantRoles = await prisma.role.findMany({
    where: { name: 'Admin', tenantId: { not: platform.id }, NOT: { permissions: { hasEvery: ['clients.view', 'clients.manage'] } } },
    select: { id: true, permissions: true },
  });
  for (const r of tenantRoles) {
    const permissions = Array.from(new Set([...r.permissions, 'clients.view', 'clients.manage']));
    await prisma.role.update({ where: { id: r.id }, data: { permissions } });
  }
  if (tenantRoles.length) console.log(`back-filled clients.* on ${tenantRoles.length} partner/branch Admin role(s)`);

  // Trim: strip tenants.manage from partner/branch Admin roles (it was
  // seeded there earlier but showed the platform-wide partner tree — wrong
  // for a partner-tier user). Give them the split Partner API perms.
  const partnerAdmins = await prisma.role.findMany({
    where: { name: 'Admin', tenantId: { not: platform.id } },
    select: { id: true, permissions: true },
  });
  let trimmed = 0;
  for (const r of partnerAdmins) {
    const next = Array.from(new Set(r.permissions
      .filter((p) => p !== 'tenants.manage' && p !== 'settings.manage')
      .concat(['partner-api.keys.manage', 'partner-api.calls.view', 'partner-api.prints.view'])));
    if (next.length !== r.permissions.length || next.some((p) => !r.permissions.includes(p))) {
      await prisma.role.update({ where: { id: r.id }, data: { permissions: next } });
      trimmed++;
    }
  }
  if (trimmed) console.log(`trimmed tenants.manage + settings.manage / added split Partner API perms on ${trimmed} partner/branch Admin role(s)`);

  // Expand every legacy broad perm on EVERY role — Admin, Staff, custom.
  // ADMIN_PERMS above already carries the granular set for platform Admin,
  // so this only rewrites custom or partner roles that predate the split.
  const allRoles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } });
  let expanded = 0;
  for (const r of allRoles) {
    const before = r.permissions;
    const after = expandLegacy(before);
    if (after.length !== before.length || after.some((p) => !before.includes(p)) || before.some((p) => !after.includes(p))) {
      await prisma.role.update({ where: { id: r.id }, data: { permissions: after } });
      expanded++;
    }
  }
  if (expanded) console.log(`expanded legacy broad perms → granular children on ${expanded} role(s)`);

  // Drop settings.manage — it was granted historically, gates nothing, and
  // shows in the role editor as a phantom checkbox.
  const stillHasSettings = await prisma.role.findMany({
    where: { permissions: { has: 'settings.manage' } },
    select: { id: true, permissions: true },
  });
  for (const r of stillHasSettings) {
    const next = r.permissions.filter((p) => p !== 'settings.manage');
    await prisma.role.update({ where: { id: r.id }, data: { permissions: next } });
  }
  if (stillHasSettings.length) console.log(`removed dead settings.manage from ${stillHasSettings.length} role(s)`);

  // Assign 6-digit sequential channel codes (from 601001) to any partner/branch missing one.
  const coded = await prisma.tenant.findMany({ where: { code: { not: null } }, orderBy: { code: 'desc' }, take: 1, select: { code: true } });
  let next = coded[0]?.code ? Number(coded[0].code) + 1 : 601001;
  const needCode = await prisma.tenant.findMany({ where: { type: { in: ['partner', 'branch'] }, code: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  for (const t of needCode) { await prisma.tenant.update({ where: { id: t.id }, data: { code: String(next++) } }); }
  if (needCode.length) console.log(`assigned channel codes to ${needCode.length} partner/branch tenant(s)`);

  console.log('Role bootstrap complete.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
