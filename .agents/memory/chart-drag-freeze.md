---
name: Chart drag-freeze + frame-coalescing
description: The architecture for throttling series.update() calls during live Delta ticks to prevent drag lag in LWC
---

## The Rule
`scheduleChartUpdate()` is the ONLY way to call `series.update()` for live realtime data in CustomChart.tsx. Both the tick path (`type=tick`) and the `candle_update` path must go through it — never call `updateBar()` directly from the WS handler.

## How it works
1. WS tick/candle arrives → store bar in `pendingChartBarRef.current`
2. Call `scheduleChartUpdate()`
3. `scheduleChartUpdate` checks:
   - If `chartUpdateRafRef.current !== null` → already scheduled, frame-coalescing is active
   - If touch device and last render < 33ms ago → skip (30fps cap)
   - Otherwise → schedule one `requestAnimationFrame`
4. RAF callback renders `pendingChartBarRef.current` once, then clears it

Note: `isInteractingRef` (drag-pause gate) was intentionally removed. Updates are never suppressed during user interaction.

## Key refs
- `pendingChartBarRef` — latest bar waiting to render (overwritten by each new tick = frame coalescing)
- `chartUpdateRafRef` — RAF handle; null = no pending frame
- `lastRenderMsRef` — timestamp of last `updateBar()` call; used for 30fps cap
- `isTouchDeviceRef` — set once at mount via `window.matchMedia("(pointer: coarse)")`, never changes

## Why this matters
- Delta Exchange `all_trades` WS sends bursts of 3-6 ticks simultaneously at the same millisecond
- LWC's `series.update()` triggers internal timescale/layout recalculation on every call
- Without coalescing: 16+ `series.update()` calls/sec = chart layout thrash = drag lag
- With coalescing: at most 1 `series.update()` per 16ms frame (60fps) = smooth panning
- On mobile: capped at 30fps = at most 1 `series.update()` per 33ms

**Why:** LWC recalculates visible range on every `series.update()` call. On mobile this is expensive enough to block pointer event processing, causing visible drag stutter.

**How to apply:** Any future code that wants to update the live candle must call `scheduleChartUpdate()` after writing to `pendingChartBarRef`, not call `updateBar()` directly.
