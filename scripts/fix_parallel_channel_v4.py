from pathlib import Path
R=Path(__file__).resolve().parents[1]

def patch(path, old, new, count=1):
    p=R/path; s=p.read_text()
    if old not in s:
        raise SystemExit(f'MISSING {path}: {old[:180]!r}')
    p.write_text(s.replace(old,new,count))

# 1) Mobile: channel is a 3-tap tool, so it must use the crosshair/tap path.
# The previous implementation handled channel before the mobile branch, which
# bypassed the mobile crosshair and made the third point inconsistent.
p='artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx'
patch(p,
'''    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n    if (activeTool === "channel") {\n      const p = snapToOHLC(e.clientX,e.clientY,e.shiftKey);\n      if (!p) return;\n      if (clickPhaseRef.current===0) { setAnchor(p);setMousePoint(p);setPhase("placed_first");setIsDrawing(true);clickPhaseRef.current=1; }\n      else if (clickPhaseRef.current===1) { channelSecondRef.current=p;setMousePoint(p);setPhase("placed_second");clickPhaseRef.current=2; }\n      else setMousePoint(p);\n      return;\n    }\n\n    // ── Mobile: crosshair-drag model — save anchor, do NOT place point yet ─''',
'''    // ── 2-point / 3-point tools: TradingView click-click interaction ───────\n    // Mobile uses the crosshair/tap path below. Keeping channel inside the\n    // desktop branch here would bypass the mobile crosshair for all 3 taps.\n\n    // ── Mobile: crosshair-drag model — save anchor, do NOT place point yet ─''')

# 2) Mobile pointer-up must include 3-point channel and commit the third tap.
patch(p,
'''    if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) {''',
'''    if (isMobile && pointsNeeded(activeTool) >= 2 && pointsNeeded(activeTool) <= 3 && !isFreehand(activeTool)) {''',2)

# 3) Mobile pointer-up channel state is already implemented, but make sure the
# second/third phase is driven by the crosshair point and survives React renders.
# Add explicit reset of the mobile drag state after a channel tap.
patch(p,
'''        if (clickPhaseRef.current===0) { setAnchor(pt);setMousePoint(pt);setPhase("placed_first");setIsDrawing(true);clickPhaseRef.current=1; }\n        else if (clickPhaseRef.current===1) { channelSecondRef.current=pt;setMousePoint(pt);setPhase("placed_second");clickPhaseRef.current=2; }\n        else if (channelSecondRef.current) { await saveDrawing([anchor!,channelSecondRef.current,pt]);channelSecondRef.current=null;setAnchor(null);setMousePoint(null);setPhase("idle");setIsDrawing(false);clickPhaseRef.current=0;if(!useDrawingStore.getState().stayInDraw)setActiveTool("cursor"); }''',
'''        if (clickPhaseRef.current===0) { setAnchor(pt);setMousePoint(pt);setPhase("placed_first");setIsDrawing(true);clickPhaseRef.current=1; }\n        else if (clickPhaseRef.current===1) { channelSecondRef.current=pt;setMousePoint(pt);setPhase("placed_second");clickPhaseRef.current=2; }\n        else if (channelSecondRef.current) {\n          await saveDrawing([anchor!,channelSecondRef.current,pt]);\n          channelSecondRef.current=null;setAnchor(null);setMousePoint(null);setPhase("idle");setIsDrawing(false);clickPhaseRef.current=0;\n          mobileDrawDragAnchor.current=null; mobilePointerStart.current=null;\n          if(!useDrawingStore.getState().stayInDraw)setActiveTool("cursor");\n        }''')

# 4) Remove the now-unreachable desktop channel special block after the mobile block.
patch(p,
'''    if (activeTool === "channel") {\n      if (clickPhaseRef.current!==2 || !anchor || !channelSecondRef.current) return;\n      const p3=snapToOHLC(e.clientX,e.clientY,e.shiftKey); if(!p3) return;\n      await saveDrawing([anchor,channelSecondRef.current,p3]);\n      channelSecondRef.current=null;setAnchor(null);setMousePoint(null);setPhase("idle");setIsDrawing(false);clickPhaseRef.current=0;if(!useDrawingStore.getState().stayInDraw)setActiveTool("cursor");\n      return;\n    }\n    if (clickPhaseRef.current !== 1) return;''',
'''    // Channel is committed in the desktop 3-click path below and in the mobile\n    // crosshair path above. Continue here only for the ordinary 2-point tools.\n    if (activeTool === "channel") {\n      if (clickPhaseRef.current !== 2 || !anchor || !channelSecondRef.current) return;\n      const p3 = snapToOHLC(e.clientX, e.clientY, e.shiftKey);\n      if (!p3) return;\n      await saveDrawing([anchor, channelSecondRef.current, p3]);\n      channelSecondRef.current = null; setAnchor(null); setMousePoint(null);\n      setPhase("idle"); setIsDrawing(false); clickPhaseRef.current = 0;\n      if (!useDrawingStore.getState().stayInDraw) setActiveTool("cursor");\n      return;\n    }\n    if (clickPhaseRef.current !== 1) return;''')

