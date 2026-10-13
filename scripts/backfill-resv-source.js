// Backfill `shareResv[k].source` on records written before provenance existed.
//
// Until 2026-09-24 nothing recorded where a stored share count came from, so
// Autofill and normalise-reservation-shares.js overwrote exchange figures with
// approximations of themselves — and the script's `source === 'operator'` guard
// protected nothing, because no row had ever carried the field.
//
// Classification is a HEURISTIC and it is deliberately one-sided:
//
//   within tolerance of `pct x total`  -> 'derived'   (stamped)
//   anything else                      -> LEFT ALONE  (needs human eyes)
//
// A count that reproduces the derivation almost certainly IS the derivation.
// A count that does not could be the exchange's figure, a hand-typed RHP number,
// or a snapshot taken from inputs that have since been corrected — MPIMANIPAL's
// stored 8,844 for QIB is an Autofill snapshot of a broken Rs0.40 Cr issue size,
// not an exchange figure. Guessing 'exchange' there would lock nonsense in place
// behind a flag that stops every future fill from repairing it. So the safe
// direction is the only one automated; the rest are printed for review.
//
// Usage:
//   node scripts/backfill-resv-source.js            report only (default)
//   node scripts/backfill-resv-source.js --apply     write the 'derived' stamps
//   node scripts/backfill-resv-source.js --tolerance N   shares (default: 1 lot)

const { PrismaClient } = require('D:/Investoyard/node_modules/@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const args = process.argv.slice(2);
const DRY = !args.includes('--apply');
const TOL_ARG = (() => { const i = args.indexOf('--tolerance'); return i >= 0 ? Number(args[i + 1]) : null; })();

const num = (v) => { const n = Number(String(v ?? '').replace(/[,\u20b9\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const f = (n) => Math.round(n).toLocaleString('en-IN');
const KEYS = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder', 'other'];

(async () => {
  console.log(`Mode: ${DRY ? 'REPORT ONLY (no writes)' : 'APPLY (writes)'}\n`);
  const ipos = await prisma.ipo.findMany({
    select: { id: true, symbol: true, issueSize: true, priceBandMax: true, lotSize: true, extra: true },
  });

  let stamped = 0, review = 0, already = 0, touchedIpos = 0;
  const reviewRows = [];

  for (const ipo of ipos) {
    const extra = ipo.extra ?? {};
    const resv = extra.shareResv;
    if (!resv || typeof resv !== 'object') continue;
    const lot = num(ipo.lotSize) || 1;
    const priceMax = num(ipo.priceBandMax);
    // Same precedence the form and ipoCalc use: stated count beats Rs / price.
    const total = num(extra.totalShares) || (priceMax > 0 ? num(ipo.issueSize) / priceMax : 0);
    if (!total || !priceMax) continue;

    const tol = TOL_ARG != null ? TOL_ARG : lot;
    const next = { ...resv };
    let changed = false;

    for (const k of KEYS) {
      const row = resv[k];
      if (!row || typeof row !== 'object') continue;
      const stored = num(row.sharesUpper);
      const pct = num(row.pct);
      if (!stored || !pct) continue;
      if (row.source) { already++; continue; }

      const derived = Math.round((total * pct) / 100);
      if (Math.abs(stored - derived) <= tol) {
        next[k] = { ...row, source: 'derived' };
        changed = true;
        stamped++;
      } else {
        review++;
        reviewRows.push(`  ${ipo.symbol.padEnd(12)} ${k.padEnd(11)} stored ${f(stored).padStart(14)}  vs derived ${f(derived).padStart(14)}  (${(Math.abs(stored - derived) / derived * 100).toFixed(2)}%)`);
      }
    }

    if (changed) {
      touchedIpos++;
      if (!DRY) await prisma.ipo.update({ where: { id: ipo.id }, data: { extra: { ...extra, shareResv: next } } });
    }
  }

  console.log(`stamped 'derived'   : ${stamped}  (across ${touchedIpos} IPOs)`);
  console.log(`already attributed  : ${already}`);
  console.log(`NEEDS REVIEW        : ${review}\n`);
  if (reviewRows.length) {
    console.log('Rows left unattributed — classify these by hand (exchange / operator / derived):');
    reviewRows.forEach((r) => console.log(r));
    console.log('\nUntil a row carries a source it behaves as before: --force may overwrite it.');
  }
  console.log(DRY ? '\nREPORT ONLY — re-run with --apply to write the stamps.' : '\nAPPLY complete.');
  await prisma.$disconnect();
})().catch((e) => { console.error('ERROR:', e?.message ?? e); process.exit(1); });
