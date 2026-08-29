from pathlib import Path
R=Path(__file__).resolve().parents[1]

def P(path,old,new):
 p=R/path;s=p.read_text()
 if old not in s: raise SystemExit(f'Missing anchor {path}: {old[:120]!r}')
 p.write_text(s.replace(old,new,1))

P('artifacts/trading-journal/src/types/drawing.ts',
'''  if (tool === "hline" || tool === "hray" || tool === "vline" || tool === "eraser" || tool === "text" || tool === "note") return 1;\n  if (isFreehand(tool)) return Infinity;\n  return 2;''',
'''  if (tool === "hline" || tool === "hray" || tool === "vline" || tool === "eraser" || tool === "text" || tool === "note") return 1;\n  if (isFreehand(tool)) return Infinity;\n  if (tool === "channel") return 3;\n  return 2;''')

P('artifacts/trading-journal/src/components/charts/drawingCanvasRenderer.ts',
'''      case "channel": {\n        if (px.length < 2) break;\n        const cW = Math.min(H * 0.12, 60);\n        const [c0, c1] = parallelOffset(px[0], px[1], cW);''',
'''      case "channel": {\n        if (px.length < 2) break;\n        const dx = px[1].x - px[0].x, dy = px[1].y - px[0].y;\n        const len = Math.hypot(dx, dy) || 1;\n        const cW = px.length >= 3 ? ((px[2].x-px[0].x)*(-dy)+(px[2].y-px[0].y)*dx)/len : Math.min(H*0.12,60);\n        const [c0, c1] = parallelOffset(px[0], px[1], cW);''')
P('artifacts/trading-journal/src/components/charts/drawingCanvasRenderer.ts',
'''        dot(ctx, px[0].x, px[0].y, 3.5, col);\n        dot(ctx, px[1].x, px[1].y, 3.5, col);\n        break;\n      }\n\n      case "fib": {''',
'''        dot(ctx, px[0].x, px[0].y, 3.5, col);\n        dot(ctx, px[1].x, px[1].y, 3.5, col);\n        if (px.length >= 3) dot(ctx, px[2].x, px[2].y, 3.5, col);\n        break;\n      }\n\n      case "fib": {''')

P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    case "channel":\n      if (pts.length < 2) return false;\n      return (\n        distToSeg({ x: cx, y: cy }, pts[0], pts[1]) < T ||\n        (pts.length >= 4 ? distToSeg({ x: cx, y: cy }, pts[2], pts[3]) < T : false) ||\n        (pts.length >= 3 ? distToSeg({ x: cx, y: cy }, pts[1], pts[2]) < T : false)\n      );''',
'''    case "channel": {\n      if (pts.length < 2) return false;\n      const dx=pts[1].x-pts[0].x, dy=pts[1].y-pts[0].y, len=Math.hypot(dx,dy)||1;\n      const off=pts.length>=3?((pts[2].x-pts[0].x)*(-dy)+(pts[2].y-pts[0].y)*dx)/len:0;\n      const [c0,c1]=parallelOffset(pts[0],pts[1],off);\n      return distToSeg({x:cx,y:cy},pts[0],pts[1])<T || (pts.length>=3 && distToSeg({x:cx,y:cy},c0,c1)<T) || (pts.length>=3 && Math.hypot(cx-pts[2].x,cy-pts[2].y)<T*1.2);\n    }''')

P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''  const [phase,      setPhase]      = useState<"idle" | "dragging" | "placed_first">("idle");\n  const [anchor,     setAnchor]     = useState<DrawingPoint | null>(null);\n  const [mousePoint, setMousePoint] = useState<DrawingPoint | null>(null);''',
'''  const [phase,      setPhase]      = useState<"idle" | "dragging" | "placed_first" | "placed_second">("idle");\n  const [anchor,     setAnchor]     = useState<DrawingPoint | null>(null);\n  const [mousePoint, setMousePoint] = useState<DrawingPoint | null>(null);\n  const channelSecondRef = useRef<DrawingPoint | null>(null);''')
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx','  const clickPhaseRef               = useRef<0 | 1>(0);','  const clickPhaseRef               = useRef<0 | 1 | 2>(0);')

