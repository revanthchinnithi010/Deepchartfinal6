---
name: Position tool coordinate sync invariants
description: Three rules that keep position boxes locked to candles during live trading, chart-type switches, and replay
---

## Rules

### 1. setChartCtx invariant — always after applyBars + fitContent
`setChartCtx({ chart, candle })` must NEVER be called before the series has data loaded.
Applies to both `loadCandles` (symbol/timeframe change) AND the `chartType` useEffect (chart-type switch).
Breaking it gives DrawingOverlay an empty series for one render frame → `priceToCoordinate()` returns null → position tools collapse to left edge.

**Why:** `priceToCoordinate()` on a series with no data returns null. React batches the setState so there's no way to defer the render.

**How to apply:** Any code path that calls `chart.removeSeries(old)` + `makeSeries()` must call `setChartCtx` at the very end, after `applyBars` + `fitContent`.

### 2. candleBars memo — must depend on replayBarCount
During replay, `barsRef.current` is REASSIGNED to a new array (immutable React state), not mutated.
`useMemo(() => barsRef.current, [renderTick])` caches the old array reference and won't pick up the new one.
Fix: `useMemo(() => barsRef.current as OhlcBar[], [renderTick, replayBarCount])`.

**Why:** Live ticks mutate the array in-place (barsRef.current.push / splice), so renderTick alone suffices. Replay uses `barsRef.current = replayBars` (new reference), so the memo needs an extra dep to re-run.

### 3. Tick-driven re-render for barsInRange / profitSplitX
The `pollPrice` RAF only fires `setRenderTick` when `priceToCoordinate(0)` moves ≥1.5px. When a new live candle forms with a small price change, the position tool's `barsInRange` and `profitSplitX` stay stale until the price scale moves enough.
Fix: subscribe to `livePrice` from Zustand store and `useEffect(() => setRenderTick(v => v+1), [livePrice])`.

**Why:** livePrice is throttled to ≤1 setState per rAF frame by `statePendingRef` in CustomChart, so this adds at most 60 extra renders/sec during live trading — acceptable, and ensures the fill always advances with each new candle.
