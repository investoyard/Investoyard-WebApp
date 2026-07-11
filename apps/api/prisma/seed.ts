/**
 * Prisma seed — IPOs (+ subscription/GMP) and a launch-rail member credential.
 * Run: npm run prisma:migrate && npm run seed  (from apps/api, with Postgres up)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const cr = (n: number) => n * 1e7; // ₹ crore → rupees
const d = (s: string) => new Date(s + 'T00:00:00Z');

type Seed = {
  symbol: string; name: string; type: 'mainboard' | 'sme'; status: 'upcoming' | 'open' | 'listed';
  open?: string; close?: string; allot?: string; list?: string;
  min: number; max: number; lot: number; minAmount: number; issueCr?: number; registrar: string;
  listingGainPct?: number; gmp?: number;
  sme?: { meetsNorms: boolean; ebitdaTest: boolean; ofsPct: number; gcpPct: number };
  subs?: [string, number][];
  res?: string[]; // reserved quotas offered (shareholder / employee)
};

const IPOS: Seed[] = [
  { symbol: 'ACME', name: 'Acme Technologies Ltd', type: 'mainboard', status: 'open',
    open: '2026-07-01', close: '2026-07-08', allot: '2026-07-11', list: '2026-07-15',
    min: 100, max: 105, lot: 142, minAmount: 14910, issueCr: 500, registrar: 'Link Intime', gmp: 18,
    res: ['shareholder', 'employee'],
    subs: [['qib', 24.1], ['nii', 9.8], ['retail', 6.2], ['total', 12.4]] },
  { symbol: 'BETA', name: 'Beta Industries Ltd', type: 'sme', status: 'upcoming',
    open: '2026-07-10', close: '2026-07-12', allot: '2026-07-15', list: '2026-07-18',
    min: 55, max: 58, lot: 2000, minAmount: 116000, issueCr: 42, registrar: 'Bigshare', gmp: 6,
    sme: { meetsNorms: true, ebitdaTest: true, ofsPct: 18, gcpPct: 9 } },
  { symbol: 'ZETA', name: 'Zeta Foods Ltd', type: 'mainboard', status: 'listed',
    open: '2026-06-05', close: '2026-06-09', allot: '2026-06-11', list: '2026-06-13',
    min: 220, max: 230, lot: 65, minAmount: 14950, issueCr: 820, registrar: 'KFin Technologies',
    listingGainPct: 14.2, gmp: 31, subs: [['qib', 62], ['nii', 40], ['retail', 28], ['total', 48.7]] },
  { symbol: 'NIMBUS', name: 'Nimbus Renewables Ltd', type: 'mainboard', status: 'open',
    open: '2026-07-02', close: '2026-07-09', allot: '2026-07-12', list: '2026-07-16',
    min: 312, max: 328, lot: 45, minAmount: 14760, issueCr: 1150, registrar: 'KFin Technologies', gmp: 42,
    subs: [['qib', 5.4], ['nii', 2.2], ['retail', 1.9], ['total', 3.1]] },
  { symbol: 'VERDANT', name: 'Verdant Agritech Ltd', type: 'sme', status: 'open',
    open: '2026-06-30', close: '2026-07-07', allot: '2026-07-10', list: '2026-07-14',
    min: 90, max: 95, lot: 1200, minAmount: 114000, issueCr: 38, registrar: 'Bigshare', gmp: 22,
    sme: { meetsNorms: true, ebitdaTest: true, ofsPct: 12, gcpPct: 8 },
    subs: [['qib', 18.2], ['nii', 41.3], ['retail', 30.1], ['total', 27.6]] },
  { symbol: 'HELIOS', name: 'Helios Financial Services Ltd', type: 'mainboard', status: 'upcoming',
    open: '2026-07-14', close: '2026-07-16', allot: '2026-07-18', list: '2026-07-22',
    min: 440, max: 462, lot: 32, minAmount: 14784, issueCr: 2400, registrar: 'Link Intime', gmp: 28 },
  { symbol: 'AURELIA', name: 'Aurelia Lifesciences Ltd', type: 'mainboard', status: 'upcoming',
    open: '2026-07-17', close: '2026-07-19', allot: '2026-07-23', list: '2026-07-25',
    min: 178, max: 188, lot: 78, minAmount: 14664, issueCr: 690, registrar: 'KFin Technologies' },
  { symbol: 'ORION', name: 'Orion Logistics Ltd', type: 'mainboard', status: 'listed',
    open: '2026-05-28', close: '2026-06-01', allot: '2026-06-03', list: '2026-06-05',
    min: 145, max: 152, lot: 98, minAmount: 14896, issueCr: 560, registrar: 'Bigshare',
    listingGainPct: -4.6, subs: [['qib', 2.9], ['nii', 1.8], ['retail', 2.1], ['total', 2.3]] },
  { symbol: 'KESARI', name: 'Kesari Textiles Ltd', type: 'sme', status: 'listed',
    open: '2026-05-30', close: '2026-06-03', allot: '2026-06-05', list: '2026-06-09',
    min: 66, max: 70, lot: 1600, minAmount: 112000, issueCr: 29, registrar: 'Bigshare',
    listingGainPct: 36.4, sme: { meetsNorms: true, ebitdaTest: true, ofsPct: 0, gcpPct: 14 },
    subs: [['qib', 120], ['nii', 90], ['retail', 70], ['total', 96.2]] },
];

async function main() {
  // ---- tenant tree: platform (operator) → Investoyard Direct + demo partners ----
  await prisma.tenant.upsert({ where: { id: 't-platform' }, update: {}, create: { id: 't-platform', type: 'platform', slug: 'investoyard-platform', name: 'Investoyard (Operator)' } });
  await prisma.tenant.upsert({ where: { id: 't-direct' }, update: {}, create: { id: 't-direct', type: 'direct', slug: 'investoyard', name: 'Investoyard', parentId: 't-platform' } });
  await prisma.tenant.upsert({ where: { id: 't-axis' }, update: { brandColor: '#c1121f', flags: { gmpEnabled: true } }, create: { id: 't-axis', type: 'partner', slug: 'axis', name: 'Axis IPO', parentId: 't-platform', customDomain: 'ipo.axis.example', brandColor: '#c1121f', flags: { gmpEnabled: true } } });
  await prisma.tenant.upsert({ where: { id: 't-pbank' }, update: { brandColor: '#0b5cad', flags: { gmpEnabled: false } }, create: { id: 't-pbank', type: 'partner', slug: 'partnerbank', name: 'PartnerBank IPO', parentId: 't-platform', customDomain: 'ipo.partnerbank.example', brandColor: '#0b5cad', flags: { gmpEnabled: false } } });
  // A branch UNDER PartnerBank — used to demonstrate the settings cascade + lock.
  await prisma.tenant.upsert({ where: { id: 't-pbank-mum' }, update: {}, create: { id: 't-pbank-mum', type: 'branch', slug: 'partnerbank-mumbai', name: 'PartnerBank IPO — Mumbai', parentId: 't-pbank', brandColor: '#0b5cad' } });

  // ---- system roles (platform templates) ----
  const roles: [string, 'own' | 'subtree' | 'all', string[]][] = [
    ['SuperAdmin', 'all', ['*']],
    ['Admin', 'subtree', ['dashboard.view', 'ipos.manage', 'bids.view', 'reports.view', 'users.view', 'users.manage', 'roles.view', 'tenants.manage']],
    ['BranchUser', 'own', ['dashboard.view', 'bids.view']],
    ['Customer', 'own', ['self.apply']],
  ];
  for (const [name, scope, permissions] of roles) {
    await prisma.role.upsert({ where: { tenantId_name: { tenantId: 't-platform', name } }, update: { scope, permissions }, create: { tenantId: 't-platform', name, scope, permissions, isSystem: true } });
  }

  // ---- admin users + memberships (RBAC) — sign in via OTP with the dev stub (123456) ----
  const superRole = await prisma.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId: 't-platform', name: 'SuperAdmin' } } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId: 't-platform', name: 'Admin' } } });
  // Platform SuperAdmin (scope 'all' → manages every tenant).
  const platAdmin = await prisma.user.upsert({ where: { mobile: '9000000001' }, update: { name: 'Platform Admin', tenantId: 't-platform' }, create: { mobile: '9000000001', name: 'Platform Admin', tenantId: 't-platform' } });
  // PartnerBank Admin (scope 'subtree' → manages PartnerBank + its branches only).
  const pbAdmin = await prisma.user.upsert({ where: { mobile: '9000000002' }, update: { name: 'PartnerBank Admin', tenantId: 't-pbank' }, create: { mobile: '9000000002', name: 'PartnerBank Admin', tenantId: 't-pbank' } });
  await prisma.membership.upsert({ where: { userId_tenantId: { userId: platAdmin.id, tenantId: 't-platform' } }, update: { roleId: superRole.id }, create: { userId: platAdmin.id, tenantId: 't-platform', roleId: superRole.id } });
  await prisma.membership.upsert({ where: { userId_tenantId: { userId: pbAdmin.id, tenantId: 't-pbank' } }, update: { roleId: adminRole.id }, create: { userId: pbAdmin.id, tenantId: 't-pbank', roleId: adminRole.id } });

  // ---- feature catalog + tenant overrides (cascade down the tenant tree) ----
  const features: [string, string, 'boolean' | 'number' | 'string', any, boolean][] = [
    // key, label, valueType, platform default, isPublic
    ['gmpEnabled', 'Show grey-market premium', 'boolean', true, true],
    ['familyApply', 'Family / multi-profile apply', 'boolean', true, true],
    ['watchlistEnabled', 'Watchlist', 'boolean', true, true],
    ['maxFamilyMembers', 'Max family profiles', 'number', 8, true],
  ];
  for (const [key, label, valueType, defaultValue, isPublic] of features) {
    await prisma.featureDefinition.upsert({
      where: { key }, update: { label, valueType, defaultValue, isPublic },
      create: { key, label, valueType, defaultValue, isPublic },
    });
  }

  // Overrides: PartnerBank is a regulated white-label → GMP OFF and LOCKED, so its
  // branches (partnerbank-mumbai) inherit it and cannot turn GMP back on.
  // Axis explicitly keeps GMP on. Investoyard Direct inherits the platform default.
  const settings: [string, string, any, boolean][] = [
    // tenantId, featureKey, value, locked
    ['t-pbank', 'gmpEnabled', false, true],
    ['t-axis', 'gmpEnabled', true, false],
    ['t-pbank', 'maxFamilyMembers', 4, false],
  ];
  for (const [tenantId, featureKey, value, locked] of settings) {
    await prisma.tenantSetting.upsert({
      where: { tenantId_featureKey: { tenantId, featureKey } },
      update: { value, locked },
      create: { tenantId, featureKey, value, locked },
    });
  }

  await prisma.memberCredential.upsert({
    where: { id: 'seed-nse-axis' }, update: {},
    create: {
      id: 'seed-nse-axis', tenantId: 't-platform', exchange: 'NSE_EIPO', memberName: 'Axis Capital (seed)',
      memberType: 'merchant_banker', loginId: 'LOGIN1', memberCode: 'AXIS',
      passwordRef: 'vault:seed-password', subBrokerCode: 'SB001',
      baseUrl: 'https://uat.example/eipo', env: 'uat', active: true,
    },
  });

  for (const i of IPOS) {
    const data = {
      symbol: i.symbol, name: i.name, type: i.type, status: i.status,
      exchanges: i.type === 'sme' ? ['NSE SME', 'BSE SME'] : ['NSE', 'BSE'],
      openDate: i.open ? d(i.open) : null, closeDate: i.close ? d(i.close) : null,
      allotmentDate: i.allot ? d(i.allot) : null, listingDate: i.list ? d(i.list) : null,
      priceBandMin: i.min, priceBandMax: i.max, lotSize: i.lot, minAmount: i.minAmount,
      issueSize: i.issueCr ? cr(i.issueCr) : null, registrar: i.registrar,
      listingGainPct: i.listingGainPct ?? null, smeFlags: i.sme ?? undefined,
      reservations: i.res ?? [],
    };
    const ipo = await prisma.ipo.upsert({
      where: { symbol: i.symbol },
      update: data,
      create: { ...data, categories: { create: [{ code: 'IND', label: 'Individual / Retail' }, { code: 'QIB' }, { code: 'NII' }] } },
    });
    // refresh subscription + gmp snapshots
    await prisma.ipoSubscription.deleteMany({ where: { ipoId: ipo.id } });
    for (const [cat, x] of i.subs ?? []) {
      await prisma.ipoSubscription.create({ data: { ipoId: ipo.id, category: cat, timesSubscribed: x } });
    }
    if (i.gmp != null) {
      await prisma.ipoGmp.deleteMany({ where: { ipoId: ipo.id } });
      await prisma.ipoGmp.create({ data: { ipoId: ipo.id, value: i.gmp, trend: 'up', source: 'seed' } });
    }
  }

  console.log(`Seeded ${IPOS.length} IPOs + 1 member credential + 4 features + tenant settings.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
