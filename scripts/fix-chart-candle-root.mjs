import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This compatibility step is intentionally source-aware and idempotent.
// Older builds left the chart with stale persisted price ranges and mixed
// quote snapshots into the OHLC stream. Those states make some crypto 1m
// candles collapse into flat/dash-like marks while another symbol can appear
// normal. Keep the repair here so a clean Railway build can repair older
// source snapshots without depending on an external URL or GitHub revision.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const baseFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChartBase.tsx");

if (!fs.existsSync(baseFile)) {
  throw new Error(`Chart base file not found: ${baseFile}`);
}

let text = fs.readFileSync(baseFile, "utf8");
let changed = false;

// 1) Never restore an old manually-persisted vertical price range on symbol
//    load. It can be wildly different from the new symbol's OHLC range and
//    causes valid candle bodies to collapse. Historical OHLC must autoscale.
const oldScale = `        if (typeof saved.priceMin === "number" && typeof saved.priceMax === "number") {
          activatePanRange({ lo: saved.priceMin, hi: saved.priceMax });
          cs.applyOptions({
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: saved.priceMin!, maxValue: saved.priceMax! },
            }),
          });
        }`;
const newScale = `        // Do not restore a persisted manual vertical range from an older
        // chart session. That range is not part of historical OHLC data and can
        // lock the price scale to a stale coordinate system, making valid candle
        // bodies collapse into dash-like marks. Historical OHLC must determine
        // the initial price scale; manual panning can be recreated by the user.
        activatePanRange(null);
        cs.applyOptions({ autoscaleInfoProvider: () => null });
        try { chart.priceScale("right").applyOptions({ autoScale: true }); } catch { }

        // Remove the obsolete persisted price range so the bad state cannot
        // return on the next symbol/interval load.
        try {
          const rawVp = JSON.parse(localStorage.getItem(vpKey) ?? "null");
          if (rawVp && ("priceMin" in rawVp || "priceMax" in rawVp)) {
            delete rawVp.priceMin;
            delete rawVp.priceMax;
            localStorage.setItem(vpKey, JSON.stringify(rawVp));
          }
        } catch { }`;
if (text.includes(oldScale)) {
  text = text.replace(oldScale, newScale);
  changed = true;
}

// 2) Keep 1m candle bodies readable on mobile after a wide-viewport restore.
if (text.includes("minBarSpacing:   4,")) {
  text = text.replace(
    "minBarSpacing:   4,",
    "// Keep mobile 1m candle bodies readable after viewport restoration.\n        minBarSpacing:   6,",
  );
  changed = true;
}

// 3) Do not use the last candle only as the cache equality test. A corrected
//    historical candle must refresh the chart even when the newest candle is
//    unchanged.
const oldFresh = `      const lastCached = cached?.[cached.length - 1];
      const lastFresh  = bars[bars.length - 1];
      const sameData   = lastCached && lastFresh &&
                         lastCached.time  === lastFresh.time &&
                         lastCached.close === lastFresh.close &&
                         lastCached.high  === lastFresh.high;

      if (!sameData) {
        applyBarArray(bars, sym, iv);
      }`;
const newFresh = `      // Compare the complete OHLCV dataset, not only the last candle.
      // A historical candle can be corrected while the newest candle remains
      // unchanged; the old shortcut therefore kept stale OHLC data on screen.
      const sameData = !!cached && cached.length === bars.length && cached.every((c, i) => {
        const f = bars[i];
        return !!f &&
          c.time === f.time &&
          c.open === f.open &&
          c.high === f.high &&
          c.low === f.low &&
          c.close === f.close &&
          c.volume === f.volume;
      });

      if (!sameData) {
        applyBarArray(bars, sym, iv);
      }`;
if (text.includes(oldFresh)) {
  text = text.replace(oldFresh, newFresh);
  changed = true;
}

// 4) Delta ticker snapshots are quote/mark updates, not executed trades.
//    Only trade ticks may form OHLC candles. This prevents flat/repeated
//    snapshots from producing artificial 1m candles for symbols whose quote
//    stream is much denser than their trade stream.
const oldTick = `        const t = msg as unknown as { symbol?: string; price?: number; volume?: number; timestamp?: number };
        if (!t.symbol || t.symbol !== symRef.current || typeof t.price !== "number") return;`;
const newTick = `        const t = msg as unknown as {
          symbol?: string;
          price?: number;
          volume?: number;
          timestamp?: number;
          tickType?: "trade" | "quote";
        };
        if (!t.symbol || t.symbol !== symRef.current || typeof t.price !== "number") return;`;
if (text.includes(oldTick)) {
  text = text.replace(oldTick, newTick);
  changed = true;
}

const oldIngest = `        const result = agg.ingest(price, volume, tsSec);
        if (!result) return; // identical consecutive price — skip`;
const newIngest = `        // Delta quote snapshots update live price only; executed trades are
        // the sole Delta input allowed to form chart OHLC candles.
        if (t.tickType === "quote") {
          tickDataRef.current.price = price;
          lastTickTimeRef.current = Date.now();
          if (!statePendingRef.current) {
            statePendingRef.current = true;
            requestAnimationFrame(() => {
              statePendingRef.current = false;
              if (!mountedRef.current) return;
              const d = tickDataRef.current;
              if (d.price !== null && d.price !== livePxRef.current) {
                livePxRef.current = d.price;
                setLivePrice(d.price);
                doUpdatePriceLine(d.price, symRef.current);
              }
            });
          }
          return;
        }

        const result = agg.ingest(price, volume, tsSec);
        if (!result) return; // identical consecutive price — skip`;
if (text.includes(oldIngest)) {
  text = text.replace(oldIngest, newIngest);
  changed = true;
}

if (changed) {
  fs.writeFileSync(baseFile, text);
  console.log("[chart-fix] Applied crypto 1m OHLC/autoscale/cache repair to CustomChartBase.tsx");
} else {
  const markers = [
    "Do not restore a persisted manual vertical range",
    "Compare the complete OHLCV dataset",
    'tickType?: "trade" | "quote"',
    "Delta quote snapshots update live price only",
  ];
  const missing = markers.filter(marker => !text.includes(marker));
  if (missing.length > 0) {
    console.warn(`[chart-fix] Repair targets were not found; missing markers: ${missing.join(", ")}`);
    console.warn("[chart-fix] No external source fetch is performed, so the build remains deterministic.");
  } else {
    console.log("[chart-fix] Crypto 1m OHLC/autoscale repair already present; no mutation required.");
  }
}
