import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../src/components/charts/CustomChart.tsx");
let s = fs.readFileSync(file, "utf8");

// The custom price-scale gesture overlay must cover only the MAIN chart pane.
// Previously it covered the entire chart container, so the transparent overlay
// also sat over horizontal pane-resize dividers. A vertical panel resize that
// started near the right edge could therefore be captured as price-scale zoom.
// Keep the bottom time-scale excluded as well, and track the live main-pane
// height so indicator-pane resize separators remain completely outside the hitbox.
const oldStyle = `      style={{\n        position:      "absolute",\n        top:           0,\n        right:         0,\n        bottom:        0,\n        width:         touchW,`;

const priorStyle = `      style={{\n        position:      "absolute",\n        top:           0,\n        right:         0,\n        // Keep the bottom time-scale / panel-resize strip outside the price-scale\n        // gesture hitbox. This prevents vertical panel resizing from accidentally\n        // being interpreted as price-scale zooming when started near the right edge.\n        bottom:        35,\n        width:         touchW,`;

const newStyle = `      style={{\n        position:      "absolute",\n        top:           0,\n        right:         0,\n        bottom:        "auto",\n        height:        "var(--price-scale-main-height, calc(100% - 35px))",\n        width:         touchW,`;

if (s.includes(oldStyle)) {
  s = s.replace(oldStyle, newStyle);
} else if (s.includes(priorStyle)) {
  s = s.replace(priorStyle, newStyle);
} else if (!s.includes(newStyle)) {
  throw new Error("[price-scale-panel-resize] PriceScaleTouchHandler style marker not found");
}

const effectMarker = `  // ── event handlers ────────────────────────────────────────────────────────\n`;
const effectBlock = `  // Keep the gesture overlay aligned to the actual MAIN LWC pane height.\n  // Pane dividers are outside this height, so dragging an indicator/chart-panel\n  // separator near the right edge can never be mistaken for price-scale zoom.\n  // The rAF loop is intentional: LWC pane heights can change continuously while\n  // the user drags a pane divider.\n  useEffect(() => {\n    const container = containerRef.current;\n    const handler = handlerRef.current;\n    if (!container || !handler) return;\n\n    let raf = 0;\n    const syncHeight = () => {\n      let h = 0;\n      try {\n        const panes = chartRef.current?.panes?.();\n        h = panes?.[0]?.getHeight?.() ?? 0;\n      } catch { /* chart may be disposing */ }\n\n      if (!(h > 0)) h = Math.max(0, container.clientHeight - 35);\n      handler.style.setProperty("--price-scale-main-height", `${Math.max(0, h)}px`);\n      raf = requestAnimationFrame(syncHeight);\n    };\n\n    syncHeight();\n    return () => cancelAnimationFrame(raf);\n  }, [chartRef, containerRef]);\n\n`;

if (!s.includes("--price-scale-main-height")) {
  if (!s.includes(effectMarker)) {
    throw new Error("[price-scale-panel-resize] event-handler insertion marker not found");
  }
  s = s.replace(effectMarker, effectBlock + effectMarker);
}

fs.writeFileSync(file, s);
console.log("[price-scale-panel-resize] price-scale hitbox restricted to main pane; horizontal pane-resize dividers excluded");
