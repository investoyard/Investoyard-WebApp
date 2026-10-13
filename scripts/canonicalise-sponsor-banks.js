/**
 * Rewrite the short / abbreviated sponsor-bank spellings in
 * `extra.sponsorBank` to the master's canonical names.
 *
 * DRY RUN BY DEFAULT — pass --apply to write.
 *
 * WHY. `matchSponsorBanks` is case- and whitespace-insensitive but deliberately
 * NOT fuzzy: "KOTAK BANK" does not become "Kotak Mahindra Bank Limited",
 * because a matcher that guesses would one day email a bank about an issue it
 * never sponsored. That leaves 15 of the 60 IPOs unroutable, every one of them
 * because of an abbreviation rather than a different bank.
 *
 * Fixing it in the DATA rather than loosening the matcher is the right side to
 * fix: the IPO form's tick-list writes canonical names from now on, so this is
 * a one-off catch-up, and the matcher stays strict for the case it exists for.
 *
 * ONLY EXACT, UNAMBIGUOUS MAPPINGS BELOW. Every one is the same legal entity —
 * there is one Kotak bank, one Axis bank. Anything not in this table is left
 * alone and reported, because a spelling nobody has checked is not something a
 * script should rename.
 *
 * Writes with a JSONB MERGE (`extra || $1`), never a read-modify-write: the
 * subscription poller rewrites `extra` every 60s on a live issue (every 5s
 * after 15:30), so sending the whole object would revert whatever it wrote in
 * between. Only the `sponsorBank` key is touched.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

const APPLY = process.argv.includes('--apply');

/* The old strings are operator-entered, taken from offer documents, and a
   jsonb merge overwrites them with nothing left to read. Every applied run
   writes the previous values beside the other backups first. */
const BACKUP_DIR = 'C:/ProgramData/Investoyard/backups';

/** lowercased, whitespace-collapsed spelling → canonical master name */
const CANON = {
  'kotak bank': 'Kotak Mahindra Bank Limited',
  'kotak mahindra bank ltd': 'Kotak Mahindra Bank Limited',
  'axis bank': 'Axis Bank Limited',
  'icici bank': 'ICICI Bank Limited',
  'hdfc bank ltd': 'HDFC Bank Limited',
};

const key = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const split = (raw) => String(raw ?? '').split(/\s*(?:,|;|&|\sand\s)\s*/i).map((s) => s.trim()).filter(Boolean);

(async () => {
  console.log(APPLY ? 'APPLYING\n' : 'DRY RUN — pass --apply to write\n');

  const master = await p.sponsorBank.findMany({ where: { active: true }, select: { name: true } });
  const canonNames = new Set(master.map((m) => key(m.name)));
  // Refuse to rename INTO a name the master does not hold — that would just
  // move the unroutable spelling somewhere else.
  for (const [from, to] of Object.entries(CANON)) {
    if (!canonNames.has(key(to))) {
      console.error(`REFUSING: "${from}" maps to "${to}", which is not an active master row. Seed the master first.`);
      process.exit(1);
    }
  }

  const rows = await p.$queryRawUnsafe(
    `SELECT id, symbol, extra->>'sponsorBank' AS sb FROM "Ipo"
     WHERE extra->>'sponsorBank' IS NOT NULL AND extra->>'sponsorBank' <> ''`,
  );

  let changed = 0, untouched = 0;
  const leftAlone = new Map();
  const backup = [];

  for (const r of rows) {
    const parts = split(r.sb);
    const next = parts.map((n) => CANON[key(n)] ?? n);
    // dedupe: "Axis Bank, Axis Bank Limited" collapses to one after renaming
    const seen = new Set();
    const final = next.filter((n) => { const k = key(n); if (seen.has(k)) return false; seen.add(k); return true; });

    for (const n of final) if (!canonNames.has(key(n))) leftAlone.set(n, (leftAlone.get(n) ?? 0) + 1);

    /*
     * Only write when a NAME actually changed.
     *
     * The first version rejoined with ", " unconditionally, which rewrote 38
     * records — most of them only turning "A and B" into "A, B" on rows that
     * already resolved perfectly. That is cosmetic churn on operator-entered
     * data and it is not this script's job: the separator is the operator's
     * phrasing from the offer document, the matcher already handles " and ",
     * and a 38-record diff hides the 15 that matter.
     */
    const renamed = parts.length !== final.length
      || parts.some((n, i) => key(n) !== key(final[i]));
    if (!renamed) { untouched++; continue; }

    const joined = final.join(', ');
    if (joined === r.sb) { untouched++; continue; }
    changed++;
    backup.push({ id: r.id, symbol: r.symbol, before: r.sb, after: joined });
    console.log(`  ${r.symbol.padEnd(14)} ${JSON.stringify(r.sb)}\n  ${' '.repeat(14)} → ${JSON.stringify(joined)}`);
  }

  if (APPLY && backup.length) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const file = path.join(BACKUP_DIR, `sponsor-bank-canonicalise-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`\nbackup written: ${file}`);

    for (const b of backup) {
      await p.$executeRawUnsafe(
        `UPDATE "Ipo" SET extra = COALESCE(extra,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
        JSON.stringify({ sponsorBank: b.after }),
        b.id,
      );
    }
  }

  console.log(`\n${changed} record(s) rewritten, ${untouched} already canonical.`);
  if (leftAlone.size) {
    console.log('\nLEFT ALONE — not in the mapping table and not an active master row:');
    for (const [n, c] of [...leftAlone].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)}×  ${JSON.stringify(n)}`);
  } else {
    console.log('Every name across the catalogue now matches an active master row.');
  }
  await p.$disconnect();
})().catch(async (e) => { console.error('FAILED:', e.message); await p.$disconnect(); process.exit(1); });
