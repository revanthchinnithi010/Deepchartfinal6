import fs from "node:fs";

const path = "src/components/charts/CustomChart.tsx";
const source = fs.readFileSync(path, "utf8");

let next = source;

// Keep history effectively unbounded for normal chart use. The loader is still
// page-based (500 bars/request) so memory/network usage grows only as the user
// scrolls backwards, like TradingView.
next = next.replace(
  "const MAX_TOTAL_BARS         = 10_000;",
  "const MAX_TOTAL_BARS         = 100_000;",
);

// Never permanently stop history because one provider page overlaps the current
// oldest bar. This can happen at broker/session boundaries. Retry from one bar
// earlier instead; the next successful page will move the cursor backwards.
const oldFreshBlock = `      const fresh = newBars.filter(b => b.time < earliestExisting);\n      if (fresh.length === 0) {\n        hasMoreHistoryRef.current = false;\n        return;\n      }`;
const newFreshBlock = `      let fresh = newBars.filter(b => b.time < earliestExisting);\n\n      // A provider may return an overlapping boundary page. Do not interpret\n      // that as "history exhausted" — retry once with a strictly older cursor.\n      if (fresh.length === 0) {\n        const retryCursor = Math.max(1, earliestExisting - 1);\n        try {\n          const retryResp = await fetch(BASE + "/api/candles/" + sym + "/" + iv + "?before=" + retryCursor);\n          if (retryResp.ok && mountedRef.current && symRef.current === sym && ivRef.current === iv) {\n            const retryBars: OHLCBar[] = await retryResp.json();\n            if (Array.isArray(retryBars)) {\n              fresh = retryBars.filter(b => b.time < earliestExisting);\n            }\n          }\n        } catch { /* keep the original page result and retry on the next scroll */ }\n      }\n\n      if (fresh.length === 0) {\n        // Only an actually empty provider response means the available history\n        // has ended. A network/provider overlap is retried on the next scroll.\n        if (newBars.length === 0) hasMoreHistoryRef.current = false;\n        return;\n      }`;

if (next.includes(oldFreshBlock)) {
  next = next.replace(oldFreshBlock, newFreshBlock);
}

// Prefetch earlier so fast mobile swipes have another page ready before the
// viewport reaches the first loaded candle.
next = next.replace(
  "const HISTORY_PREFETCH_BARS  = 150;",
  "const HISTORY_PREFETCH_BARS  = 300;",
);

// If the chart is already at the left edge after a page restore, explicitly
// schedule another page on the next frame. This makes chained 500-bar loading
// deterministic even when LWC coalesces range-change notifications.
const rangeBlock = `        if (\n          (range.from as number) < HISTORY_PREFETCH_BARS &&\n          !isLoadingMoreRef.current &&\n          hasMoreHistoryRef.current\n        ) {\n          void loadMoreHistRef.current();\n        }`;
const rangeReplacement = `        if (\n          (range.from as number) < HISTORY_PREFETCH_BARS &&\n          !isLoadingMoreRef.current &&\n          hasMoreHistoryRef.current\n        ) {\n          void loadMoreHistRef.current();\n        }\n\n        // Keep requesting pages while a restored range is still close to the\n        // left edge. requestAnimationFrame avoids recursive synchronous calls.\n        if (\n          (range.from as number) < 40 &&\n          !isLoadingMoreRef.current &&\n          hasMoreHistoryRef.current\n        ) {\n          requestAnimationFrame(() => {\n            if (!isLoadingMoreRef.current && hasMoreHistoryRef.current) {\n              void loadMoreHistRef.current();\n            }\n          });\n        }`;
if (next.includes(rangeBlock) && !next.includes("Keep requesting pages while a restored range")) {
  next = next.replace(rangeBlock, rangeReplacement);
}

if (next === source) {
  throw new Error("[infinite-history] no changes were applied");
}

fs.writeFileSync(path, next);
console.log("[infinite-history] enabled 500-bar paged history loading up to 100,000 bars with overlap retry");
