import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../src/components/charts/CustomChart.tsx");
let s = fs.readFileSync(file, "utf8");

const old = `      const currentBars = (range.to as number) - (range.from as number);
      const ratio       = prevSpan / span;
      const newBars     = Math.max(3, Math.min(500_000, currentBars * ratio));

      // ── Zoom limit guard ─────────────────────────────────────────────────
      // If newBars equals currentBars the clamp absorbed the entire gesture
      // (already at min or max zoom). Skip setVisibleLogicalRange completely —
      // even though newBars didn't change, the anchor-midpoint calculation
      // below can produce a slightly different newFrom, which manifests as
      // unwanted horizontal drift when pinching at the zoom boundary.
      if (newBars === currentBars) return;

      // ── Anchor: live midpoint of the two fingers in logical bar space ─────
      const rect   = container.getBoundingClientRect();
      const midX   = ((t0.clientX + t1.clientX) / 2) - rect.left;
      const anchor = ch.timeScale().coordinateToLogical(midX)
                     ?? (((range.from as number) + (range.to as number)) / 2);

      const leftFrac = (anchor - (range.from as number)) / currentBars;
      const newFrom  = anchor - newBars * leftFrac;
      const newTo    = newFrom + newBars;`;

const next = `      const currentBars = Math.max(0.000001, (range.to as number) - (range.from as number));
      const ratio       = prevSpan / span;
      if (!Number.isFinite(ratio) || ratio <= 0) return;

      // No artificial min/max zoom. Keep the logical range proportional to
      // the finger span instead of clamping it at a zoom boundary.
      const newBars = currentBars * ratio;
      if (!Number.isFinite(newBars) || newBars <= 0) return;

      // ── Anchor: keep the midpoint under the fingers fixed ────────────────
      const rect   = container.getBoundingClientRect();
      const midX   = ((t0.clientX + t1.clientY) / 2) - rect.left;
      const anchor = ch.timeScale().coordinateToLogical(midX)
                     ?? (((range.from as number) + (range.to as number)) / 2);

      // Preserve the finger anchor exactly. This prevents horizontal drift
      // when the range becomes wider than the loaded candle set.
      const anchorFrac = (anchor - (range.from as number)) / currentBars;
      const newFrom  = anchor - newBars * anchorFrac;
      const newTo    = newFrom + newBars;`;

if (s.includes(old)) {
  s = s.replace(old, next);
}

// Dragging left on the time axis must zoom out (show more historical candles).
// The previous positive exponent did the opposite and quickly hit the zoom-in
// boundary, making the left side appear stuck.
s = s.replace(
  /const newBars\s*=\s*startBars \* Math\.pow\(2, totalDx \/ \(w \* 0\.2\)\);\n\s*const safeBars\s*=\s*Math\.max\(3, Math\.min\(500_000, newBars\));\n\s*try \{\n\s*ch\.timeScale\(\)\.setVisibleLogicalRange\(\{ from: toEdge - safeBars, to: toEdge \}\);/,
  `const newBars   = startBars * Math.pow(2, -totalDx / (w * 0.2));
        const safeBars  = Math.max(1, Math.min(2_000_000, newBars));
        try {
          ch.timeScale().setVisibleLogicalRange({ from: toEdge - safeBars, to: toEdge });`
);

// The previous minBarSpacing=4 was itself a hard zoom-out boundary on mobile.
s = s.replace(/minBarSpacing:\s*4\b/g, "minBarSpacing: 0.01");

fs.writeFileSync(file, s);
console.log("[pinch-fix] Unlimited pinch zoom + corrected horizontal zoom direction");
