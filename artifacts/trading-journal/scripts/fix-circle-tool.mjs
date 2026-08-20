import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname;

function edit(rel, replacements) {
  const path = new URL(rel, new URL("../", import.meta.url)).pathname;
  let s = fs.readFileSync(path, "utf8");
  let changed = false;
  for (const [from, to] of replacements) {
    if (s.includes(to)) continue;
    if (!s.includes(from)) {
      console.log(`[circle-fix] marker not found in ${rel}; leaving unchanged`);
      continue;
    }
    s = s.replace(from, to);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(path, s);
    console.log(`[circle-fix] patched ${rel}`);
  }
}

// Drawing geometry: Point A is the circle center; Point B is a point on the
// circumference. Radius is the pixel distance A→B, matching TradingView.
edit("src/components/charts/drawingCanvasRenderer.ts", [[
`      case "ellipse": {
        if (px.length < 2) break;
        const cx = (px[0].x + px[1].x) / 2, cy = (px[0].y + px[1].y) / 2;
        const erx = Math.abs(px[1].x - px[0].x) / 2, ery = Math.abs(px[1].y - px[0].y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(erx, 0.1), Math.max(ery, 0.1), 0, 0, Math.PI * 2);
        if ((style.fillOpacity ?? 0) > 0) {
          ctx.save(); ctx.shadowBlur = 0;
          ctx.fillStyle = hexToRgba(col, style.fillOpacity ?? 0);
          ctx.fill(); ctx.restore();
        }
        ctx.stroke();
        break;
      }`,
`      case "ellipse": {
        if (px.length < 2) break;
        // TradingView-style circle: first point is the center, second point
        // defines the radius. Keep it circular in screen space.
        const cx = px[0].x, cy = px[0].y;
        const radius = Math.max(0.1, Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y));
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        if ((style.fillOpacity ?? 0) > 0) {
          ctx.save(); ctx.shadowBlur = 0;
          ctx.fillStyle = hexToRgba(col, style.fillOpacity ?? 0);
          ctx.fill(); ctx.restore();
        }
        ctx.stroke();
        break;
      }`
]]);

edit("src/components/charts/DrawingOverlay.tsx", [
[
`    case "fib": {
      if (pts.length < 2) return false;`,
`    case "ellipse": {
      if (pts.length < 2) return false;
      const cx = pts[0].x, cy = pts[0].y;
      const radius = Math.max(1, Math.hypot(pts[1].x - cx, pts[1].y - cy));
      return Math.abs(Math.hypot(cx - cx, cy - cy) - radius) < T ||
        Math.abs(Math.hypot(cx - cx, cy - cy)) <= radius + T;
    }
    case "fib": {
      if (pts.length < 2) return false;`
],
[
`      case "ellipse": {
        if (px.length < 2) return null;
        const ecx = (px[0].x + px[1].x) / 2, ecy = (px[0].y + px[1].y) / 2;
        const erx = Math.abs(px[1].x - px[0].x) / 2, ery = Math.abs(px[1].y - px[0].y) / 2;
        return (
          <g opacity={op}>
            <ellipse cx={ecx} cy={ecy} rx={Math.max(1, erx + HIT / 2)} ry={Math.max(1, ery + HIT / 2)} stroke="transparent" strokeWidth={1} fill="transparent" {...hitProps} />
            <Anchor i={0} p={px[0]} /><Anchor i={1} p={px[1]} />
          </g>
        );
      }`,
`      case "ellipse": {
        if (px.length < 2) return null;
        const ecx = px[0].x, ecy = px[0].y;
        const radius = Math.max(1, Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y));
        return (
          <g opacity={op}>
            <circle cx={ecx} cy={ecy} r={radius + HIT / 2} stroke="transparent" strokeWidth={1} fill="transparent" {...hitProps} />
            <Anchor i={0} p={px[0]} /><Anchor i={1} p={px[1]} />
          </g>
        );
      }`
],
[
`    // ── 2-point / 3-point tools: TradingView click-click interaction ───────`,
`    // ── TradingView-style circle/ellipse: press at the center, drag to radius, release ──
    if (activeTool === "ellipse") {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);
      if (!pt) return;
      setAnchor(pt);
      setMousePoint(pt);
      setPhase("dragging");
      isDragging.current = true;
      setIsDrawing(true);
      return;
    }

    // ── 2-point / 3-point tools: TradingView click-click interaction ───────`
],
[
`    // ── 2-point / 3-point tools: click-click commit ───────────────────────
    // This fires on EVERY pointerUp. We use distance from anchor to discriminate:`,
`    // ── TradingView-style circle commit ───────────────────────────────────
    if (activeTool === "ellipse") {
      if (!isDragging.current || !anchor) return;
      isDragging.current = false;
      setPhase("idle"); setIsDrawing(false); setSnapIndicator(null);
      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);
      if (pt) {
        const ap = toPx(anchor), bp = toPx(pt);
        const dist = ap && bp ? Math.hypot(bp.x - ap.x, bp.y - ap.y) : 0;
        if (dist >= 4) await saveDrawing([anchor, pt]);
      }
      setAnchor(null); setMousePoint(null);
      if (!useDrawingStore.getState().stayInDraw) setActiveTool("cursor");
      return;
    }

    // ── 2-point / 3-point tools: click-click commit ───────────────────────
    // This fires on EVERY pointerUp. We use distance from anchor to discriminate:`
]
]);

console.log("[circle-fix] TradingView-style circle interaction ready");
