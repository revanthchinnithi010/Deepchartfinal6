from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx"
source = PATH.read_text()

old = '''    case "channel": {
      if (px.length < 2) return null;
      const dx=px[1].x-px[0].x,dy=px[1].y-px[0].y,len=Math.hypot(dx,dy)||1;'''

new = '''    case "channel": {
      if (px.length < 2) return null;
      // TradingView-style channel interaction: after Point 1 and Point 2,
      // show only the base trendline. Do not invent a channel width until
      // Point 3 has actually been placed; the third point controls the offset.
      if (px.length === 2) {
        const d = extendBothEnds(px[0], px[1], W, H);
        return (
          <g opacity={op} {...eraseClick}>
            <Glow d={d} />
            <path d={d} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />
            <path d={d} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" />
          </g>
        );
      }
      const dx=px[1].x-px[0].x,dy=px[1].y-px[0].y,len=Math.hypot(dx,dy)||1;'''

if old not in source:
    raise SystemExit("channel renderer anchor not found")

PATH.write_text(source.replace(old, new, 1))
print("Channel preview guard applied")
