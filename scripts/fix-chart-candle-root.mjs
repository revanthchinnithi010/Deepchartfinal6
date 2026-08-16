import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Railway runs this compatibility script before the frontend build. Older
// revisions needed it to patch CustomChart.tsx at build time. The fixes are now
// committed in CustomChartBase.tsx, while CustomChart.tsx is intentionally only
// a wrapper for the compressed time-axis overlay. Keep the prebuild command
// harmless and idempotent so Railway does not fail looking for old source text.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const baseFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChartBase.tsx");

if (!fs.existsSync(baseFile)) {
  throw new Error(`Chart base file not found: ${baseFile}`);
}

const text = fs.readFileSync(baseFile, "utf8");
const checks = [
  "Compare the complete OHLCV dataset",
  "Do not restore a persisted manual vertical range",
  "minBarSpacing:   6,",
  'tickType?: "trade" | "quote"',
  "Delta quote snapshots update live price only",
];

const missing = checks.filter(marker => !text.includes(marker));
if (missing.length > 0) {
  console.warn(`[chart-fix] Compatibility markers missing: ${missing.join(", ")}`);
  console.warn("[chart-fix] Continuing because chart fixes are source-controlled; no build-time mutation is required.");
} else {
  console.log("[chart-fix] Chart fixes already present in CustomChartBase.tsx; no mutation required.");
}
