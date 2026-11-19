#!/usr/bin/env node
/*
 * Build the partner designs for PRODUCTION and publish them where partner
 * domains are served from: apps/web/out/_partner/<variant>/.
 *
 *   node scripts/publish-live.mjs                 all five
 *   node scripts/publish-live.mjs prism sterling  just these
 *
 * Every partner domain shares investoyard.com's folder and web.config. A
 * partner who is switched on and has picked a design is routed to
 * _partner/<design>/ by the host map that scripts/partner-routes.js (repo
 * root) writes; this script only keeps those exports fresh.
 *
 * Each variant is built (no base path) into out/<variant>, refused by
 * check-export.mjs unless it is the right design with a full catalogue, and
 * only then copied — copy pass first, purge second, so a visitor mid-publish
 * never meets a page whose chunk is already gone. A variant that fails is not
 * published and the live copy stays as it was. The website deploy excludes
 * _partner/ from its purge.
 *
 * Run `node scripts/api-forward.js --check` from the repo root first.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALL = ['sterling', 'bento', 'terminal', 'horizon', 'prism'];
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

/* A production build: no base path, the default export folder, the public API. A stray preview setting in the caller's shell must not leak in. */
const env = { ...process.env };
for (const k of ['PARTNER_BASE_PATH', 'PARTNER_EXPORT_DIR', 'PARTNER_ASSET_PREFIX', 'NEXT_PUBLIC_API_URL']) delete env[k];

const results = [];
for (const v of list) {
  console.log(`\n=== ${v}: building for production ===`);
  let b = spawnSync(process.execPath, [path.join(app, 'scripts', 'build.mjs'), v], { cwd: app, env, stdio: 'inherit' });
  /* One retry: the next/font and EISDIR flakes documented for apps/web have both succeeded on a first retry. */
  if (b.status !== 0) { console.log(`\n${v}: build failed, retrying once`); b = spawnSync(process.execPath, [path.join(app, 'scripts', 'build.mjs'), v], { cwd: app, env, stdio: 'inherit' }); }
  if (b.status !== 0) { results.push([v, 'NOT PUBLISHED — build or check failed']); continue; }
  const src = path.join(app, 'out', v);
  const dst = path.join(webOut, '_partner', v);
  const ok = robo(src, dst, '/E') && robo(src, dst, '/MIR');
  results.push([v, ok ? `published to _partner/${v}/` : 'NOT PUBLISHED — copy failed']);
}

console.log('\n' + results.map(([v, r]) => `${v.padEnd(9)} ${r}`).join('\n'));
process.exit(results.some(([, r]) => r.startsWith('NOT')) ? 1 : 0);
