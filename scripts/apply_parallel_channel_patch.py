from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path, replacements):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    for old, new in replacements:
        if old not in s:
            raise SystemExit(f'Missing patch anchor in {path}: {old[:120]!r}')
        s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')

# 1) Parallel channel is a 3-anchor drawing: first two points define the base,
# third point defines the parallel offset.
patch('artifacts/trading-journal/src/types/drawing.ts', [
    ('  if (tool === "hline" || tool === "hray" || tool === "vline" || tool === "eraser" || tool === "text" || tool === "note") return 1;\n  if (isFreehand(tool)) return Infinity;\n  return 2;',
     '  if (tool === "hline" || tool === "hray" || tool === "vline" || tool === "eraser" || tool === "text" || tool === "note") return 1;\n  if (isFreehand(tool)) return Infinity;\n  if (tool === "channel") return 3;\n  return 2;'),
])

# 2) Canvas renderer: calculate the parallel boundary from the third anchor
# instead of the old fixed-width H*0.12 band.
patch('artifacts/trading-journal/src/components/charts/drawingCanvasRenderer.ts', [
    ('function parallelOffset(a: Px, b: Px, dist: number): [Px, Px] {\n  const dx = b.x - a.x, dy = b.y - a.y;\n  const len = Math.hypot(dx, dy) || 1;\n  const nx = -dy / len * dist, ny = dx / len * dist;\n  return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }];\n}',
     'function parallelOffset(a: Px, b: Px, dist: number): [Px, Px] {\n  const dx = b.x - a.x, dy = b.y - a.y;\n  const len = Math.hypot(dx, dy) || 1;\n  const nx = -dy / len * dist, ny = dx / len * dist;\n  return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }];\n}\n\nfunction signedParallelOffset(a: Px, b: Px, p: Px): number {\n  const dx = b.x - a.x, dy = b.y - a.y;\n  const len = Math.hypot(dx, dy) || 1;\n  return ((p.x - a.x) * (-dy) + (p.y - a.y) * dx) / len;\n}'),
    ('      case "channel": {\n        if (px.length < 2) break;\n        const cW = Math.min(H * 0.12, 60);\n        const [c0, c1] = parallelOffset(px[0], px[1], cW);',
     '      case "channel": {\n        if (px.length < 2) break;\n        const cW = px.length >= 3 ? signedParallelOffset(px[0], px[1], px[2]) : Math.min(H * 0.12, 60);\n        if (Math.abs(cW) < 2) break;\n        const [c0, c1] = parallelOffset(px[0], px[1], cW);'),
    ('        dot(ctx, px[0].x, px[0].y, 3.5, col);\n        dot(ctx, px[1].x, px[1].y, 3.5, col);\n        break;\n      }\n\n      case "fib": {',
     '        dot(ctx, px[0].x, px[0].y, 3.5, col);\n        dot(ctx, px[1].x, px[1].y, 3.5, col);\n        if (px.length >= 3) dot(ctx, px[2].x, px[2].y, 3.5, col);\n        break;\n      }\n\n      case "fib": {'),
])

