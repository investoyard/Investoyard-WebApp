#!/usr/bin/env node
/**
 * setup-hooks.js — point git at the tracked hooks directory.
 *
 * Git hooks stored under `.git/hooks/` are per-clone and not tracked,
 * so a shared hook can only survive if git is told to look somewhere
 * else. This script sets `core.hooksPath scripts/hooks`, which git
 * reads from repository-local config (also not tracked, but re-armed
 * automatically because this script runs on every `npm install` via
 * postinstall).
 *
 * Safe to re-run: `git config --local` overwrites the same value.
 * Silent no-op outside a git working tree (a tarball build wouldn't
 * have a .git — no hook to install, no error to raise).
 */

const { execSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.resolve(__dirname, '..');
const HOOKS_DIR = 'scripts/hooks';

// Bail silently if this checkout isn't a git working tree — running
// postinstall from a plain tarball extract is a valid scenario and
// should never fail the install.
if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) return;

try {
  const before = spawnSync('git', ['config', '--local', 'core.hooksPath'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  }).stdout.trim();
  if (before === HOOKS_DIR) return;   // already set — no message, no noise

  execSync(`git config --local core.hooksPath ${HOOKS_DIR}`, { cwd: REPO_ROOT });
  console.log(`✓ git hooks: core.hooksPath → ${HOOKS_DIR}`);

  // On Windows / Git Bash the exec bit is decorative but harmless.
  // On macOS / Linux hooks need it or git will silently skip them.
  const hook = path.join(REPO_ROOT, HOOKS_DIR, 'pre-push');
  if (fs.existsSync(hook)) {
    try { fs.chmodSync(hook, 0o755); } catch { /* ignore on Windows */ }
  }
} catch (e) {
  console.warn(`(setup-hooks: skipped — ${e && e.message ? e.message : e})`);
}
