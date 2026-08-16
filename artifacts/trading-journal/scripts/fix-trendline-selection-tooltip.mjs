import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");
if (!fs.existsSync(file)) throw new Error("DrawingOverlay.tsx not found");
let src = fs.readFileSync(file, "utf8");

// Remove the generated block from a previous build, but leave the real source untouched.
src = src.replace(/\n\/\/ \[chart-fix\] Selected drawing information tooltip\.[\s\S]*?(?=\nfunction hexToRgba)/m, "\n");

const marker = 'const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "");';
if (!src.includes(marker)) throw new Error("DrawingOverlay BASE marker not found");

const block = String.raw`

// [chart-fix] Selected drawing information tooltip.
let __drawingTooltip: HTMLDivElement | null = null;
let __lastDrawingPointer = { x: 0, y: 0 };
let __allowDrawingTooltipRefresh = false;

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
  if (__drawingTooltip && document.body.contains(__drawingTooltip)) return __drawingTooltip;
  const el = document.createElement("div");
  el.setAttribute("data-chart-drawing-info-tooltip", "true");
  el.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "display:none",
    "pointer-events:none",
    "width:280px",
    "box-sizing:border-box",
    "padding:12px 13px",
    "border-radius:12px",
    "border:1px solid rgba(255,255,255,.16)",
    "background:rgba(14,14,16,.98)",
    "backdrop-filter:blur(14px)",
    "-webkit-backdrop-filter:blur(14px)",
    "box-shadow:0 14px 40px rgba(0,0,0,.55)",
    "color:#f4f4f5",
    "font:12px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
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
  const rows: Array<[string, string]> = [
    ["Alert", alert ? "Set" : "Not set"],
    ["ID", String(d.displayId ?? d.id)],
    ["Trigger", alert?.status === "triggered" ? "Triggered" : "Not triggered"],
    ["Symbol", String(d.symbol ?? "—")],
    ["Timeframe", String(d.timeframe ?? "—")],
    ["Condition", String(alert?.condition ?? "—")],
    ["Alert ID", String(alert?.id ?? "—")],
    ["Created", d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"]
  ];
  const rowHtml = rows.map(([key, value]) =>
    "<div style=\"display:flex;gap:12px;justify-content:space-between;border-top:1px solid rgba(255,255,255,.07);padding:5px 0\"><span style=\"color:#9ca3af\">" + __tooltipEscape(key) + "</span><span style=\"text-align:right;max-width:190px;overflow-wrap:anywhere\">" + __tooltipEscape(value) + "</span></div>"
  ).join("");
  el.innerHTML = "<div style=\"font-weight:700;font-size:13px;margin-bottom:8px\">" + (d.toolType === "rect" ? "Zone" : "Trendline") + "</div>" + rowHtml;
  el.style.display = "block";
  const pad = 10;
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(pad, __lastDrawingPointer.x + 16), Math.max(pad, window.innerWidth - r.width - pad));
  const top = Math.min(Math.max(pad, __lastDrawingPointer.y + 16), Math.max(pad, window.innerHeight - r.height - pad));
  el.style.left = left + "px";
  el.style.top = top + "px";
}

function __refreshDrawingTooltip() {
  if (typeof document === "undefined") return;
  const state = useDrawingStore.getState();
  const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);
  if (selected && ["trendline", "extended", "ray", "rect"].includes(selected.toolType)) __showDrawingTooltip(selected);
  else __hideDrawingTooltip();
}

function __isDrawingHitTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-drawing-toolbar], [data-drawing-popup]")) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "path" || tag === "circle" || tag === "line" || tag === "rect" || tag === "polygon" || tag === "polyline" || tag === "ellipse";
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", event => {
    __lastDrawingPointer = { x: event.clientX, y: event.clientY };
    __allowDrawingTooltipRefresh = __isDrawingHitTarget(event.target);
    // Any tap outside an actual drawing hit area — including the empty chart
    // area and the bottom drawing control bar — closes the tooltip immediately.
    if (!__allowDrawingTooltipRefresh) __hideDrawingTooltip();
  }, true);
  window.addEventListener("pointerup", event => {
    __lastDrawingPointer = { x: event.clientX, y: event.clientY };
    if (__allowDrawingTooltipRefresh) window.setTimeout(__refreshDrawingTooltip, 0);
    else __hideDrawingTooltip();
    __allowDrawingTooltipRefresh = false;
  }, true);
  window.addEventListener("pointermove", event => {
    __lastDrawingPointer = { x: event.clientX, y: event.clientY };
  }, true);
  useDrawingStore.subscribe((state, previous) => {
    if (state.selectedDrawingId !== previous.selectedDrawingId) {
      window.requestAnimationFrame(() => window.setTimeout(__refreshDrawingTooltip, 0));
    }
  });
  window.setTimeout(__refreshDrawingTooltip, 0);
}
`;

src = src.replace(marker, marker + block);
fs.writeFileSync(file, src, "utf8");
console.log("[drawing-fix] Tooltip now closes on empty chart/control-bar taps and remains on drawing selection.");
