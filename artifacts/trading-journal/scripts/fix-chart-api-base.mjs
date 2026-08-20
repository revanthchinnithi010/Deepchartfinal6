import fs from "node:fs";

const path = "src/components/charts/CustomChart.tsx";
const source = fs.readFileSync(path, "utf8");

const oldLine = 'const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "");';
const newLine = 'const BASE = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.BASE_URL).replace(/\\/$/, "");';

if (source.includes(newLine)) {
  console.log("[chart-api-base] API base already patched");
} else if (source.includes(oldLine)) {
  fs.writeFileSync(path, source.replace(oldLine, newLine));
  console.log("[chart-api-base] Historical candle requests now use VITE_API_BASE_URL");
} else {
  throw new Error("[chart-api-base] CustomChart BASE marker not found");
}
