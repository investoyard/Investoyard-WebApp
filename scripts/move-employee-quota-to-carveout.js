#!/usr/bin/env node
/**
 * AUGMONT and NSE — move the employee quota out of `extra.shareResv` and into
 * `extra.carveouts`, which is the only place anything reads it. Both raise
 * **E-RESV** until this runs.
 *
 * WHY IT MATTERS, beyond clearing a warning. A carve-out comes OFF THE TOP and
 * every category percentage below is a percentage of what is LEFT. With the
 * quota sitting in the reservation table instead, the split divided the GROSS
 * offer — so QIB, NII and Retail each carried a share of the employees' shares.
 * On NSE that is 43,33,437 shares spread across the other four categories.
 *
 * THE SIBLING COUNTS ARE OURS, WHICH IS WHAT LICENSES RESTAMPING THEM. Every
 * one reproduces `floor(pct x gross / price)` exactly — 8 of 8 on NSE, 10 of 10
 * on AUGMONT, including the floor-to-lot. That is not coincidence; they are
 * pre-2026-09-24 derivations, not exchange figures. They are stamped `derived`
 * here so `refill-derived-reservation.js` may re-derive them against the NET
 * offer afterwards. Run that second.
 *
 * THE TWO QUOTAS ARE NOT THE SAME KIND OF FIGURE:
 *   • NSE stores a COUNT — 43,33,437, identical at both bands and matching no
 *     derivation — so it is stated, and goes in on the `shares` basis.
 *   • AUGMONT stores only a PERCENTAGE, 0.691%. Against its 4,00,00,000-share
 *     offer that is exactly 276,400, and 276400/40000000 is 0.691% to the
 *     digit — so 276,400 is the figure the operator computed it from. It goes
 *     in as that count. **Reconstructed, not read from AUGMONT's RHP — worth
 *     the operator confirming.**
 *
 * AUGMONT also has NO `extra.issueSizeCr`, only the ₹3,152 Cr column, so
 * nothing derives from it at all until the two agree. Set here to match.
 *
 *   node scripts/move-employee-quota-to-carveout.js            # dry run
 *   node scripts/move-employee-quota-to-carveout.js --apply
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const PLAN = {
  NSE: {
    // A stated count: identical at both bands, matches no derivation.
    shares: 43_33_437,
    expectUpper: '4333437',
  },
  AUGMONT: {
    // 0.691% of a 4,00,00,000-share offer. Reconstructed — see the header.
    shares: 2_76_400,
    expectPct: '0.691',
    // The column says ₹3,152 Cr and `extra` says nothing; make them agree.
    issueSizeCr: '3152.00',
  },
};

const fmt = (n) => Number(n).toLocaleString('en-IN');

(async () => {
  for (const [symbol, plan] of Object.entries(PLAN)) {
    const ipo = await prisma.ipo.findUnique({
      where: { symbol },
      select: { id: true, symbol: true, extra: true },
    });
    if (!ipo) { console.error(`${symbol}: not found`); process.exitCode = 1; continue; }
    const extra = ipo.extra || {};
    const resv = extra.shareResv || {};
    const emp = resv.employee || {};

    // Guards — the row must still be the one diagnosed, and the carve-out empty.
    const carve = String((extra.carveouts || {}).employee ?? '');
    if (carve !== '') { console.error(`${symbol}: employee carve-out already holds "${carve}" — skipped`); continue; }
    if (plan.expectUpper && String(emp.sharesUpper) !== plan.expectUpper) {
      console.error(`${symbol}: sharesUpper is ${emp.sharesUpper}, expected ${plan.expectUpper} — skipped`); continue;
    }
    if (plan.expectPct && String(emp.pct) !== plan.expectPct) {
      console.error(`${symbol}: pct is ${emp.pct}, expected ${plan.expectPct} — skipped`); continue;
    }

    /* The employee ROW is emptied, not deleted: `RESV_ROWS` still renders it,
       read-only and labelled "from carve-out", and a missing key would read as
       a record that never had the quota at all. */
    const nextResv = { ...resv, employee: { on: false, pct: '' } };
    /* Stamp the siblings `derived` so the refill may touch them. Only rows that
       reproduce the derivation are stamped — a row that does not is not
       evidence of anything and must stay unattributed. */
    const stamped = [];
    for (const k of ['qib', 'hni', 'hni2', 'retail']) {
      const row = nextResv[k];
      if (!row || row.source) continue;
      if (!(Number(row.pct) > 0) || !(Number(row.sharesUpper) > 0)) continue;
      nextResv[k] = { ...row, source: 'derived' };
      stamped.push(k);
    }

    const patch = {
      shareResv: nextResv,
      carveouts: { ...(extra.carveouts || {}), employee: String(plan.shares) },
      carveoutBasis: { ...(extra.carveoutBasis || {}), employee: 'shares' },
    };
    if (plan.issueSizeCr && !extra.issueSizeCr) patch.issueSizeCr = plan.issueSizeCr;

    console.log(`${symbol}`);
    console.log(`   employee quota  shareResv(${emp.pct || '—'}% / ${fmt(emp.sharesUpper || 0)} sh)  ->  carve-out ${fmt(plan.shares)} shares`);
    if (patch.issueSizeCr) console.log(`   issueSizeCr     (none) -> ${patch.issueSizeCr}   [the column already said this]`);
    console.log(`   stamped derived: ${stamped.join(', ') || '(none — already attributed)'}`);

    if (APPLY) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Ipo" SET extra = COALESCE(extra,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
        JSON.stringify(patch), ipo.id,
      );
      console.log('   written (jsonb merge)');
    }
  }
  console.log(APPLY
    ? '\nNow run: node scripts/refill-derived-reservation.js --only NSE --apply  (and --only AUGMONT)'
    : '\nDry run. Re-run with --apply to write.');
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
