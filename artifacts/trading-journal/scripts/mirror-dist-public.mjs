#!/usr/bin/env node
// Mirrors the Vite build output (dist/) into dist/public/ as well.
//
// Why this exists:
// - Railway's frontend service runs `vite preview` (see package.json
//   "serve" script), which serves straight from Vite's configured
//   build.outDir — now "dist" (dist/index.html, dist/assets/...).
// - Replit's artifact config (.replit-artifact/artifact.toml) is fixed to
//   `publicDir = "artifacts/trading-journal/dist/public"` and serves that
//   directory as a static site.
//
// Rather than building twice or maintaining two outDir configs, `vite
// build` writes once to "dist", and this script copies that output into
// "dist/public" immediately after, so both platforms find a complete,
// identical build from a single `pnpm run build`.
//
// Implementation note: dist/public can't be populated with a plain
// recursive copy of dist itself (Node's fs.cpSync rejects copying a
// directory into its own subdirectory — ERR_FS_CP_EINVAL). Instead we copy
// dist into a sibling temp directory first, then move that temp directory
// into place as dist/public.

import { cpSync, rmSync, existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const distDir = path.join(packageRoot, "dist");
const tmpDir = path.join(packageRoot, "dist-tmp-mirror");
const publicDir = path.join(distDir, "public");

if (!existsSync(distDir)) {
  console.error(
    `[mirror-dist-public] "${distDir}" does not exist — run \`vite build\` first.`,
  );
  process.exit(1);
}

rmSync(tmpDir, { recursive: true, force: true });
cpSync(distDir, tmpDir, { recursive: true });
rmSync(publicDir, { recursive: true, force: true });
renameSync(tmpDir, publicDir);

console.log("[mirror-dist-public] mirrored dist/ -> dist/public/");
