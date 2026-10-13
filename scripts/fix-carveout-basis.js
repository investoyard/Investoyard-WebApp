#!/usr/bin/env node
/**
 * A carve-out whose VALUE is a share count while its BASIS says `amount`.
 *
 * SHIVCHEM stores `carveouts.marketmaker = "114000"` with
 * `carveoutBasis.marketmaker = "amount"`, so every reader divides ₹1,14,000
 * CRORE by the band price — against an issue of ₹13.31 Cr. PAPADMALJI is the
 * same shape at ₹1,44,000 Cr against ₹19.00 Cr.
 *
 * WHAT IT COSTS TODAY. This is not cosmetic and not latent in the admin form:
 * `IpoForm` has passed `carveouts` to the engine since 2026-09-25, so opening
 * either record in Add IPO hands `computeIssue()` a carve-out larger than the
 * offer. The engine does not return a wrong number — **it returns NO SCENARIO
 * AT ALL** (`primary` is undefined), so every derived figure on the screen is
 * blank. It escaped notice only because neither record has reservation
 * percentages entered yet, which is also what keeps it off the public pages.
 *
 * THE TEST, and it is the generalisable part: an `amount` carve-out whose RUPEE
 * reading exceeds the whole issue size cannot be rupees. Catalogue-wide that
 * matches these two and nothing else — KHERIAAUTO (₹2 Cr), AXIOMGAS (₹3 Cr) and
 * BMISL (₹2 Cr) are genuine rupee figures and are left alone. The Excel
 * importer can reintroduce this shape, so the script SCANS rather than
 * hardcoding the two symbols.
 *
 * WHY FLIPPING THE BASIS IS THE RIGHT REPAIR rather than rewriting the value:
 * both figures are 5.3% and 5.5% of their stated share counts, which is exactly
 * what an SME market maker is (B18's floor is 5%). The value is already the
 * document's count; only the label on it is wrong.
 *
 * GUARDS. A record is only touched when ALL of these hold:
 *   • the basis is `amount` or absent (never an explicit `shares`);
 *   • reading the value as ₹ Cr exceeds the issue size — the fault signature;
 *   • a share denominator exists (stated count, or ₹ total ÷ cap price), so the
 *     plausibility test below cannot be silently skipped;
 *   • reading the value as SHARES lands between 0.01% and 25% of the offer.
 *     A market maker is ~5%; a preferential quota is smaller. Anything outside
 *     that is a different fault and wants a human.
 *
 *   node scripts/fix-carveout-basis.js            # dry run
 *   node scripts/fix-carveout-basis.js --apply
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const CARVEOUT_KEYS = ['employee', 'shareholder', 'policyholder', 'marketmaker'];
/** A share reading must land in this band of the total offer to be believed. */
const MIN_PCT = 0.01;
const MAX_PCT = 25;

const num = (v) => {
  const x = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const fmt = (n) => Number(n).toLocaleString('en-IN');
const cr = (rupees) => `₹${(rupees / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;

(async () => {
  const ipos = await prisma.ipo.findMany({
    select: {
      id: true, symbol: true, type: true, issueSize: true,
      priceBandMax: true, priceBandMin: true, extra: true,
    },
  });

  let scanned = 0;
  const plans = [];

  for (const ipo of ipos) {
    const extra = ipo.extra || {};
    const carveouts = extra.carveouts;
    if (!carveouts || typeof carveouts !== 'object') continue;
    scanned += 1;

    const sizeRs = Number(ipo.issueSize) || 0;
    const price = Number(ipo.priceBandMax) || Number(ipo.priceBandMin) || 0;
    /* The denominator for the plausibility test: the stated count first, the
       ₹ total ÷ cap price second — the same precedence as everything else. */
    const totalShares = num(extra.totalShares)
      || (sizeRs > 0 && price > 0 ? Math.round(sizeRs / price) : 0);

    const basisMap = extra.carveoutBasis || {};
    const flips = [];

    for (const key of CARVEOUT_KEYS) {
      const value = num(carveouts[key]);
      if (value <= 0) continue;

      const basis = basisMap[key];
      if (basis === 'shares') continue;               // already correct
      if (sizeRs <= 0) continue;                      // nothing to measure against

      const asRupees = value * 1e7;
      if (asRupees <= sizeRs) continue;               // a believable ₹ figure — leave it

      if (totalShares <= 0) {
        console.error(`${ipo.symbol}: ${key} reads ${cr(asRupees)} against an issue of ${cr(sizeRs)}, `
          + 'but no share denominator exists — SKIPPED, needs a human');
        process.exitCode = 1;
        continue;
      }
      const pct = (value / totalShares) * 100;
      if (pct < MIN_PCT || pct > MAX_PCT) {
        console.error(`${ipo.symbol}: ${key} = ${fmt(value)} is ${pct.toFixed(2)}% of the offer as shares, `
          + `outside ${MIN_PCT}–${MAX_PCT}% — SKIPPED, this is a different fault`);
        process.exitCode = 1;
        continue;
      }
      flips.push({ key, value, pct, asRupees, hadBasis: basis == null ? '(absent)' : String(basis) });
    }

    if (flips.length) plans.push({ ipo, sizeRs, totalShares, flips });
  }

  console.log(`${scanned} records hold a carve-out object; ${plans.length} carry a basis fault.\n`);

  for (const { ipo, sizeRs, totalShares, flips } of plans) {
    console.log(`${ipo.symbol}  (${ipo.type})  issue ${cr(sizeRs)}  offer ${fmt(totalShares)} shares`);
    for (const f of flips) {
      console.log(`   ${f.key}: ${fmt(f.value)}  basis ${f.hadBasis} -> shares`);
      console.log(`      as rupees that was ${cr(f.asRupees)} — ${(f.asRupees / sizeRs).toFixed(0)}x the whole issue`);
      console.log(`      as shares it is ${f.pct.toFixed(2)}% of the offer`);
    }

    if (!APPLY) continue;

    /* The jsonb MERGE, never a read-modify-write: the poller rewrites this
       column every 60s on a live issue (every 5s after 15:30) and a Prisma
       `update({ data: { extra } })` would send the whole object back. */
    const patch = {
      carveoutBasis: {
        ...(ipo.extra.carveoutBasis || {}),
        ...Object.fromEntries(flips.map((f) => [f.key, 'shares'])),
      },
    };
    await prisma.$executeRawUnsafe(
      `UPDATE "Ipo" SET extra = COALESCE(extra,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify(patch), ipo.id,
    );

    /* RE-READ. A script that reports success has only proved it issued the
       write — on a live record the poller may have overwritten it since. */
    const after = await prisma.ipo.findUnique({ where: { id: ipo.id }, select: { extra: true } });
    const got = (after?.extra || {}).carveoutBasis || {};
    const bad = flips.filter((f) => got[f.key] !== 'shares');
    if (bad.length) {
      console.error(`   WRITE DID NOT STICK for ${bad.map((f) => f.key).join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('   written and re-read (jsonb merge)');
    }
  }

  console.log(APPLY
    ? '\nDone. Re-open each record in Add IPO and confirm the derived figures render.'
    : '\nDry run. Re-run with --apply to write.');
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
