import fs from "node:fs";
import path from "node:path";

const file = path.resolve("artifacts/trading-journal/src/components/charts/CustomChart.tsx");
let text = fs.readFileSync(file, "utf8");

const oldFresh = `      const lastCached = cached?.[cached.length - 1];
      const lastFresh  = bars[bars.length - 1];
      const sameData   = lastCached && lastFresh &&
                         lastCached.time  === lastFresh.time &&
                         lastCached.close === lastFresh.close &&
                         lastCached.high  === lastFresh.high;

      if (!sameData) {
        applyBarArray(bars, sym, iv);
      }`;

const newFresh = `      // Compare the complete OHLC dataset, not only the last candle.
      // The old check could keep stale historical candles when the newest
      // candle was unchanged, leaving the chart visually incorrect.
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

if (!text.includes(oldFresh)) throw new Error("Fresh OHLC comparison block not found");
text = text.replace(oldFresh, newFresh);

const oldScale = `        if (typeof saved.priceMin === "number" && typeof saved.priceMax === "number") {
          activatePanRange({ lo: saved.priceMin, hi: saved.priceMax });
          cs.applyOptions({
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: saved.priceMin!, maxValue: saved.priceMax! },
            }),
          });
        }`;

const newScale = `        // Restore a saved manual vertical range only when it is still sane for
        // the freshly fetched dataset. A stale/wide saved range can lock the
        // price scale far outside the current candles and collapse 1m bodies
        // into horizontal dash-like marks.
        if (typeof saved.priceMin === "number" && typeof saved.priceMax === "number") {
          const dataMin = safeBars.reduce((m, b) => Math.min(m, b.low), Infinity);
          const dataMax = safeBars.reduce((m, b) => Math.max(m, b.high), -Infinity);
          const dataSpan = dataMax - dataMin;
          const savedSpan = saved.priceMax - saved.priceMin;
          const lastCloseForRange = safeBars[safeBars.length - 1]?.close ?? 0;
          const maxReasonableSpan = Math.max(dataSpan * 4, Math.abs(lastCloseForRange) * 0.01);
          const savedRangeValid =
            Number.isFinite(saved.priceMin) &&
            Number.isFinite(saved.priceMax) &&
            saved.priceMax > saved.priceMin &&
            saved.priceMin <= lastCloseForRange &&
            saved.priceMax >= lastCloseForRange &&
            dataSpan > 0 &&
            savedSpan <= maxReasonableSpan;

          if (savedRangeValid) {
            activatePanRange({ lo: saved.priceMin, hi: saved.priceMax });
            cs.applyOptions({
              autoscaleInfoProvider: () => ({
                priceRange: { minValue: saved.priceMin!, maxValue: saved.priceMax! },
              }),
            });
          } else {
            activatePanRange(null);
            cs.applyOptions({ autoscaleInfoProvider: () => null });
            try { chart.priceScale("right").applyOptions({ autoScale: true }); } catch { }
          }
        }`;

if (!text.includes(oldScale)) throw new Error("Saved vertical-range block not found");
text = text.replace(oldScale, newScale);

fs.writeFileSync(file, text);
console.log("[chart-fix] CustomChart.tsx patched for full OHLC refresh + stale vertical-scale protection");
