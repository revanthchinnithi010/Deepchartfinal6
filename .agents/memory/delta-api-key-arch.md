---
name: Delta Exchange API Key architecture
description: Full Delta Exchange broker connection using API Key + HMAC SHA256 — NOT OAuth
---

## Auth method
API Key + API Secret, HMAC-SHA256 signing. No OAuth. `types/broker.ts` has `authType: "api_key"` for Delta.

## Backend modules
- `artifacts/api-server/src/services/deltaSigner.ts` — `signDeltaRequest()`, `buildDeltaAuthHeaders()`, `buildDeltaWsAuthPayload()`
- `artifacts/api-server/src/services/deltaAuth.ts` — `validateDeltaCredentials(apiKey, apiSecret)` — calls `/v2/wallet/balances`, returns `{valid, error, usdtBalance}`
- `artifacts/api-server/src/ws/deltaSocket.ts` — `DeltaSocketManager` singleton exported as `deltaSocketManager`

## WS auth protocol (Delta private WS)
- URL: `wss://socket.delta.exchange`
- Auth signature: `HMAC-SHA256(apiSecret, "GET" + timestamp + "/live")` where timestamp = UNIX seconds string
- Auth message: `{type:"auth", payload:{"api-key","signature","timestamp"}}`
- On `auth_result` with `success:true` → subscribe channels: `v2/user_balance`, `v2/orders`, `v2/position_lifecycle`
- Events broadcasted via `wsManager.broadcast()` as: `delta_balance`, `delta_orders`, `delta_positions`
- Status updates: `delta_ws_status` with `status: "connecting"|"connected"|"reconnecting"|"failed"`
- Heartbeat: send `{type:"heartbeat"}` every 15s, timeout if no pong in 8s

## deltaSocketManager lifecycle
- `setWsManager(wsManager)` — called once at server startup in `index.ts`
- `startSession(accountId, apiKey, apiSecret)` — decrypted creds passed in; reconnect backoff 1s → 30s max
- `stopSession(accountId)` — terminates WS and clears timers
- Sessions auto-stop if auth fails (bad credentials)

## REST routes (broker_delta.ts)
- `POST /api/broker/delta/validate` — validate raw credentials, no account needed
- `POST /api/broker/delta/ws/start` — requires `X-Broker-Account-Id` + `X-Broker-Token`; decrypts creds server-side and starts WS session
- `DELETE /api/broker/delta/ws/stop` — stops WS session for account
- All existing REST routes kept: balance, positions, orders, place/cancel order, close position

## broker_accounts.ts — Delta flow
Delta is now accepted (removed OAuth rejection). Flow:
1. `POST /api/broker-accounts` with `{broker_id:"delta", api_key, api_secret, label}`
2. Backend calls `validateDeltaCredentials()` — 401 if fails with user-friendly error
3. On success: encrypts + stores, sets `meta: {auth_mode: "api_key"}`, returns `{ok, account, api_token}`
4. Frontend stores `api_token` in `localStorage["tj_broker_token_<id>"]`
5. Frontend POSTs to `/api/broker/delta/ws/start` to begin private WS relay

## Frontend components
- `src/components/broker/DeltaApiConnectForm.tsx` — standalone form: API Key + API Secret + Label; handles full connection flow + WS start
- `src/components/broker/BrokerConnectModal.tsx` — full glassmorphism modal shell; routes to DeltaApiConnectForm / CTraderOAuthPanel / Mt5CredentialsForm
- `src/components/broker/BrokerAuthModal.tsx` — thin re-export: `export { BrokerConnectModal as BrokerAuthModal }`
- charts.tsx still imports `BrokerAuthModal` — backward compat maintained

## UI spec
Background: #000, Glass: rgba(18,18,18,0.72), Border: rgba(255,255,255,0.08), Glow: rgba(0,255,180,0.12)
Delta accent: #F97316 (orange). Success: #00FFB4. Error: #EF4444.

**Why:** User explicitly rejected OAuth for Delta. HMAC SHA256 is Delta's native API auth. Secret never leaves backend — signed server-side. API secret encrypted at rest with AES-256-CBC.
