import fs from "node:fs";
const file = new URL("../src/components/charts/CustomChart.tsx", import.meta.url);
let s = fs.readFileSync(file, "utf8");
let changed = false;
const oldScale = `        pinch:                false, // we implement pinch-to-zoom ourselves in onTouchStart/onTouchMove`;
const newScale = `        pinch:                true,  // native LWC pinch: scale only, no custom range drift`;
if (s.includes(oldScale)) { s = s.replace(oldScale, newScale); changed = true; }
else if (!s.includes("pinch:                true,  // native LWC pinch")) throw new Error("handleScale pinch option not found");
const oldPinchMove = `        // Block LWC from double-handling, then apply our zoom\n        e.stopPropagation();\n        applyPinchZoom(e.touches[0], e.touches[1]);\n        return;`;
const newPinchMove = `        // Native LWC pinch owns the two-finger gesture. Do not stop propagation\n        // and do not call setVisibleLogicalRange ourselves; that custom transform\n        // was the source of the zoom-boundary horizontal drift.\n        return;`;
if (s.includes(oldPinchMove)) { s = s.replace(oldPinchMove, newPinchMove); changed = true; }
else if (!s.includes("Native LWC pinch owns the two-finger gesture")) throw new Error("two-finger touchmove block not found");
if (changed) { fs.writeFileSync(file, s); console.log("[pinch-fix] Native LWC pinch enabled"); }
else console.log("[pinch-fix] Native pinch fix already applied");
