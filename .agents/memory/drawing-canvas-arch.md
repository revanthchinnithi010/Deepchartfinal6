---
name: DrawingOverlay Canvas2D architecture
description: All drawing visual paths moved from React/SVG to imperative Canvas2D; architecture for zero React renders during chart pan/zoom.
---

## Rule
`drawingCanvasRenderer.ts` renders ALL visual paths imperatively at 60fps via a RAF loop. The SVG layer only keeps anchor handles + hit areas for the currently selected drawing. `position_long`/`position_short` always get full SVG (complex HTML labels).

## Key refs (in DrawingOverlay main component)
- `drawingCanvasRef` — canvas element
- `canvasRafRef` — pending RAF handle (coalesces concurrent requests)
- `drawingsRef`, `selectedIdRef`, `chartRef`, `toPxRef` — always-current values, written synchronously in render body

## scheduleCanvasRender
- Stable `useCallback(()=>{}, [])` — reads all values via mutable refs, zero stale closures
- Called by: `subscribeVisibleLogicalRangeChange` bump, `pollPrice` interval, and four `useEffect` triggers (drawings/selectedId/dragTick/chart+candle)
- `bump` only calls `setRenderTick` (React) when `selectedIdRef.current !== null` — avoids React renders during pan when nothing is selected

## canvasOnly prop on DrawingShape
- `canvasOnly={!isMoveDrag}` — when true AND drawing is not selected AND not position tool, early-exit after rendering just a hit-area + anchor handles (no visible path)
- During move-drag: `canvasOnly=false` so the DOM-transform path keeps full SVG visual; canvas skips that drawing via `moveDragId` param

## Naming clash
- Inner PositionToolbar component had its own `const toPxRef` — renamed to `tbToPxRef` to avoid VarRedeclaration error with main component's `toPxRef`

**Why:** React SVG re-renders on every pan/zoom frame caused visible lag. Canvas2D lets all drawing paths redraw imperatively in a single RAF, matching LWC's own rendering strategy.

**How to apply:** Pan/zoom triggers canvas redraw (zero React state). React state (`setRenderTick`) only fires for anchor handle repositioning when a drawing is actively selected.
