const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the whole workspace and resolve from both module trees.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Pin EVERY import of `react` (and react/jsx-runtime etc.) to the app's own
// copy. The repo root hoists React 18.3.x for Next.js; Expo 51 ships 18.2.0 —
// if both land in one bundle React crashes with "Invalid hook call". Normal
// hierarchical lookup stays ON so react-native's nested deps keep resolving.
const REACT_DIR = path.resolve(projectRoot, 'node_modules/react');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const redirected = moduleName === 'react' ? REACT_DIR : REACT_DIR + moduleName.slice('react'.length);
    return context.resolveRequest(context, redirected, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
