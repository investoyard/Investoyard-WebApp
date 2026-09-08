/**
 * Prisma seed — CLEAN SLATE for production onboarding.
 * Wipes all data, then creates: the platform tenant, the default public brand,
 * the feature catalog, and exactly ONE superadmin operator (username + password).
 * No demo IPOs, partners, or users — real data is entered via the admin console.
 *
 * Run (from apps/api, Postgres up):  npm run seed
 * Superadmin password: SUPERADMIN_PASSWORD env, else the default below (CHANGE IT).
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/password';

// Seed/wipe run as the superuser (DIRECT_URL) so RLS never gets in the way.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } } });

const DEFAULT_PASSWORD = 'Investoyard@2026';

async function wipe() {
  // Delete children before parents (FK-safe order).
  await prisma.applicationStatusEvent.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.consent.deleteMany({});
  await prisma.watchlistItem.deleteMany({});
  await prisma.deviceToken.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.investorProfile.deleteMany({});
  await prisma.ipoGmp.deleteMany({});
  await prisma.ipoSubscription.deleteMany({});
  await prisma.ipoDocument.deleteMany({});
  await prisma.ipoCategory.deleteMany({});
  await prisma.ipo.deleteMany({});
  await prisma.tenantSetting.deleteMany({});
  await prisma.featureDefinition.deleteMany({});
  await prisma.memberCredential.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.providerConfig.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
}

async function main() {
  await wipe();

  // ---- tenants: platform operator + the default public brand ----
  await prisma.tenant.create({ data: { id: 't-platform', type: 'platform', slug: 'investoyard-platform', name: 'Investoyard (Operator)' } });
  await prisma.tenant.create({ data: { id: 't-direct', type: 'direct', slug: 'investoyard', name: 'Investoyard', parentId: 't-platform' } });

  // ---- feature catalog (per-tenant settings cascade) ----
  const features: [string, string, 'boolean' | 'number' | 'string', any, boolean][] = [
    ['gmpEnabled', 'Show grey-market premium', 'boolean', true, true],
    ['familyApply', 'Family / multi-profile apply', 'boolean', true, true],
    ['watchlistEnabled', 'Watchlist', 'boolean', true, true],
    ['maxFamilyMembers', 'Max family profiles', 'number', 8, true],
    ['upiCap', 'UPI mandate cap (₹)', 'number', 500000, true],
    ['whatsappChannel', 'WhatsApp channel / chat URL', 'string', '', true],
  ];
  for (const [key, label, valueType, defaultValue, isPublic] of features) {
    await prisma.featureDefinition.create({ data: { key, label, valueType, defaultValue, isPublic } });
  }

  // ---- platform operator roles (assignable to Admin/Staff operators) ----
  // SuperAdmin: everything, every tenant. Admin: full platform management minus rails/provider
  // secrets and role editing. Staff: read-mostly back-office (catalog + clients + bids).
  const superRole = await prisma.role.create({
    data: { tenantId: 't-platform', name: 'SuperAdmin', scope: 'all', permissions: ['*'], isSystem: true },
  });
  await prisma.role.create({
    data: {
      tenantId: 't-platform', name: 'Admin', scope: 'all', isSystem: true,
      permissions: [
        'dashboard.view',
        // IPO Management — one perm per child menu
        'ipos.view', 'ipos.manage', 'ipos.import', 'ipos.operations',
        'gmp.log.view', 'gmp.feed.view',
        // Applications + Bidding & Exchange (children split from rails.manage)
        'bids.view', 'bids.manage',
        'rails.manage', 'bidding.report.view', 'bidding.summary.view',
        // Clients + Partners / Branches (Partner Applications split off)
        'clients.view', 'clients.manage',
        'tenants.manage', 'tenants.applications.review',
        // Reports + operator-global site content
        'reports.view', 'banners.manage', 'news.manage',
        // Allotment (view + import)
        'allotment.view', 'allotment.manage',
        // Partner API — one perm per remaining child
        'partner-api.keys.manage', 'partner-api.calls.view', 'partner-api.prints.view',
        // Masters — one perm per child menu
        'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.relationships.manage',
        'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
        'masters.exchanges.manage', 'masters.ipo-category.manage',
        // User Management + Audit
        'users.view', 'users.manage', 'roles.view', 'audit.view',
        // System Settings — one perm per child
        'providers.manage', 'templates.manage', 'messages.view', 'chatbot.manage',
      ],
    },
  });
  await prisma.role.create({
    data: {
      tenantId: 't-platform', name: 'Staff', scope: 'all', isSystem: true,
      permissions: ['dashboard.view', 'ipos.view', 'ipos.manage', 'bids.view', 'clients.view', 'reports.view'],
    },
  });

  // ---- the single superadmin operator (username + password) ----
  const password = process.env.SUPERADMIN_PASSWORD || DEFAULT_PASSWORD;
  const superAdmin = await prisma.user.create({
    data: { tenantId: 't-platform', username: 'superadmin', name: 'Super Admin', passwordHash: await hashPassword(password), status: 'active' },
  });
  await prisma.membership.create({ data: { userId: superAdmin.id, tenantId: 't-platform', roleId: superRole.id, isPrimary: true } });

  console.log('Clean slate ready:');
  console.log('  tenants: investoyard-platform (operator) + investoyard (default brand)');
  console.log('  operator: username "superadmin" / name "Super Admin" (SuperAdmin, scope all)');
  console.log(`  password: ${process.env.SUPERADMIN_PASSWORD ? '(from SUPERADMIN_PASSWORD env)' : `"${DEFAULT_PASSWORD}"  ← CHANGE THIS after first login`}`);
  console.log('  IPOs: 0 — add real ones via the admin console.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
