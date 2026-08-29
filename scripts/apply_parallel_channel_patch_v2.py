from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def patch(path, old, new):
    p=ROOT/path; s=p.read_text()
    if old not in s: raise SystemExit(f'MISSING {path}: {old[:160]!r}')
    p.write_text(s.replace(old,new,1))

# drawing.ts
patch('artifacts/trading-journal/src/types/drawing.ts',
'''  if (tool === "hline" || tool === "hray" || tool === "vline" || tool === "eraser" || tool === "text" || tool === "note") return 1;\n  if (isFreehand(tool)) return Infinity;\n  return 2;''',
'''  if (tool === "hline" || tool === "hray" || tool === "vline" || tool === "eraser" || tool === "text" || tool === "note") return 1;\n  if (isFreehand(tool)) return Infinity;\n  if (tool === "channel") return 3;\n  return 2;''')

# Canvas channel width from anchor 3.
patch('artifacts/trading-journal/src/components/charts/drawingCanvasRenderer.ts',
'''      case "channel": {\n        if (px.length < 2) break;\n        const cW = Math.min(H * 0.12, 60);\n        const [c0, c1] = parallelOffset(px[0], px[1], cW);''',
'''      case "channel": {\n        if (px.length < 2) break;\n        const dx = px[1].x - px[0].x, dy = px[1].y - px[0].y;\n        const len = Math.hypot(dx, dy) || 1;\n        const cW = px.length >= 3\n          ? ((px[2].x - px[0].x) * (-dy) + (px[2].y - px[0].y) * dx) / len\n          : Math.min(H * 0.12, 60);\n        const [c0, c1] = parallelOffset(px[0], px[1], cW);''')
patch('artifacts/trading-journal/src/components/charts/drawingCanvasRenderer.ts',
'''        dot(ctx, px[0].x, px[0].y, 3.5, col);\n        dot(ctx, px[1].x, px[1].y, 3.5, col);\n        break;\n      }\n\n      case "fib": {''',
'''        dot(ctx, px[0].x, px[0].y, 3.5, col);\n        dot(ctx, px[1].x, px[1].y, 3.5, col);\n        if (px.length >= 3) dot(ctx, px[2].x, px[2].y, 3.5, col);\n        break;\n      }\n\n      case "fib": {''')

# hit test
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    case "channel":\n      if (pts.length < 2) return false;\n      return (\n        distToSeg({ x: cx, y: cy }, pts[0], pts[1]) < T ||\n        (pts.length >= 4 ? distToSeg({ x: cx, y: cy }, pts[2], pts[3]) < T : false) ||\n        (pts.length >= 3 ? distToSeg({ x: cx, y: cy }, pts[1], pts[2]) < T : false)\n      );''',
'''    case "channel": {\n      if (pts.length < 2) return false;\n      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;\n      const len = Math.hypot(dx, dy) || 1;\n      const off = pts.length >= 3 ? ((pts[2].x - pts[0].x) * (-dy) + (pts[2].y - pts[0].y) * dx) / len : 0;\n      const [c0, c1] = parallelOffset(pts[0], pts[1], off);\n      return distToSeg({ x: cx, y: cy }, pts[0], pts[1]) < T ||\n             (pts.length >= 3 && distToSeg({ x: cx, y: cy }, c0, c1) < T) ||\n             (pts.length >= 3 && Math.hypot(cx - pts[2].x, cy - pts[2].y) < T * 1.2);\n    }''')

# state
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''  const [phase,      setPhase]      = useState<"idle" | "dragging" | "placed_first">("idle");\n  const [anchor,     setAnchor]     = useState<DrawingPoint | null>(null);\n  const [mousePoint, setMousePoint] = useState<DrawingPoint | null>(null);''',
'''  const [phase,      setPhase]      = useState<"idle" | "dragging" | "placed_first" | "placed_second">("idle");\n  const [anchor,     setAnchor]     = useState<DrawingPoint | null>(null);\n  const [mousePoint, setMousePoint] = useState<DrawingPoint | null>(null);\n  const channelSecondRef = useRef<DrawingPoint | null>(null);''')
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''  const clickPhaseRef               = useRef<0 | 1>(0);''',
'''  const clickPhaseRef               = useRef<0 | 1 | 2>(0);''')

# canvas-only selected channel: transparent hit rails + 3 handles
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''      case "fib":\n      case "fib_ext": {''',
'''      case "channel": {\n        if (px.length < 2) return null;\n        const dx = px[1].x - px[0].x, dy = px[1].y - px[0].y;\n        const len = Math.hypot(dx, dy) || 1;\n        const off = px.length >= 3 ? ((px[2].x - px[0].x) * (-dy) + (px[2].y - px[0].y) * dx) / len : 0;\n        const [c0, c1] = parallelOffset(px[0], px[1], off);\n        const d1 = extendBothEnds(px[0], px[1], W, H);\n        const d2 = extendBothEnds(c0, c1, W, H);\n        return <g opacity={op}>\n          <path d={d1} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n          <path d={d2} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n          <Anchor i={0} p={px[0]} /><Anchor i={1} p={px[1]} />\n          {px.length >= 3 && <Anchor i={2} p={px[2]} />}\n        </g>;\n      }\n      case "fib":\n      case "fib_ext": {''')

