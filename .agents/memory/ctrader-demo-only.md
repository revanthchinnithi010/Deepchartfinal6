---
name: cTrader DEMO-only app diagnosis
description: How CTraderService detects and surfaces the "app registered DEMO-only but accounts are LIVE" error, and how the UI displays it.
---

## The rule
When an Open API app is registered for Demo only on the Spotware portal, the live endpoint (live.ctraderapi.com:5036) returns `UNKNOWN_ERROR / "Corrupted frame."` on App Auth. This is NOT a credential error — the same credentials work fine on the demo endpoint.

**Why:** Spotware's live gateway rejects demo-only apps at the TLS frame level, not with a meaningful error code.

## How CTraderService handles it
1. Live endpoint → "Corrupted frame" during `app_auth` → auto-probe flips to demo (`endpointProbe=1`)
2. Demo endpoint → App Auth OK → GET_ACCOUNTS succeeds, finds LIVE accounts (isLive=true)
3. `liveEndpointUpgradeAttempted=true` → reconnect to live for Account Auth
4. Live endpoint (again) → "Corrupted frame" AND `liveEndpointUpgradeAttempted=true` → **DEMO-only branch fires**
5. `this.lastError` set to a message containing the exact substring `"DEMO only"` (sentinel for the UI card)
6. `state` stays `"error"` via the `if (this.lastError)` guard in `onDisconnected()`; no auto-reconnect

## intentionalDisconnect flag
Set to `true` before destroying the socket for the live-endpoint upgrade teardown. Checked in the `sock.on("close")` handler BEFORE the diagnostic logging — prevents false "Connection closed during get_accounts" errors. Cleared to `false` at the top of `onDisconnected()`.

## UI error card (brokers.tsx FusionPanel)
Condition: `state === "error" && status?.lastError?.includes("DEMO only")`
Shows two action options:
- Option A: link to openapi.ctrader.com to register for Live access
- Option B: create a Demo trading account and re-authorise OAuth

## How to apply
If cTrader connection is stuck cycling LIVE→"Corrupted frame"→DEMO→success→LIVE→"Corrupted frame"→loop, the root cause is almost always a DEMO-only app registration. The sentinel substring `"DEMO only"` in `lastError` is the canonical check.
