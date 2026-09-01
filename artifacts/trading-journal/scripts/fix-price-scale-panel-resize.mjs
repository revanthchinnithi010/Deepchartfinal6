import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../src/components/charts/CustomChart.tsx");
let s = fs.readFileSync(file, "utf8");

// The price-scale gesture overlay must start EXACTLY at the left edge of the
// rendered LWC price-scale <td>. Using a generous/fixed width lets the overlay
// bleed left of the visible white axis boundary and steal panel-resize drags.
// The measured CSS variable below makes the white line the hard interaction
// boundary: left of it = chart/panel interaction; right of it = price scale.
const oldStyle = `      style={{\n        position:      "absolute",\n        top:           0,\n        right:         0,\n        bottom:        0,\n        width:         touchW,`;

const priorStyle = `      style={{\n        position:      "absolute",\n        top:           0,\n        right:         0,\n        // Keep the bottom time-scale / panel-resize strip outside the price-scale\n        // gesture hitbox. This prevents vertical panel resizing from accidentally\n        // being interpreted as price-scale zooming when started near the right edge.\n        bottom:        35,\n        width:         touchW,`;

const newStyle = `      style={{\n        position:      "absolute",\n        top:           0,\n        left:          "var(--price-scale-left, calc(100% - 75px))",\n        right:         0,\n        bottom:        "auto",\n        height:        "var(--price-scale-main-height, calc(100% - 35px))",\n        width:         "auto",`;

if (s.includes(oldStyle)) {
  s = s.replace(oldStyle, newStyle);
} else if (s.includes(priorStyle)) {
  s = s.replace(priorStyle, newStyle);
} else if (!s.includes(newStyle)) {
  throw new Error("[price-scale-panel-resize] PriceScaleTouchHandler style marker not found");
}

const effectMarker = `  // ── event handlers ────────────────────────────────────────────────────────\n`;
const effectBlock = `  // Keep the gesture overlay aligned to the exact MAIN LWC pane and the exact
  // left edge of the rendered price-scale cell. The white axis boundary is the
  // hard interaction boundary: everything left of it remains chart/panel space.
  // The rAF loop is intentional because pane heights and layout can change while
  // the user drags a panel divider or rotates the device.
  useEffect(() => {
    const container = containerRef.current;
    const handler = handlerRef.current;
    if (!container || !handler) return;

    let raf = 0;
    const syncHitbox = () => {
      const containerRect = container.getBoundingClientRect();
      const scaleCell = container.querySelector('table tr:first-child td:last-child') as HTMLElement | null;

      let left = container.clientWidth - (touchW || 75);
      if (scaleCell) {
        const scaleRect = scaleCell.getBoundingClientRect();
        const measuredLeft = scaleRect.left - containerRect.left;
        if (Number.isFinite(measuredLeft)) left = Math.max(0, Math.min(container.clientWidth, measuredLeft));
      }

      let h = 0;
      try {
        const panes = chartRef.current?.panes?.();
        h = panes?.[0]?.getHeight?.() ?? 0;
      } catch { /* chart may be disposing */ }
      if (!(h > 0)) h = Math.max(0, container.clientHeight - 35);

      handler.style.setProperty("--price-scale-left", String(left) + "px");
      handler.style.setProperty("--price-scale-main-height", String(Math.max(0, h)) + "px");
      raf = requestAnimationFrame(syncHitbox);
    };

    syncHitbox();
    return () => cancelAnimationFrame(raf);
  }, [chartRef, containerRef, touchW]);

`;

// Add the exact-boundary effect independently of the older height-only effect.
// This is deliberately keyed to --price-scale-left so it remains idempotent on
// every Railway build and upgrades installations that already contain the old fix.
if (!s.includes("--price-scale-left")) {
  if (!s.includes(effectMarker)) {
    throw new Error("[price-scale-panel-resize] event-handler insertion marker not found");
  }
  s = s.replace(effectMarker, effectBlock + effectMarker);
}

fs.writeFileSync(file, s);
console.log("[price-scale-panel-resize] price-scale hitbox now starts at the exact LWC price-scale boundary; panel area is excluded");