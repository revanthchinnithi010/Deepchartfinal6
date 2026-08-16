import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

// Deterministic compatibility repair for the custom chart. This runs during
// Railway builds and is intentionally idempotent.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const baseFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/CustomChartBase.tsx");

if (!fs.existsSync(baseFile)) throw new Error(`Chart base file not found: ${baseFile}`);

let text = fs.readFileSync(baseFile, "utf8");
let changed = false;

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
if (text.includes(oldScale)) { text = text.replace(oldScale, newScale); changed = true; }

if (text.includes("minBarSpacing:   4,")) {
  text = text.replace("minBarSpacing:   4,", "// Keep mobile 1m candle bodies readable after viewport restoration.\n        minBarSpacing:   6,");
  changed = true;
}

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
        return !!f && c.time === f.time && c.open === f.open && c.high === f.high &&
          c.low === f.low && c.close === f.close && c.volume === f.volume;
      });
      if (!sameData) applyBarArray(bars, sym, iv);`;
if (text.includes(oldFresh)) { text = text.replace(oldFresh, newFresh); changed = true; }

const oldTick = `        const t = msg as unknown as { symbol?: string; price?: number; volume?: number; timestamp?: number };
        if (!t.symbol || t.symbol !== symRef.current || typeof t.price !== "number") return;`;
const newTick = `        const t = msg as unknown as {
          symbol?: string; price?: number; volume?: number; timestamp?: number;
          tickType?: "trade" | "quote";
        };
        if (!t.symbol || t.symbol !== symRef.current || typeof t.price !== "number") return;`;
if (text.includes(oldTick)) { text = text.replace(oldTick, newTick); changed = true; }

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
if (text.includes(oldIngest)) { text = text.replace(oldIngest, newIngest); changed = true; }

// Trendline/two-point drawing: render optimistically before the network request.
const overlayFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");
if (!fs.existsSync(overlayFile)) throw new Error(`Drawing overlay file not found: ${overlayFile}`);
let overlay = fs.readFileSync(overlayFile, "utf8");
let overlayChanged = false;

// ── Selected drawing information tooltip ──────────────────────────────────────
// Keep this at module scope so it works for mouse and touch selection without
// changing the chart's existing SVG/canvas pointer-event behaviour.
if (!overlay.includes("[chart-fix] selected-drawing-info-tooltip")) {
  const tooltipBlock = `

// [chart-fix] selected-drawing-info-tooltip
let __drawingTooltip: HTMLDivElement | null = null;
let __lastDrawingPointer = { x: 0, y: 0 };

function __drawingTooltipHide() {
  if (__drawingTooltip) __drawingTooltip.style.display = "none";
}

