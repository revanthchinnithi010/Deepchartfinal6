---
name: Long/Short Position drawing tool
description: Architecture and data model for the position_long/position_short drawing tool in DrawingOverlay.tsx
---

## Point storage model
- `points[0]` = `{time: left_time, price: entry_price}` — entry price + left edge X
- `points[1]` = `{time: right_time, price: tp_price}` — TP price + right edge X (use `pt.time` in creation, not `anchor.time`)
- `points[2]` = `{time: left_time, price: sl_price}` — SL price only; time is locked during drag

## Drag constraints
- `DragState` has a `toolType?` field set by both `onBodyDown` and `onAnchorDown`
- In the `onMove` handler: when `toolType === "position_long/short"` and `anchorIdx === 2`, lock X (use `origPx.x` without `dx`) so SL only moves vertically

## 4 drag handles
- TP center: `sqHandle(effectiveMidX, tpY, "ns-resize", idx=1, profitCol)`
- SL center: `sqHandle(effectiveMidX, slY, "ns-resize", idx=2, lossCol)`
- Left edge: `sqHandle(effectiveLeftX, entY, "ew-resize", idx=0, white)`
- Right edge: `sqHandle(effectiveRightX, tpY, "nwse-resize", idx=1, profitCol, suffix="re")` ← "re" suffix avoids key collision with TP center handle (both idx=1)

## Minimum-width fallback
If `zoneW < 20px` (same-time points), spread ±120px around `entPx.x` as `effectiveLeftX`/`effectiveRightX` so the tool is always visible.

**Why:** All three original points used `anchor.time` causing zero-width zones on old drawings; only `points[1]` now uses `pt.time`.
