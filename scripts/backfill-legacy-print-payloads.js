// Snapshot the LEGACY partner prints onto `Application.partnerPayload`.
//
// 103 prints predate the payload column, so the Print report reads their
// applicant details from the shared InvestorProfile instead. That makes those
// profiles load-bearing: delete them and the rows survive but go blank.
//
// This reconstructs the same payload shape from the profile + the application
// itself, so every print becomes self-contained and the profiles can go. It is
// PURELY ADDITIVE — it only fills rows where `partnerPayload IS NULL`, and it
// never touches a row that already has one.
//
//   node scripts/backfill-legacy-print-payloads.js           report only
//   node scripts/backfill-legacy-print-payloads.js --apply    write
//
// Run it from apps/api/dist so the vault inherits the production key chain:
//   cd apps/api/dist && node ../../../scripts/backfill-legacy-print-payloads.js

const { PrismaClient } = require('D:/Investoyard/node_modules/@prisma/client');
const { PiiVaultService } = require('D:/Investoyard/apps/api/dist/common/pii-vault.service.js');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
const DRY = !process.argv.includes('--apply');

(async () => {
  console.log(`Mode: ${DRY ? 'REPORT ONLY (no writes)' : 'APPLY (writes)'}\n`);
  const vault = new PiiVaultService();

  /*
   * Selected in RAW SQL on purpose. Prisma treats a Json field's `null` as
   * JSON-null, not SQL NULL, so `{ partnerPayload: { equals: null } }` matched
   * ZERO of the 103 rows and the first dry run reported nothing to do.
   */
  const ids = await prisma.$queryRawUnsafe(
    `SELECT id FROM "Application" WHERE "partnerPayload" IS NULL AND "asbaFormNo" IS NOT NULL`,
  );
  const rows = await prisma.application.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: { profile: true },
  });
  console.log(`legacy prints with no payload: ${rows.length}`);

  let ok = 0;
  const failed = [];
  for (const a of rows) {
    const p = a.profile;
    let pan = null;
    let bank = null;
    try { pan = await vault.resolve(p.panTokenRef); } catch { /* key gone for this one */ }
    if (p.bankTokenRef) { try { bank = await vault.resolve(p.bankTokenRef); } catch { /* optional */ } }
    if (!pan) { failed.push({ id: a.id, name: p.fullName, why: 'PAN unreadable' }); continue; }

    // Same shape the partner API records, rebuilt from what we hold.
    const payload = {
      pan,
      fullName: p.fullName,
      dpId: p.dpId,
      clientId: p.clientId,
      depository: p.depository,
      category: a.category,
      lots: a.lots,
      shareQty: a.shareQty,
      sharePrice: a.bidPrice != null ? Number(a.bidPrice) : undefined,
      amount: a.amount != null ? Number(a.amount) : undefined,
      bankAccount: bank ?? undefined,
      bankName: p.bankName ?? undefined,
      branchName: p.branchName ?? undefined,
      address: p.address ?? undefined,
      city: p.city ?? undefined,
      state: p.state ?? undefined,
      pincode: p.pincode ?? undefined,
      email: p.email ?? undefined,
      mobile: p.mobile ?? undefined,
      familyGroup: a.familyGroup ?? '',
      // Marks the row as reconstructed rather than received — a payload the
      // partner actually sent is evidence; this one is our best rebuild of it.
      _reconstructed: { at: new Date().toISOString(), from: 'InvestorProfile', profileId: p.id },
    };
    if (!DRY) await prisma.application.update({ where: { id: a.id }, data: { partnerPayload: payload } });
    ok++;
  }

  console.log(`  reconstructed : ${ok}`);
  console.log(`  could not     : ${failed.length}`);
  failed.forEach((f) => console.log(`     ${f.id}  "${f.name}"  ${f.why}`));

  if (DRY) { console.log('\nREPORT ONLY — re-run with --apply to write.'); return; }

  const left = (await prisma.$queryRawUnsafe(`SELECT count(*)::int n FROM "Application" WHERE "partnerPayload" IS NULL AND "asbaFormNo" IS NOT NULL`))[0].n;
  console.log(`\nlegacy prints still without a payload: ${left}`);
})().catch((e) => { console.error('ERROR:', e?.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
