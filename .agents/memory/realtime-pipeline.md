---
name: Realtime pipeline architecture
description: Full stack of the ultra-low-latency tick→chart pipeline; new engine files and how they connect
---

## Rule
The realtime pipeline has two tracks:
1. **Zero-latency** — WS handler → `tickDataRef` (mutable ref) → `LivePriceBox` RAF loop → direct DOM mutation
2. **60fps batched** — WS handler → `series.update()` (direct LWC call, no React) → RAF-throttled Zustand (`setLivePrice` at ≤1/frame)

Never push React state on every tick. Never call `series.setData()` on a live update.

## New files
- `src/lib/ultraFastTickEngine.ts` — `UltraFastTickEngine` class: Float64Array ring buffer, O(1) price dedup, immediate `onPrice` callbacks (synchronous, for DOM mutations), RAF-batched `onBar` callbacks (for LWC series.update). Also exports `perfSnapshot` / `updatePerfSnapshot` for perf overlay reads.
- `src/lib/websocketDispatcher.ts` — `WebSocketDispatcher` class: Map<type, handlers[]> router, priority groups (realtime > ui > system), per-handler error isolation, token-based unsubscribe. `createCandleDispatcher()` convenience factory.

## Context connection
- `LiveMarketContext` exposes `sendMessage(msg: object)` — sends JSON through wsRef without React state
- `CustomChart` subscribes via `subscribeToMessages` and also handles `type === "welcome"` inside the same handler to re-send `subscribe_candles` on WS reconnect
- `sendMsgRef` in CustomChart (updated every render) lets the stable WS handler closure always call the latest `sendMessage`

## Why
The `useSyncMarketStore` export in `marketStore.ts` is unused (no importer) — its `updateTick` / `updateLastCandle` Zustand setState calls never fire. `marketStore.ticks` and `marketStore.candles` are only written, never read by any component — safe dead code. Do not add new callers.
