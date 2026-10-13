#!/usr/bin/env node
/**
 * SPECTRAA — repair the offer size and everything derived from it.
 *
 * The record published ₹1.00 Cr against a real ₹42.52 Cr offer. It was NOT the
 * legged-issue desync: `fresh` was ₹0 and `ofs` ₹1 Cr, so the legs AGREED with
 * the broken column and a leg-sum fix would have changed nothing. Every derived
 * figure then traced back to that ₹1 Cr — including the reservation
 * percentages, which the form back-derives from a stored count and which had
 * reached **QIB 936.84% · bHNI 188.16% · sHNI 94.08%**, Σ 1,219%.
 *
 * WHERE THE FIGURES COME FROM, and why they are trustworthy. Chittorgarh's
 * table for the issue, corroborated INDEPENDENTLY by our own subscription
 * poller: its stored `timesSubscribed` divides demand by the book it saw at the
 * time, so back-solving `nseShares / timesSubscribed` recovers the denominators
 * the record held while it was live —
 *
 *     QIB   12,62,30,400 / 73.87  = 17,08,817   vs published 17,08,800
 *     bHNI  16,75,16,400 / 488.1  =  3,43,201   vs published  3,43,200
 *     sHNI   6,00,31,200 / 349.83 =  1,71,606   vs published  1,71,600
 *
 * — agreeing to under 0.01%. So the record was CORRECT during bidding and was
 * overwritten afterwards; these figures restore what it held.
 *
 * The offer is quoted in SHARES, not rupees (the RHP states the counts and the
 * ₹ figures are the "agg. up to" derivations), so both legs are stored on the
 * `shares` basis and the reservation table is share-sized — one count, the same
 * at either end of the band.
 *
 * THE STATED TOTAL IS WHY `totalShares` IS SET. `legSumCrOf` rounds to 2 dp, so
 * ₹42.52248 Cr stores as 42.52 and dividing that back at ₹118 gives 36,03,400 —
 * 200 shares short of the published 36,03,600. The stated count involves no
 * division to round away, which is exactly what that field is for.
 *
 * NOT TOUCHED: `anchorShares` is still blank, so QIB Book Size publishes GROSS
 * and the page says so. Chittorgarh puts the anchor at 10,24,800 shares
 * (₹12.09 Cr, bid 16 Sep) — filling it is the operator's call, in line with the
 * catalogue-wide anchor task, not something to slip in here.
 *
 *   node scripts/fix-spectraa-offer.js            # dry run
 *   node scripts/fix-spectraa-offer.js --apply
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const PRICE_CAP = 118;
const FRESH_SHARES = 32_55_600;
const OFS_SHARES = 3_48_000;
const TOTAL_SHARES = 36_03_600;   // published; FRESH + OFS
const MARKET_MAKER = 1_82_400;    // 5.06% of the total
const NET_OFFER = TOTAL_SHARES - MARKET_MAKER; // 34,21,200

/**
 * Percentages of the NET offer, to 4 dp so they sum to exactly 100.0000 — B01
 * checks that sum, and the published 2-dp figures (49.95 / 10.03 / 5.02 /
 * 35.01) add to 100.01 and would fail it. The COUNTS are the authority here;
 * these exist for validation and for the "from count" readout.
 */
const ROWS = {
  qib: { shares: 17_08_800, pct: '49.9473' },
  hni: { shares: 3_43_200, pct: '10.0316' },   // bNII > ₹10 L
  hni2: { shares: 1_71_600, pct: '5.0158' },   // sNII < ₹10 L
  retail: { shares: 11_97_600, pct: '35.0053' },
};

const fmt = (n) => Number(n).toLocaleString('en-IN');

