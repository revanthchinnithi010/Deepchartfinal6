const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo so Metro can resolve shared packages.
config.watchFolders = [monorepoRoot];

// 2. Resolve packages from the package's own node_modules first, then fall
//    back to the monorepo root node_modules (for hoisted deps / pnpm shamefully-hoist).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Disable package exports field so Metro uses the classic resolution
//    strategy — avoids pnpm symlink loops that produce the
//    "Unable to resolve ./index from /home/runner/workspace/." error.
config.resolver.unstable_enablePackageExports = false;

// 4. Follow symlinks so Metro can traverse pnpm's virtual store layout.
//    pnpm hard-links package content into a global store and creates
//    directory symlinks in node_modules; without this flag Metro may fail
//    to locate binary assets (.ttf, .png) that live inside linked packages
//    (e.g. @expo-google-fonts/inter fonts), causing font-loading to stall.
config.resolver.unstable_enableSymlinks = true;

// 5. Exclude paths that can vanish at runtime from Metro's file watcher.
//    Metro watches the entire monorepo root (see watchFolders above), so any
//    directory that disappears after the initial walk causes FallbackWatcher
//    to throw ENOENT and crash the bundler.
//
//    - .local/  — Replit skills/integrations metadata (directories are deleted
//                 by the platform while Metro is running)
//    - drizzle-orm_tmp_*/  — drizzle-orm creates temporary directories during
//                 its postinstall step and removes them afterwards; Metro
//                 encounters them in the pnpm virtual store and tries to watch
//                 them, but they no longer exist by the time expo start runs.
config.resolver.blockList = [
  /\/\.local\/.*/,
  /\/drizzle-orm_tmp_[^/]+\/.*/,
];

module.exports = config;
