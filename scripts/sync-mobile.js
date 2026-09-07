#!/usr/bin/env node
/**
 * sync-mobile.js — mirror the mobile-relevant paths from the internal
 * monorepo (D:/Investoyard) into the mobile-only repo working tree
 * (D:/Investoyard-Mobile), so the two stay in step for a `git push`.
 *
 * What this ships:
 *   apps/mobile/                        → apps/mobile/
 *   packages/shared-types/              → packages/shared-types/
 *   packages/i18n/                      → packages/i18n/
 *   scripts/link-expo-router.js         → scripts/link-expo-router.js
 *
 * What this LEAVES ALONE in the mobile repo:
 *   .git/                                       (obviously)
 *   .gitignore, README.md, package.json         (mobile-repo-specific)
 *   any node_modules the mobile repo has installed locally
 *
 * Behaviour:
 *   • Idempotent — running twice with no source changes touches nothing.
 *   • True mirror — files removed in the monorepo are removed in the
 *     mirror (rsync --delete style). Without this, drift accumulates
 *     silently — a shared-types file renamed on the web side would keep
 *     its stale copy in the mobile repo, importing broken types.
 *   • Skips build artefacts and package caches on both sides
 *     (node_modules, .expo, .next, out, dist, .turbo, .cache, coverage).
 *   • Prints a per-path summary of copies / updates / deletes and, at
 *     the end, `git status --short` of the mirror so it's obvious what's
 *     staged for the next commit.
 *
 * Usage:
 *   node scripts/sync-mobile.js            # do the mirror + show summary
 *   node scripts/sync-mobile.js --dry-run  # report the diff, change nothing
 *   node scripts/sync-mobile.js --commit   # mirror, then commit + push
 *
 * Non-goals:
 *   • Not an npm publish flow for shared-types. Duplication is the
 *     accepted trade-off (see README of the mobile repo); if drift
 *     becomes painful, converting shared-types into a private GitHub
 *     package is the next step.
 *   • Not a merge tool. If the mobile repo has local edits to a mirrored
 *     path, this script OVERWRITES them. Local mobile-repo work should
 *     happen on the monorepo side.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SOURCE = path.resolve(__dirname, '..');            // D:/Investoyard
const TARGET = path.resolve(SOURCE, '..', 'Investoyard-Mobile');

if (!fs.existsSync(TARGET)) {
  console.error(`\n✗ Mirror directory not found: ${TARGET}`);
  console.error('  Create it first, git init the mobile repo, and add the origin remote before running this script.\n');
  process.exit(1);
}

/** Paths to mirror, relative to the repo root. Each entry is copied
 *  recursively; the target subtree is pruned to match. */
const MIRROR_PATHS = [
  'apps/mobile',
  'packages/shared-types',
  'packages/i18n',
  'scripts/link-expo-router.js',
];

/** Directory names that never cross the wire. Applies to both source
 *  (skip when copying out) and target (skip when pruning). */
const SKIP_DIRS = new Set([
  'node_modules',
  '.expo',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  'out',
  'dist',       // shared-types has a `dist/` — the mobile repo can rebuild it
  'build',
  '.DS_Store',
]);

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const COMMIT = args.has('--commit');

const stats = { copied: 0, updated: 0, deleted: 0, unchanged: 0 };
const changes = [];   // { kind, rel } for the summary log

/** true when `rel` is inside any SKIP_DIRS along its path. */
function isSkipped(rel) {
  return rel.split(path.sep).some((seg) => SKIP_DIRS.has(seg));
}

/** Walk a directory recursively, yielding {rel, abs, kind} for every
 *  file (not directory). Empty dirs are ignored — mirroring files
 *  handles the dir shape as a side effect. */
function* walk(root, rel = '') {
  const abs = path.join(root, rel);
  let ents;
  try { ents = fs.readdirSync(abs, { withFileTypes: true }); }
  catch (e) { return; }
  for (const ent of ents) {
    const nextRel = rel ? path.join(rel, ent.name) : ent.name;
    if (SKIP_DIRS.has(ent.name)) continue;
    if (ent.isDirectory()) {
      yield* walk(root, nextRel);
    } else if (ent.isFile()) {
      yield { rel: nextRel, abs: path.join(root, nextRel) };
    }
  }
}

/** Cheap content-equality check: same size + same mtime rounded to a
 *  second is treated as unchanged. mtime alone is unreliable across
 *  copies; size alone can miss same-length edits. Full byte-compare
 *  would be slower for no meaningful gain here. */
function unchanged(srcAbs, dstAbs) {
  try {
    const [s, d] = [fs.statSync(srcAbs), fs.statSync(dstAbs)];
    if (s.size !== d.size) return false;
    // Compare content when sizes match — cheap for these repos (< ~5 MB
    // of source) and rules out timestamp drift.
    const [a, b] = [fs.readFileSync(srcAbs), fs.readFileSync(dstAbs)];
    return a.equals(b);
  } catch { return false; }
}

