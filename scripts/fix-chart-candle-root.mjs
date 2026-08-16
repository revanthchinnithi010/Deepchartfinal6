import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Deterministic compatibility repair for the custom chart. This runs during
// Railway builds and is intentionally idempotent.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const baseFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChartBase.tsx");

if (!fs.existsSync(baseFile)) {
  throw new Error(`Chart base file not found: ${baseFile}`);
}

let text = fs.readFileSync(baseFile, "utf8");
let changed = false;

// 1) Never restore an obsolete persisted vertical price range on symbol load.
const oldScale = `        if (typeof saved.priceMin === "number" && typeof saved.priceMax === "number") {
          activatePanRange({ lo: saved.priceMin, hi: saved.priceMax });
          cs.applyOptions({
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: saved.priceMin!, maxValue: saved.priceMax! },
            }),
          });
        }`;
const newScale = `        // Do not restore a persisted manual vertical range from an older chart session.
        activatePanRange(null);
        cs.applyOptions({ autoscaleInfoProvider: () => null });
        try { chart.priceScale("right").applyOptions({ autoScale: true }); } catch { }
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

// 2) Keep 1m candle bodies readable on mobile.
if (text.includes("minBarSpacing:   4,")) {
  text = text.replace(
    "minBarSpacing:   4,",
    "// Keep mobile 1m candle bodies readable after viewport restoration.\n        minBarSpacing:   6,",
  );
  changed = true;
}

// 3) Compare the complete OHLCV dataset so corrected historical candles refresh.
const oldFresh = `      const lastCached = cached?.[cached.length - 1];
      const lastFresh  = bars[bars.length - 1];
      const sameData   = lastCached && lastFresh &&
                         lastCached.time  === lastFresh.time &&
                         lastCached.close === lastFresh.close &&
                         lastCached.high  === lastFresh.high;

      if (!sameData) {
        applyBarArray(bars, sym, iv);
      }`;
const newFresh = `      const sameData = !!cached && cached.length === bars.length && cached.every((c, i) => {
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

// 4) Treat Delta quote snapshots as live-price updates, not OHLC trades.
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
const newIngest = `        if (t.tickType === "quote") {
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

// 5) Trendline/two-point drawing must appear immediately on the second tap.
//    The old flow awaited POST /api/drawings before adding the line to Zustand,
//    so mobile users saw a noticeable delay while the network request completed.
//    Render optimistically first, then reconcile the temporary id with the DB row.
const overlayFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");
if (!fs.existsSync(overlayFile)) {
  throw new Error(`Drawing overlay file not found: ${overlayFile}`);
}
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
    // Optimistic UI: paint the completed drawing immediately. Network persistence
    // happens in the background and must never delay the second-tap interaction.
    const tempId = -Math.max(1, Date.now());
    const optimistic: Drawing = {
      id: tempId,
      symbol,
      timeframe,
      toolType: activeTool,
      points: pts,
      style: activeStyle,
      isLocked: false,
      isVisible: true,
      createdAt: new Date().toISOString(),
    };
    addDrawing(optimistic);
    selectDrawing(tempId);

    try {
      const res = await fetch(\`\${BASE}/api/drawings\`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, toolType: activeTool, points: pts, style: activeStyle }),
      });
      if (res.ok) {
        const saved: Drawing = await res.json();
        const current = useDrawingStore.getState().drawings;
        useDrawingStore.getState().setDrawings(
          current.map(d => d.id === tempId ? saved : d),
        );
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
}

if (overlay.includes("await saveDrawing(")) {
  overlay = overlay.replaceAll("await saveDrawing(", "void saveDrawing(");
  overlayChanged = true;
}

if (overlayChanged) {
  fs.writeFileSync(overlayFile, overlay);
  console.log("[chart-fix] Applied immediate optimistic drawing commit to DrawingOverlay.tsx");
}

if (changed) {
  fs.writeFileSync(baseFile, text);
  console.log("[chart-fix] Applied crypto 1m OHLC/autoscale/cache repair to CustomChartBase.tsx");
} else {
  console.log("[chart-fix] Crypto 1m OHLC/autoscale repair already present; no mutation required.");
}
