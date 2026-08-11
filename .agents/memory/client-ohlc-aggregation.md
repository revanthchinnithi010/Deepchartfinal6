---
name: Client-side OHLC aggregation pattern
description: MT5/TradingView tick→chart pattern: client builds live bar from raw ticks, not from server candle_update
---

# Client-Side OHLC Aggregation (MT5 Pattern)

## The Rule
The chart subscribes to two WS message types:
- **`tick`** → fast path: `RealtimeTradeAggregator.ingest()` → `series.update()` instantly
- **`candle_update`** → accuracy path: server OHLC + EMA/VWAP indicators + `barsRef` update

Both handlers live inside the same `subscribeToMessages` useEffect. The `tick` handler fires first (broadcast order in index.ts), giving immediate chart movement. `candle_update` arrives milliseconds later with authoritative server OHLC.

**Why:** With `all_trades` firing 5-15 ticks/sec, the `tick` handler gives sub-second chart updates without waiting for CandleAggregator. `candle_update` keeps indicators accurate. This matches how MT5/TradingView work.

## How to Apply

### RealtimeTradeAggregator (`src/lib/realtimeTradeAggregator.ts`)
- `new RealtimeTradeAggregator(interval)` — created fresh on symbol/interval change (in subscribe_candles useEffect)
- `agg.seed(lastBar)` — called in `loadCandles` after historical bars are applied
- `agg.ingest(price, volume, tsSec)` → returns `{bar, isNewBar}` or null (dedup)
- `toSec(ts)` utility: normalizes µs/ms/sec → seconds

### In CustomChart.tsx tick handler
```typescript
if (msg.type === "tick") {
  const agg = tradeAggRef.current;
  if (!agg || !t.symbol || t.symbol !== symRef.current) return;
  const tsSec = t.timestamp != null ? toSec(t.timestamp) : Math.floor(Date.now() / 1000);
  const result = agg.ingest(price, volume, tsSec);
  if (!result) return; // deduplicated
  updateBar(cs, ctRef.current, result.bar);
  tickCountRef.current++;
  tickDataRef.current = { price: result.bar.close, open: result.bar.open };
  // RAF for Zustand setState throttle
  return;
}
```

### Lifecycle
1. **Mount / symbol/interval change**: `tradeAggRef.current = new RealtimeTradeAggregator(interval)` in subscribe_candles useEffect
2. **Historical bars loaded**: `tradeAggRef.current.seed(lastBar)` in loadCandles callback
3. **Live tick arrives**: `ingest()` → `updateBar()` → instant chart redraw
4. **candle_update arrives**: server OHLC overwrites current bar in `barsRef`, updates EMA/VWAP

### Important: tickCountRef ownership
`tickCountRef++` is only in the `tick` handler, NOT in `candle_update`. This prevents double-counting on the TickRateOverlay.
