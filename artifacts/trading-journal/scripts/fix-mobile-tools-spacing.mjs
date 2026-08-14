import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "src/components/charts/MobileChartLayout.tsx");
let s = fs.readFileSync(file, "utf8");

// Compact mobile Tools CTA: do not stretch across the toolbar. Keep a fixed
// compact width so there is no large empty area inside the button.
s = s.replace(
  /height:42,\s*minWidth:0,\s*flex:1,\s*padding:"0 14px",/,
  'height:38, width:160, minWidth:160, flex:"0 0 160px", padding:"0 12px",',
);
s = s.replace(
  'height:42, minWidth:148, padding:"0 18px",',
  'height:38, width:160, minWidth:160, flex:"0 0 160px", padding:"0 12px",',
);

// Keep the CTA compact and aligned with the adjacent More button.
s = s.replace(
  'display:"inline-flex", alignItems:"center", justifyContent:"center", gap:9,',
  'display:"flex", alignItems:"center", justifyContent:"center", gap:7,',
);

fs.writeFileSync(file, s, "utf8");
console.log("Applied mobile Tools CTA compact fix: 160px width, 38px height, no flex stretch.");
