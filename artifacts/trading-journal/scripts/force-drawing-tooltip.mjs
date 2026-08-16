import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");
if (!fs.existsSync(file)) throw new Error(`DrawingOverlay.tsx not found: ${file}`);
let src = fs.readFileSync(file, "utf8");

// The tooltip is created by fix-trendline-selection-tooltip.mjs. Make its
// visibility deterministic: it must remain visible whenever a supported
// drawing is selected, regardless of pointer event ordering.
if (src.includes("data-chart-drawing-info-tooltip")) {
  src = src.replace(/z-index:\\d+/g, "z-index:9999");
  if (!src.includes("__forceDrawingTooltipInterval")) {
    const marker = 'useDrawingStore.subscribe((state,previous)=>{ if(state.selectedDrawingId===previous.selectedDrawingId)return;';
    const idx = src.indexOf(marker);
    if (idx >= 0) {
      const end = src.indexOf("\n}", idx);
      const insertAt = end >= 0 ? end + 2 : idx;
      const force = `\n\n// [chart-fix] Deterministic tooltip refresh.\nconst __forceDrawingTooltipInterval = window.setInterval(() => {\n  if (typeof document === "undefined") return;\n  const modalOpen = document.querySelector("[data-drawing-popup], [role=\\"dialog\\"]");\n  const state = useDrawingStore.getState();\n  const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);\n  if (modalOpen || !selected || !["trendline", "extended", "ray", "rect"].includes(selected.toolType)) { __hideDrawingTooltip(); return; }\n  __showDrawingTooltip(selected);\n}, 150);\n`;
      src = src.slice(0, insertAt) + force + src.slice(insertAt);
    }
  }
}

fs.writeFileSync(file, src, "utf8");
console.log("[drawing-fix] Forced drawing tooltip visibility with high z-index and deterministic refresh.");
