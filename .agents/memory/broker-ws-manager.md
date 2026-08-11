---
name: Broker WS manager architecture
description: Modular real-time WS manager for Delta Exchange + cTrader — module layout, event flow, and integration points
---

## Module location
`artifacts/trading-journal/src/lib/broker-ws/` — 9 files, no external deps.

## Module roles
- `types.ts` — all shared types: `BrokerEvent` union, `WsClientStatus`, `WsClientState`, `IBrokerWsClient`, `SubscriptionTopic`
- `SubscriptionManager.ts` — topic-based pub/sub; topics: `"tick:SYMBOL"`, `"positions"`, `"orders"`, `"balance"`, `"pnl"`, `"status"`, `"latency"`, `"*"` (wildcard)
- `HeartbeatManager.ts` — ping/pong interval with timeout detection; calls `onTimeout` to force reconnect
- `ReconnectManager.ts` — exponential backoff (1s → 30s max, factor 1.5); first attempt immediate; resets on success
- `WsConnection.ts` — reusable self-healing WS wrapper; owns HeartbeatManager + ReconnectManager; exposes `send()`, `notifyPong()`, `connect()`, `disconnect()`
- `DeltaWsClient.ts` — direct browser→`wss://socket.delta.exchange`; handles public `v2/ticker` channels; maps Delta tick to `TickEvent`; calls `conn.notifyPong()` on pong
- `CTraderWsClient.ts` — uses backend relay WS via `subscribeToMessages` (LiveMarketContext); handles `ctrader_tick`, `ctrader_status`, `ctrader_positions`, `ctrader_orders`, `ctrader_balance` relay messages
- `LivePnlTracker.ts` — O(1) per-tick PnL: `setPositions(broker, positions)` seeds map; `onTick(broker, symbol, price)` computes delta; emits `PnlEvent` only when value changes
- `BrokerWsOrchestrator.ts` — owns both clients; routes events through SubscriptionManager + globalHandlers; drives LivePnlTracker; exposes `connectBroker()`, `disconnectBroker()`, `subscribeSymbol()`, `subscribe()`, `onEvent()`

## React integration
- `useBrokerWs.ts` — mounts once in `Layout`; creates `BrokerWsOrchestrator`, registers it via `setOrchestratorRef`, calls `orch.onEvent(handleBrokerEvent)`, connects/disconnects on `connectedBroker` changes, subscribes active symbol for Delta
- `Layout` calls `useBrokerWs()` (replaced old `useBrokerWsSync`)

## brokerStore additions
- State: `livePnl: Record<string, number>`, `wsClientStates: {delta, ctrader}`
- Actions: `handleBrokerEvent(event)` — routes events to state; `setOrchestratorRef(orch)` — stores singleton ref
- Module-level `_orchestrator` singleton exported via `getBrokerOrchestrator()`

## Key invariants
- `WsConnection.notifyPong()` must be called (not `receivePong` which is protected)
- `CTraderWsClient.send()` always returns false — cTrader is receive-only via relay
- `LivePnlTracker` only emits when PnL changes by >0.000001 (prevents render storms)
- `handleBrokerEvent` in store guards `broker_id` match before updating state

**Why:** Delta has a public WS (fast ticks, no auth needed) but private data via backend REST. cTrader's Open API is binary protobuf server-side — relay is the only viable frontend approach.
