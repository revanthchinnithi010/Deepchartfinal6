#!/bin/bash
set -e

echo "[post-merge] Installing workspace dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "[post-merge] Pushing DB migrations..."
pnpm --filter @workspace/db push 2>/dev/null || true

echo "[post-merge] Done."
