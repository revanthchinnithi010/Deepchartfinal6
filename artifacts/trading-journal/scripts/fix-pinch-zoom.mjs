import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../src/components/charts/CustomChart.tsx");
let s = fs.readFileSync(file, "utf8");

// ── 1) Unlimited pinch zoom ─────────────────────────────────────────────────
// Remove every artificial logical-bar min/max. The only practical limits are
// the browser/LWC floating-point range and the amount of history the API can
// actually provide. Keep the finger midpoint anchored so the chart expands
// from the user's pinch point instead of drifting horizontally.
const pinchBlock = /const currentBars = \(range\.to as number\) - \(range\.from as number\);[\s\S]*?const newTo\s*=\s*newFrom \+ newBars;/;
const pinchReplacement = `const currentBars = Math.max(Number.EPSILON, (range.to as number) - (range.from as number));
      const ratio = prevSpan / span;
      if (!Number.isFinite(ratio) || ratio <= 0) return;

      // No artificial zoom-out ceiling. Pinching inward can keep increasing the
      // logical range for as long as the user continues the gesture.
      const newBars = currentBars * ratio;
      if (!Number.isFinite(newBars) || newBars <= 0) return;

      const rect = container.getBoundingClientRect();
      const midX = ((t0.clientX + t1.clientX) / 2) - rect.left;
      const anchor = ch.timeScale().coordinateToLogical(midX)
        ?? (((range.from as number) + (range.to as number)) / 2);
      const anchorFrac = (anchor - (range.from as number)) / currentBars;
      const newFrom = anchor - newBars * anchorFrac;
      const newTo = newFrom + newBars;`;
if (pinchBlock.test(s)) s = s.replace(pinchBlock, pinchReplacement);

// ── 2) Remove the time-scale zoom-out ceiling ────────────────────────────────
// Dragging the time axis left must continue exposing older candles. Do not
// clamp the range to 500k/2m bars.
s = s.replace(
  /const newBars\s*=\s*startBars \* Math\.pow\(2,\s*-?totalDx \/ \(w \* 0\.2\)\);\n\s*const safeBars\s*=\s*Math\.max\([^\n]+\);\n\s*try \{\n\s*ch\.timeScale\(\)\.setVisibleLogicalRange\(\{ from: toEdge - safeBars, to: toEdge \}\);/,
  `const newBars = startBars * Math.pow(2, -totalDx / (w * 0.2));
        if (!Number.isFinite(newBars) || newBars <= 0) return;
        try {
          ch.timeScale().setVisibleLogicalRange({ from: toEdge - newBars, to: toEdge });`
);

// ── 3) Never let minBarSpacing stop zoom-out ─────────────────────────────────
s = s.replace(/minBarSpacing:\s*4\b/g, "minBarSpacing: 0.01");
s = s.replace(/minBarSpacing:\s*\d+(?:\.\d+)?\b/g, "minBarSpacing: 0.01");

// ── 4) Do not stop history at an arbitrary 10,000-bar ceiling ───────────────
s = s.replace(/const MAX_TOTAL_BARS\s*=\s*10_000;/, "const MAX_TOTAL_BARS = Number.POSITIVE_INFINITY;");
s = s.replace(/if \(merged\.length >= MAX_TOTAL_BARS\) hasMoreHistoryRef\.current = false;/, "if (merged.length >= MAX_TOTAL_BARS) hasMoreHistoryRef.current = false;");

fs.writeFileSync(file, s);
console.log("[zoom-fix] unlimited pinch/time zoom + unlimited history ceiling removed");
