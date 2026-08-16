import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const file = path.join(repoRoot, "artifacts/trading-journal/src/components/charts/DrawingOverlay.tsx");

if (!fs.existsSync(file)) throw new Error(`DrawingOverlay.tsx not found: ${file}`);

let src = fs.readFileSync(file, "utf8");
if (src.includes("data-chart-drawing-info-tooltip")) {
  console.log("[trendline-tooltip] Already installed; no changes required.");
  process.exit(0);
}

const marker = 'const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "");';
if (!src.includes(marker)) throw new Error("DrawingOverlay BASE marker not found");

const block = String.raw`

// [chart-fix] Selected trendline information tooltip.
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
  if (!d || !["trendline", "extended", "ray"].includes(d.toolType)) return;
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
  el.innerHTML = "<div style=\"font-weight:700;font-size:13px;margin-bottom:8px\">Trendline</div>" + rowHtml;
  el.style.display = "block";

  const pad = 12;
  const rect = el.getBoundingClientRect();
  const left = Math.min(Math.max(pad, __lastDrawingPointer.x + 14), Math.max(pad, window.innerWidth - rect.width - pad));
  const top = Math.min(Math.max(pad, __lastDrawingPointer.y + 14), Math.max(pad, window.innerHeight - rect.height - pad));
  el.style.left = left + "px";
  el.style.top = top + "px";
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (event) => {
    __lastDrawingPointer = { x: event.clientX, y: event.clientY };
    window.setTimeout(() => {
      const state = useDrawingStore.getState();
      const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);
      if (selected) __showDrawingTooltip(selected); else __hideDrawingTooltip();
    }, 0);
  }, true);
  useDrawingStore.subscribe((state, previous) => {
    if (state.selectedDrawingId === previous.selectedDrawingId) return;
    const selected = state.selectedDrawingId == null ? null : state.drawings.find(d => d.id === state.selectedDrawingId);
    if (selected) __showDrawingTooltip(selected); else __hideDrawingTooltip();
  });
}
`;

src = src.replace(marker, marker + block);
fs.writeFileSync(file, src);
console.log("[trendline-tooltip] Installed selected trendline info tooltip.");
