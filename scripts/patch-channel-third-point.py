from pathlib import Path

p = Path("artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx")
s = p.read_text()

old = '''        else if (clickPhaseRef.current===1) { channelSecondRef.current=pt;setMousePoint(pt);setPhase("placed_second");clickPhaseRef.current=2; }'''
new = '''        else if (clickPhaseRef.current===1) {
          channelSecondRef.current=pt;
          setMousePoint(pt);
          setPhase("placed_second");
          clickPhaseRef.current=2;
          // Keep the full-span crosshair active after Point 2 so the user can
          // drag vertically to position Point 3 before committing the channel.
          if (xhairHRef.current) xhairHRef.current.style.display = "";
          if (xhairVRef.current) xhairVRef.current.style.display = "";
        }'''

if old in s:
    s = s.replace(old, new, 1)

old_guard = 'if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) return;'
new_guard = 'if (isMobile && activeTool === "channel" && !isFreehand(activeTool)) return;'
if old_guard in s:
    s = s.replace(old_guard, new_guard, 1)

p.write_text(s)
print("channel third-point patch applied")
