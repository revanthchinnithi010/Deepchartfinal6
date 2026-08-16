import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const drawingFile = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");
const chartsFile = path.join(repoRoot, "artifacts/trading-journal/src/pages/charts.tsx");

if (!fs.existsSync(drawingFile)) throw new Error(`DrawingOverlay.tsx not found: ${drawingFile}`);
if (!fs.existsSync(chartsFile)) throw new Error(`charts.tsx not found: ${chartsFile}`);

// ── Selected-drawing tooltip + alert request event ────────────────────────────
let src = fs.readFileSync(drawingFile, "utf8");
if (!src.includes("data-chart-drawing-info-tooltip")) {
  const marker = 'const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "");';
  if (!src.includes(marker)) throw new Error("DrawingOverlay BASE marker not found");

  const block = String.raw`

// [chart-fix] Selected drawing information tooltip + alert-page request.
let __drawingTooltip: HTMLDivElement | null = null;
let __lastDrawingPointer = { x: 0, y: 0 };

function __tooltipEscape(value: unknown): string {
  const text = String(value ?? "—");
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return text.replace(/[&<>"']/g, ch => map[ch] ?? ch);
}

function __hideDrawingTooltip() {
  if (__drawingTooltip) __drawingTooltip.style.display = "none";
}

function __getDrawingTooltip(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (__drawingTooltip) return __drawingTooltip;
  const el = document.createElement("div");
  el.setAttribute("data-chart-drawing-info-tooltip", "true");
  el.style.cssText = [
    "position:fixed", "z-index:2147483647", "display:none", "pointer-events:none",
    "min-width:250px", "max-width:320px", "padding:12px 13px", "border-radius:12px",
    "border:1px solid rgba(255,255,255,.12)", "background:rgba(14,14,16,.96)",
    "backdrop-filter:blur(14px)", "-webkit-backdrop-filter:blur(14px)",
    "box-shadow:0 14px 40px rgba(0,0,0,.42)", "color:#f4f4f5",
    "font:12px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
  ].join(";");
  document.body.appendChild(el);
  __drawingTooltip = el;
  return el;
}

function __findTrendlineAlert(d: Drawing): TrendlineAlert | undefined {
  const alerts = useAlertStore.getState().alerts.filter(a => a.type === "trendline") as TrendlineAlert[];
  const displayKey = String(d.displayId ?? d.id);
  return alerts.find(a => String(a.drawingDisplayId ?? "") === displayKey)
    ?? alerts.find(a => a.symbol === d.symbol && normalizeTimeframe(a.timeframe) === normalizeTimeframe(d.timeframe));
}

function __showDrawingTooltip(d: Drawing) {
  if (!d || !["trendline", "extended", "ray", "rect"].includes(d.toolType)) return;
  const el = __getDrawingTooltip();
  if (!el) return;

  const alert = __findTrendlineAlert(d);
  const p1 = d.points[0];
  const p2 = d.points[1];
  const point1Text = p1 ? new Date(Number(p1.time) * 1000).toLocaleString() + " • " + Number(p1.price).toFixed(6) : "—";
  const point2Text = p2 ? new Date(Number(p2.time) * 1000).toLocaleString() + " • " + Number(p2.price).toFixed(6) : "—";
  const rows: Array<[string, string]> = [
    ["Alert", alert ? "Set" : "Not set"],
    ["Id", String(d.displayId ?? d.id)],
    ["Trigger", alert?.status === "triggered" ? "Triggered" : "Not triggered"],
    ["Symbol", String(d.symbol)],
    ["Timeframe", String(d.timeframe)],
    ["Point 1", point1Text],
    ["Point 2", point2Text],
    ["Condition", String(alert?.condition ?? "—")],
    ["Alert ID", String(alert?.id ?? "—")],
    ["Created", d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"],
    ["Locked", d.isLocked ? "Yes" : "No"],
    ["Visible", d.isVisible ? "Yes" : "No"],
  ];
  const rowHtml = rows.map(([key, value]) =>
    "<div style=\"display:flex;gap:12px;justify-content:space-between;border-top:1px solid rgba(255,255,255,.07);padding:5px 0\"><span style=\"color:#9ca3af\">" +
    __tooltipEscape(key) + "</span><span style=\"text-align:right;max-width:205px;overflow-wrap:anywhere\">" +
    __tooltipEscape(value) + "</span></div>"
  ).join("");
  const title = d.toolType === "rect" ? "Rectangle" : "Trendline";
  el.innerHTML = "<div style=\"font-weight:700;font-size:13px;margin-bottom:8px\">" + title + "</div>" + rowHtml;
  el.style.display = "block";

  const pad = 12;
  const rect = el.getBoundingClientRect();
  const left = Math.min(Math.max(pad, __lastDrawingPointer.x + 14), Math.max(pad, window.innerWidth - rect.width - pad));
  const top = Math.min(Math.max(pad, __lastDrawingPointer.y + 14), Math.max(pad, window.innerHeight - rect.height - pad));
  el.style.left = left + "px";
  el.style.top = top + "px";
}

function __requestDrawingAlert(d: Drawing) {
  if (!d || !["trendline", "extended", "ray", "rect"].includes(d.toolType)) return;
  window.dispatchEvent(new CustomEvent("chart-drawing-alert-request", { detail: d }));
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (event) => {
    __lastDrawingPointer = { x: event.clientX, y: event.clientY };
    window.setTimeout(() => {
      const state = useDrawingStore.getState();
      const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);
      if (selected) {
        __showDrawingTooltip(selected);
        __requestDrawingAlert(selected);
      } else {
        __hideDrawingTooltip();
      }
    }, 0);
  }, true);
  useDrawingStore.subscribe((state, previous) => {
    if (state.selectedDrawingId === previous.selectedDrawingId) return;
    const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);
    if (selected) {
      __showDrawingTooltip(selected);
      __requestDrawingAlert(selected);
    } else {
      __hideDrawingTooltip();
    }
  });
}
`;
  src = src.replace(marker, marker + block);
  fs.writeFileSync(drawingFile, src);
}

