import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This script is invoked in two different working directories by Railway:
// 1) repo root from the Nixpacks build command
// 2) artifacts/trading-journal from the package's prebuild script
// Resolve the repository root from this file instead of process.cwd().
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChart.tsx");

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

if (text.includes(oldFresh)) {
  text = text.replace(oldFresh, newFresh);
} else if (!text.includes("Compare the complete OHLCV dataset")) {
  throw new Error("Fresh OHLC comparison block not found");
}

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
} else if (!text.includes("Do not restore a persisted manual vertical range")) {
  throw new Error("Saved vertical-range block not found");
}

const oldSpacing = `        minBarSpacing:   4,`;
const newSpacing = `        // Keep mobile 1m candle bodies readable even after a wide viewport
        // restore. This is a lower bound; users can still zoom in/out.
        minBarSpacing:   6,`;
if (text.includes(oldSpacing)) {
  text = text.replace(oldSpacing, newSpacing);
} else if (!text.includes("minBarSpacing:   6,")) {
  throw new Error("Chart minBarSpacing target not found");
}

// Delta v2/ticker snapshots are quote/mark data. They keep the live price box
// responsive but must not be fed into the OHLC trade aggregator.
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
} else if (!text.includes('tickType?: "trade" | "quote"')) {
  throw new Error("Chart tick payload target not found");
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
} else if (!text.includes('Delta quote snapshots update live price only')) {
  throw new Error("Chart tick ingest target not found");
}

fs.writeFileSync(file, text);
console.log("[chart-fix] Applied full-OHLC refresh + clean autoscale + trade-only Delta candle input");

// ── Instant mobile drawing creation ─────────────────────────────────────────
// DrawingOverlay previously awaited POST /api/drawings before adding the line
// to Zustand. On mobile the second tap therefore appeared to do nothing until
// the network request completed. Patch the build artifact source optimistically:
// render immediately, persist in the background, then reconcile the temporary id.
const overlayFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");
if (!fs.existsSync(overlayFile)) throw new Error(`Drawing overlay file not found: ${overlayFile}`);

let overlay = fs.readFileSync(overlayFile, "utf8");
let overlayChanged = false;

const oldSaveDrawing = `  const saveDrawing = async (pts: DrawingPoint[]) => {
    try {
      const res = await fetch(\`${BASE}/api/drawings\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, toolType: activeTool, points: pts, style: activeStyle }),
      });
      if (res.ok) {
        const saved: Drawing = await res.json();
        addDrawing(saved);
        // Auto-select the newly placed drawing so the toolbar appears immediately
        selectDrawing(saved.id);
      }
    } catch { /* ignore */ }
  };`;

const newSaveDrawing = `  const saveDrawing = async (pts: DrawingPoint[]) => {
    // OPTIMISTIC: render immediately; never block the second-point tap on network I/O.
    const tempId = -Math.max(1, Date.now());
    const optimistic: Drawing = {
      id: tempId, symbol, timeframe, toolType: activeTool, points: pts,
      style: activeStyle, isLocked: false, isVisible: true,
      createdAt: new Date().toISOString(),
    };
    addDrawing(optimistic);
    selectDrawing(tempId);

    try {
      const res = await fetch(\`${BASE}/api/drawings\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, toolType: activeTool, points: pts, style: activeStyle }),
      });
      if (res.ok) {
        const saved: Drawing = await res.json();
        const current = useDrawingStore.getState().drawings;
        useDrawingStore.getState().setDrawings(current.map(d => d.id === tempId ? saved : d));
        selectDrawing(saved.id);
      } else {
        const current = useDrawingStore.getState().drawings;
        useDrawingStore.getState().setDrawings(current.filter(d => d.id !== tempId));
        selectDrawing(null);
      }
    } catch {
      const current = useDrawingStore.getState().drawings;
      useDrawingStore.getState().setDrawings(current.filter(d => d.id !== tempId));
      selectDrawing(null);
    }
  };`;

if (overlay.includes(oldSaveDrawing)) {
  overlay = overlay.replace(oldSaveDrawing, newSaveDrawing);
  overlayChanged = true;
} else if (!overlay.includes("OPTIMISTIC: render immediately")) {
  throw new Error("Drawing save block not found; refusing to skip the latency fix");
}

if (overlay.includes("await saveDrawing(")) {
  overlay = overlay.replaceAll("await saveDrawing(", "void saveDrawing(");
  overlayChanged = true;
}

if (overlayChanged) {
  fs.writeFileSync(overlayFile, overlay);
  console.log("[chart-fix] Applied instant optimistic drawing creation");
} else {
  console.log("[chart-fix] Instant drawing creation already present");
}
