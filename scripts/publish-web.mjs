/**
 * Publish the static export into the directory IIS serves.
 *
 * WHY THIS EXISTS: `next build` clears its export directory before writing it.
 * While that directory WAS the live one, a clear that died half way took the
 * site down — 2026-10-16, `ENOTEMPTY: rmdir out\hi\ipos`, ~25 minutes of
 * outage for a build whose 2,601 pages had all generated fine. The build now
 * writes to `out-staging/` (see next.config.mjs) and this script copies it
 * across, so a failed build cannot reach what is being served.
 *
 *   node scripts/publish-web.mjs [--dry-run] [--min-ipo-pages N] [--force]
 *
 * TWO ROBOCOPY PASSES, AND THE ORDER IS LOAD-BEARING: copy first WITHOUT
 * deleting, then purge. A single `/MIR` can remove a hashed chunk before the
 * HTML that replaces it has landed, and a visitor mid-publish then 404s an
 * asset. Retries are on (`/R:3 /W:2`) because a locked file is exactly the
 * failure class this whole change exists for — robocopy retries where Next's
 * rmdir simply aborted.
 */
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '..', 'apps', 'web');
const STAGING = join(WEB, process.env.WEB_EXPORT_DIR || 'out-staging');
const LIVE = join(WEB, 'out');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = has('--dry-run');
const FORCE = has('--force');

const dirCount = (p) => { try { return readdirSync(p).length; } catch { return 0; } };
const size = (p) => { try { return statSync(p).size; } catch { return 0; } };

/* ------------------------------------------------------------------ the gate
 * Refuses to publish a build that looks wrong. Existence is the cheap half;
 * the floor on page count is the half that matters, because the documented
 * catastrophic build here is NOT a crash — it is `safeGet` swallowing a dead
 * API and collapsing every dynamic route to the single `no-ipos` placeholder.
 * That build exits 0 and looks perfect in the log.
 */
const liveIpos = dirCount(join(LIVE, 'ipos'));
const MIN_IPOS = Number(arg('--min-ipo-pages', Math.max(100, Math.floor(liveIpos * 0.8))));

const checks = [
  ['staging directory exists', () => existsSync(STAGING), STAGING],
  ['index.html >= 1 MB', () => size(join(STAGING, 'index.html')) >= 1_000_000,
    `${size(join(STAGING, 'index.html')).toLocaleString()} bytes`],
  ['web.config present', () => size(join(STAGING, 'web.config')) > 0,
    'carries the canonical 301 + the SPA fallbacks'],
  ['_next/static present', () => existsSync(join(STAGING, '_next', 'static')), ''],
  [`ipo pages >= ${MIN_IPOS}`, () => dirCount(join(STAGING, 'ipos')) >= MIN_IPOS,
    `${dirCount(join(STAGING, 'ipos'))} built, live has ${liveIpos}`],
  ['home page is a real render', () => {
    try { return /<title[^>]*>/i.test(readFileSync(join(STAGING, 'index.html'), 'utf8').slice(0, 20000)); }
    catch { return false; }
  }, ''],
];

console.log(`staging : ${STAGING}`);
console.log(`live    : ${LIVE}\n`);

let failed = 0;
for (const [name, fn, detail] of checks) {
  let ok = false;
  try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

if (failed && !FORCE) {
  console.error(`\nREFUSING TO PUBLISH — ${failed} check(s) failed. The live site is untouched.`);
  console.error('Fix the build and re-run. --force overrides, and should need a reason.');
  process.exit(1);
}
if (failed && FORCE) console.warn(`\n--force: publishing anyway over ${failed} failed check(s).`);

if (DRY) { console.log('\n--dry-run: nothing copied.'); process.exit(0); }

/* --------------------------------------------------------------- the publish */
const robo = (args, label) => {
  console.log(`\n${label}`);
  const r = spawnSync('robocopy', args, { stdio: 'inherit', shell: false });
  // Robocopy exit codes are a BITMASK, not a status: 0-7 are success (bit 0 =
  // files copied, bit 1 = extras removed, bit 2 = mismatches). 8 and above are
  // real failures. Treating non-zero as failure here would fail every publish.
  const code = r.status ?? 16;
  if (code >= 8) { console.error(`robocopy failed (exit ${code})`); process.exit(1); }
  return code;
};

const COMMON = ['/R:3', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'];
robo([STAGING, LIVE, '/E', ...COMMON], 'pass 1/2  copy new and changed files (no deletions yet)');
robo([STAGING, LIVE, '/MIR', ...COMMON], 'pass 2/2  remove files no longer in the build');

const ok = size(join(LIVE, 'index.html')) >= 1_000_000 && size(join(LIVE, 'web.config')) > 0;
console.log(`\n${ok ? 'PUBLISHED' : 'PUBLISH LOOKS WRONG'} — live index.html ${size(join(LIVE, 'index.html')).toLocaleString()} bytes, ` +
            `web.config ${size(join(LIVE, 'web.config')).toLocaleString()} bytes, ${dirCount(join(LIVE, 'ipos'))} ipo pages`);
process.exit(ok ? 0 : 1);
