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

if (!text.includes(oldScale)) throw new Error("Saved vertical-range block not found");
text = text.replace(oldScale, newScale);

fs.writeFileSync(file, text);
console.log("[chart-fix] Applied full-OHLC refresh + clean historical autoscale protection");
