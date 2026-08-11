#!/usr/bin/env bash
set -euo pipefail

echo "[deploy-build] Starting production build..."

echo "[deploy-build] Installing workspace dependencies..."
pnpm install --frozen-lockfile

echo "[deploy-build] Building API server..."
pnpm --filter @workspace/api-server run build

echo "[deploy-build] Building trading-journal web app..."
pnpm --filter @workspace/trading-journal run build

echo "[deploy-build] Building trading-journal-tablet..."
pnpm --filter @workspace/trading-journal-tablet run build

echo "[deploy-build] Done."