# normal selected rendering channel geometry
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    case "channel": {\n      if (px.length < 2) return null;\n      const channelWidth = Math.min(H * 0.12, 60);\n      const [c0, c1] = parallelOffset(px[0], px[1], channelWidth);''',
'''    case "channel": {\n      if (px.length < 2) return null;\n      const dx = px[1].x - px[0].x, dy = px[1].y - px[0].y;\n      const len = Math.hypot(dx, dy) || 1;\n      const channelWidth = px.length >= 3\n        ? ((px[2].x - px[0].x) * (-dy) + (px[2].y - px[0].y) * dx) / len\n        : Math.min(H * 0.12, 60);\n      const [c0, c1] = parallelOffset(px[0], px[1], channelWidth);''')
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''          <circle cx={px[1].x} cy={px[1].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />''',
'''          <circle cx={px[1].x} cy={px[1].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          {px.length >= 3 && <circle cx={px[2].x} cy={px[2].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />}\n          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n          {px.length >= 3 && <Anchor i={2} p={px[2]} />}''')

# right-click cleanup
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''      setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n      clickPhaseRef.current = 0;\n      return;''',
'''      setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n      channelSecondRef.current = null;\n      clickPhaseRef.current = 0;\n      return;''')

# desktop pointerdown: channel consumes three clicks
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n\n    // ── Mobile: crosshair-drag model — save anchor, do NOT place point yet ─''',
'''    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n    const ptForChannel = activeTool === "channel" ? snapToOHLC(e.clientX, e.clientY, e.shiftKey) : null;\n    if (activeTool === "channel" && ptForChannel) {\n      if (clickPhaseRef.current === 0) {\n        setAnchor(ptForChannel); setMousePoint(ptForChannel); setPhase("placed_first"); setIsDrawing(true); clickPhaseRef.current = 1;\n      } else if (clickPhaseRef.current === 1) {\n        channelSecondRef.current = ptForChannel; setMousePoint(ptForChannel); setPhase("placed_second"); clickPhaseRef.current = 2;\n      } else {\n        setMousePoint(ptForChannel);\n      }\n      return;\n    }\n\n    // ── Mobile: crosshair-drag model — save anchor, do NOT place point yet ─''')

# mobile supports channel 3 taps
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) {''',
'''    if (isMobile && pointsNeeded(activeTool) >= 2 && pointsNeeded(activeTool) <= 3 && !isFreehand(activeTool)) {''')
# replace the same occurrence in pointerup too (second occurrence)
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) {''',
'''    if (isMobile && pointsNeeded(activeTool) >= 2 && pointsNeeded(activeTool) <= 3 && !isFreehand(activeTool)) {''')

# mobile tap block: add channel branch before normal 2-point commit
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''      if (clickPhaseRef.current === 0) {\n        // First tap → place Point A\n        setAnchor(pt);\n        setMousePoint(pt);\n        setPhase("placed_first");\n        setIsDrawing(true);\n        clickPhaseRef.current = 1;''',
'''      if (activeTool === "channel") {\n        if (clickPhaseRef.current === 0) {\n          setAnchor(pt); setMousePoint(pt); setPhase("placed_first"); setIsDrawing(true); clickPhaseRef.current = 1;\n        } else if (clickPhaseRef.current === 1) {\n          channelSecondRef.current = pt; setMousePoint(pt); setPhase("placed_second"); clickPhaseRef.current = 2;\n        } else if (channelSecondRef.current) {\n          await saveDrawing([anchor!, channelSecondRef.current, pt]);\n          channelSecondRef.current = null; setAnchor(null); setMousePoint(null); setPhase("idle"); setIsDrawing(false); clickPhaseRef.current = 0;\n          if (!useDrawingStore.getState().stayInDraw) setActiveTool("cursor");\n        }\n      } else if (clickPhaseRef.current === 0) {\n        // First tap → place Point A\n        setAnchor(pt);\n        setMousePoint(pt);\n        setPhase("placed_first");\n        setIsDrawing(true);\n        clickPhaseRef.current = 1;''')

# desktop pointerup: channel third click commits, before generic phase check
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    if (clickPhaseRef.current !== 1) return;\n\n    const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);''',
'''    if (activeTool === "channel") {\n      if (clickPhaseRef.current !== 2 || !anchor || !channelSecondRef.current) return;\n      const pt3 = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      if (!pt3) return;\n      await saveDrawing([anchor, channelSecondRef.current, pt3]);\n      channelSecondRef.current = null; setAnchor(null); setMousePoint(null); setPhase("idle"); setIsDrawing(false); clickPhaseRef.current = 0;\n      if (!useDrawingStore.getState().stayInDraw) setActiveTool("cursor");\n      return;\n    }\n\n    if (clickPhaseRef.current !== 1) return;\n\n    const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);''')

# preview now includes third point while channel is in phase 2.
patch('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''  const previewDrawing: Drawing | null =\n    (phase === "dragging" || phase === "placed_first") && anchor && mousePoint && activeTool !== "eraser" && pointsNeeded(activeTool) === 2\n      ? { id: -1, symbol, timeframe, toolType: activeTool, points: [anchor, mousePoint], style: activeStyle, isLocked: false, isVisible: true, createdAt: "" }\n      : null;''',
'''  const previewPts = activeTool === "channel" && channelSecondRef.current && mousePoint\n    ? [anchor!, channelSecondRef.current, mousePoint]\n    : [anchor!, mousePoint!];\n  const previewDrawing: Drawing | null =\n    (phase === "dragging" || phase === "placed_first" || phase === "placed_second") && anchor && mousePoint && activeTool !== "eraser" && pointsNeeded(activeTool) >= 2\n      ? { id: -1, symbol, timeframe, toolType: activeTool, points: previewPts as DrawingPoint[], style: activeStyle, isLocked: false, isVisible: true, createdAt: "" }\n      : null;''')

print('v2 patch complete')
