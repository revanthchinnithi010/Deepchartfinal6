import fs from "node:fs";

const overlayPath = new URL("../src/components/charts/DrawingOverlay.tsx", import.meta.url).pathname;
let s = fs.readFileSync(overlayPath, "utf8");

const start = s.indexOf('  const onPointerDown = useCallback((e: React.PointerEvent) => {');
const move = s.indexOf('  const onPointerMove = useCallback((e: React.PointerEvent) => {', start);
const up = s.indexOf('  const onPointerUp = useCallback(async (e: React.PointerEvent) => {', move);
if (start < 0 || move < 0 || up < 0) throw new Error('[circle-fix] pointer handlers not found');

const downBlock = s.slice(start, move);
const moveBlock = s.slice(move, up);
const upEnd = s.indexOf('\n  const ', up + 20);
const upBlock = upEnd > 0 ? s.slice(up, upEnd) : s.slice(up);

const circleDown = `  const onPointerDown = useCallback((e: React.PointerEvent) => {\n    if (!isDrawMode || activeTool === "eraser") return;\n    e.preventDefault();\n\n    // TradingView: first press is the circle center; dragging controls radius.\n    if (activeTool === "ellipse") {\n      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      if (!pt) return;\n      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}\n      setAnchor(pt);\n      setMousePoint(pt);\n      setPhase("dragging");\n      isDragging.current = true;\n      setIsDrawing(true);\n      return;\n    }\n\n` + downBlock.slice(downBlock.indexOf('\n', downBlock.indexOf('{')) + 1);

const circleMove = `  const onPointerMove = useCallback((e: React.PointerEvent) => {\n    if (!isDrawMode || activeTool === "eraser") return;\n\n    // Live circle radius preview.\n    if (activeTool === "ellipse" && isDragging.current && anchor) {\n      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      if (pt) setMousePoint(pt);\n      return;\n    }\n\n` + moveBlock.slice(moveBlock.indexOf('\n', moveBlock.indexOf('{')) + 1);

const circleUp = `  const onPointerUp = useCallback(async (e: React.PointerEvent) => {\n    if (!isDrawMode || activeTool === "eraser") return;\n\n    // TradingView: release commits [center, radius-point].\n    if (activeTool === "ellipse") {\n      if (!isDragging.current || !anchor) return;\n      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      isDragging.current = false;\n      setPhase("idle");\n      setIsDrawing(false);\n      setSnapIndicator(null);\n      if (pt) {\n        const a = toPx(anchor);\n        const b = toPx(pt);\n        if (a && b && Math.hypot(b.x - a.x, b.y - a.y) >= 3) {\n          void saveDrawing([anchor, pt]);\n        }\n      }\n      setAnchor(null);\n      setMousePoint(null);\n      if (!useDrawingStore.getState().stayInDraw) setActiveTool("cursor");\n      return;\n    }\n\n` + upBlock.slice(upBlock.indexOf('\n', upBlock.indexOf('{')) + 1);

s = s.slice(0, start) + circleDown + circleMove + circleUp + s.slice(up + upBlock.length);

// Hit-testing uses center + radius.
s = s.replace(
  /    case "fib": \{\n      if \(pts\.length < 2\) return false;/,
  `    case "ellipse": {\n      if (pts.length < 2) return false;\n      const radius = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));\n      const d = Math.hypot(cx - pts[0].x, cy - pts[0].y);\n      return Math.abs(d - radius) < T || d <= radius + T;\n    }\n    case "fib": {\n      if (pts.length < 2) return false;`
);

// SVG circle geometry: point 0 is center, point 1 defines radius.
s = s.replace(
  /const cx = \(px\[0\]\.x \+ px\[1\]\.x\) \/ 2, cy = \(px\[0\]\.y \+ px\[1\]\.y\) \/ 2;\s*const erx = Math\.abs\(px\[1\]\.x - px\[0\]\.x\) \/ 2, ery = Math\.abs\(px\[1\]\.y - px\[0\]\.y\) \/ 2;/g,
  `const cx = px[0].x, cy = px[0].y;\n      const radius = Math.max(1, Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y));\n      const erx = radius, ery = radius;`
);
fs.writeFileSync(overlayPath, s);

// Canvas renderer must use the same center/radius geometry for unselected drawings.
const rendererPath = new URL("../src/components/charts/drawingCanvasRenderer.ts", import.meta.url).pathname;
let r = fs.readFileSync(rendererPath, "utf8");
r = r.replace(
  /case "ellipse": \{\n\s*if \(px\.length < 2\) break;\n\s*const cx = \(px\[0\]\.x \+ px\[1\]\.x\) \/ 2, cy = \(px\[0\]\.y \+ px\[1\]\.y\) \/ 2;\n\s*const erx = Math\.abs\(px\[1\]\.x - px\[0\]\.x\) \/ 2, ery = Math\.abs\(px\[1\]\.y - px\[0\]\.y\) \/ 2;/g,
  `case "ellipse": {\n        if (px.length < 2) break;\n        const cx = px[0].x, cy = px[0].y;\n        const radius = Math.max(0.1, Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y));\n        const erx = radius, ery = radius;`
);
fs.writeFileSync(rendererPath, r);
console.log('[circle-fix] TradingView circle lifecycle + circular rendering + hit-testing applied');