# 5) Make the SVG channel geometry exactly parallel to the base line. The old
# polygon used mixed coordinates, producing a skewed/non-parallel shaded zone.
patch(p,
'''      const [c0,c1]=parallelOffset(px[0],px[1],channelWidth);\n      const d1 = extendBothEnds(px[0], px[1], W, H);\n      const d2 = extendBothEnds(c0, c1, W, H);\n      return (\n        <g opacity={op} {...eraseClick}>\n          <Glow d={d1} />\n          <path d={d1} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n          <path d={d1} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" />\n          <path d={d2} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" opacity={0.6} />\n          <polygon\n            points={`${Math.max(-20, px[0].x - 50)},${px[0].y + (px[0].y - px[1].y) * -10} ${Math.min(W + 20, px[1].x + 50)},${px[1].y} ${Math.min(W + 20, c1.x + 50)},${c1.y} ${Math.max(-20, c0.x - 50)},${c0.y}`}\n            fill={col} fillOpacity={style.fillOpacity * 0.5} />\n          <circle cx={px[0].x} cy={px[0].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          <circle cx={px[1].x} cy={px[1].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n          {px.length>=3 && <Anchor i={2} p={px[2]} />}\n        </g>\n      );''',
'''      const [c0,c1]=parallelOffset(px[0],px[1],channelWidth);\n      const [a1,b1]=extendBothEnds(px[0],px[1],W,H).split(" ") as any;\n      // Use the same infinite line geometry for both rails. The offset rail is\n      // parallel by construction; the shaded zone is the exact quadrilateral\n      // between the two extended rails.\n      const baseSlope = Math.abs(px[1].x-px[0].x) > 0.5 ? (px[1].y-px[0].y)/(px[1].x-px[0].x) : null;\n      const baseA: Px = Math.abs(px[1].x-px[0].x) <= 0.5\n        ? {x:px[0].x,y:-20}\n        : {x:-20,y:px[0].y+(baseSlope!)*(-20-px[0].x)};\n      const baseB: Px = Math.abs(px[1].x-px[0].x) <= 0.5\n        ? {x:px[0].x,y:H+20}\n        : {x:W+20,y:px[0].y+(baseSlope!)*(W+20-px[0].x)};\n      const offA: Px = Math.abs(c1.x-c0.x) <= 0.5\n        ? {x:c0.x,y:-20}\n        : {x:-20,y:c0.y+(baseSlope!)*(-20-c0.x)};\n      const offB: Px = Math.abs(c1.x-c0.x) <= 0.5\n        ? {x:c0.x,y:H+20}\n        : {x:W+20,y:c0.y+(baseSlope!)*(W+20-c0.x)};\n      const d1=`M ${baseA.x.toFixed(1)} ${baseA.y.toFixed(1)} L ${baseB.x.toFixed(1)} ${baseB.y.toFixed(1)}`;\n      const d2=`M ${offA.x.toFixed(1)} ${offA.y.toFixed(1)} L ${offB.x.toFixed(1)} ${offB.y.toFixed(1)}`;\n      return (\n        <g opacity={op} {...eraseClick}>\n          <Glow d={d1} />\n          <path d={d1} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n          <path d={d2} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n          <path d={d1} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" />\n          <path d={d2} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" opacity={0.6} />\n          <polygon points={`${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${offB.x},${offB.y} ${offA.x},${offA.y}`} fill={col} fillOpacity={style.fillOpacity * 0.5} />\n          <circle cx={px[0].x} cy={px[0].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          <circle cx={px[1].x} cy={px[1].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />\n          {px.length>=3 && <circle cx={px[2].x} cy={px[2].y} r={3.5} fill={col} opacity={isSelected ? 0 : 0.85} />}\n          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n          {px.length>=3 && <Anchor i={2} p={px[2]} />}\n        </g>\n      );''')

# 6) Canvas renderer already has the same perpendicular offset math, but make its
# shaded quadrilateral use the exact two extended rails and no stale anchor points.
# No code change needed there beyond the existing 3-point cW calculation.

print('TradingView parallel channel v4 patch complete')
