import fs from "node:fs";

const path = "src/components/charts/MobileChartLayout.tsx";
let source = fs.readFileSync(path, "utf8");

const importLine = 'import "./mobileFavoriteTools";';
if (!source.includes(importLine)) {
  const marker = 'const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "");';
  if (!source.includes(marker)) throw new Error("[mobile-favorites] BASE marker not found");
  source = source.replace(marker, `${importLine}\n\n${marker}`);
}

fs.writeFileSync(path, source);
console.log("[mobile-favorites] long-press favourite controller enabled");