(async () => {
  // Arithmetic must reconcile before anything is written.
  const sumLegs = FRESH_SHARES + OFS_SHARES;
  const sumRows = Object.values(ROWS).reduce((a, r) => a + r.shares, 0);
  const sumPct = Object.values(ROWS).reduce((a, r) => a + Number(r.pct), 0);
  const checks = [
    [`legs ${fmt(FRESH_SHARES)} + ${fmt(OFS_SHARES)} = total ${fmt(TOTAL_SHARES)}`, sumLegs === TOTAL_SHARES],
    [`rows sum to the net offer ${fmt(NET_OFFER)}`, sumRows === NET_OFFER],
    [`percentages sum to 100.0000`, Math.abs(sumPct - 100) < 1e-9],
  ];
  checks.forEach(([label, ok]) => console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`));
  if (checks.some(([, ok]) => !ok)) { console.error('\nArithmetic does not reconcile — nothing written.'); process.exitCode = 1; return; }

  const ipo = await prisma.ipo.findUnique({
    where: { symbol: 'SPECTRAA' },
    select: { id: true, priceBandMax: true, issueSize: true, extra: true },
  });
  if (!ipo) { console.error('SPECTRAA not found.'); process.exitCode = 1; return; }
  if (Number(ipo.priceBandMax) !== PRICE_CAP) {
    console.error(`Band cap is ₹${ipo.priceBandMax}, expected ₹${PRICE_CAP} — nothing written.`);
    process.exitCode = 1; return;
  }
  const extra = ipo.extra || {};

  // `legSumCrOf` in IpoForm.tsx: a `shares` leg is value × price ÷ 1e7, summed,
  // then toFixed(2). Reproduced here so the form and this script agree.
  const issueSizeCr = ((sumLegs * PRICE_CAP) / 1e7).toFixed(2); // "42.52"
  const issueSizeRupees = Math.round(Number(issueSizeCr) * 1e7);

  const shareResv = { ...(extra.shareResv || {}) };
  for (const [key, r] of Object.entries(ROWS)) {
    shareResv[key] = {
      ...(shareResv[key] || {}),
      pct: r.pct,
      // Share-sized: the count does not move with the price, so both bands
      // carry the same figure.
      sharesUpper: String(r.shares),
      sharesLower: String(r.shares),
      // The RHP's own numbers outrank any derivation, so they are never refilled.
      source: 'operator',
    };
  }

  const patch = {
    fresh: { basis: 'shares', value: FRESH_SHARES },
    ofs: { basis: 'shares', value: OFS_SHARES },
    issueSizeCr,
    totalShares: String(TOTAL_SHARES),
    totalSharesSource: 'operator',
    carveouts: { ...(extra.carveouts || {}), marketmaker: String(MARKET_MAKER) },
    carveoutBasis: { ...(extra.carveoutBasis || {}), marketmaker: 'shares' },
    shareResv,
    resvRemarks: `Fresh Issue of up to ${fmt(FRESH_SHARES)} equity shares and Offer for Sale of up to ${fmt(OFS_SHARES)} equity shares.`,
  };

  console.log(`\nissueSize column  ₹${fmt(ipo.issueSize)} -> ₹${fmt(issueSizeRupees)}   (₹${extra.issueSizeCr} Cr -> ₹${issueSizeCr} Cr)`);
  console.log(`fresh / ofs       ${JSON.stringify(extra.fresh)} / ${JSON.stringify(extra.ofs)}`);
  console.log(`               -> shares ${fmt(FRESH_SHARES)} / ${fmt(OFS_SHARES)}`);
  console.log(`totalShares       "${extra.totalShares ?? ''}" -> ${fmt(TOTAL_SHARES)} [operator]`);
  console.log(`market maker      "${(extra.carveouts || {}).marketmaker ?? ''}" -> ${fmt(MARKET_MAKER)} shares  (net offer ${fmt(NET_OFFER)})`);
  for (const [key, r] of Object.entries(ROWS)) {
    const old = (extra.shareResv || {})[key] || {};
    console.log(`  ${key.padEnd(7)} ${String(old.pct ?? '—').padStart(8)}% ${String(old.sharesUpper ?? '—').padStart(9)}  ->  ${r.pct}% ${fmt(r.shares).padStart(10)} [operator]`);
  }

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return; }

  // jsonb MERGE — never a read-modify-write on this column.
  await prisma.$executeRawUnsafe(
    `UPDATE "Ipo" SET extra = COALESCE(extra,'{}'::jsonb) || $1::jsonb, "issueSize" = $2 WHERE id = $3`,
    JSON.stringify(patch), issueSizeRupees, ipo.id,
  );
  console.log('\nWritten (jsonb merge + issueSize column, one statement).');
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