P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''      setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n      clickPhaseRef.current = 0;\n      return;''',
'''      setPhase("idle"); setAnchor(null); setMousePoint(null); setIsDrawing(false);\n      channelSecondRef.current = null;\n      clickPhaseRef.current = 0;\n      return;''')

P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n\n    // ── Mobile: crosshair-drag model — save anchor, do NOT place point yet ─''',
'''    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n    if (activeTool === "channel") {\n      const p = snapToOHLC(e.clientX,e.clientY,e.shiftKey);\n      if (!p) return;\n      if (clickPhaseRef.current===0) { setAnchor(p);setMousePoint(p);setPhase("placed_first");setIsDrawing(true);clickPhaseRef.current=1; }\n      else if (clickPhaseRef.current===1) { channelSecondRef.current=p;setMousePoint(p);setPhase("placed_second");clickPhaseRef.current=2; }\n      else setMousePoint(p);\n      return;\n    }\n\n    // ── Mobile: crosshair-drag model — save anchor, do NOT place point yet ─''')

# mobile conditions, both occurrences
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx','pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)','pointsNeeded(activeTool) >= 2 && pointsNeeded(activeTool) <= 3 && !isFreehand(activeTool)')
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx','pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)','pointsNeeded(activeTool) >= 2 && pointsNeeded(activeTool) <= 3 && !isFreehand(activeTool)')

# Mobile channel branch before normal first-tap branch.
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''      if (clickPhaseRef.current === 0) {\n        // First tap → place Point A''',
'''      if (activeTool === "channel") {\n        if (clickPhaseRef.current===0) { setAnchor(pt);setMousePoint(pt);setPhase("placed_first");setIsDrawing(true);clickPhaseRef.current=1; }\n        else if (clickPhaseRef.current===1) { channelSecondRef.current=pt;setMousePoint(pt);setPhase("placed_second");clickPhaseRef.current=2; }\n        else if (channelSecondRef.current) { await saveDrawing([anchor!,channelSecondRef.current,pt]);channelSecondRef.current=null;setAnchor(null);setMousePoint(null);setPhase("idle");setIsDrawing(false);clickPhaseRef.current=0;if(!useDrawingStore.getState().stayInDraw)setActiveTool("cursor"); }\n      } else if (clickPhaseRef.current === 0) {\n        // First tap → place Point A''')

# Desktop third click commit before normal 2-point commit.
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''    if (clickPhaseRef.current !== 1) return;\n\n    const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);''',
'''    if (activeTool === "channel") {\n      if (clickPhaseRef.current!==2 || !anchor || !channelSecondRef.current) return;\n      const p3=snapToOHLC(e.clientX,e.clientY,e.shiftKey); if(!p3) return;\n      await saveDrawing([anchor,channelSecondRef.current,p3]);\n      channelSecondRef.current=null;setAnchor(null);setMousePoint(null);setPhase("idle");setIsDrawing(false);clickPhaseRef.current=0;if(!useDrawingStore.getState().stayInDraw)setActiveTool("cursor");\n      return;\n    }\n    if (clickPhaseRef.current !== 1) return;\n\n    const pt = snapToOHLC(e.clientX, e.clientY, e.shiftKey);''')

# preview
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''  const previewDrawing: Drawing | null =\n    (phase === "dragging" || phase === "placed_first") && anchor && mousePoint && activeTool !== "eraser" && pointsNeeded(activeTool) === 2\n      ? { id: -1, symbol, timeframe, toolType: activeTool, points: [anchor, mousePoint], style: activeStyle, isLocked: false, isVisible: true, createdAt: "" }\n      : null;''',
'''  const previewPts = activeTool === "channel" && channelSecondRef.current && mousePoint ? [anchor!,channelSecondRef.current,mousePoint] : [anchor!,mousePoint!];\n  const previewDrawing: Drawing | null =\n    (phase === "dragging" || phase === "placed_first" || phase === "placed_second") && anchor && mousePoint && activeTool !== "eraser" && pointsNeeded(activeTool) >= 2\n      ? { id:-1,symbol,timeframe,toolType:activeTool,points:previewPts as DrawingPoint[],style:activeStyle,isLocked:false,isVisible:true,createdAt:"" } : null;''')

# Selected channel rendering: width comes from point 3 and point 3 gets a handle.
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''      const channelWidth = Math.min(H * 0.12, 60);\n      const [c0, c1] = parallelOffset(px[0], px[1], channelWidth);''',
'''      const dx=px[1].x-px[0].x,dy=px[1].y-px[0].y,len=Math.hypot(dx,dy)||1;\n      const channelWidth=px.length>=3?((px[2].x-px[0].x)*(-dy)+(px[2].y-px[0].y)*dx)/len:Math.min(H*0.12,60);\n      const [c0,c1]=parallelOffset(px[0],px[1],channelWidth);''')
P('artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx',
'''          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n        </g>\n      );\n    }\n\n    case "rect": {''',
'''          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n          {px.length>=3 && <Anchor i={2} p={px[2]} />}\n        </g>\n      );\n    }\n\n    case "rect": {''')

print('v3 complete')
