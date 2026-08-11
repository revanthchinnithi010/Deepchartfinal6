---
name: Broker store architecture
description: brokerStore.ts design — dual-name fields, WS sync hook, per-broker polling, reconnect backoff
---

## Dual-name state fields (backward compat)
Every renamed field exists under both the old name and the new name. The `connect` action always writes both via helper fns:
- `syncAccount(a)` → sets `connectedBroker` + `activeAccount`
- `syncStatus(s)` → sets `brokerStatus` + `connectionStatus`
- `syncBalance(b)` → sets `accountBalance` + `balance`

Do NOT set one without the other — always use the sync helpers.

## Requested API (new names)
State: `connectedBroker`, `brokerStatus`, `accountBalance`, `websocketStatus`, `connectionLatency`, `reconnectingState`, `reconnectAttempts`, `lastSuccessfulPoll`, `activeSymbol`, `activeTimeframe`

Actions: `connectBroker`, `disconnectBroker`, `updateBalance`, `updatePositions`, `updateOrders`, `setLatency`, `setWebsocketStatus`, `handleWsMessage`, `setActiveSymbol`, `setActiveTimeframe`

Legacy aliases: `activeAccount`, `connectionStatus`, `balance`, `connect`, `disconnect`, `refreshBalance`, `refreshPositions`, `refreshOrders`

## Per-broker polling intervals
Defined in `POLL_INTERVAL` map at top of brokerStore.ts:
- `delta`: 3 000 ms (REST-only, no WS account push)
- `ctrader`: 5 000 ms (WS ticks via LiveMarket, but positions/balance are REST)
- `default`: 4 000 ms (fallback for any future brokers)

## WS sync hook
`src/hooks/useBrokerWsSync.ts` — mounted once inside `Layout` (which is inside `LiveMarketProvider`).
- Mirrors `wsStatus` → `websocketStatus` in store
- Mirrors `latencyMs` → `connectionLatency` via `setLatency`
- Pipes all WS messages → `handleWsMessage`

`handleWsMessage` in the store handles:
- `ctrader_status` — triggers status update or reconnect if connected account is cTrader
- `pong` with `latencyMs` field — updates `connectionLatency`

## Reconnect logic
`reconnect()` uses exponential backoff: `delay = min(1000 × 1.5^(attempt-1), 30 000ms)`. Sets `reconnectingState: true`, clears it after `connect()` completes. `reconnectAttempts` resets to 0 on successful `connect`.

**Why:** First reconnect is immediate (attempt=1, delay=0); subsequent ones back off. This prevents thundering-herd on transient network blips while still recovering quickly.
