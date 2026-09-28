const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm workspace: this app has its own node_modules, but shared libs live
// outside it — Metro's watcher only sees projectRoot by default, so add the
// monorepo root or edits under libs/** never trigger a rebuild.
config.watchFolders = [workspaceRoot];

// pnpm's content-addressable store symlinks packages into .pnpm/ rather
// than hoisting flat copies like npm/yarn — Metro needs both node_modules
// directories on its resolution path, and needs to actually follow those
// symlinks instead of treating them as opaque/missing.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;

// libs/contracts and libs/locales are consumed as TS source, not built
// packages — same convention the backend services use via tsconfig `paths`
// (see apps/api-gateway/tsconfig.json) and the web app via Vite's
// resolve.alias (see apps/web/vite.config.ts). Metro has no equivalent to
// either, so it's wired here explicitly. Keep in sync with the `paths`
// entries in tsconfig.json (those are for the editor/type-checker only —
// they don't affect what Metro actually bundles).
config.resolver.extraNodeModules = {
  '@household/contracts': path.resolve(workspaceRoot, 'libs/contracts/src'),
  '@household/locales': path.resolve(workspaceRoot, 'libs/locales/src'),
};

module.exports = config;
