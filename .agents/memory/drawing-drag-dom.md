---
name: Drawing drag — direct DOM architecture
description: How drawing drag achieves zero-React-render smoothness during move drags via SVG transform on a g wrapper
---

## The rule
Move drag: apply `transform="translate(dx,dy)"` directly to each drawing's `<g>` SVG wrapper via `svgGroupsRef` (a `Map<id, SVGGElement>`). Zero `setDragTick`, zero React renders, zero `getBoundingClientRect()` during drag.

Anchor drag: still uses `setDragTick` + React re-render per RAF because geometry changes, not just position. But also uses cached `overlayRect` (no getBCR per frame) and absolute delta from `startClientX/Y`.

## DragState fields (key ones)
- `startPxPoints: (Px | null)[]` — pixel positions at drag-start, computed once via `toPxRef.current`
- `startClientX/Y: number` — absolute pointer position at start; `totalDx = e.clientX - startClientX`
- `overlayRect: DOMRect` — cached once at drag-start, never called again during drag

## Why
`getBoundingClientRect()` per move event forces a layout reflow; could fire 120+ times/second.
Incremental delta accumulation requires `toPx(accumulated_world_pt)` each frame (double conversion).
`setDragTick` per RAF causes React to reconcile ALL DrawingShapes, not just the dragged one.

## How to apply
- `svgGroupsRef` is a `useRef<Map<number, SVGGElement>>(new Map())` in DrawingOverlay
- Each drawing is wrapped: `<g ref={el => { if (el) svgGroupsRef.current.set(d.id, el); else svgGroupsRef.current.delete(d.id); }}>`
- React never sets `transform` on this `<g>`, so DOM-applied transforms survive React reconciliation
- On `pointerup` for move drag: `el.removeAttribute("transform")` before committing world points to Zustand
- `effectiveDrawing` in drawings.map only applies for anchor drag (not move, since DOM transform handles the visual)
