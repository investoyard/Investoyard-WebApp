#!/usr/bin/env node
/*
 * Build the partner designs as PREVIEWS and publish them under
 * investoyard.com/partner-preview/<variant>/, which is what the admin's
 * Site layout panel loads in its live preview.
 *
 *   node scripts/publish-preview.mjs                  all five
 *   node scripts/publish-preview.mjs horizon ledger   just these
 *
 * Each preview is built with a base path (/partner-preview/<variant>) into
 * out-preview/<variant>, checked by check-export.mjs exactly like a normal
 * build, and only then copied into apps/web/out/partner-preview/<variant>.
 * A variant that fails to build or check is not published, and the ones
 * already live stay as they were.
 *
 * The web publish (scripts/publish-web.mjs) excludes partner-preview from its
 * purge, so a website deploy or the nightly rebuild cannot delete these.
 * Previews are noindex and robots.txt disallows the path: they carry a
 * placeholder broker under our own domain.
 *
 * Run `node scripts/api-forward.js --check` from the repo root first; the
 * build reads the catalogue through that forwarder.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALL = ['sterling', 'bento', 'terminal', 'horizon', 'ledger'];
const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const webOut = path.join(app, '..', 'web', 'out');
const asked = process.argv.slice(2);
const list = asked.length ? asked : ALL;
for (const v of list) if (!ALL.includes(v)) { console.error(`unknown variant "${v}" — one of ${ALL.join(', ')}`); process.exit(2); }
if (!existsSync(path.join(webOut, 'index.html'))) { console.error(`no live web export at ${webOut}; refusing to publish into it`); process.exit(1); }

const robo = (src, dst, mode) => {
  const r = spawnSync('robocopy', [src, dst, mode, '/R:3', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'inherit', shell: false });
  // Robocopy's exit code is a BITMASK: 0-7 are success, 8 and above are failures.
  return (r.status ?? 16) < 8;
};

const results = [];
for (const v of list) {
  console.log(`\n=== ${v}: building preview ===`);
  const env = { ...process.env, PARTNER_BASE_PATH: `/partner-preview/${v}`, PARTNER_EXPORT_DIR: `out-preview/${v}` };
  const b = spawnSync(process.execPath, [path.join(app, 'scripts', 'build.mjs'), v], { cwd: app, env, stdio: 'inherit' });
  if (b.status !== 0) { results.push([v, 'NOT PUBLISHED — build or check failed']); continue; }
  const src = path.join(app, 'out-preview', v);
  const dst = path.join(webOut, 'partner-preview', v);
  // Copy first, purge second, so a visitor mid-publish never meets a page whose chunk is already gone.
  const ok = robo(src, dst, '/E') && robo(src, dst, '/MIR');
  results.push([v, ok ? `published to /partner-preview/${v}/` : 'NOT PUBLISHED — copy failed']);
}

console.log('\n' + results.map(([v, r]) => `${v.padEnd(9)} ${r}`).join('\n'));
process.exit(results.some(([, r]) => r.startsWith('NOT')) ? 1 : 0);