# 3) Drawing overlay: TradingView-style three-point creation, dynamic width,
# three handles, mobile support, and correct channel hit testing.
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx', [
    ('    case "channel":\n      if (pts.length < 2) return false;\n      return (\n        distToSeg({ x: cx, y: cy }, pts[0], pts[1]) < T ||\n        (pts.length >= 4 ? distToSeg({ x: cx, y: cy }, pts[2], pts[3]) < T : false) ||\n        (pts.length >= 3 ? distToSeg({ x: cx, y: cy }, pts[1], pts[2]) < T : false)\n      );',
     '    case "channel": {\n      if (pts.length < 2) return false;\n      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;\n      const len = Math.hypot(dx, dy) || 1;\n      const offset = pts.length >= 3\n        ? ((pts[2].x - pts[0].x) * (-dy) + (pts[2].y - pts[0].y) * dx) / len\n        : 0;\n      const [c0, c1] = parallelOffset(pts[0], pts[1], offset);\n      return distToSeg({ x: cx, y: cy }, pts[0], pts[1]) < T ||\n             (pts.length >= 3 && distToSeg({ x: cx, y: cy }, c0, c1) < T) ||\n             (pts.length >= 3 && Math.hypot(cx - pts[2].x, cy - pts[2].y) < T * 1.2);\n    }'),
    ('      case "fib":\n      case "fib_ext": {',
     '      case "fib":\n      case "fib_ext": {'),
    ('      default: {\n        // Line-based: trendline, ray, extended, arrow, channel, ruler, curve, path, fib_channel…',
     '      case "channel": {\n        if (px.length < 2) return null;\n        const cW = px.length >= 3\n          ? ((px[2].x - px[0].x) * (-(px[1].y - px[0].y)) + (px[2].y - px[0].y) * (px[1].x - px[0].x)) / (Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y) || 1)\n          : 0;\n        const [c0, c1] = parallelOffset(px[0], px[1], cW);\n        const [a1, b1] = extendBothEnds(px[0], px[1], W, H);\n        const [a2, b2] = extendBothEnds(c0, c1, W, H);\n        return (\n          <g opacity={op}>\n            <path d={extendBothEnds(px[0], px[1], W, H)} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n            <path d={extendBothEnds(c0, c1, W, H)} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n            <Anchor i={0} p={px[0]} /><Anchor i={1} p={px[1]} />\n            {px.length >= 3 && <Anchor i={2} p={px[2]} />}\n          </g>\n        );\n      }\n      default: {\n        // Line-based: trendline, ray, extended, arrow, ruler, curve, path, fib_channel…'),
    ('    case "channel": {\n      if (px.length < 2) return null;\n      const channelWidth = Math.min(H * 0.12, 60);\n      const [c0, c1] = parallelOffset(px[0], px[1], channelWidth);',
     '    case "channel": {\n      if (px.length < 2) return null;\n      const channelWidth = px.length >= 3\n        ? ((px[2].x - px[0].x) * (-(px[1].y - px[0].y)) + (px[2].y - px[0].y) * (px[1].x - px[0].x)) / (Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y) || 1)\n        : Math.min(H * 0.12, 60);\n      const [c0, c1] = parallelOffset(px[0], px[1], channelWidth);'),
    ('          <circle cx={px[1].x} cy={px[1].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n        </g>\n      );\n    }\n',
     '          <circle cx={px[1].x} cy={px[1].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          {px.length >= 3 && <circle cx={px[2].x} cy={px[2].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />}\n          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n          {px.length >= 3 && <Anchor i={2} p={px[2]} />}\n        </g>\n      );\n    }\n',
    ('  const [phase,      setPhase]      = useState<"idle" | "dragging" | "placed_first">("idle");\n  const [anchor,     setAnchor]     = useState<DrawingPoint | null>(null);\n  const [mousePoint, setMousePoint] = useState<DrawingPoint | null>(null);',
     '  const [phase,      setPhase]      = useState<"idle" | "dragging" | "placed_first" | "placed_second">("idle");\n  const [anchor,     setAnchor]     = useState<DrawingPoint | null>(null);\n  const [mousePoint, setMousePoint] = useState<DrawingPoint | null>(null);\n  const channelSecondRef = useRef<DrawingPoint | null>(null);'),
    ('  const clickPhaseRef               = useRef<0 | 1>(0);',
     '  const clickPhaseRef               = useRef<0 | 1 | 2>(0);'),
    ('    setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n    isDragging.current = false;',
     '    setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n    channelSecondRef.current = null;\n    isDragging.current = false;'),
    ('    if (pointsNeeded(activeTool) !== 2) return;',
     '    if (pointsNeeded(activeTool) < 2 || pointsNeeded(activeTool) > 3) return;'),
    ('    if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) {',
     '    if (isMobile && pointsNeeded(activeTool) >= 2 && pointsNeeded(activeTool) <= 3 && !isFreehand(activeTool)) {'),
    ('    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n\n    // ── Mobile: crosshair-drag model',
     '    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n\n    // ── Mobile: crosshair-drag model'),
    ('    if (clickPhaseRef.current === 0) {\n      // FIRST click — lock the first anchor and enter preview mode immediately\n      setAnchor(pt);\n      setMousePoint(pt);\n      setPhase("placed_first");\n      setIsDrawing(true);\n      clickPhaseRef.current = 1;\n    } else {\n      // SECOND click down — update live preview to exact cursor position\n      setMousePoint(pt);\n    }',
     '    if (activeTool === "channel") {\n      if (clickPhaseRef.current === 0) {\n        setAnchor(pt); setMousePoint(pt); setPhase("placed_first"); setIsDrawing(true); clickPhaseRef.current = 1;\n      } else if (clickPhaseRef.current === 1) {\n        channelSecondRef.current = pt; setMousePoint(pt); setPhase("placed_second"); clickPhaseRef.current = 2;\n      } else {\n        setMousePoint(pt);\n      }\n      return;\n    }\n\n    if (clickPhaseRef.current === 0) {\n      // FIRST click — lock the first anchor and enter preview mode immediately\n      setAnchor(pt);\n      setMousePoint(pt);\n      setPhase("placed_first");\n      setIsDrawing(true);\n      clickPhaseRef.current = 1;\n    } else {\n      // SECOND click down — update live preview to exact cursor position\n      setMousePoint(pt);\n    }'),
    ('    if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) {',
     '    if (isMobile && pointsNeeded(activeTool) >= 2 && pointsNeeded(activeTool) <= 3 && !isFreehand(activeTool)) {'),
    ('    const previewDrawing: Drawing | null =\n    (phase === "dragging" || phase === "placed_first") && anchor && mousePoint && activeTool !== "eraser" && pointsNeeded(activeTool) === 2\n      ? { id: -1, symbol, timeframe, toolType: activeTool, points: [anchor, mousePoint], style: activeStyle, isLocked: false, isVisible: true, createdAt: "" }\n      : null;',
     '    const previewPoints = activeTool === "channel" && channelSecondRef.current && mousePoint\n      ? [anchor, channelSecondRef.current, mousePoint]\n      : [anchor, mousePoint];\n    const previewDrawing: Drawing | null =\n    (phase === "dragging" || phase === "placed_first" || phase === "placed_second") && anchor && mousePoint && activeTool !== "eraser" && pointsNeeded(activeTool) >= 2\n      ? { id: -1, symbol, timeframe, toolType: activeTool, points: previewPoints as DrawingPoint[], style: activeStyle, isLocked: false, isVisible: true, createdAt: "" }\n      : null;'),
    ('    // ── 2-point / 3-point tools: click-click commit ───────────────────────\n    // This fires on EVERY pointerUp.',
     '    // ── Parallel channel: third click defines the parallel offset ─────────\n    if (activeTool === "channel") {\n      if (isMobile) return;\n      if (clickPhaseRef.current !== 2 || !anchor || !channelSecondRef.current) return;\n      const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      if (!pt) return;\n      const a = channelSecondRef.current;\n      if (Math.hypot(e.clientX - (overlayRef.current?.getBoundingClientRect().left ?? 0), e.clientY - (overlayRef.current?.getBoundingClientRect().top ?? 0)) < 0) return;\n      await saveDrawing([anchor, a, pt]);\n      channelSecondRef.current = null; setAnchor(null); setMousePoint(null); setPhase("idle"); setIsDrawing(false); clickPhaseRef.current = 0;\n      if (!useDrawingStore.getState().stayInDraw) setActiveTool("cursor");\n      return;\n    }\n\n    // ── 2-point / 3-point tools: click-click commit ───────────────────────\n    // This fires on EVERY pointerUp.')
])

