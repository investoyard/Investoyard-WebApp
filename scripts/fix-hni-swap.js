/**
 * One-off: repair IPO records whose HNI Big / Small reservation percentages are
 * transposed.
 *
 * SEBI splits the NII quota two-thirds to bids above ₹10 L (Big) and one-third
 * to ₹2–10 L (Small), so Big is always the larger of the two. Three live records
 * had them the other way round, which produced wrong "applications for 1×"
 * figures on the public site — and because the row still totals 100%, nothing
 * else flagged it.
 *
 * Only records matching a KNOWN-SAFE signature are touched:
 *   QIB 75 · Big 5 · Small 10 · Retail 10   → the textbook ICDR 6(2) shape with
 *                                             the NII rows transposed.
 * Anything else that merely looks odd is REPORTED, never rewritten — a split
 * that violates a floor may be a data-entry error somewhere else entirely, and
 * guessing at the operator's intent is how you turn one wrong number into two.
 *
 *   node scripts/fix-hni-swap.js          # dry run — prints the plan, writes nothing
 *   node scripts/fix-hni-swap.js --apply  # performs the update
 */
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

const pct = (row) => {
  const v = Number(String(row?.pct ?? '').replace(/[^\d.]/g, ''));
  return row?.on && Number.isFinite(v) ? v : 0;
};

(async () => {
  const ipos = await prisma.ipo.findMany({ select: { id: true, symbol: true, name: true, extra: true } });
  const fix = [];
  const review = [];

  for (const ipo of ipos) {
    const sr = ipo.extra?.shareResv;
    if (!sr) continue;
    const big = pct(sr.hni);
    const small = pct(sr.hni2);
    if (!(big > 0 && small > 0 && small > big)) continue;

    const qib = pct(sr.qib);
    const retail = pct(sr.retail);
    // the one shape we can reverse with certainty
    const safe = qib === 75 && big === 5 && small === 10 && retail === 10;
    (safe ? fix : review).push({ ipo, qib, big, small, retail });
  }

  console.log(`scanned ${ipos.length} IPOs\n`);

  if (fix.length) {
    console.log('WILL SWAP (Big <-> Small):');
    for (const f of fix) {
      console.log(`  ${f.ipo.symbol.padEnd(12)} QIB ${f.qib}  Big ${f.big} -> ${f.small}   Small ${f.small} -> ${f.big}   Retail ${f.retail}`);
    }
  } else {
    console.log('WILL SWAP: nothing');
  }

  if (review.length) {
    console.log('\nFLAGGED FOR MANUAL REVIEW (not touched — the split is wrong in a way this script cannot safely infer):');
    for (const r of review) {
      const nii = r.big + r.small;
      console.log(`  ${r.ipo.symbol.padEnd(12)} QIB ${r.qib}  Big ${r.big}  Small ${r.small}  Retail ${r.retail}   (NII ${nii}%, retail ${r.retail}%)`);
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to perform the swap.');
    await prisma.$disconnect();
    return;
  }

  for (const f of fix) {
    const extra = f.ipo.extra;
    const sr = extra.shareResv;
    const bigRow = { ...sr.hni };
    const smallRow = { ...sr.hni2 };
    // swap the WHOLE row: count, remark and req1x were all derived from the
    // wrong percentage too, so leaving them behind would just move the error
    sr.hni = smallRow;
    sr.hni2 = bigRow;
    await prisma.ipo.update({ where: { id: f.ipo.id }, data: { extra } });
    console.log(`  swapped ${f.ipo.symbol}`);
  }
  console.log(`\napplied to ${fix.length} record(s).`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
