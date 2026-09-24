// Normalise reservation share counts to industry convention.
//
// Operator ask (2026-09-22): VARMORA (and others) had shares stored at
// midband price — didn't match Bumtaria / Chittorgarh / IPOPremium
// tables. This script walks every IPO with a filled `shareResv[k].pct`
// and rewrites `sharesUpper` = shares at priceBandMax, `sharesLower` =
// shares at priceBandMin (both floored to lot).
//
// Preserves the operator's overrides via a per-row `source: 'operator'`
// flag: set that flag on any row you want to keep untouched (edit the
// row in the admin form and save with the manual value + we'll add a
// UI marker in a future pass). For now the flag has to be set manually
// in Prisma Studio if you want to protect a specific row.
//
// Usage:
//   cd apps/api && node ../../scripts/normalise-reservation-shares.js
//     --dry-run   report what would change, no writes
//     --apply     actually write. Default is --dry-run.
//     --only SYM  restrict to a single IPO symbol (VARMORA / NSE / …)
//     --tolerance N  skip rows whose current shares are within N shares
//                    of the derived value (default: 1 lot)
//
// The script prints a per-IPO diff of what would change, plus a summary
// at the end. Safe to re-run — it's idempotent once every row matches
// the derived convention.

const { PrismaClient } = require('D:/Investoyard/node_modules/@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const args = process.argv.slice(2);
const DRY = !args.includes('--apply');
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null; })();
const TOL_ARG = (() => { const i = args.indexOf('--tolerance'); return i >= 0 ? Number(args[i + 1]) : null; })();

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/** Floor a share count down to the nearest whole number of lots. */
const floorToLot = (n, lot) => (lot > 0 ? Math.floor(n / lot) * lot : Math.round(n));

/**
 * Parse the free-text issueSize field into rupees. The catalog stores this as
 * a string like "₹708 Cr" or "₹22,562 Cr" — matches the parseIssueValue helper
 * used everywhere on the front-site.
 */
function parseIssueRupees(s) {
  if (!s) return 0;
  const t = String(s).replace(/,/g, '');
  const m = t.match(/([\d.]+)\s*Cr/i);
  if (m) return parseFloat(m[1]) * 1e7;
  const n = t.replace(/[^\d.]/g, '');
  return n ? parseFloat(n) : 0;
}

(async () => {
  console.log(`Mode: ${DRY ? 'DRY-RUN (no writes)' : 'APPLY (writes)'}${ONLY ? ` -- only symbol ${ONLY}` : ''}`);
  const ipos = await prisma.ipo.findMany({
    where: ONLY ? { symbol: ONLY } : undefined,
    select: { id: true, symbol: true, issueSize: true, priceBandMin: true, priceBandMax: true, lotSize: true, extra: true },
  });
  console.log(`Scanning ${ipos.length} IPO(s)...\n`);

  let touched = 0, unchanged = 0, skippedNoInputs = 0, skippedNoResv = 0, rowsChanged = 0;
  const KEYS = ['qib', 'hni', 'hni2', 'retail', 'employee', 'shareholder', 'other'];

  for (const ipo of ipos) {
    const rupees = parseIssueRupees(ipo.issueSize);
    const priceMax = Number(ipo.priceBandMax) || 0;
    const priceMin = Number(ipo.priceBandMin) || priceMax;
    const lot = Number(ipo.lotSize) || 1;
    if (!rupees || !priceMax || !lot) { skippedNoInputs++; continue; }

    const extra = (ipo.extra ?? {});
    const resv = extra.shareResv;
    if (!resv || typeof resv !== 'object') { skippedNoResv++; continue; }

    // The offer document's own share count wins over `₹ ÷ price` when the
    // operator entered it — same precedence the IPO form and ipoCalc use. It
    // is the figure the exchanges publish and it involves no division to
    // round away, which is where the ₹ path loses its last few hundred
    // shares. The stated count is the count AT THE CAP, so the floor-band
    // equivalent scales by the band ratio rather than re-dividing the rupees
    // (which would reintroduce the rounding this is here to avoid).
    const stated = num(extra.totalShares);
    const totalAtCap = stated > 0 ? stated : rupees / priceMax;
    const totalAtFloor = stated > 0 ? (stated * priceMax) / priceMin : rupees / priceMin;
    if (stated > 0) console.log(`  (${ipo.symbol}: using stated total ${stated.toLocaleString('en-IN')} shares, not ₹${(rupees / 1e7).toFixed(4)} Cr ÷ ${priceMax})`);

    const changes = [];
    const nextResv = { ...resv };

    for (const k of KEYS) {
      const row = resv[k];
      if (!row || typeof row !== 'object') continue;
      const pct = num(row.pct);
      if (pct <= 0) continue;                       // no pct — skip (nothing to derive from)
      if (row.source === 'operator') continue;      // operator-locked — respect it

      const derivedUpper = floorToLot((totalAtCap * pct) / 100, lot);
      const derivedLower = floorToLot((totalAtFloor * pct) / 100, lot);
      const currentUpper = num(row.sharesUpper);
      const currentLower = num(row.sharesLower);

      const tol = TOL_ARG != null ? TOL_ARG : lot;   // within one lot = no change
      const upperOff = currentUpper > 0 && Math.abs(currentUpper - derivedUpper) > tol;
      const lowerOff = currentLower > 0 && Math.abs(currentLower - derivedLower) > tol;
      const needsUpper = currentUpper === 0 || upperOff;
      const needsLower = currentLower === 0 || lowerOff;

      if (needsUpper || needsLower) {
        changes.push({
          k, pct,
          upperFrom: currentUpper || null, upperTo: derivedUpper,
          lowerFrom: currentLower || null, lowerTo: derivedLower,
        });
        nextResv[k] = {
          ...row,
          sharesUpper: String(derivedUpper),
          sharesLower: String(derivedLower),
        };
      }
    }

    if (changes.length === 0) { unchanged++; continue; }
    touched++;
    rowsChanged += changes.length;

    console.log(`${ipo.symbol}  (issue ${ipo.issueSize}, band ₹${priceMin}–₹${priceMax}, lot ${lot})`);
    for (const c of changes) {
      const uFrom = c.upperFrom ? c.upperFrom.toLocaleString('en-IN') : '—';
      const uTo = c.upperTo.toLocaleString('en-IN');
      const lFrom = c.lowerFrom ? c.lowerFrom.toLocaleString('en-IN') : '—';
      const lTo = c.lowerTo.toLocaleString('en-IN');
      console.log(`  ${c.k.padEnd(11)} ${c.pct}% : upper ${uFrom.padStart(14)} → ${uTo.padStart(14)} · lower ${lFrom.padStart(14)} → ${lTo.padStart(14)}`);
    }

    if (!DRY) {
      await prisma.ipo.update({
        where: { id: ipo.id },
        data: { extra: { ...extra, shareResv: nextResv } },
      });
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Summary:`);
  console.log(`  IPOs touched         : ${touched}`);
  console.log(`  IPOs unchanged       : ${unchanged}`);
  console.log(`  IPOs skipped (no inputs): ${skippedNoInputs}`);
  console.log(`  IPOs skipped (no resv): ${skippedNoResv}`);
  console.log(`  Rows rewritten       : ${rowsChanged}`);
  console.log(DRY
    ? `\nDRY-RUN — no writes performed. Re-run with --apply to commit these changes.`
    : `\nAPPLY complete.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error('ERROR:', e?.message ?? e);
  process.exit(1);
});
