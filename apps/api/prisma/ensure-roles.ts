/**
 * Idempotent role bootstrap — SAFE for production (does NOT wipe data, unlike seed.ts).
 * Ensures the platform Admin + Staff operator roles exist, and back-fills the new
 * clients.* permissions onto existing partner/branch Admin roles. Run once after a
 * deploy that introduces these roles/permissions:
 *
 *   cd apps/api && npx ts-node prisma/ensure-roles.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } } });

const ADMIN_PERMS = [
  'dashboard.view', 'ipos.view', 'ipos.manage', 'bids.view', 'bids.manage',
  'clients.view', 'clients.manage', 'reports.view', 'users.view', 'users.manage',
  'roles.view', 'audit.view', 'tenants.manage', 'settings.manage',
  // Added when the corresponding admin surfaces got their own perm.
  'allotment.view', 'allotment.manage', 'banners.manage', 'news.manage',
  'masters.manage', 'partner-api.reports.view',
];
const STAFF_PERMS = ['dashboard.view', 'ipos.view', 'ipos.manage', 'bids.view', 'clients.view', 'reports.view', 'allotment.view'];

/** Partner-tenant Admin — sensible perms for a partner or white-label
 *  admin. Kept in step with AdminService.PARTNER_ADMIN_PERMS. Notably no
 *  `tenants.manage` — that opens the platform-wide partner tree. */
const PARTNER_TENANT_ADMIN_PERMS = [
  'dashboard.view', 'ipos.view', 'bids.view', 'bids.manage',
  'clients.view', 'clients.manage', 'reports.view',
  'users.view', 'users.manage', 'roles.view', 'audit.view', 'settings.manage',
  'partner-api.reports.view',
];

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
  // Additive only — doesn't touch anything already granted.
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
  // for a partner-tier user). Add partner-api.reports.view so partner
  // admins can see their own API usage.
  const partnerAdmins = await prisma.role.findMany({
    where: { name: 'Admin', tenantId: { not: platform.id } },
    select: { id: true, permissions: true },
  });
  let trimmed = 0;
  for (const r of partnerAdmins) {
    const next = Array.from(new Set(r.permissions
      .filter((p) => p !== 'tenants.manage')
      .concat(['partner-api.reports.view'])));
    // sort so an idempotent re-run doesn't churn rows unnecessarily
    if (next.length !== r.permissions.length || next.some((p) => !r.permissions.includes(p))) {
      await prisma.role.update({ where: { id: r.id }, data: { permissions: next } });
      trimmed++;
    }
  }
  if (trimmed) console.log(`trimmed tenants.manage / added partner-api.reports.view on ${trimmed} partner/branch Admin role(s)`);

  // Assign 6-digit sequential channel codes (from 601001) to any partner/branch missing one.
  const coded = await prisma.tenant.findMany({ where: { code: { not: null } }, orderBy: { code: 'desc' }, take: 1, select: { code: true } });
  let next = coded[0]?.code ? Number(coded[0].code) + 1 : 601001;
  const needCode = await prisma.tenant.findMany({ where: { type: { in: ['partner', 'branch'] }, code: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  for (const t of needCode) { await prisma.tenant.update({ where: { id: t.id }, data: { code: String(next++) } }); }
  if (needCode.length) console.log(`assigned channel codes to ${needCode.length} partner/branch tenant(s)`);

  console.log('Role bootstrap complete.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
