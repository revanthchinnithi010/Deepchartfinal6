---
name: cTrader ProtoOA transport — raw TLS not WebSocket
description: ProtoOA port 5035 is a raw TLS TCP socket, NOT WebSocket. Using ws library gives "Bye" close. tls.connect() gives APP_AUTH_RES.
---

# cTrader ProtoOA Transport

## Rule
Port 5035 (`demo.ctraderapi.com:5035`) is a **raw TLS TCP socket**, not WebSocket.

**Why:** `connect-js-adapter-tls` (official Spotware SDK) uses `tls.connect(port, host)`, not WebSocket. The port accepts HTTP Upgrade (so `ws` library "connects") but rejects any protobuf sent inside WS frames with WebSocket close code=1000 reason="Bye".

**How to apply:** Use `tls.connect({ host, port, rejectUnauthorized: false })` in Node.js. Framing is 4-byte BE length prefix + protobuf ProtoMessage body — same as the official SDK's `connect-js-encode-decode`.

## Verified working (raw TLS test)
- `ApplicationAuthReq` sent via `sock.write(frame)` → server responds `APP_AUTH_RES (payloadType=2101)`
- Full clientId format confirmed: `{numericAppId}_{longAlphanumeric}` (e.g. `"26547_5Ayg..."`) — numeric-only returns ERROR_RES

## Flow (raw TLS)
1. `tls.connect(5035, 'demo.ctraderapi.com')` — raw socket, no HTTP upgrade
2. Send ApplicationAuthReq → receive APP_AUTH_RES
3. Send AccountAuthReq (ctidTraderAccountId + accessToken) → receive ACCT_AUTH_RES
4. Send SymbolsListReq → receive SYMBOL_LIST_RES
5. Send SymbolByIdReq → receive SYMBOL_BY_ID_RES

## Implementation
`artifacts/api-server/src/lib/ctraderProtoOA.ts` — `makeTlsConn()` helper, `fetchSymbolsViaProtoOA()`, `probeAppAuth()`