# The replacement above intentionally changes only the desktop path. Add the
# mobile channel tap handling inside the existing mobile tap branch.
p = ROOT / 'artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx'
s = p.read_text(encoding='utf-8')
old = '''      if (clickPhaseRef.current === 0) {\n        // First tap → place Point A\n        setAnchor(pt);\n        setMousePoint(pt);\n        setPhase("placed_first");\n        setIsDrawing(true);\n        clickPhaseRef.current = 1;\n        // Defensively re-assert crosshair lines visible (React re-renders may not\n        // have reset them, but being explicit guarantees they stay shown).\n        if (xhairHRef.current) xhairHRef.current.style.display = "";\n        if (xhairVRef.current) xhairVRef.current.style.display = "";\n      } else {\n        // Second tap → place Point B and commit\n        setSnapIndicator(null);\n        if (activeTool === "position_long" || activeTool === "position_short") {'''
new = '''      if (activeTool === "channel") {\n        if (clickPhaseRef.current === 0) {\n          setAnchor(pt); setMousePoint(pt); setPhase("placed_first"); setIsDrawing(true); clickPhaseRef.current = 1;\n        } else if (clickPhaseRef.current === 1) {\n          channelSecondRef.current = pt; setMousePoint(pt); setPhase("placed_second"); clickPhaseRef.current = 2;\n        } else {\n          setSnapIndicator(null);\n          if (channelSecondRef.current) await saveDrawing([anchor!, channelSecondRef.current, pt]);\n          channelSecondRef.current = null; setAnchor(null); setMousePoint(null); setPhase("idle"); setIsDrawing(false); clickPhaseRef.current = 0;\n          if (!useDrawingStore.getState().stayInDraw) setActiveTool("cursor");\n        }\n      } else if (clickPhaseRef.current === 0) {\n        // First tap → place Point A\n        setAnchor(pt);\n        setMousePoint(pt);\n        setPhase("placed_first");\n        setIsDrawing(true);\n        clickPhaseRef.current = 1;\n        // Defensively re-assert crosshair lines visible (React re-renders may not\n        // have reset them, but being explicit guarantees they stay shown).\n        if (xhairHRef.current) xhairHRef.current.style.display = "";\n        if (xhairVRef.current) xhairVRef.current.style.display = "";\n      } else {\n        // Second tap → place Point B and commit\n        setSnapIndicator(null);\n        if (activeTool === "position_long" || activeTool === "position_short") {'''
if old not in s:
    raise SystemExit('Missing mobile channel anchor')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# Re-assert channel state cleanup on context/right-click paths.
p = ROOT / 'artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx'
s = p.read_text(encoding='utf-8')
s = s.replace('      setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n      clickPhaseRef.current = 0;', '      setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n      channelSecondRef.current = null;\n      clickPhaseRef.current = 0;', 1)
p.write_text(s, encoding='utf-8')

print('Parallel channel patch applied successfully')
