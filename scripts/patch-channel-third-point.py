from pathlib import Path

p = Path("artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx")
s = p.read_text()

# Keep the mobile Parallel Channel interaction alive after Point 2 so Point 3
# can be positioned by drag instead of the tool completing early.
old = '''        else if (clickPhaseRef.current===1) { channelSecondRef.current=pt;setMousePoint(pt);setPhase("placed_second");clickPhaseRef.current=2; }'''
new = '''        else if (clickPhaseRef.current===1) {
          channelSecondRef.current=pt;
          setMousePoint(pt);
          setPhase("placed_second");
          clickPhaseRef.current=2;
          if (xhairHRef.current) xhairHRef.current.style.display = "";
          if (xhairVRef.current) xhairVRef.current.style.display = "";
        }'''
if old in s:
    s = s.replace(old, new, 1)

old_guard = 'if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) return;'
new_guard = 'if (isMobile && activeTool === "channel" && !isFreehand(activeTool)) return;'
if old_guard in s:
    s = s.replace(old_guard, new_guard, 1)

# Replace the DrawingShape Parallel Channel renderer with geometry that:
#   1) shows only the base line before Point 3,
#   2) starts both rails exactly at Point 1 / Point 3's parallel offset,
#   3) extends both rails to the right only (never through the left side), and
#   4) avoids the historical baseA/baseB runtime references.
start_marker = '      // TradingView-style channel interaction: after Point 1 and Point 2,'
start = s.find(start_marker)
if start < 0:
    raise SystemExit("channel renderer marker not found; refusing unsafe edit")
end = s.find('    case "rect": {', start)
if end < 0:
    raise SystemExit("channel renderer end marker not found; refusing unsafe edit")

new_block = '''      // TradingView-style channel interaction: Point 1 + Point 2 define the base,
      // and Point 3 defines the parallel offset. Never extend the rails to the left.
      if (px.length === 2) {
        const d = extendRight(px[0], px[1], W);
        return (
          <g opacity={op} {...eraseClick}>
            <Glow d={d} />
            <path d={d} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />
            <path d={d} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" />
            <Anchor i={0} p={px[0]} />
            <Anchor i={1} p={px[1]} />
          </g>
        );
      }

      const dx = px[1].x - px[0].x;
      const dy = px[1].y - px[0].y;
      const len = Math.hypot(dx, dy) || 1;
      const channelWidth = ((px[2].x - px[0].x) * (-dy) + (px[2].y - px[0].y) * dx) / len;
      const [c0, c1] = parallelOffset(px[0], px[1], channelWidth);
      const d1 = extendRight(px[0], px[1], W);
      const d2 = extendRight(c0, c1, W);

      const slope = Math.abs(dx) > 0.5 ? dy / dx : null;
      const rightBase: Px = Math.abs(dx) <= 0.5
        ? { x: px[0].x, y: 0 }
        : { x: W + 20, y: px[0].y + slope! * (W + 20 - px[0].x) };
      const rightOffset: Px = Math.abs(dx) <= 0.5
        ? { x: c0.x, y: 0 }
        : { x: W + 20, y: c0.y + slope! * (W + 20 - c0.x) };

      return (
        <g opacity={op} {...eraseClick}>
          <Glow d={d1} />
          <path d={d1} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />
          <path d={d2} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />
          <path d={d1} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" />
          <path d={d2} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" opacity={0.6} />
          <polygon points={`${px[0].x},${px[0].y} ${rightBase.x},${rightBase.y} ${rightOffset.x},${rightOffset.y} ${c0.x},${c0.y}`} fill={col} fillOpacity={style.fillOpacity * 0.5} />
          <Anchor i={0} p={px[0]} />
          <Anchor i={1} p={px[1]} />
          <Anchor i={2} p={px[2]} />
        </g>
      );
    }

'''
s = s[:start] + new_block + s[end:]

if 'baseA' in new_block or 'baseB' in new_block or 'offA' in new_block or 'offB' in new_block:
    raise SystemExit("unsafe channel geometry remained")
if 'const d1 = extendRight(px[0], px[1], W);' not in s:
    raise SystemExit("right-only channel geometry was not installed")

p.write_text(s)
print("channel third-point + right-only channel geometry patch applied")