function mkdirp(dir) {
  if (!DRY) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(srcAbs, dstAbs) {
  if (!DRY) {
    mkdirp(path.dirname(dstAbs));
    fs.copyFileSync(srcAbs, dstAbs);
  }
}

function deleteFile(abs) {
  if (!DRY) fs.unlinkSync(abs);
}

/** Recursively remove empty directories under `root`, stopping at
 *  `stopAt`. Called after deletes so the mirror doesn't accumulate
 *  empty scaffolding. */
function pruneEmptyDirs(root, stopAt) {
  if (DRY) return;
  const abs = path.resolve(root);
  if (abs === path.resolve(stopAt)) return;
  let ents;
  try { ents = fs.readdirSync(abs); } catch { return; }
  if (ents.length === 0) {
    try {
      fs.rmdirSync(abs);
      pruneEmptyDirs(path.dirname(abs), stopAt);
    } catch { /* ignore */ }
  }
}

/** Mirror one path (file or directory) from source to target.
 *  Returns true if any change was made. */
function mirror(rel) {
  const srcAbs = path.join(SOURCE, rel);
  const dstAbs = path.join(TARGET, rel);
  if (!fs.existsSync(srcAbs)) {
    console.warn(`  ! source path missing, skipping: ${rel}`);
    return;
  }
  const srcStat = fs.statSync(srcAbs);

  if (srcStat.isFile()) {
    if (isSkipped(rel)) return;
    if (fs.existsSync(dstAbs) && unchanged(srcAbs, dstAbs)) {
      stats.unchanged++;
    } else {
      const kind = fs.existsSync(dstAbs) ? 'updated' : 'copied';
      copyFile(srcAbs, dstAbs);
      stats[kind]++;
      changes.push({ kind, rel });
    }
    return;
  }

  // directory: mirror every source file under it, then prune target
  // files that no longer exist in source
  const seen = new Set();
  for (const { rel: sub } of walk(srcAbs)) {
    const nestedRel = path.join(rel, sub);
    if (isSkipped(nestedRel)) continue;
    seen.add(nestedRel);
    const s = path.join(SOURCE, nestedRel);
    const d = path.join(TARGET, nestedRel);
    if (fs.existsSync(d) && unchanged(s, d)) {
      stats.unchanged++;
    } else {
      const kind = fs.existsSync(d) ? 'updated' : 'copied';
      copyFile(s, d);
      stats[kind]++;
      changes.push({ kind, rel: nestedRel });
    }
  }

  // prune target files that have no source counterpart
  if (fs.existsSync(dstAbs)) {
    for (const { rel: sub, abs: dAbs } of walk(dstAbs)) {
      const nestedRel = path.join(rel, sub);
      if (isSkipped(nestedRel)) continue;
      if (!seen.has(nestedRel)) {
        deleteFile(dAbs);
        stats.deleted++;
        changes.push({ kind: 'deleted', rel: nestedRel });
      }
    }
    pruneEmptyDirs(dstAbs, TARGET);
  }
}

// ── main ────────────────────────────────────────────────────────────────
console.log('');
console.log('sync-mobile — mirroring monorepo → mobile repo');
console.log('  from:', SOURCE);
console.log('  to:  ', TARGET);
if (DRY) console.log('  mode: DRY-RUN (no writes)');
console.log('');

for (const rel of MIRROR_PATHS) {
  console.log('▸', rel);
  mirror(rel);
}

console.log('');
console.log('summary:');
console.log(`  copied:    ${stats.copied}`);
console.log(`  updated:   ${stats.updated}`);
console.log(`  deleted:   ${stats.deleted}`);
console.log(`  unchanged: ${stats.unchanged}`);

if (changes.length && changes.length <= 30) {
  console.log('\nchanges:');
  for (const { kind, rel } of changes) {
    const mark = kind === 'copied' ? '+' : kind === 'updated' ? '~' : '-';
    console.log(`  ${mark} ${rel}`);
  }
} else if (changes.length > 30) {
  console.log(`\n${changes.length} files changed — first 30 shown:`);
  for (const { kind, rel } of changes.slice(0, 30)) {
    const mark = kind === 'copied' ? '+' : kind === 'updated' ? '~' : '-';
    console.log(`  ${mark} ${rel}`);
  }
  console.log(`  … and ${changes.length - 30} more`);
}

if (DRY) {
  console.log('\n(dry-run — nothing written)');
  process.exit(0);
}

// Show git status of the mirror so the operator sees exactly what's staged
try {
  const status = execSync('git status --short', { cwd: TARGET }).toString().trim();
  console.log('\nmirror git status:');
  console.log(status ? status.split('\n').map((l) => '  ' + l).join('\n') : '  (clean — nothing to commit)');
} catch (e) {
  console.warn('\n(could not run git status in mirror — is it a git repo?)');
}

if (COMMIT && (stats.copied || stats.updated || stats.deleted)) {
  console.log('\ncommitting and pushing…');
  const iso = new Date().toISOString().slice(0, 10);
  execSync('git add -A', { cwd: TARGET, stdio: 'inherit' });
  execSync(`git commit -m "Sync from monorepo — ${iso}"`, { cwd: TARGET, stdio: 'inherit' });
  execSync('git push origin main', { cwd: TARGET, stdio: 'inherit' });
  console.log('\n✓ pushed.');
} else if (COMMIT) {
  console.log('\n(--commit passed but nothing changed; nothing to commit.)');
} else if (stats.copied || stats.updated || stats.deleted) {
  console.log('\nnext:  cd', TARGET, '&&  git add -A  &&  git commit  &&  git push');
  console.log('or:    node scripts/sync-mobile.js --commit');
}
console.log('');
