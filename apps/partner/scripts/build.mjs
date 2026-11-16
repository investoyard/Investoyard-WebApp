#!/usr/bin/env node
/*
 * Build one partner variant and refuse it unless the export is what it claims.
 *
 *   node scripts/build.mjs sterling
 *   node scripts/build.mjs bento
 *
 * `next build` exits 0 for a wrong-variant export and for a placeholder
 * catalogue alike, so the check runs as part of the build: a failed check is
 * a failed build.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const variant = process.argv[2];
if (!variant || !/^[a-z0-9-]+$/.test(variant)) { console.error('usage: build.mjs <variant>'); process.exit(2); }
const cwd = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, PARTNER_VARIANT: variant };

const build = spawnSync('npx', ['next', 'build'], { cwd, env, stdio: 'inherit', shell: true });
if (build.status !== 0) { console.error(`\nnext build failed for ${variant} (exit ${build.status})`); process.exit(build.status || 1); }
const check = spawnSync(process.execPath, [path.join(cwd, 'scripts', 'check-export.mjs'), variant], { cwd, env, stdio: 'inherit' });
process.exit(check.status ?? 1);
