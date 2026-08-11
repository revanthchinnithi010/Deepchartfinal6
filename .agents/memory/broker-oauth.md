---
name: Broker OAuth Architecture
description: How cTrader OAuth popup flow and MT5 credentials flow work end-to-end
---

## cTrader OAuth popup flow

1. Frontend calls `GET /api/ctrader/config` — backend stores OAuth state in session, returns `authUrl`
2. Frontend opens `window.open(authUrl, "ctrader_oauth", ...)` popup
3. Popup navigates to Spotware's login; on completion Spotware redirects to `/api/ctrader/callback`
4. Callback: validates state, calls `ctrader.handleOAuthCode()`, gets `ctrader.currentAccessToken`
5. Callback fetches live trading account from Spotware REST (`/connect/tradingaccounts`)
6. Callback upserts `broker_accounts` row: `api_key_enc=encrypt(accessToken)`, `api_secret_enc=encrypt(ctidAccountId)`
7. Callback stores `{accountId, apiToken, label}` in `req.session.pendingBrokerAccount`, serves popup-close HTML with `postMessage`
8. Frontend receives `postMessage`, calls `GET /api/ctrader/pending-account` to claim the pending account from session
9. Token stored in `localStorage` as `tj_broker_token_${accountId}`

**Why popup + session:**
- OAuth state validation (CSRF protection) requires the same session across /config and /callback
- `sameSite:"none"` + `secure:true` allows cross-origin popup ↔ main window session sharing
- `postMessage` from popup → opener signals completion without polling

## MT5 credentials flow

- Form: `mt5_server`, `mt5_login`, `mt5_password`
- Stored as: `api_key_enc=encrypt("${server}||${login}")`, `api_secret_enc=encrypt(password)`
- MT5TradingAdapter parses by splitting on `"||"`
- Gateway URL from `MT5_GATEWAY_URL` env var; headers: `X-MT5-Server`, `X-MT5-Login`, `X-MT5-Password`
- If `MT5_GATEWAY_URL` is not set, `testConnection()` returns false — user gets clear error

## BrokerService adapter creation
- `createAdapter(brokerId, apiKey, apiSecret)` dispatches to adapter constructors
- ctrader: `new CTraderTradingAdapter(apiKey=accessToken, apiSecret=ctidAccountId)`
- mt5: `new MT5TradingAdapter(apiKey="server||login", apiSecret=password)`

## CTraderService getter
- Added `get currentAccessToken(): string | null { return this.accessToken; }` to CTraderService.ts
- Used in callback to get the freshly-exchanged token without coupling to DB

## Token refresh limitation
- Stored access_token expires (~1 hour for cTrader); reconnecting via OAuth re-runs the full flow
- No automatic refresh of stored api_key_enc — user must re-connect when token expires
