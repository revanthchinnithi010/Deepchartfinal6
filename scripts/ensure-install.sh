#!/bin/bash
# Ensures workspace-root node_modules are fully installed before any artifact dev server starts.
# Uses a sentinel file so a broken/partial install is retried on next startup.
# Uses a file lock so concurrent workflow starts don't collide during install.
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SENTINEL="$WORKSPACE_ROOT/node_modules/.install-complete"
LOCKFILE="$WORKSPACE_ROOT/.install.lock"

if [ ! -f "$SENTINEL" ]; then
  (
    flock -x 200
    # Re-check inside the lock — another process may have finished first
    if [ ! -f "$SENTINEL" ]; then
      echo "[ensure-install] node_modules missing or incomplete — installing workspace dependencies..."
      cd "$WORKSPACE_ROOT"
      pnpm install && touch "$SENTINEL" && echo "[ensure-install] install complete"
    fi
  ) 200>"$LOCKFILE"
fi
