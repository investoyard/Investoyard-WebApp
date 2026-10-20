#!/usr/bin/env node
/**
 * Import the pincode directory (PincodeMaster) from a CSV.
 *
 *   node scripts/import-pincodes.js <file.csv>          # DRY RUN
 *   node scripts/import-pincodes.js <file.csv> --apply
 *   node scripts/import-pincodes.js <file.csv> --ambiguous   # list the disagreements and stop
 *
 * Same shape as import-ifsc.js: dry-run by default, idempotent, re-runnable,
 * and it prints the file's own headers with the mapping it chose.
 *
 * THE COLLAPSE IS THE POINT OF THIS SCRIPT. India Post publishes one row per
 * POST OFFICE and a pincode carries several, while `PincodeMaster.pincode` is
 * unique because the form wants one answer. So each pincode's post offices are
 * grouped and the MOST FREQUENT district/state wins — and every pincode whose
 * post offices DISAGREED is flagged `ambiguous` and counted, never silently
 * resolved. A pincode spanning two districts is a data question for the
 * operator; a script that picks one quietly is how a form starts confidently
 * filling in the wrong state.
 *
 * `--ambiguous` prints those cases and writes nothing, so the decision can be
 * looked at before 19k rows land.
 *
 * TWO INPUT FORMATS, detected rather than flagged:
 *
  *  - A HEADERED CSV, mapped by the candidate lists below.
 *  - The GEONAMES postal export (`IN.txt` out of
 *    https://download.geonames.org/export/zip/IN.zip) — tab-separated with NO
 *    header row: country, postalcode, place, admin1(state), admin1code,
 *    admin2(district), admin2code, admin3, admin3code, lat, lon, accuracy.
 *    **CC-BY 4.0, so a visible attribution is required wherever this data is
 *    published.** It is read natively so that refreshing the directory is one
 *    command rather than a conversion step somebody has to remember.
 *
 * WHY NOT THE LIVE INDIA POST API: probed 2026-10-20 and it returns the raw
 * post-office list with no collapse — 400001 came back as SEVEN offices whose
 * districts DISAGREE (Mumbai vs Raigarh). So a live lookup does not answer the
 * question the form asks; it moves this script’s collapse into the browser, on
 * every pincode entry, with nothing to flag the disagreement. It would also put
 * an unofficial third party on the critical path of the one screen an applicant
 * cannot avoid, and send every pincode out of the building.
 *
 * IT ALSO SEEDS `StateMaster` from the distinct states it sees, because the
 * dropdown has to offer the SAME spellings this import will auto-fill. Existing
 * rows are never overwritten — an operator correction must survive a refresh.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const SHOW_AMBIG = argv.includes('--ambiguous');
const file = argv.find((a) => !a.startsWith('--'));
const BATCH = 2000;

const CANDIDATES = {
  pincode:  ['pincode', 'pin', 'pincodes', 'pinco', 'pincodenumber'],
  district: ['district', 'districtname', 'revenuedistrict'],
  state:    ['state', 'statename'],
  /* Taken only to report how many offices a row was collapsed from. */
  office:   ['officename', 'postoffice', 'postofficename', 'office', 'name'],
};
const REQUIRED = ['pincode'];

const norm = (h) => String(h).toLowerCase().replace(/[^a-z]/g, '');

function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const clean = (v) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s && s !== '-' && s.toUpperCase() !== 'NA' ? s : null;
};

/** Title-case a SHOUTED directory value, keeping short connectives lower. */
const LOWER = new Set(['and', 'of', 'the']);
const titleCase = (s) =>
  s == null ? null
    : s.split(/\s+/).map((w, i) => {
        const l = w.toLowerCase();
        if (i > 0 && LOWER.has(l)) return l;
        return l.replace(/(^|[^a-z])([a-z])/g, (_, a, b) => a + b.toUpperCase());
      }).join(' ');

/**
 * Corrections applied to the directory’s state names, ON EVERY IMPORT.
 *
 * IT HAS TO LIVE HERE RATHER THAN BE A ONE-OFF UPDATE, because PincodeMaster
 * upserts and WOULD overwrite a hand-fixed name on the next refresh — unlike
 * StateMaster, which is add-only for exactly that reason. Normalising on import
 * also keeps the two tables agreeing, which matters: the form auto-fills the
 * state from a pincode and then has to find that value in the dropdown.
 *
 * DELIBERATELY MINIMAL — only names that are factually out of date, not
 * stylistic variants. "Andaman & Nicobar Islands" and "Jammu & Kashmir" keep
 * their ampersands; churning those would rewrite 19k rows to no purpose.
 *
 * NOT FIXED HERE, because it cannot be: GeoNames has no LADAKH, which has been
 * a union territory since 2019 — its pincodes are still filed under Jammu &
 * Kashmir. Reassigning them would mean guessing which ones, so Ladakh is added
 * to StateMaster (so it can be chosen) while the auto-fill still says Jammu &
 * Kashmir and the applicant corrects it.
 */
