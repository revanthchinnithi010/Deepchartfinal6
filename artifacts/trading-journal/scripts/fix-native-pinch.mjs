import fs from "node:fs";
const file = new URL("../src/components/charts/CustomChart.tsx", import.meta.url);
let s = fs.readFileSync(file, "utf8");
let changed = false;

// Keep the custom pinch engine in control. Native LWC pinch is intentionally
// disabled because the custom engine provides anchor-preserving unlimited zoom.
const nativeOn = `        pinch:                true,  // native LWC pinch: scale only, no custom range drift`;
const nativeOff = `        pinch:                false, // custom unlimited pinch zoom owns the gesture`;
if (s.includes(nativeOn)) {
  s = s.replace(nativeOn, nativeOff);
  changed = true;
} else if (!s.includes(nativeOff)) {
  const re = /        pinch:\s*(?:true|false).*?(?:\n)/;
  if (re.test(s)) {
    s = s.replace(re, nativeOff + "\n");
    changed = true;
  }
}

// Do not remove the custom touchmove pinch handler. It is required for the
// unlimited logical-range zoom behaviour on touch devices.
if (changed) fs.writeFileSync(file, s);
console.log("[native-pinch-fix] custom unlimited pinch engine retained");
