import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../src/components/charts/CustomChart.tsx");
let s = fs.readFileSync(file, "utf8");

// The custom price-scale gesture overlay must not cover the bottom time-scale /
// pane-resize boundary. When a chart panel is dragged vertically, starting near
// the right edge could otherwise hit PriceScaleTouchHandler first and turn the
// panel resize into a price-scale zoom gesture.
const marker = `      style={{\n        position:      "absolute",\n        top:           0,\n        right:         0,\n        bottom:        0,\n        width:         touchW,\n        zIndex:        25,\n        touchAction:   "none",\n        cursor:        "ns-resize",`;

const replacement = `      style={{\n        position:      "absolute",\n        top:           0,\n        right:         0,\n        // Keep the bottom time-scale / panel-resize strip outside the price-scale\n        // gesture hitbox. This prevents vertical panel resizing from accidentally\n        // being interpreted as price-scale zooming when started near the right edge.\n        bottom:        35,\n        width:         touchW,\n        zIndex:        25,\n        touchAction:   "none",\n        cursor:        "ns-resize",`;

if (s.includes(replacement)) {
  console.log("[price-scale-panel-resize] already applied");
} else if (s.includes(marker)) {
  s = s.replace(marker, replacement);
  fs.writeFileSync(file, s);
  console.log("[price-scale-panel-resize] excluded bottom time-scale/panel-resize strip from price-scale hitbox");
} else {
  throw new Error("[price-scale-panel-resize] PriceScaleTouchHandler style marker not found");
}
