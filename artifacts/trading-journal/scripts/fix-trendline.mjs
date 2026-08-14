import fs from "node:fs";

function patch(file, replacements) {
  let s = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) {
    if (!s.includes(from)) {
      // Already patched is fine; otherwise fail loudly so a future source change
      // does not silently produce a partial build.
      if (!s.includes(to)) throw new Error(`Expected pattern not found in ${file}`);
      continue;
    }
    s = s.replace(from, to);
  }
  fs.writeFileSync(file, s, "utf8");
}

patch("src/components/charts/drawingCanvasRenderer.ts", [
  [
    'if (isSelected && toolType !== "position_long" && toolType !== "position_short") {',
    'if (isSelected && toolType !== "position_long" && toolType !== "position_short" && toolType !== "trendline") {'
  ],
  [
`        if (isSelected) {
          ctx.save();
          ctx.shadowBlur  = 0;
          ctx.strokeStyle = col;
          ctx.lineWidth   = sw + 7;
          ctx.globalAlpha *= 0.2;
          drawLine(ctx, a, b);
          ctx.restore();
        }
        drawLine(ctx, a, b);`,
`        drawLine(ctx, a, b);`
  ],
  [
`              if (isSelected) {
                ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = col;
                ctx.lineWidth = sw + 7; ctx.globalAlpha *= 0.2;
                drawLine(ctx, a, b); ctx.restore();
              }
              drawLine(ctx, a, b);`,
`              drawLine(ctx, a, b);`
  ],
]);

// DrawingOverlay is the SVG fallback/interaction layer. Trendlines should not
// receive the blue selection glow; endpoint handles remain available for editing.
patch("src/components/charts/DrawingOverlay.tsx", [
  [
    'if (!isSelected) return null;',
    'if (!isSelected || toolType === "trendline") return null;'
  ],
  [
`          {isSelected && (
            <path d={d} stroke="#3b82f6" strokeWidth={Math.max(sw + 16, 20)}
              fill="none" strokeLinecap="round" opacity={0.10} />
          )}
          <Glow d={d} />`,
`          <Glow d={d} />`
  ],
]);

console.log("Trendline styling fixed: default white, no selection glow.");