function __drawingTooltipEsc(value: unknown): string {
  return String(value ?? "—").replace(/[&<>\"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\\"": "&quot;", "'": "&#39;" } as Record<string, string>)[ch] ?? ch);
}

function __drawingTooltipCreate() {
  if (typeof document === "undefined") return null;
  if (__drawingTooltip) return __drawingTooltip;
  const el = document.createElement("div");
  el.setAttribute("data-chart-drawing-info-tooltip", "true");
  el.style.cssText = [
    "position:fixed", "z-index:2147483647", "display:none", "pointer-events:none",
    "min-width:245px", "max-width:310px", "padding:12px 13px", "border-radius:12px",
    "border:1px solid rgba(255,255,255,.12)", "background:rgba(14,14,16,.96)",
    "backdrop-filter:blur(14px)", "-webkit-backdrop-filter:blur(14px)",
    "box-shadow:0 14px 40px rgba(0,0,0,.42)", "color:#f4f4f5",
    "font:12px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
  ].join(";");
  document.body.appendChild(el);
  __drawingTooltip = el;
  return el;
}

function __drawingTooltipFindAlert(d: Drawing) {
  const alerts = useAlertStore.getState().alerts.filter(a => a.type === "trendline") as TrendlineAlert[];
  const key = String(d.displayId ?? d.id);
  return alerts.find(a => String(a.drawingDisplayId ?? "") === key)
    ?? alerts.find(a => a.symbol === d.symbol && normalizeTimeframe(a.timeframe) === normalizeTimeframe(d.timeframe));
}

function __drawingTooltipShow(d: Drawing) {
  if (!d || !["trendline", "extended", "ray"].includes(d.toolType)) return;
  const el = __drawingTooltipCreate();
  if (!el) return;
  const alert = __drawingTooltipFindAlert(d);
  const triggerText = alert?.status === "triggered" ? "Triggered" : "Not triggered";
  const alertText = alert ? "Set" : "Not set";
  const p1 = d.points[0];
  const p2 = d.points[1];
  const rows = [
    ["Alert", alertText],
    ["Id", d.displayId ?? String(d.id)],
    ["Trigger", triggerText],
    ["Symbol", d.symbol],
    ["Timeframe", d.timeframe],
    ["Point 1", p1 ? `${new Date(Number(p1.time) * 1000).toLocaleString()}  •  ${Number(p1.price).toFixed(6)}` : "—"],
    ["Point 2", p2 ? `${new Date(Number(p2.time) * 1000).toLocaleString()}  •  ${Number(p2.price).toFixed(6)}` : "—"],
    ["Condition", alert?.condition ?? "—"],
    ["Alert ID", alert?.id ?? "—"],
    ["Created", d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"],
    ["Locked", d.isLocked ? "Yes" : "No"],
    ["Visible", d.isVisible ? "Yes" : "No"],
  ];
  el.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:8px">Trendline</div>` + rows.map(([k,v]) =>
    `<div style="display:flex;gap:12px;justify-content:space-between;border-top:1px solid rgba(255,255,255,.07);padding:5px 0"><span style="color:#9ca3af">${__drawingTooltipEsc(k)}</span><span style="text-align:right;max-width:195px;overflow-wrap:anywhere">${__drawingTooltipEsc(v)}</span></div>`
  ).join("");
  el.style.display = "block";
  const pad = 12;
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(pad, __lastDrawingPointer.x + 14), Math.max(pad, window.innerWidth - r.width - pad));
  const top = Math.min(Math.max(pad, __lastDrawingPointer.y + 14), Math.max(pad, window.innerHeight - r.height - pad));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (ev) => {
    __lastDrawingPointer = { x: ev.clientX, y: ev.clientY };
    window.setTimeout(() => {
      const state = useDrawingStore.getState();
      const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);
      if (selected) __drawingTooltipShow(selected); else __drawingTooltipHide();
    }, 0);
  }, true);
  useDrawingStore.subscribe((state, previous) => {
    if (state.selectedDrawingId === previous.selectedDrawingId) return;
    const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);
    if (selected) __drawingTooltipShow(selected); else __drawingTooltipHide();
  });
}
`;
  const marker = "const BASE = import.meta.env.BASE_URL.replace(/\\\/$/, \"\");";
  if (!overlay.includes(marker)) throw new Error("DrawingOverlay BASE marker not found");
  overlay = overlay.replace(marker, marker + tooltipBlock);
  overlayChanged = true;
}

const saveStart = overlay.indexOf("  const saveDrawing = async (pts: DrawingPoint[]) => {");
if (saveStart >= 0) {
  const saveEndMarker = "  };";
  const saveEnd = overlay.indexOf(saveEndMarker, saveStart);
  if (saveEnd < 0) throw new Error("Drawing save function end marker not found");

  const newSaveDrawingTemplate = `  const saveDrawing = (pts: DrawingPoint[]) => {
    // Optimistic UI: paint the completed drawing immediately; persistence is background-only.
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

    fetch(__BASE_TOKEN__, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, timeframe, toolType: activeTool, points: pts, style: activeStyle }),
    })
      .then(res => {
        if (!res.ok) throw new Error("Drawing save failed");
        return res.json();
      })
      .then((saved: Drawing) => {
        const current = useDrawingStore.getState().drawings;
        useDrawingStore.getState().setDrawings(current.map(d => d.id === tempId ? saved : d));
        selectDrawing(saved.id);
      })
      .catch(() => {
        const current = useDrawingStore.getState().drawings;
        useDrawingStore.getState().setDrawings(current.filter(d => d.id !== tempId));
        selectDrawing(null);
      });
  };`;
  const newSaveDrawing = newSaveDrawingTemplate.replace("__BASE_TOKEN__", "`${BASE}/api/drawings`");
  overlay = overlay.slice(0, saveStart) + newSaveDrawing + overlay.slice(saveEnd + saveEndMarker.length);
  overlayChanged = true;
}

if (overlay.includes("await saveDrawing(")) {
  overlay = overlay.replaceAll("await saveDrawing(", "void saveDrawing(");
  overlayChanged = true;
}

if (overlayChanged) {
  fs.writeFileSync(overlayFile, overlay);
  console.log("[chart-fix] Applied chart selection tooltip + optimistic drawing commit to DrawingOverlay.tsx");
}
if (changed) {
  fs.writeFileSync(baseFile, text);
  console.log("[chart-fix] Applied chart compatibility repair to CustomChartBase.tsx");
} else {
  console.log("[chart-fix] Chart compatibility repair already present; no base mutation required.");
}
