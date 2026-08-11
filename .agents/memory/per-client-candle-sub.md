---
name: Per-client candle subscription
description: WSManager filters candle_update by subscribed symbol:interval per client, eliminating 89% of WS candle traffic
---

## Rule
Each frontend client declares the one `symbol:interval` it cares about by sending `{ type: "subscribe_candles", symbol, interval }`. The server only sends matching `candle_update` messages to that client.

## Why
Previously: CandleAggregator emitted 9 `candle_update` events per tick (one per interval). WSManager broadcast all 9 to every client. At 4 active symbols × 9 intervals = 36 messages per tick cycle. The chart only consumed 1 of them — 97% were wasted network and parse cost.

## How to apply
- `WSManager.clientState: Map<WebSocket, { candleKey: string|null }>` — tracks subscription per socket
- `WSManager.broadcastCandleUpdate(symbol, interval, bar)` — filters, lazy-serializes (cache per key), sends only to matching clients
- `WSManager.clearCandleCache()` — called ONCE at the top of the `marketData.on("tick")` handler BEFORE `candleAggregator.ingestTick()` to keep payload cache fresh per tick cycle
- Frontend: `CustomChart` calls `sendMessage({ type: "subscribe_candles", symbol, interval })` on mount (useEffect on [symbol, interval]) and on "welcome" WS message (reconnect recovery)
- Default for new clients: `candleKey = null` → receives all updates until they subscribe (safe fallback)
