import fs from "node:fs";

const path = "./src/components/charts/DrawingAlertModal.tsx";
let s = fs.readFileSync(path, "utf8");

// The chart drawing store is the single source of truth. The alert screen must
// use the chart's persistent displayId, never the database/internal numeric id.
if (!s.includes('useDrawingStore } from "@/store/drawingStore"')) {
  s = s.replace(
    'import { useAlertStore } from "@/store/alertStore";',
    'import { useAlertStore } from "@/store/alertStore";\nimport { useDrawingStore } from "@/store/drawingStore";'
  );
}

if (!s.includes('const liveChartDrawings = useDrawingStore')) {
  const marker = '  const isHLine = drawingType === "horizontal_line";';
  if (!s.includes(marker)) throw new Error("Drawing type marker not found");
  const injected = `  const liveChartDrawings = useDrawingStore((state) => state.drawings);\n  const chartSelectedDrawingId = useDrawingStore((state) => state.selectedDrawingId);\n  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(() => chartSelectedDrawingId ?? prefillDrawing?.id ?? null);\n  useEffect(() => {\n    if (chartSelectedDrawingId != null) setSelectedDrawingId(chartSelectedDrawingId);\n  }, [chartSelectedDrawingId]);\n  const normalizeTf = (tf: string) => { const raw = String(tf ?? "").trim().toUpperCase(); if (raw === "D") return "1D"; if (raw === "W") return "1W"; if (raw === "M") return "1M"; if (raw.endsWith("H")) return String(Number(raw.slice(0, -1)) * 60) + "M"; if (/^\\d+$/.test(raw)) return String(Number(raw)) + "M"; return raw; };\n  const sameDrawingPoints = (a: Drawing, b: Drawing) => {\n    if (!a || !b || a.points.length < 2 || b.points.length < 2) return false;\n    const priceClose = (x: number, y: number) => Math.abs(Number(x) - Number(y)) <= 1e-9;\n    const timeClose = (x: number, y: number) => Math.abs(Number(x) - Number(y)) <= 2;\n    return priceClose(a.points[0].price, b.points[0].price) && priceClose(a.points[1].price, b.points[1].price) && timeClose(a.points[0].time, b.points[0].time) && timeClose(a.points[1].time, b.points[1].time);\n  };\n  const selectableTrendlines = liveChartDrawings.filter((d) => ["trendline", "extended", "ray"].includes(d.toolType) && (!d.symbol || !symbol || d.symbol === symbol) && normalizeTf(d.timeframe) === normalizeTf(currentInterval) && d.points.length >= 2 && d.isVisible !== false);\n  const selectedChartDrawing = selectedDrawingId != null ? liveChartDrawings.find((d) => d.id === selectedDrawingId) : undefined;\n  const canonicalPrefillDrawing = prefillDrawing ? liveChartDrawings.find((d) => {\n    if (d.toolType !== prefillDrawing.toolType || (d.symbol && prefillDrawing.symbol && d.symbol !== prefillDrawing.symbol)) return false;\n    return sameDrawingPoints(d, prefillDrawing);\n  }) : undefined;\n  const resolvedChartDrawing = selectedChartDrawing ?? canonicalPrefillDrawing;\n  const selectedChartDisplayId = resolvedChartDrawing?.displayId ?? (resolvedChartDrawing as any)?.display_id ?? null;\n\n  const isHLine = drawingType === "horizontal_line";`;
  s = s.replace(marker, injected);
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
                    const selected = selectedDrawingId === d.id;
                    const p1 = d.points[0]; const p2 = d.points[1];
                    const displayId = d.displayId ?? (d as any).display_id ?? null;
                    return <button key={d.id} type="button" onClick={() => { setSelectedDrawingId(d.id); setDrawingType(d.toolType === "ray" ? "ray" : "trendline"); const mappedTf = ({ "1":"1m", "5":"5m", "15":"15m", "30":"30m", "60":"1H", "120":"2H", "240":"4H", "D":"1D", "W":"1W" } as Record<string,string>)[String(d.timeframe)] ?? String(d.timeframe); setTimeframe(mappedTf); setP1Price(String(p1.price)); setP2Price(String(p2.price)); setP1DT(msToUtcParts(Number(p1.time) * 1000)); setP2DT(msToUtcParts(Number(p2.time) * 1000)); }} className="w-full text-left rounded-xl px-3 py-2.5 transition-all" style={{ background: selected ? "rgba(183,255,90,0.10)" : "rgba(13,28,22,0.6)", border: selected ? "1px solid rgba(183,255,90,0.45)" : "1px solid rgba(57,91,67,0.25)" }}><div className="flex items-center justify-between gap-2"><span className="text-[12px] font-bold text-white">{displayId ?? "—"}</span><span className="text-[9px] font-mono text-white/45">{d.timeframe}</span></div><div className="mt-1 flex gap-4 text-[10px] font-mono text-white/50"><span>P1 {Number(p1.price).toFixed(6)}</span><span>P2 {Number(p2.price).toFixed(6)}</span></div></button>;
                  })}
                </div>
              )}
            </div>

${marker}`;
  s = s.replace(marker, block);
}

const displayIdExpr = 'selectedChartDisplayId ?? null';
if (!s.includes('const selectedDrawingDisplayId =')) {
  const marker = '  const isHLine = drawingType === "horizontal_line";';
  if (!s.includes(marker)) throw new Error("Drawing type marker not found for display ID injection");
  s = s.replace(marker, `  const selectedDrawingDisplayId = ${displayIdExpr};\n\n${marker}`);
}

if (s.includes('drawingDisplayId:')) {
  s = s.replace(/drawingDisplayId:\s*[^,\n}]+/g, 'drawingDisplayId: selectedDrawingDisplayId');
} else {
  const marker = 'point2Time:';
  if (!s.includes(marker)) throw new Error("Alert payload marker not found");
  s = s.replace(marker, `drawingDisplayId: selectedDrawingDisplayId,\n        ${marker}`);
}

fs.writeFileSync(path, s);
console.log("Trendline alert selector now resolves the canonical chart displayId from selected/matching drawing");
