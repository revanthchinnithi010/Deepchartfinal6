import { useEffect, useRef, useState, useCallback, memo, useLayoutEffect } from "react";
import {
  LineSeries, AreaSeries, LineStyle as LWLineStyle,
  type ISeriesApi, type Time, type SeriesType,
} from "lightweight-charts";
import { useChartContext } from "@/contexts/ChartContext";
import { useChartBars } from "@/contexts/ChartBarsContext";
import { useIndicatorStore } from "@/store/indicatorStore";
import { useChartStore } from "@/store/chartStore";
import { subscribePanRange, getPanRange } from "./chartPanState";
import {
  parsePineScript, computeCustomIndicator,
  type ParsedPineResult, type PineZone, type PineLevel,
} from "@/calculations/pineParser";
import type { OHLCBar } from "@/store/chartStore";

// ── Canvas size helper ────────────────────────────────────────────────────────

function useChartSize(containerRef: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    setSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
    return () => ro.disconnect();
  }, [containerRef]);
  return size;
}

// ── Zone / level colors ───────────────────────────────────────────────────────

function zoneColor(kind: PineZone["kind"]) {
  switch (kind) {
    case "fvg_bull": return { fill: "rgba(34,197,94,0.10)",  stroke: "rgba(34,197,94,0.5)" };
    case "fvg_bear": return { fill: "rgba(239,68,68,0.10)",  stroke: "rgba(239,68,68,0.5)" };
    case "ob_bull":  return { fill: "rgba(34,197,94,0.14)",  stroke: "rgba(34,197,94,0.65)" };
    case "ob_bear":  return { fill: "rgba(239,68,68,0.14)",  stroke: "rgba(239,68,68,0.65)" };
  }
}

function levelColor(kind: PineLevel["kind"]) {
  switch (kind) {
    case "bos_bull":   return "#22c55e";
    case "bos_bear":   return "#ef4444";
    case "choch_bull": return "#a78bfa";
    case "choch_bear": return "#fb923c";
    case "liq_high":   return "#38bdf8";
    case "liq_low":    return "#f59e0b";
  }
}

// ── SMC SVG overlay (for overlay=true SMC drawings) ──────────────────────────

interface SMCOverlayProps {
  result:  ParsedPineResult;
  bars:    OHLCBar[];
  visible: boolean;
}

