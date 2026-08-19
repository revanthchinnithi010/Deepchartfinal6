import fs from "node:fs";

const path = "./src/components/charts/DrawingAlertModal.tsx";
let s = fs.readFileSync(path, "utf8");

if (!s.includes('useDrawingStore } from "@/store/drawingStore"')) {
  s = s.replace(
    'import { useAlertStore } from "@/store/alertStore";',
    'import { useAlertStore } from "@/store/alertStore";\nimport { useDrawingStore } from "@/store/drawingStore";'
  );
}

if (!s.includes('const liveChartDrawings = useDrawingStore')) {
  s = s.replace(
    '  const isHLine = drawingType === "horizontal_line";',
    '  const liveChartDrawings = useDrawingStore((state) => state.drawings);\n  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(() => prefillDrawing?.id ?? null);\n  const normalizeTf = (tf: string) => { const raw = String(tf ?? "").trim().toUpperCase(); if (raw === "D") return "1D"; if (raw === "W") return "1W"; if (raw === "M") return "1M"; if (raw.endsWith("H")) return String(Number(raw.slice(0, -1)) * 60) + "M"; if (/^\\d+$/.test(raw)) return String(Number(raw)) + "M"; return raw; };\n  const selectableTrendlines = liveChartDrawings.filter((d) => ["trendline", "extended", "ray"].includes(d.toolType) && (!d.symbol || !symbol || d.symbol === symbol) && normalizeTf(d.timeframe) === normalizeTf(currentInterval) && d.points.length >= 2 && d.isVisible !== false);\n\n  const isHLine = drawingType === "horizontal_line";'
  );
}

if (!s.includes('data-live-drawing-selector')) {
  const marker = '            {/* Drawing type */}';
  if (!s.includes(marker)) throw new Error("Drawing type marker not found");
  const block = String.raw`            {/* Live chart drawings */}
            <div data-live-drawing-selector className="flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(167,184,169,0.5)" }}>Select Existing Drawing</span>
              {selectableTrendlines.length === 0 ? (
                <div className="rounded-xl px-3 py-3 text-[10px]" style={{ background: "rgba(13,28,22,0.6)", border: "1px solid rgba(57,91,67,0.25)", color: "rgba(167,184,169,0.35)" }}>No trendlines on this chart for {timeframe}.</div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {selectableTrendlines.map((d) => {
                    const selected = selectedDrawingId === d.id; const p1 = d.points[0]; const p2 = d.points[1];
                    return <button key={d.id} type="button" onClick={() => { setSelectedDrawingId(d.id); setDrawingType(d.toolType === "ray" ? "ray" : "trendline"); const mappedTf = ({ "1":"1m", "5":"5m", "15":"15m", "30":"30m", "60":"1H", "120":"2H", "240":"4H", "D":"1D", "W":"1W" } as Record<string,string>)[String(d.timeframe)] ?? String(d.timeframe); setTimeframe(mappedTf); setP1Price(String(p1.price)); setP2Price(String(p2.price)); setP1DT(msToUtcParts(Number(p1.time) * 1000)); setP2DT(msToUtcParts(Number(p2.time) * 1000)); }} className="w-full text-left rounded-xl px-3 py-2.5 transition-all" style={{ background: selected ? "rgba(183,255,90,0.10)" : "rgba(13,28,22,0.6)", border: selected ? "1px solid rgba(183,255,90,0.45)" : "1px solid rgba(57,91,67,0.25)" }}><div className="flex items-center justify-between gap-2"><span className="text-[12px] font-bold text-white">{d.displayId || ("TL-" + String(d.id).padStart(3, "0"))}</span><span className="text-[9px] font-mono text-white/45">{d.timeframe}</span></div><div className="mt-1 flex gap-4 text-[10px] font-mono text-white/50"><span>P1 {Number(p1.price).toFixed(6)}</span><span>P2 {Number(p2.price).toFixed(6)}</span></div></button>;
                  })}
                </div>
              )}
            </div>

${marker}`;
  s = s.replace(marker, block);
}

// Always bind the alert to the selected chart drawing's persistent display ID.
// This prevents the alert record from generating/keeping an unrelated TL-NNN ID.
const displayIdExpr = '(selectedDrawingId != null ? liveChartDrawings.find((d) => d.id === selectedDrawingId)?.displayId : prefillDrawing?.displayId) ?? null';
if (!s.includes('const selectedDrawingDisplayId =')) {
  s = s.replace(
    '  const isHLine = drawingType === "horizontal_line";',
    `  const selectedDrawingDisplayId = ${displayIdExpr};\n\n  const isHLine = drawingType === "horizontal_line";`
  );
}

if (s.includes('drawingDisplayId:')) {
  s = s.replace(/drawingDisplayId:\s*[^,\n}]+/g, `drawingDisplayId: selectedDrawingDisplayId`);
} else {
  // If an older build does not yet include the field, add it to the trendline alert payload.
  const payloadMarkers = [
    'point2Time:',
    'point2Time :',
  ];
  let inserted = false;
  for (const marker of payloadMarkers) {
    if (s.includes(marker)) {
      s = s.replace(marker, `drawingDisplayId: selectedDrawingDisplayId,\n        ${marker}`);
      inserted = true;
      break;
    }
  }
  if (!inserted) console.warn("Could not find alert payload marker; drawingDisplayId was not injected");
}

fs.writeFileSync(path, s);
console.log("Live chart drawing selector + persistent display ID binding applied");
