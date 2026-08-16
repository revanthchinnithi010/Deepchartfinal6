import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");

if (!fs.existsSync(file)) throw new Error(`DrawingOverlay.tsx not found: ${file}`);

let src = fs.readFileSync(file, "utf8");

// Keep the drawing tooltip compact: alert status, id, trigger, symbol,
// timeframe, condition and alert id are useful; raw drawing metadata is not.
src = src.replace(/\n\s*const p1 = d\.points\[0\];\n\s*const p2 = d\.points\[1\];\n\s*const point1Text = p1 \?[^\n]*\n\s*const point2Text = p2 \?[^\n]*\n/, "\n");
src = src.replace(/\n\s*\[\"Point 1\", point1Text\],\n\s*\[\"Point 2\", point2Text\],/g, "");
src = src.replace(/\n\s*\[\"Locked\", d\.isLocked \? \"Yes\" : \"No\"\],\n\s*\[\"Visible\", d\.isVisible \? \"Yes\" : \"No\"\],/g, "");

fs.writeFileSync(file, src);
console.log("[drawing-tooltip] Removed Point 1, Point 2, Locked and Visible fields.");
