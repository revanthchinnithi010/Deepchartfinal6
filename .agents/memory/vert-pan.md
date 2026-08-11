---
name: Unified gesture state machine (pan + crosshair separation)
description: Single gesture handler replaces dual vpDown/hpDown system; 10px shared threshold gates ALL chart transforms; below threshold = crosshair only, zero pan
---

## The rule
Use ONE unified gesture handler (`gestureDown/gestureMove/gestureUp`) — not separate vertical + horizontal handlers. A single 10px threshold gates ALL chart transforms. Below threshold: zero transforms, LWC handles crosshair naturally. Above threshold: 2D pan activates.

**Why:** The old dual-handler system (vpMove + hpMove separate) had vpMove apply `autoscaleInfoProvider` on every pixel of vertical movement with NO threshold. Even 1px vertical drift during crosshair tracking immediately shifted the price scale. The unified state machine fixes this with one clean invariant: no transform fires while `gesture.panning === false`.

## Key invariant
```
gesture.panning === false  →  ZERO calls to setVisibleLogicalRange or autoscaleInfoProvider
gesture.panning === true   →  both H and V pan active (V on touch only)
```

## Critical: margin-corrected snapshot (gestureMove V pan + PriceScaleTouchHandler)

`coordinateToPrice(0)` / `coordinateToPrice(h)` return the SCREEN range (S_max / S_min), which **includes** the chart's `scaleMargins: { top: 0.07, bottom: 0.25 }`. But `autoscaleInfoProvider` expects the DATA range. Using screen range causes LWC to zoom out by the margin factor on first application.

**Fix — invert the margin formula before storing the snapshot:**
```typescript
const sMax = Math.max(sTop, sBot);
const sMin = Math.min(sTop, sBot);
const span = sMax - sMin;
g.panMax     = sMax - 0.07 * span; // data top
g.panMin     = sMin + 0.25 * span; // data bottom
g.pricePerPx = span / h;           // screen px → screen price units
```

## LWC chart config (must never re-enable these)
```typescript
handleScroll: {
  mouseWheel:       true,
  pressedMouseMove: false,  // custom gesture handler takes over
  horzTouchDrag:    false,  // custom gesture handler takes over
  vertTouchDrag:    false,  // autoScale:true overrides LWC's native vertTouchDrag
}
```
DrawingOverlay cursor-mode restore must also use `pressedMouseMove: false, horzTouchDrag: false`.

## Gesture state type
```typescript
type GestureState = {
  pointerId, startX, startY, lastX, lastY, lastT,
  isTouch: boolean,
  panning: boolean,       // false = undecided/crosshair; true = panning committed
  velY: number,           // smoothed velocity for kinetic momentum
  hRafId, vRafId: number | null,
  panMin, panMax, pricePerPx: number | null,  // lazy-init on first V pan frame
};
let gesture: GestureState | null = null;
let momentumRaf: number | null = null;
```

## Modes: IDLE | CROSSHAIR | CHART_PAN | PINCH_ZOOM | TIME_SCALE_DRAG

## gestureDown
- Skip right/middle mouse click, SVG targets (drawing hit-areas)
- Compute `rect = container.getBoundingClientRect()` ONCE at top (used for both zone checks)
- Mouse + right edge ≤72px → price-scale zone: `e.preventDefault()`, keep ig=null, LWC owns it
- All pointers + bottom ≤35px → time-scale zone: set mode `TIME_SCALE_DRAG`, return early (before pressCount++)
- Second finger → `cancelActiveGesture()` — hands off to LWC pinch-zoom
- Kill any running momentumRaf; create fresh gesture state

## gestureMove
1. Always track velY (for accurate kinetics when pan activates later)
2. If `TIME_SCALE_DRAG`: H drag zooms time axis via `setVisibleLogicalRange` (factor = 1 - dx / (w*0.5)), clamp [0.5, 2.0], return early
3. Threshold check: `Math.max(|dx from start|, |dy from start|) < PAN_THRESHOLD` → return (crosshair only)
4. Past threshold → `g.panning = true`
5. H pan: `setVisibleLogicalRange` on RAF (mouse + touch)
6. V pan: `autoscaleInfoProvider` on RAF (mouse + touch) with lazy price-range snapshot

## gestureUp (kinetic coast)
- `TIME_SCALE_DRAG` lift → `ig = null`, no kinetics
- Never entered panning (`!g.panning`) → just `gesture = null` (was crosshair tap)
- Mouse panning → `gesture = null`; if V pan was active, clear with `autoscaleInfoProvider: () => null` — NOT `undefined` (`undefined` means "don't change", `() => null` actually clears the lock)
- Touch panning with V movement → kinetic coast: `vel = velY * 16.67`, `vel *= 0.88` per frame, stop at `< 0.12 px/frame`

## DOM isolation
PriceScaleTouchHandler is a **sibling** of containerRef (not a child). Touches on it never travel through containerRef's capture path — no conflict with gestureDown.

## GPU hints (JSX)
Outer wrapper: `willChange: "transform", transform: "translate3d(0,0,0)"`
containerRef div: `willChange: "transform"`
