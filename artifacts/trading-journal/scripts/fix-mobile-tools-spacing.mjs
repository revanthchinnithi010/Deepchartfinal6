import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "src/components/charts/MobileChartLayout.tsx");
let s = fs.readFileSync(file, "utf8");

// Make the mobile Tools CTA use the available horizontal space without the
// unwanted empty left/right gaps visible in the control bar screenshot.
s = s.replace(
  'height:42, minWidth:148, padding:"0 18px",',
  'height:42, minWidth:0, flex:1, padding:"0 14px",',
);

// Keep the CTA compact enough that the adjacent More button stays flush to it.
s = s.replace(
  'display:"inline-flex", alignItems:"center", justifyContent:"center", gap:9,',
  'display:"flex", alignItems:"center", justifyContent:"center", gap:9,',
);

fs.writeFileSync(file, s, "utf8");
console.log("Applied mobile Tools CTA spacing fix: removed left/right empty space and made the button fill available width.");
