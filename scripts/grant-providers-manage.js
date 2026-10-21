#!/usr/bin/env node
/**
 * Grant `providers.manage` to every partner Admin that lacks it.
 *
 *   node scripts/grant-providers-manage.js            # DRY RUN
 *   node scripts/grant-providers-manage.js --apply
 *
 * OPERATOR DECISION, 2026-10-21, taken after the trade-off was put to them.
 * `providers.manage` lives in `WHITELABEL_ADMIN_PERMS` and not in
 * `PARTNER_ADMIN_PERMS`, so on the template alone an ordinary partner should
 * not hold it. The operator asked for all six to have it regardless; this
 * script is that decision, kept separate from
 * `backfill-partner-admin-perms.js` precisely BECAUSE it departs from the
 * template — mixing the two would make a deliberate exception look like
 * routine drift the next time somebody diffs the roles.
 *
 * WHAT IT DOES AND DOES NOT BUY THEM. Reading is ungated, so the Provider Keys
 * screen loads and shows what the tenant inherits. WRITING goes through
 * `ProviderConfigService.assertConfigurable`, which admits the platform tenant
 * and tenants flagged `whitelabel` and refuses everyone else with "Only
 * white-label tenants can configure their own provider keys." That gate is a
 * SEPARATE decision and is deliberately untouched here: four of the six are
 * not white-label, so for them this grant opens the screen and not the save.
 * Relaxing the gate means deciding whether an ordinary partner — whose clients
 * receive mail under OUR brand — should send it through their own server, and
 * that is not a question a permission grant should answer by side effect.
 *
 * It does NOT reach the platform's own config: `/admin/providers` and
 * `/admin/chatbot` are slug-less and now carry `SuperadminGuard`, so holding
 * this permission stops at the holder's own tenant. Verified before and after.
 *
 * ADDITIVE and idempotent. Never removes anything; skips a role that already
 * has it and any role with scope `all`.
 */
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const PERM = 'providers.manage';

(async () => {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      where: { type: { in: ['partner', 'branch'] } },
      select: {
        slug: true, flags: true,
        roles: { select: { id: true, name: true, scope: true, permissions: true } },
      },
      orderBy: { slug: 'asc' },
    });

    const plan = [];
    for (const t of tenants) {
      const wl = !!(t.flags || {}).whitelabel;
      for (const role of t.roles) {
        if (role.name !== 'Admin') continue;
        if (role.scope === 'all') { console.log(`  !! ${t.slug} Admin has scope 'all' — SKIPPED`); continue; }
        const has = role.permissions.includes(PERM);
        const note = wl ? 'white-label — writes allowed'
                        : 'NOT white-label — screen loads, SAVES REFUSED by assertConfigurable';
        console.log(`  ${t.slug.padEnd(32)} ${has ? 'already has it' : 'GRANT'}   (${note})`);
        if (!has) plan.push({ slug: t.slug, roleId: role.id, next: [...role.permissions, PERM] });
      }
    }

    if (!plan.length) { console.log('\nNothing to do.'); return; }
    console.log(`\n${plan.length} role(s) to grant.`);
    if (!APPLY) { console.log('DRY RUN — pass --apply to write.'); return; }
    for (const p of plan) {
      await prisma.role.update({ where: { id: p.roleId }, data: { permissions: p.next } });
      console.log(`  granted ${p.slug}`);
    }
    console.log('Done — permissions resolve fresh per request, so this is live immediately.');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
