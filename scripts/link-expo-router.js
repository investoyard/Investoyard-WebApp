#!/usr/bin/env node
/*
 * Monorepo hoisting fixup for Expo Router.
 *
 * npm hoists `babel-preset-expo` to the workspace-root node_modules, but leaves
 * `expo-router` in apps/mobile/node_modules. babel-preset-expo decides whether to
 * run the expo-router Babel transform (which inlines EXPO_ROUTER_APP_ROOT into
 * expo-router/_ctx.*.js) by calling plain `require.resolve('expo-router')` from
 * its own location — i.e. from the root. If expo-router is not resolvable there,
 * the transform is skipped and Metro bundling fails with:
 *   "Invalid call ... process.env.EXPO_ROUTER_APP_ROOT ... should be a string".
 *
 * We can't hoist expo-router via the dependency graph (its peers drag React 19 to
 * the root, conflicting with React Native's React 18.2). Instead we make it
 * resolvable from the root by linking it in. Runs on postinstall so it survives
 * every `npm install`. Idempotent; no-op if already correct.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'apps', 'mobile', 'node_modules', 'expo-router');
const target = path.join(root, 'node_modules', 'expo-router');

function log(msg) { console.log(`[link-expo-router] ${msg}`); }

if (!fs.existsSync(source)) {
  log(`source not found (${source}); nothing to link — skipping.`);
  process.exit(0);
}

// If a real (non-link) expo-router already sits at the root, leave it alone.
try {
  const st = fs.lstatSync(target);
  if (st.isSymbolicLink()) {
    if (fs.realpathSync(target) === fs.realpathSync(source)) { log('already linked — ok.'); process.exit(0); }
    fs.rmSync(target, { recursive: true, force: true });
  } else if (st.isDirectory()) {
    // A hoisted copy exists and resolves fine; don't disturb it.
    log('root expo-router already present (real dir) — ok.'); process.exit(0);
  }
} catch { /* target does not exist yet */ }

try {
  fs.symlinkSync(source, target, 'junction'); // 'junction' = Windows; ignored flag on POSIX
  log(`linked root -> apps/mobile (${target})`);
} catch (e) {
  log(`symlink failed (${e.code}); falling back to copy`);
  fs.cpSync(source, target, { recursive: true });
  log('copied expo-router into root node_modules');
}
