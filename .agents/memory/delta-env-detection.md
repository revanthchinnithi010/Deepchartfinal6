---
name: Delta Exchange environment auto-detection
description: Delta India vs International are separate platforms with separate key namespaces; invalid_api_key means wrong endpoint, not wrong credentials.
---

# Delta Exchange environment auto-detection

## The Rule
`invalid_api_key` from Delta means the key does not exist in that platform's namespace.
It does NOT mean the signing is wrong — that would be `invalid_signature`.

Delta runs two completely separate platforms:
- **International**: REST `https://api.delta.exchange` / WS `wss://socket.delta.exchange`
- **India**: REST `https://api.india.delta.exchange` / WS `wss://socket.india.delta.exchange`

An India key sent to the International endpoint always returns `invalid_api_key`, and vice versa.

**Why:** Delta India and International are separate legal entities with separate databases of accounts and API keys.

## How to Apply
1. During `validateDeltaCredentials`: probe **both** endpoints concurrently using `Promise.allSettled`.
2. Whichever returns `success: true` is the user's environment.
3. Store `base_url`, `ws_url`, `env_name` in the `meta` JSONB column of `broker_accounts`.
4. `BrokerService.createAdapter` reads `meta.base_url` and passes it to `DeltaTradingAdapter(apiKey, apiSecret, authMode, baseOrigin)`.
5. `deltaSocket.ts startSession` accepts a `wsUrl` parameter; `broker_delta.ts` WS-start route reads `meta.ws_url` from DB and passes it through.
6. Legacy rows without `base_url`/`ws_url` in meta fall back to International silently.

## Signing format (still required; separate issue)
Payload: `METHOD + TIMESTAMP(seconds) + FULL_PATH + QUERY_STRING + BODY`
- FULL_PATH **must include /v2** (e.g. `/v2/wallet/balances`) — omitting `/v2` causes `invalid_signature`
- TIMESTAMP: `Math.floor(Date.now() / 1000)` — seconds, NOT milliseconds
- BODY: empty string `""` for GET requests
- Header names: `api-key`, `timestamp`, `signature` (all lowercase)
