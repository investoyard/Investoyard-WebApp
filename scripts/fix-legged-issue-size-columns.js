#!/usr/bin/env node
/**
 * The five records still carrying the LEGGED-ISSUE desync: `Ipo.issueSize` (the
 * column) disagrees with `extra.issueSizeCr`, and `extra` is the one that is
 * right.
 *
 * THE BUG, which was fixed at source on 2026-09-25 — these are its leftovers.
 * When both legs are entered, *Total issue size (₹ Cr)* goes read-only and
 * renders the leg sum, so `form.issueSizeCr` kept whatever had been typed
 * before that, usually the Fresh leg alone. `payload()` then sent the stale
 * field as the COLUMN while `extra.issueSizeCr` took the leg sum.
 *
 * **DEEPA is the textbook case**: its column holds ₹250 Cr, which is exactly
 * its Fresh leg, against a ₹460 Cr offer (Fresh 250 + OFS 210).
 *
 * WHY `extra` WINS, established rather than assumed: on all five, the leg sum
 * reproduces `extra.issueSizeCr` to the paisa. The column matches nothing.
 *
 *   MPIMANIPAL  col ₹0.40    legs 320 + 485 = 805
 *   MANIKA      col ₹92.70   legs  92 +  33 = 125
 *   PRANAV      col ₹2.00    legs 316 +  35 = 351
 *   DEEPA       col ₹250.00  legs 250 + 210 = 460
 *   MOMSBELIEF  col ₹1.00    leg  125       = 125
 *
 * All five closed between 3 and 16 September, so nothing publishes live.
 *
 * Only the COLUMN is written — `extra` is already correct and is not touched,
 * so there is no jsonb merge to do here. Re-derive the reservation counts
 * afterwards with `refill-derived-reservation.js`; they were derived against
 * the broken column.
 *
 *   node scripts/fix-legged-issue-size-columns.js            # dry run
 *   node scripts/fix-legged-issue-size-columns.js --apply
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const SYMBOLS = ['MPIMANIPAL', 'MANIKA', 'PRANAV', 'DEEPA', 'MOMSBELIEF'];

const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/** A leg in ₹ Cr at a price. A `shares` leg is valued at that price. */
const legCr = (leg, price) => {
  if (!leg || !leg.basis || leg.basis === 'none') return 0;
  const v = num(leg.value);
  return v <= 0 ? 0 : (leg.basis === 'shares' ? (v * price) / 1e7 : v);
};

(async () => {
  let changed = 0;
  for (const symbol of SYMBOLS) {
    const ipo = await prisma.ipo.findUnique({
      where: { symbol },
      select: { id: true, symbol: true, issueSize: true, priceBandMin: true, priceBandMax: true, extra: true },
    });
    if (!ipo) { console.error(`${symbol}: not found`); process.exitCode = 1; continue; }
    const extra = ipo.extra || {};
    const cap = Number(ipo.priceBandMax) || Number(ipo.priceBandMin) || 0;
    const target = num(extra.issueSizeCr);
    const legs = legCr(extra.fresh, cap) + legCr(extra.ofs, cap);
    const colCr = Number(ipo.issueSize) / 1e7;

    // GUARDS. `extra` only wins because the legs corroborate it; without that
    // there is no reason to prefer either figure, so refuse rather than guess.
    if (!(target > 0)) { console.error(`${symbol}: extra.issueSizeCr is empty — skipped`); continue; }
    if (Math.abs(legs - target) > 0.02) {
      console.error(`${symbol}: legs sum to ₹${legs.toFixed(2)} Cr but extra says ₹${target} — NOT corroborated, skipped`);
      continue;
    }
    if (Math.abs(colCr - target) < 0.005) { console.log(`${symbol}: already ₹${target} Cr — nothing to do`); continue; }

    const rupees = Math.round(target * 1e7);
    changed++;
    console.log(`${symbol.padEnd(12)} column ₹${colCr.toFixed(2)} Cr -> ₹${target} Cr   (legs ${legs.toFixed(2)} corroborate)`);
    if (APPLY) {
      await prisma.ipo.update({ where: { id: ipo.id }, data: { issueSize: rupees } });
      console.log('             written');
    }
  }
  console.log(`\n${changed} column(s) ${APPLY ? 'updated' : 'would change'}.${APPLY
    ? '\nNow re-derive: node scripts/refill-derived-reservation.js --only <SYM> --apply'
    : '  Re-run with --apply to write.'}`);
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