const STATE_FIXES = new Map([
  ['pondicherry', 'Puducherry'],   // renamed in 2006
]);
const fixState = (n) => (n ? (STATE_FIXES.get(n.toLowerCase()) ?? n) : n);

const mode = (arr) => {
  const c = new Map();
  for (const v of arr) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best = null, n = 0;
  for (const [v, k] of c) if (k > n) { best = v; n = k; }
  return { best, distinct: c.size };
};

/**
 * GeoNames postal rows are headerless TSV. The test is structural rather than
 * filename-based: 12 tab-separated fields whose first is a 2-letter country
 * code and whose second is the postal code. A headered CSV can never match it,
 * so the two formats cannot be confused.
 */
function asGeonames(lines) {
  const f = lines[0].split('\t');
  if (f.length < 11) return null;
  if (!/^[A-Z]{2}$/.test(f[0].trim())) return null;
  return lines.map((l) => {
    const c = l.split('\t');
    return { pincode: c[1], district: c[5], state: c[3], place: c[2] };
  });
}

async function main() {
  if (!file) {
    console.error('usage: node scripts/import-pincodes.js <file.csv> [--apply] [--ambiguous]');
    process.exit(2);
  }
  if (!fs.existsSync(file)) { console.error(`not found: ${path.resolve(file)}`); process.exit(2); }

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) { console.error('file is empty'); process.exit(2); }

  console.log(`file     : ${path.resolve(file)}`);

  /* GeoNames first: it has no header row, so there is nothing for the CSV
     mapper to look at and it would otherwise treat row 1 as column names. */
  const geo = asGeonames(lines);
  let recs;
  if (geo) {
    console.log(`format   : GeoNames postal export (headerless TSV) — CC-BY 4.0, attribution required`);
    console.log(`rows     : ${geo.length} locality rows`);
    recs = geo;
  } else {
    const headers = splitCsv(lines[0]).map((h) => h.trim());
    console.log(`format   : headered CSV`);
    console.log(`rows     : ${lines.length - 1} data rows (one per post office)`);
    console.log(`headers  : ${JSON.stringify(headers)}`);
    const map = {};
    for (const [field, cands] of Object.entries(CANDIDATES)) {
      /* CANDIDATES ARE TRIED IN THEIR OWN ORDER, not the file’s.
         `headers.findIndex(h => cands.includes(h))` scans HEADERS and takes the
         first that matches anything, which silently discards the priority the
         candidate list was written to express — whichever column the file
         happens to put first wins. */
      let i = -1;
      for (const c of cands) { i = headers.findIndex((h) => norm(h) === c); if (i >= 0) break; }
      if (i >= 0) map[field] = i;
    }
    console.log('mapping  :');
    for (const field of Object.keys(CANDIDATES)) {
      const i = map[field];
      console.log(`  ${field.padEnd(9)} -> ${i >= 0 ? `[${i}] ${headers[i]}` : 'NOT FOUND'}${REQUIRED.includes(field) ? ' (required)' : ''}`);
    }
    const missing = REQUIRED.filter((f) => map[f] === undefined);
    if (missing.length) {
      console.error(`\nREFUSING: no column matched ${missing.join(', ')}.`);
      process.exit(1);
    }
    recs = lines.slice(1).map((l) => {
      const c = splitCsv(l);
      return {
        pincode: c[map.pincode],
        district: map.district !== undefined ? c[map.district] : null,
        state: map.state !== undefined ? c[map.state] : null,
        place: map.office !== undefined ? c[map.office] : null,
      };
    });
  }


  /* ---- group by pincode ---------------------------------------------- */
  const groups = new Map(); // pincode -> { districts:[], states:[], offices:n }
  const stateNames = new Set();
  let badPin = 0;
  for (const r of recs) {
    const pin = (clean(r.pincode) ?? '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(pin)) { badPin++; continue; }
    let g = groups.get(pin);
    if (!g) { g = { districts: [], states: [], offices: 0 }; groups.set(pin, g); }
    g.offices++;
    /* GeoNames states are already properly cased ("Andaman & Nicobar
       Islands"); India Post SHOUTS them. titleCase is idempotent on the
       former, so one path handles both. */
    const d = titleCase(clean(r.district));
    const st = fixState(titleCase(clean(r.state)));
    if (d) g.districts.push(d);
    if (st) { g.states.push(st); stateNames.add(st); }
  }

  const rows = [];
  const ambiguous = [];
  for (const [pincode, g] of groups) {
    const d = mode(g.districts);
    const s = mode(g.states);
    const amb = d.distinct > 1 || s.distinct > 1;
    if (amb) ambiguous.push({ pincode, districts: d.distinct, states: s.distinct, took: `${d.best ?? '—'} / ${s.best ?? '—'}` });
    rows.push({ pincode, city: d.best, state: s.best, sources: g.offices, ambiguous: amb });
  }
  rows.sort((a, b) => a.pincode.localeCompare(b.pincode));

  console.log(`\nparsed   : ${rows.length} distinct pincodes, collapsed from ${recs.length} locality rows`);
  console.log(`states   : ${stateNames.size} distinct`);
  if (badPin) console.log(`skipped  : ${badPin} rows without a 6-digit pincode`);
  console.log(`ambiguous: ${ambiguous.length} pincodes whose post offices disagreed on district or state`);

  if (SHOW_AMBIG) {
    console.log('\nthe disagreements (pincode · distinct districts/states · what was taken):');
    for (const a of ambiguous.slice(0, 200)) console.log(`  ${a.pincode}  ${a.districts}d/${a.states}s  -> ${a.took}`);
    if (ambiguous.length > 200) console.log(`  … and ${ambiguous.length - 200} more`);
    console.log('\n--ambiguous: nothing written.');
    return;
  }

  /* Raw, for the same reason as import-ifsc.js: the dry run must work before
     the client knows these models. */
  const [{ n: livePins }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "PincodeMaster"');
  console.log(`live now : ${livePins} pincodes`);
  if (!APPLY) {
    console.log('\nsample   :');
    for (const r of rows.slice(0, 3)) console.log(`  ${r.pincode}  ${r.city ?? '—'} / ${r.state ?? '—'}  (${r.sources} office${r.sources === 1 ? '' : 's'}${r.ambiguous ? ', AMBIGUOUS' : ''})`);
    console.log('\n--dry-run (default): nothing written. Re-run with --apply, or --ambiguous to review the disagreements first.');
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    slice.forEach((r, k) => {
      const b = k * 5;
      vals.push(`(gen_random_uuid(), $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, true, now(), now())`);
      params.push(r.pincode, r.city, r.state, r.sources, r.ambiguous);
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PincodeMaster" (id, pincode, city, state, sources, ambiguous, active, "createdAt", "updatedAt")
       VALUES ${vals.join(',')}
       ON CONFLICT (pincode) DO UPDATE SET
         city = EXCLUDED.city, state = EXCLUDED.state, sources = EXCLUDED.sources,
         ambiguous = EXCLUDED.ambiguous, "updatedAt" = now()`,
      ...params,
    );
    written += slice.length;
  }

  /* Seed StateMaster — ADD ONLY. `ON CONFLICT DO NOTHING`, because an operator
     may have fixed a name or a sort order and a refresh must not undo it. */
  /* LADAKH is added even though the directory never mentions it — see the
     STATE_FIXES note. A UT an applicant cannot select is worse than one whose
     pincodes still auto-fill the old state. */
  stateNames.add('Ladakh');
  const names = [...stateNames].sort();
  /* REFUSE A NUMERIC NAME. This exact seed shipped junk once — a patch script
     lost a $ from the SQL placeholder, so `$1` became `1` and 35 states were
     inserted named "1"…"35". A guard at the point of writing catches that
     whatever mangles the statement, where grepping for the pattern only catches
     it where I remember to look (and it was missed in this very file). */
  if (names.some((n) => /^[0-9]+$/.test(n))) {
    console.error(`REFUSING: a state name is purely numeric — the insert statement is malformed, not the data.`);
    process.exit(1);
  }
  if (names.length) {
    const vals = names.map((_, k) => `(gen_random_uuid(), $${k + 1}, 100, true, now(), now())`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "StateMaster" (id, name, "sortOrder", active, "createdAt", "updatedAt")
       VALUES ${vals.join(',')} ON CONFLICT (name) DO NOTHING`,
      ...names,
    );
  }

  console.log(`\nDONE     : ${written} pincodes upserted`);
  const [{ n: pins }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "PincodeMaster"');
  const [{ n: amb }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "PincodeMaster" WHERE ambiguous');
  const [{ n: sts }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "StateMaster"');
  console.log(`live now : ${pins} pincodes (${amb} ambiguous), ${sts} states`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
