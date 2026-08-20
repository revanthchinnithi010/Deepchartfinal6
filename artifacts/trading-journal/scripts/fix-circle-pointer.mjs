import fs from "node:fs";

const path = new URL("../src/components/charts/DrawingOverlay.tsx", import.meta.url).pathname;
let s = fs.readFileSync(path, "utf8");

const start = s.indexOf('  const onPointerDown = useCallback((e: React.PointerEvent) => {');
const move = s.indexOf('  const onPointerMove = useCallback((e: React.PointerEvent) => {', start);
const up = s.indexOf('  const onPointerUp = useCallback((e: React.PointerEvent) => {', move);

if (start < 0 || move < 0 || up < 0) {
  throw new Error('[circle-fix] pointer handlers not found');
}

const downBlock = s.slice(start, move);
const moveBlock = s.slice(move, up);

// The existing generic 2-point tool is click-click. Circle is different:
// pointer-down establishes the center, pointer-move changes radius, pointer-up commits.
const circleDown = `  const onPointerDown = useCallback((e: React.PointerEvent) => {\n    if (!isDrawMode || activeTool === "eraser") return;\n    e.preventDefault();\n\n    if (activeTool === "ellipse") {\n      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      if (!pt) return;\n      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}\n      setAnchor(pt);\n      setMousePoint(pt);\n      setPhase("dragging");\n      isDragging.current = true;\n      setIsDrawing(true);\n      return;\n    }\n\n` + downBlock.slice(downBlock.indexOf('\n', downBlock.indexOf('{')) + 1);

const circleMove = `  const onPointerMove = useCallback((e: React.PointerEvent) => {\n    if (!isDrawMode || activeTool === "eraser") return;\n\n    if (activeTool === "ellipse" && isDragging.current && anchor) {\n      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      if (pt) setMousePoint(pt);\n      return;\n    }\n\n` + moveBlock.slice(moveBlock.indexOf('\n', moveBlock.indexOf('{')) + 1);

s = s.slice(0, start) + circleDown + circleMove + s.slice(up);

// Replace the ellipse geometry in the SVG renderer: first point is center, second is radius point.
s = s.replace(
  /case "ellipse": \{\n\s*if \(px\.length < 2\) return null;\n\s*const cx = \(px\[0\]\.x \+ px\[1\]\.x\) \/ 2, cy = \(px\[0\]\.y \+ px\[1\]\.y\) \/ 2;\n\s*const erx = Math\.abs\(px\[1\]\.x - px\[0\]\.x\) \/ 2, ery = Math\.abs\(px\[1\]\.y - px\[0\]\.y\) \/ 2;/,
  `case "ellipse": {\n        if (px.length < 2) return null;\n        const cx = px[0].x, cy = px[0].y;\n        const radius = Math.max(1, Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y));\n        const erx = radius, ery = radius;`
);

fs.writeFileSync(path, s);
console.log('[circle-fix] Circle pointer lifecycle changed to center-drag-radius');
