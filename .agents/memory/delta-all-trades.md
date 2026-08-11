---
name: Delta India all_trades channel
description: Correct real-time tick channel for Delta Exchange India WebSocket — not recent_trade
---

# Delta India `all_trades` Channel

## The Rule
Subscribe to `all_trades` channel on Delta India WS (`wss://socket.india.delta.exchange`), NOT `recent_trade`. Subscribe both `all_trades` + `v2/ticker` in a single payload.

**Why:** `recent_trade` channel was accepted by Delta India but fired zero events — even in active markets. `all_trades` fires on every executed trade, confirmed working at sub-second frequency (5-15 ticks/sec for BTCUSD/ETHUSD during active hours).

## How to Apply
```typescript
this.ws.send(JSON.stringify({
  type: "subscribe",
  payload: { channels: [
    { name: "all_trades", symbols: [deltaSym] },  // sub-second per-trade ticks
    { name: "v2/ticker",  symbols: [deltaSym] },  // 5-second baseline fallback
  ]},
}));
```

Message type handling:
- `msg.type === "all_trades"` → price from `msg.price`, size from `msg.size`
- `msg.type === "v2/ticker"` → price from `msg.mark_price || msg.close || msg.spot_price`

## Timestamp Normalization
Delta India sends microsecond timestamps (1.78e15 range in 2026). Use `normToMs`:
```typescript
function normToMs(ts?: number): number {
  if (!ts)     return Date.now();
  if (ts > 1e15) return Math.floor(ts / 1_000);   // microseconds → ms
  if (ts > 1e12) return ts;                         // already ms
  return ts * 1_000;                                // seconds → ms
}
```
CandleAggregator expects milliseconds — always pass `tsMs` not seconds.

## Message Format (all_trades)
```json
{
  "type": "all_trades",
  "symbol": "BTCUSD",
  "price": "62204",
  "size": 5,
  "timestamp": 1780853289000000,
  "buyer_role": "taker"
}
```
Prices from `all_trades` are rounded to tick size (integer for BTC, 2 decimals for ETH). v2/ticker gives high-precision mark prices.
