#!/usr/bin/env node
/**
 * Bring each partner's `Admin` role back up to ITS OWN template.
 *
 *   node scripts/backfill-partner-admin-perms.js            # DRY RUN
 *   node scripts/backfill-partner-admin-perms.js --apply
 *
 * WHY THIS KEEPS BEING NEEDED. `registerTenant` stamps a role's permissions
 * ONCE, at creation, from `PARTNER_ADMIN_PERMS` / `WHITELABEL_ADMIN_PERMS` /
 * `BRANCH_ADMIN_PERMS`. Nothing re-applies them, so every later addition to one
 * of those lists leaves every EXISTING role behind — the same shape as
 * `tenant.site.manage` on 2026-10-16, where the list gained a permission and
 * the roles already created did not.
 *
 * THE TEMPLATE IS CHOSEN BY THE TENANT'S OWN `flags.whitelabel`, NOT BY WHAT
 * THE ROLE ALREADY HOLDS, and that distinction is the whole point.
 * `providers.manage`, `templates.manage`, `messages.view` and `chatbot.manage`
 * are WHITE-LABEL permissions: a white-label partner publishes under their own
 * brand and configures their own SMTP / SMS / WhatsApp, which is exactly what
 * `ProviderConfigService.assertConfigurable` allows and what it refuses to an
 * ordinary partner ("Only white-label tenants can configure their own provider
 * keys"). So granting them to an ordinary partner does not widen their reach —
 * it hands them a screen on which every save fails. Measured 2026-10-21:
 * 2 of the 6 partners are white-label (acml, finwave) and 4 are not.
 *
 * ADDITIVE ONLY. It never removes a permission. An EXTRA one is reported and
 * left alone, because a role may have been deliberately widened by hand and a
 * script is the wrong place to overrule that — the same reasoning that stops
 * `refill-derived-reservation.js` touching an `operator` row.
 *
 * SuperAdmin-scoped roles (`scope: 'all'`) are never touched: a partner tenant
 * should not own one, and if it does that is a finding for a human rather than
 * something to normalise away.
 */
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');

/* Mirrors of the lists in admin.service.ts. They are duplicated here rather
   than imported because that file pulls in the whole Nest graph; the test
   below is that this script reports ZERO missing right after a fresh
   registerTenant, so a drift between the two shows up immediately. */
const PARTNER_ADMIN_PERMS = [
  'dashboard.view', 'ipos.view',
  'bids.view', 'bids.manage', 'bidding.report.view',
  'clients.view', 'clients.manage', 'reports.view',
  'users.view', 'users.manage', 'roles.view', 'audit.view',
  'partner-api.keys.manage', 'partner-api.calls.view', 'partner-api.prints.view',
];
const WHITELABEL_ADMIN_PERMS = [
  ...PARTNER_ADMIN_PERMS,
  'providers.manage', 'templates.manage', 'messages.view', 'chatbot.manage',
  'tenant.site.manage',
];

(async () => {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      where: { type: { in: ['partner', 'branch'] } },
      select: {
        slug: true, name: true, type: true, flags: true,
        roles: { select: { id: true, name: true, scope: true, permissions: true } },
      },
      orderBy: { slug: 'asc' },
    });

    const plan = [];
    for (const t of tenants) {
      const whitelabel = !!(t.flags || {}).whitelabel;
      const want = whitelabel ? WHITELABEL_ADMIN_PERMS : PARTNER_ADMIN_PERMS;
      for (const role of t.roles) {
        if (role.name !== 'Admin') continue;
        if (role.scope === 'all') {
          console.log(`  !! ${t.slug} / ${role.name} has scope 'all' — SKIPPED, that is a finding for a human`);
          continue;
        }
        const missing = want.filter((p) => !role.permissions.includes(p));
        const extra = role.permissions.filter((p) => !want.includes(p));
        const tag = whitelabel ? '[white-label]' : '[partner]    ';
        if (!missing.length && !extra.length) {
          console.log(`  ${tag} ${t.slug.padEnd(30)} matches its template`);
          continue;
        }
        console.log(`  ${tag} ${t.slug.padEnd(30)} have=${String(role.permissions.length).padStart(2)}`);
        if (missing.length) console.log(`        + ${missing.join(', ')}`);
        if (extra.length) console.log(`        ? extra (left alone): ${extra.join(', ')}`);
        if (missing.length) plan.push({ slug: t.slug, roleId: role.id, next: [...role.permissions, ...missing], missing });
      }
    }

    if (!plan.length) { console.log('\nNothing to do — every partner Admin matches its template.'); return; }
    console.log(`\n${plan.length} role(s) to widen, ${plan.reduce((a, b) => a + b.missing.length, 0)} permission(s) in total.`);
    if (!APPLY) { console.log('DRY RUN — pass --apply to write.'); return; }

    for (const p of plan) {
      await prisma.role.update({ where: { id: p.roleId }, data: { permissions: p.next } });
      console.log(`  wrote ${p.slug}: +${p.missing.length}`);
    }
    console.log('Done. Permissions resolve fresh on every request, so this takes effect immediately — no pool restart.');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
