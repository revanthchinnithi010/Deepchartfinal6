import fs from "node:fs";

const path = new URL("../src/components/charts/CustomChart.tsx", import.meta.url).pathname;
let source = fs.readFileSync(path, "utf8");
source = source.replace("MIN_FUTURE_BARS = 50", "MIN_FUTURE_BARS = 8");
fs.writeFileSync(path, source);