// ── Connect selected drawing to the existing DrawingAlertModal ────────────────
let charts = fs.readFileSync(chartsFile, "utf8");
const chartMarker = "[chart-fix] Open DrawingAlertModal from selected chart drawing";
if (!charts.includes(chartMarker)) {
  const modalStart = charts.indexOf("<DrawingAlertModal");
  if (modalStart < 0) throw new Error("DrawingAlertModal JSX invocation not found in charts.tsx");

  function findTagEnd(text, start) {
    let brace = 0;
    let quote = null;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\" && quote !== "`" ) i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "{") brace++;
      else if (ch === "}") brace--;
      else if (ch === ">" && brace === 0) return i + 1;
    }
    throw new Error("Unterminated DrawingAlertModal JSX tag");
  }

  function propRange(tag, prop) {
    const re = new RegExp(`\\b${prop}\\s*=\\s*\\{`, "m");
    const m = re.exec(tag);
    if (!m) return null;
    const open = m.index + m[0].lastIndexOf("{");
    let depth = 0, quote = null;
    for (let i = open; i < tag.length; i++) {
      const ch = tag[i];
      if (quote) {
        if (ch === "\\" && quote !== "`") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return { start: open, end: i + 1, expr: tag.slice(open + 1, i) };
      }
    }
    throw new Error(`Unterminated ${prop} prop`);
  }

  const modalEnd = findTagEnd(charts, modalStart);
  let tag = charts.slice(modalStart, modalEnd);
  const openProp = propRange(tag, "open") ?? propRange(tag, "isOpen");
  const drawingProp = propRange(tag, "drawing");
  if (!openProp || !drawingProp) throw new Error("DrawingAlertModal must expose open/isOpen and drawing props");

  const openName = tag.slice(0, openProp.start).match(/\\b(open|isOpen)\\s*=\\s*$/)?.[1] ?? (tag.includes("isOpen=") ? "isOpen" : "open");
  const drawingName = "drawing";
  const newOpen = `{__selectionAlertOpen || (${openProp.expr})}`;
  const newDrawing = `{__selectionAlertDrawing ?? (${drawingProp.expr})}`;
  tag = tag.slice(0, openProp.start) + `${openName}=${newOpen}` + tag.slice(openProp.end);
  let shift = newOpen.length + openName.length + 1 - (openProp.end - openProp.start);
  const drawingProp2 = propRange(tag, drawingName);
  if (!drawingProp2) throw new Error("Failed to locate drawing prop after patching open prop");
  tag = tag.slice(0, drawingProp2.start) + `${drawingName}=${newDrawing}` + tag.slice(drawingProp2.end);

  const closeProp = propRange(tag, "onClose");
  if (!closeProp) throw new Error("DrawingAlertModal onClose prop not found");
  const closeExpr = closeProp.expr;
  const wrappedClose = `{() => { __setSelectionAlertOpen(false); __setSelectionAlertDrawing(null); (${closeExpr})?.(); }}`;
  tag = tag.slice(0, closeProp.start) + `onClose=${wrappedClose}` + tag.slice(closeProp.end);

  // Find the component function containing the modal invocation and install the hook state there.
  const before = charts.slice(0, modalStart);
  const fnMatches = [
    ...before.matchAll(/(?:export\\s+default\\s+)?function\\s+[A-Za-z0-9_$]+\\s*\\([^)]*\\)\\s*\\{/g),
    ...before.matchAll(/(?:const|let)\\s+[A-Za-z0-9_$]+\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{/g),
  ].sort((a, b) => a.index - b.index);
  const fn = fnMatches[fnMatches.length - 1];
  if (!fn) throw new Error("Could not locate Charts component function for alert-selection hooks");
  const bracePos = fn.index + fn[0].lastIndexOf("{") + 1;
  const hookBlock = `\n  // ${chartMarker}\n  const [__selectionAlertOpen, __setSelectionAlertOpen] = useState(false);\n  const [__selectionAlertDrawing, __setSelectionAlertDrawing] = useState<Drawing | null>(null);\n  useEffect(() => {\n    const handler = (event) => {\n      const drawing = event?.detail;\n      if (!drawing || !["trendline", "extended", "ray", "rect"].includes(drawing.toolType)) return;\n      __setSelectionAlertDrawing(drawing);\n      __setSelectionAlertOpen(true);\n    };\n    window.addEventListener("chart-drawing-alert-request", handler);\n    return () => window.removeEventListener("chart-drawing-alert-request", handler);\n  }, []);\n`;

  charts = charts.slice(0, bracePos) + hookBlock + charts.slice(bracePos);
  const adjustedModalStart = modalStart + hookBlock.length;
  const adjustedModalEnd = adjustedModalStart + tag.length;
  charts = charts.slice(0, adjustedModalStart) + tag + charts.slice(adjustedModalEnd);
  fs.writeFileSync(chartsFile, charts);
}

console.log("[drawing-alert] Selected trendline/ray/rectangle now opens the existing alert page with the drawing prefilled.");
