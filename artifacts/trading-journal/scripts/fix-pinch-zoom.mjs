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

      // No artificial min/max zoom. Lightweight Charts can represent logical
      // ranges beyond the loaded dataset, so keep expanding/contracting the
      // range instead of clamping it. Clamping here was the source of the
      // "Limit" state and the horizontal jump at the zoom boundary.
      const newBars = currentBars * ratio;
      if (!Number.isFinite(newBars) || newBars <= 0) return;

      // ── Anchor: keep the midpoint under the fingers fixed ────────────────
      const rect   = container.getBoundingClientRect();
      const midX   = ((t0.clientX + t1.clientX) / 2) - rect.left;
      const anchor = ch.timeScale().coordinateToLogical(midX)
                     ?? (((range.from as number) + (range.to as number)) / 2);

      // Preserve the finger anchor exactly. This prevents any horizontal
      // translation when a pinch reaches a very wide logical range.
      const anchorFrac = (anchor - (range.from as number)) / currentBars;
      const newFrom  = anchor - newBars * anchorFrac;
      const newTo    = newFrom + newBars;`;

if (!s.includes(old)) {
  if (s.includes("const newBars = currentBars * ratio;")) {
    console.log("[pinch-fix] already applied");
    process.exit(0);
  }
  throw new Error("Pinch zoom block not found; refusing to modify blindly");
}

s = s.replace(old, next);
fs.writeFileSync(file, s);
console.log("[pinch-fix] Removed artificial zoom limits and boundary drift");
