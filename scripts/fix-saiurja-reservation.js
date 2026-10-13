#!/usr/bin/env node
/**
 * SAIURJA — there was never a 24,000-share gap. The TOTAL and the MARKET MAKER
 * were both right all along; the stored PERCENTAGES were wrong.
 *
 * THE EARLIER DIAGNOSIS HAD IT BACKWARDS. It assumed the split really was
 * 50 / 10 / 5 / 35, back-solved the net offer those percentages would need
 * (20,16,000) from the RHP's bHNI and sHNI counts, and concluded the record's
 * 19,92,000 was 24,000 short. The issuer simply did not use round numbers.
 *
 * The published table reconciles to the share, and three independent sources
 * agree on it:
 *
 *   total                    22,08,000   <- matches the record
 *   market maker              2,16,000   <- matches the record
 *   net offer                19,92,000
 *     QIB      9,79,200 = anchor 5,86,800 + ex-anchor 3,92,400   49.1566%
 *     bHNI     2,01,600  (2/3 of NII 3,02,400)                   10.1205%
 *     sHNI     1,00,800  (1/3)                                    5.0602%
 *     Retail   7,10,400                                          35.6627%
 *                        ------------------------------------------------
 *     sum      19,92,000 == the net offer EXACTLY                100.0000%
 *
 * A third source states the same figures as percentages of the TOTAL — 9.78%
 * market maker, 26.58% anchor, 17.77% QIB ex-anchor, 13.7% NII, 32.17% retail —
 * and all five land within a hundred shares of the counts above.
 *
 * Percentages are stored to 4 dp so they sum to exactly 100.0000: B01 tolerates
 * only 0.001, and the 2 dp figures add to 100.01 and would be REJECTED. The
 * pages round them on the way out via `pctStr()`.
 *
 * `anchorShares` 5,86,800 replaces an `anchorPct` ESTIMATE of 59, so the page
 * moves from "the anchor is ESTIMATED" to the actual allotment. It is 59.93% of
 * QIB, inside B09's 60% cap.
 *
 * The offer is share-quoted (both legs in shares), so every count is identical
 * at both bands and `sharesLower` equals `sharesUpper`.
 *
 *   node scripts/fix-saiurja-reservation.js            # dry run
 *   node scripts/fix-saiurja-reservation.js --apply
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const TOTAL = 22_08_000;
const MARKET_MAKER = 2_16_000;
const NET = TOTAL - MARKET_MAKER; // 19,92,000
const ANCHOR = 5_86_800;

const ROWS = {
  qib: { shares: 9_79_200, pct: '49.1566' },
  hni: { shares: 2_01_600, pct: '10.1205' }, // bHNI, 2/3 of NII
  hni2: { shares: 1_00_800, pct: '5.0602' }, // sHNI, 1/3
  retail: { shares: 7_10_400, pct: '35.6627' },
};

const fmt = (n) => Number(n).toLocaleString('en-IN');

(async () => {
  // Reconcile before touching anything.
  const sumShares = Object.values(ROWS).reduce((a, r) => a + r.shares, 0);
  const sumPct = Object.values(ROWS).reduce((a, r) => a + Number(r.pct), 0);
  const checks = [
    [`rows sum to the net offer ${fmt(NET)}`, sumShares === NET],
    ['percentages sum to 100.0000', Math.abs(sumPct - 100) < 1e-9],
    [`anchor ${fmt(ANCHOR)} is inside 60% of QIB`, ANCHOR / ROWS.qib.shares <= 0.6],
    ['bHNI is twice sHNI', ROWS.hni.shares === 2 * ROWS.hni2.shares],
  ];
  checks.forEach(([l, ok]) => console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${l}`));
  if (checks.some(([, ok]) => !ok)) { console.error('\nDoes not reconcile — nothing written.'); process.exitCode = 1; return; }

  const ipo = await prisma.ipo.findUnique({
    where: { symbol: 'SAIURJA' },
    select: { id: true, extra: true },
  });
  if (!ipo) { console.error('SAIURJA not found'); process.exitCode = 1; return; }
  const extra = ipo.extra || {};
  const resv = extra.shareResv || {};

  // Guards: the record must still be the one diagnosed.
  if (String(extra.totalShares) !== String(TOTAL)) {
    console.error(`totalShares is ${extra.totalShares}, expected ${TOTAL} — nothing written`); process.exitCode = 1; return;
  }
  if (String((extra.carveouts || {}).marketmaker) !== String(MARKET_MAKER)) {
    console.error(`market maker is ${(extra.carveouts || {}).marketmaker}, expected ${MARKET_MAKER} — nothing written`); process.exitCode = 1; return;
  }

  const next = { ...resv };
  for (const [key, r] of Object.entries(ROWS)) {
    next[key] = {
      ...(next[key] || {}),
      pct: r.pct,
      // Share-quoted offer: the count does not move with the price.
      sharesUpper: String(r.shares),
      sharesLower: String(r.shares),
      // The published table outranks any derivation, so these are never refilled.
      source: 'operator',
    };
  }

  console.log(`\nnet offer ${fmt(NET)} = total ${fmt(TOTAL)} less market maker ${fmt(MARKET_MAKER)}  (both already correct)`);
  for (const [key, r] of Object.entries(ROWS)) {
    const old = resv[key] || {};
    console.log(`  ${key.padEnd(7)} ${String(old.pct ?? '—').padStart(8)}% ${String(old.sharesUpper ?? '—').padStart(9)}  ->  ${r.pct}% ${fmt(r.shares).padStart(9)} [operator]`);
  }
  console.log(`  anchor  ${String(extra.anchorPct ?? '—')}% (ESTIMATE) -> ${fmt(ANCHOR)} shares [actual, ${(ANCHOR / ROWS.qib.shares * 100).toFixed(2)}% of QIB]`);

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return; }
  await prisma.$executeRawUnsafe(
    `UPDATE "Ipo" SET extra = COALESCE(extra,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
    JSON.stringify({ shareResv: next, anchorShares: String(ANCHOR) }), ipo.id,
  );
  console.log('\nWritten (jsonb merge).');
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
