#!/usr/bin/env node
/**
 * Correct a partner's contact name in ALL THREE places it lives.
 *
 *   node scripts/fix-partner-contact-name.js --slug finwave --name "Ami Patel"
 *   node scripts/fix-partner-contact-name.js --slug finwave --name "Ami Patel" --apply
 *
 * Dry run by default.
 *
 * WHY THREE PLACES, and why a script rather than a screen. The contact name
 * entered on the apply form becomes a LOGIN IDENTITY at approval, and there is
 * no admin screen anywhere that can edit it afterwards. It lands in:
 *
 *   1. User.name                       — what the dashboard and profile menu show
 *   2. PartnerApplication.contactName  — the submitted record
 *   3. Tenant.profile.contactPerson    — the empanelment profile
 *
 * Fixing only the first leaves the other two disagreeing with the screen, and
 * any future re-map would put the stale value back. One real application
 * arrived with a mobile number in that box, which is what this exists for; the
 * apply form now rejects a digits-only name and the approver can override it,
 * so this is for records approved before those guards.
 *
 * THE APPLICATION RECORD IS CORRECTED, NOT PRESERVED AS SUBMITTED. That is a
 * deliberate call: it is a working record that feeds re-maps and reports, not
 * an audit log, and leaving a known-wrong identity in it guarantees the fault
 * comes back. The original value is printed before the write.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const SLUG = arg('--slug');
const NAME = (arg('--name') || '').trim();
const APPLY = process.argv.includes('--apply');

if (!SLUG || !NAME) {
  console.error('usage: --slug <tenant-slug> --name "Full Name" [--apply]');
  process.exit(1);
}
/* The same rule the apply form now enforces — refuse to write back the shape
   we are repairing. */
if (!/[A-Za-z]/.test(NAME)) {
  console.error('refusing: a contact name must contain at least one letter.');
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: SLUG },
      select: { id: true, slug: true, name: true, profile: true },
    });
    if (!tenant) throw new Error(`no tenant with slug '${SLUG}'`);

    const profile = tenant.profile || {};
    const appId = profile.applicationId || null;
    const app = appId ? await prisma.partnerApplication.findUnique({ where: { id: appId } }) : null;

    /* The tenant's own admin user — the one registerTenant created. Matching on
       the username it mints avoids touching an unrelated user in the tenant. */
    const users = await prisma.user.findMany({
      where: { tenantId: tenant.id, username: { not: null } },
      select: { id: true, username: true, name: true },
    });
    const admin = users.find((u) => u.username === `${SLUG}-admin`) || (users.length === 1 ? users[0] : null);
    if (!admin) throw new Error(`could not identify the admin user for '${SLUG}' (candidates: ${users.map((u) => u.username).join(', ') || 'none'})`);

    console.log(`tenant   ${tenant.slug} (${tenant.name})`);
    console.log(`  1. User.name                      ${JSON.stringify(admin.name)}  ->  ${JSON.stringify(NAME)}   [${admin.username}]`);
    console.log(`  2. PartnerApplication.contactName ${app ? JSON.stringify(app.contactName) : '(no linked application)'}  ->  ${app ? JSON.stringify(NAME) : '—'}`);
    console.log(`  3. Tenant.profile.contactPerson   ${JSON.stringify(profile.contactPerson ?? null)}  ->  ${JSON.stringify(NAME)}`);

    if (!APPLY) { console.log('\ndry run — re-run with --apply to write.'); return; }

    await prisma.$transaction([
      prisma.user.update({ where: { id: admin.id }, data: { name: NAME } }),
      ...(app ? [prisma.partnerApplication.update({ where: { id: app.id }, data: { contactName: NAME } })] : []),
      prisma.tenant.update({ where: { id: tenant.id }, data: { profile: { ...profile, contactPerson: NAME } } }),
    ]);

    /* Re-read: a script reporting success has only proved it issued the write. */
    const [u2, a2, t2] = await Promise.all([
      prisma.user.findUnique({ where: { id: admin.id }, select: { name: true } }),
      app ? prisma.partnerApplication.findUnique({ where: { id: app.id }, select: { contactName: true } }) : Promise.resolve(null),
      prisma.tenant.findUnique({ where: { id: tenant.id }, select: { profile: true } }),
    ]);
    const ok = u2.name === NAME && (!a2 || a2.contactName === NAME) && (t2.profile || {}).contactPerson === NAME;
    console.log(ok ? '\nwritten and verified in all three places.' : '\n!! VERIFY FAILED — re-read does not match, investigate before retrying.');
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
