#!/usr/bin/env node
/**
 * Re-map an already-approved self-onboarding tenant's profile onto the
 * EMPANELMENT key names, so the tenant page actually shows what the partner
 * told us at onboarding.
 *
 *   node scripts/remap-onboarding-profiles.js            # dry run
 *   node scripts/remap-onboarding-profiles.js --apply
 *   node scripts/remap-onboarding-profiles.js --only finwave
 *
 * WHY THIS IS NEEDED. Approval wrote the apply form's OWN key names
 * (entityType, city, state, sebiRegNo) while the tenant page renders a profile
 * by walking the empanelment schema and reading profile[field.key]. Nothing
 * bridged the two vocabularies, so those values were stored and never
 * displayed — and PAN and the contact person were not carried across at all.
 * The approval path is fixed; this repairs the tenants approved before it.
 *
 * NON-DESTRUCTIVE. Existing keys are never removed and an empanelment key that
 * already holds a value is never overwritten — an operator may have filled the
 * empanelment form by hand since approval, and that is the better data. Only
 * blanks are filled, from the application the tenant was created from.
 *
 * THE PAN WRITTEN HERE IS THE MASKED FORM. The full value stays in the vault
 * behind panTokenRef; a clear PAN must not sit in an unencrypted JSON column.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', 'apps', 'api', 'dist'));
const { PrismaClient } = require('@prisma/client');

const APPLICANT_TYPE = {
  'Individual': 'Individual',
  'Proprietorship': 'Sole Proprietor',
  'Partnership': 'Partnership',
  'LLP': 'LLP',
  'Private Limited': 'Company',
  'Public Limited': 'Company',
};

const APPLY = process.argv.includes('--apply');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > -1 ? process.argv[i + 1] : null; })();

(async () => {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      where: { ...(ONLY ? { slug: ONLY } : {}) },
      select: { id: true, slug: true, name: true, profile: true },
    });

    let touched = 0, skipped = 0;
    for (const t of tenants) {
      const p = (t.profile || {});
      if (p.source !== 'self-onboarding') { skipped++; continue; }
      if (!p.applicationId) { console.log(`  ${t.slug}: self-onboarding but no applicationId — skipped`); skipped++; continue; }

      const app = await prisma.partnerApplication.findUnique({ where: { id: p.applicationId } });
      if (!app) { console.log(`  ${t.slug}: application ${p.applicationId} not found — skipped`); skipped++; continue; }

      /* Fill blanks only. A value an operator typed into the empanelment form
         after approval is better than the original application. */
      const want = {
        applicantType: (app.entityType && APPLICANT_TYPE[app.entityType]) || (app.entityType ? 'Other' : undefined),
        entityName: app.legalName || undefined,
        pan: app.panMasked || undefined,
        gstin: app.gstin || undefined,
        corrCity: app.city || undefined,
        corrState: app.state || undefined,
        sebiRegistration: app.sebiRegNo || undefined,
        arn: app.arn || undefined,
        contactPerson: app.contactName || undefined,
        contactMobile: app.mobile || undefined,
        contactEmail: app.email || undefined,
      };

      const add = {};
      for (const [k, v] of Object.entries(want)) {
        if (v === undefined) continue;
        /* A contact name with no letter in it is the known-bad shape — an
           applicant typing their mobile into the contact box. Copying it into
           the profile would spread a value we are already repairing, so it is
           reported and skipped rather than propagated. */
        if (k === 'contactPerson' && !/[A-Za-z]/.test(String(v))) {
          console.log(`  ${t.slug}: contactPerson ${JSON.stringify(v)} has no letters — skipped, fix the name first`);
          continue;
        }
        const cur = p[k];
        if (cur === undefined || cur === null || cur === '') add[k] = v;
      }
      if (!Object.keys(add).length) { console.log(`  ${t.slug}: already complete — nothing to do`); skipped++; continue; }

      console.log(`\n  ${t.slug} (${t.name})`);
      for (const [k, v] of Object.entries(add)) console.log(`      + ${k.padEnd(18)} ${JSON.stringify(v)}`);

      if (APPLY) {
        const next = {
          ...p, ...add,
          application: p.application ?? {
            entityType: app.entityType, legalName: app.legalName, contactName: app.contactName,
            city: app.city, state: app.state, sebiRegNo: app.sebiRegNo, arn: app.arn,
            gstin: app.gstin, panMasked: app.panMasked, panTokenRef: app.panTokenRef,
            email: app.email, mobile: app.mobile, notes: app.notes,
          },
        };
        await prisma.tenant.update({ where: { id: t.id }, data: { profile: next } });
        /* Re-read: a script reporting success has only proved it issued the write. */
        const back = await prisma.tenant.findUnique({ where: { id: t.id }, select: { profile: true } });
        const bad = Object.keys(add).filter((k) => (back.profile || {})[k] !== add[k]);
        console.log(bad.length ? `      !! did not persist: ${bad.join(', ')}` : '      written and verified');
      }
      touched++;
    }

    console.log(`\n${APPLY ? 'updated' : 'would update'} ${touched} tenant(s); ${skipped} skipped.`);
    if (!APPLY && touched) console.log('re-run with --apply to write.');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