const SMCOverlay = memo(function SMCOverlay({ result, bars, visible }: SMCOverlayProps) {
  const { chart, candle } = useChartContext();
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useChartSize(wrapRef);
  const [tick, setTick] = useState(0);

  const toX = useCallback((t: number): number | null => {
    try { return chart?.timeScale().timeToCoordinate(t as Time) ?? null; } catch { return null; }
  }, [chart]);

  const toY = useCallback((p: number): number | null => {
    try { return candle?.priceToCoordinate(p) ?? null; } catch { return null; }
  }, [candle]);

  useEffect(() => {
    if (!chart) return;
    const bump = () => setTick(t => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(bump);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    return () => {
      try { chart.timeScale().unsubscribeVisibleTimeRangeChange(bump); } catch { /**/ }
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump); } catch { /**/ }
    };
  }, [chart]);

  useEffect(() => { setTick(t => t + 1); }, [bars, result]);

  if (!visible) return null;
  void tick;

  const W = size.w || 800, H = size.h || 500;
  let rightX = W;
  try {
    const r = chart?.timeScale().getVisibleRange();
    if (r?.to) { const rx = toX(r.to as unknown as number); if (rx != null) rightX = Math.min(rx + 40, W); }
  } catch { /**/ }

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15, overflow: "hidden" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {result.zones.map((zone, i) => {
          const x1 = toX(zone.startTime), x2 = toX(zone.endTime) ?? rightX;
          const y1 = toY(zone.top), y2 = toY(zone.bottom);
          if (x1 == null || y1 == null || y2 == null) return null;
          const { fill, stroke } = zoneColor(zone.kind);
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          if (rh < 0.5) return null;
          return (
            <g key={i}>
              <rect x={rx} y={ry} width={Math.max(rw, 8)} height={rh} fill={fill} stroke={stroke} strokeWidth={1} rx={2} />
              <text x={rx + 4} y={ry + 10} fontSize={9} fill={stroke} fontFamily="monospace" fontWeight={700}>{zone.label}</text>
            </g>
          );
        })}
        {result.levels.map((lv, i) => {
          const x1 = toX(lv.time), y = toY(lv.price);
          if (x1 == null || y == null) return null;
          const color = levelColor(lv.kind);
          return (
            <g key={i}>
              <line x1={x1} y1={y} x2={rightX} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray="6 4" />
              <rect x={rightX - 36} y={y - 8} width={34} height={14} rx={3} fill={color} opacity={0.9} />
              <text x={rightX - 19} y={y + 4} fontSize={8.5} fill="#0f1618" fontFamily="monospace" fontWeight={800} textAnchor="middle">{lv.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

// ── Per-indicator series tracker ──────────────────────────────────────────────

interface IndSeries {
  seriesList: ISeriesApi<SeriesType>[];
  paneIndex:  number;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export default function CustomIndicatorRenderer() {
  const { chart } = useChartContext();
  const { barsRef, replayBarCount } = useChartBars();
  const { appliedIndicators } = useIndicatorStore();
  const { barsLoaded } = useChartStore();

  // Map from indicator id → series list + pane index
  const seriesMapRef = useRef<Map<string, IndSeries>>(new Map());
  // Parsed results cache (used by SMC overlay)
  const resultsRef  = useRef<Map<string, ParsedPineResult>>(new Map());
  // Track which pane indices are in use (so we can allocate new ones)
  const paneCountRef = useRef(1); // pane 0 = main chart

  const customInds = appliedIndicators.filter(i => i.type === "CUSTOM");

  function lwLineStyle(s?: string) {
    if (s === "dashed") return LWLineStyle.Dashed;
    if (s === "dotted") return LWLineStyle.Dotted;
    return LWLineStyle.Solid;
  }

  // ── Build / sync series on bar/indicator change ───────────────────────────
  useEffect(() => {
    if (!chart || !barsLoaded) return;
    const bars = barsRef.current;
    const map  = seriesMapRef.current;

    // Remove stale entries
    const currentIds = new Set(customInds.map(i => i.id));
    for (const [id, entry] of map) {
      if (!currentIds.has(id)) {
        for (const s of entry.seriesList) { try { chart.removeSeries(s); } catch { /**/ } }
        map.delete(id);
        resultsRef.current.delete(id);
      }
    }

    for (const ind of customInds) {
      const pineCode = (ind.pineCode as string) ?? "";
      const parsed   = parsePineScript(pineCode);
      const result   = computeCustomIndicator(parsed, bars, ind.color, pineCode);
      resultsRef.current.set(ind.id, result);

      const existing = map.get(ind.id);

      // ── Multi-series (WaveTrend / future oscillators) ──────────────────
      if (result.multiSeries.length > 0) {
        // Allocate a new pane for this oscillator if not yet done
        const paneIndex = existing?.paneIndex ?? paneCountRef.current++;

        if (existing) {
          // Update visibility + re-feed data
          for (let si = 0; si < existing.seriesList.length; si++) {
            const s = existing.seriesList[si];
            const ms = result.multiSeries[si];
            if (!ms) continue;
            try {
              s.applyOptions({ visible: ind.visible });
              s.setData(ms.plots.map(p => ({ time: p.time as Time, value: p.value })) as never[]);
            } catch { /**/ }
          }
        } else {
          // Create all series in the allocated pane
          const seriesList: ISeriesApi<SeriesType>[] = [];

          for (const ms of result.multiSeries) {
            try {
              let s: ISeriesApi<SeriesType>;
              if (ms.style === "area") {
                s = chart.addSeries(AreaSeries, {
                  lineColor:   ms.color,
                  topColor:    ms.areaTopColor    ?? "rgba(59,130,246,0.3)",
                  bottomColor: ms.areaBottomColor ?? "rgba(59,130,246,0.05)",
                  lineWidth:   (ms.lineWidth ?? 1) as 1|2|3|4,
                  priceLineVisible:       false,
                  crosshairMarkerVisible: false,
                  lastValueVisible:       false,
                  visible: ind.visible,
                }, paneIndex);
              } else {
                s = chart.addSeries(LineSeries, {
                  color:     ms.color,
                  lineWidth: (ms.lineWidth ?? 1) as 1|2|3|4,
                  priceLineVisible:       false,
                  crosshairMarkerVisible: false,
                  lastValueVisible:       false,
                  visible: ind.visible,
                }, paneIndex);
              }
              s.setData(ms.plots.map(p => ({ time: p.time as Time, value: p.value })) as never[]);
              seriesList.push(s);
            } catch { /**/ }
          }

          // Add horizontal level lines via price lines on the last line series (wt1)
          if (result.hlines.length > 0 && seriesList.length > 0) {
            const refSeries = seriesList[seriesList.length - 1];
            for (const hl of result.hlines) {
              try {
                refSeries.createPriceLine({
                  price:            hl.price,
                  color:            hl.color,
                  lineWidth:        1,
                  lineStyle:        lwLineStyle(hl.lineStyle),
                  axisLabelVisible: true,
                  title:            hl.label ?? "",
                });
              } catch { /**/ }
            }
          }

          map.set(ind.id, { seriesList, paneIndex });
        }

      // ── Single plot series (EMA / SMA / VWAP / RSI) ───────────────────
      } else if (result.plots.length > 0 && result.overlay) {
        if (existing) {
          try {
            const s = existing.seriesList[0];
            s.applyOptions({ visible: ind.visible, color: ind.color });
            s.setData(result.plots.map(p => ({ time: p.time as Time, value: p.value })) as never[]);
          } catch { /**/ }
        } else {
          try {
            const s = chart.addSeries(LineSeries, {
              color: ind.color, lineWidth: (ind.lineWidth || 1) as 1|2|3|4,
              priceLineVisible: false, crosshairMarkerVisible: false,
              lastValueVisible: false, visible: ind.visible,
            }, 0);
            s.setData(result.plots.map(p => ({ time: p.time as Time, value: p.value })) as never[]);
            map.set(ind.id, { seriesList: [s], paneIndex: 0 });
          } catch { /**/ }
        }

      // ── SMC / UNKNOWN: remove any existing chart series (rendered via SVG) ─
      } else {
        if (existing) {
          for (const s of existing.seriesList) { try { chart.removeSeries(s); } catch { /**/ } }
          map.delete(ind.id);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, barsLoaded, customInds, barsRef, replayBarCount]);

  // Lock pane-0 (overlay) series to the same vertical pan range as the candlestick.
  // WaveTrend and other separate-pane indicators (paneIndex > 0) are intentionally
  // excluded — they have their own price scales and shouldn't be constrained.
  useEffect(() => {
    return subscribePanRange((range) => {
      for (const entry of seriesMapRef.current.values()) {
        if (entry.paneIndex !== 0) continue; // skip separate-pane indicators
        for (const s of entry.seriesList) {
          try {
            if (range !== null) {
              s.applyOptions({
                autoscaleInfoProvider: () => {
                  const r = getPanRange();
                  return r ? { priceRange: { minValue: r.lo, maxValue: r.hi } } : null;
                },
              });
            } else {
              s.applyOptions({ autoscaleInfoProvider: () => null });
            }
          } catch { /**/ }
        }
      }
    });
  }, []); // module-level subscribePanRange needs no deps

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (!chart) return;
      for (const entry of seriesMapRef.current.values()) {
        for (const s of entry.seriesList) { try { chart.removeSeries(s); } catch { /**/ } }
      }
      seriesMapRef.current.clear();
      paneCountRef.current = 1;
    };
  }, [chart]);

  // ── Render SMC SVG overlays ───────────────────────────────────────────────
  const bars = barsRef.current;
  const smcInds = customInds.filter(ind => {
    const pineCode = (ind.pineCode as string) ?? "";
    const parsed   = parsePineScript(pineCode);
    return ["SMC_FULL","SMC_STRUCTURE","SMC_FVG","SMC_OB","SMC_LIQUIDITY","UNKNOWN"].includes(parsed.type);
  });

  return (
    <>
      {smcInds.map(ind => {
        const result = resultsRef.current.get(ind.id);
        if (!result) return null;
        return <SMCOverlay key={ind.id} result={result} bars={bars} visible={ind.visible} />;
      })}
    </>
  );
}
