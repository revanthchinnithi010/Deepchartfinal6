---
name: Position tool viewport future-space bug
description: Why position box appears clipped/wrong after page refresh — root cause and fix
---

## The Root Cause

`fitContent()` leaves `to ≈ numBars − 0.5` (zero future space).  `doSaveVp` fires 600ms later and saves that value.  On every subsequent load `setVisibleLogicalRange(saved)` restores a viewport where the last real bar is flush with the right edge.  Any position tool whose right-edge timestamp is N bars into the future gets a pixel-X beyond `chartWidth`; the SVG clips it and the box looks completely wrong.

## The Fix (CustomChart.tsx `loadCandles`)

1. Extend `to` by `MIN_FUTURE_BARS = 50` whenever the saved viewport is at/near the right edge (`saved.to >= lastBarIdx - 5`).
2. Same extension for the no-saved-viewport fallback after `fitContent()`.
3. Move `setChartCtx` to **after** the viewport is fully set, so DrawingOverlay's very first render sees the final range.

**Why:** `doSaveVp` will then save the extended range, so every subsequent reload has 50 future bars by default.  Historical-only views (`saved.to < lastBarIdx - 5`) are left unchanged to avoid zooming out zoomed-in charts.

## Key invariant

Always call `setVisibleLogicalRange` **before** `setChartCtx`.  React 18 batches both, but being explicit prevents a future refactor from breaking the ordering.
