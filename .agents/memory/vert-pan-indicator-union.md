---
name: Vertical pan + indicator union fix
description: Why overlay indicators break vertical pan and how chartPanState.ts fixes it
---

## The Problem
LWC (`lightweight-charts`) **unions** the `autoscaleInfoProvider` return values from ALL series in a pane to determine the visible price range. When EMA/SMA overlays are in pane 0, they don't have a custom provider, so LWC includes their full natural data range in the union. This expands the visible price window beyond the candlestick's locked range, making vertical pan appear "limited" — the chart fights back because the union keeps pulling the range toward the full data extent.

## The Fix — `chartPanState.ts`
A module-level pub/sub (`src/components/charts/chartPanState.ts`) coordinates the locked range across all pane-0 series:

- `activatePanRange({ lo, hi })` — called on first vertical pan frame and on pan end. Fires all listeners.
- `updatePanRange(lo, hi)` — called silently on every subsequent RAF frame. No listener notification needed because the main series' per-frame `applyOptions` triggers LWC to re-render and re-call all providers, which read `getPanRange()` dynamically.
- `subscribePanRange(fn)` — called in `IndicatorRenderer` and `CustomIndicatorRenderer` to install a live `autoscaleInfoProvider` on their pane-0 series when pan activates.

## Flow
1. First vertical pan frame: `activatePanRange({ lo, hi })` → listeners fire → indicator series get live providers that call `getPanRange()`.
2. Each subsequent frame: `updatePanRange(lo, hi)` (updates `_current` silently) + main series `applyOptions(new closure)` → LWC re-renders → all providers called → indicator providers read updated `getPanRange()`.
3. Lift / coast end: `activatePanRange(null)` → listeners fire → indicator series clear their providers (restore LWC auto-scale).

## Where to Apply
- `CustomIndicatorRenderer`: only pane-0 entries (`entry.paneIndex === 0`). WaveTrend and other separate-pane indicators (`paneIndex > 0`) have their own price scales and must NOT be constrained.
- `IndicatorRenderer`: all entries (they're always pane-0 overlays: EMA, SMA, VWAP, etc.).
- `CustomChart`: clears pan range on coast cancel (new gesture) and in effect cleanup.

**Why:** Without locking all pane-0 series to the same range, the price-scale union includes the EMA/SMA data range and the chart appears to resist vertical dragging.
