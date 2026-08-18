import { useEffect, useRef, useMemo, useCallback } from "react";
import { LineSeries, type ISeriesApi, type Time, LineStyle } from "lightweight-charts";
import { useChartContext } from "@/contexts/ChartContext";
import { useChartBars } from "@/contexts/ChartBarsContext";
import { useIndicatorStore, type AppliedIndicator } from "@/store/indicatorStore";
import { useChartStore, type OHLCBar } from "@/store/chartStore";
import { useLiveMarketContext } from "@/contexts/LiveMarketContext";
import { calcEMA, calcSMA, calcVWAP, calcRSI, calcSupertrend } from "@/calculations/indicatorCalc";
import { subscribePanRange, getPanRange } from "./chartPanState";

interface SeriesEntry {
  series: ISeriesApi<"Line">;
}

function toLineStyle(s: string): LineStyle {
  if (s === "dashed") return LineStyle.Dashed;
  if (s === "dotted") return LineStyle.Dotted;
  return LineStyle.Solid;
}

function getSettingsKey(ind: AppliedIndicator): string {
  // Indicator settings are part of the calculation identity.
  // Without this, changing EMA 20 -> 50 could incorrectly reuse the old cached points.
  return `${ind.type}:${JSON.stringify(ind.settings ?? {})}`;
}

function buildPoints(bars: OHLCBar[], ind: AppliedIndicator): { time: Time; value: number }[] {
  if (!bars.length) return [];
  const closes = bars.map(b => b.close);

  try {
    switch (ind.type) {
      case "SMA": {
        const period = Number(ind.settings.period) || 20;
        const vals = calcSMA(closes, period);
        return bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time as Time, value: vals[i]! }] : []);
      }
      case "VWAP": {
        const vals = calcVWAP(bars);
        return bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time as Time, value: vals[i]! }] : []);
      }
      case "RSI": {
        const period = Number(ind.settings.period) || 14;
        const rsiVals = calcRSI(closes, period);
        const slice = closes.slice(-100);
        const minP = Math.min(...slice);
        const maxP = Math.max(...slice);
        const range = maxP - minP || 1;
        return bars.flatMap((b, i) => {
          const r = rsiVals[i];
          return r != null ? [{ time: b.time as Time, value: minP + (r / 100) * range }] : [];
        });
      }
      case "SUPERTREND": {
        const period = Number(ind.settings.period) || 10;
        const mult   = Number(ind.settings.multiplier) || 3;
        const pts = calcSupertrend(bars, period, mult);
        return bars.flatMap((b, i) => {
          const p = pts[i];
          return p != null ? [{ time: b.time as Time, value: p.value }] : [];
        });
      }
      case "EMA":
      default: {
        const period = Number(ind.settings.period) || 9;
        const vals = calcEMA(closes, period);
        return bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time as Time, value: vals[i]! }] : []);
      }
    }
  } catch {
    return [];
  }
}

export default function IndicatorRenderer() {
  const { chart } = useChartContext();
  const { barsRef, replayBarCount } = useChartBars();
  const appliedIndicators = useIndicatorStore(s => s.appliedIndicators);
  const { barsLoaded } = useChartStore();
  const { subscribeToMessages } = useLiveMarketContext();

  const seriesMapRef = useRef<Map<string, SeriesEntry>>(new Map());

  const builtinInds = useMemo(
    () => appliedIndicators.filter(i => i.type !== "CUSTOM"),
    [appliedIndicators],
  );

  const indicatorsRef = useRef(builtinInds);
  indicatorsRef.current = builtinInds;

  // Cache is keyed by indicator id, but its validity also includes settings.
  // This guarantees EMA/SMA/RSI period changes always recalculate the line.
  const pointCacheRef = useRef<Map<string, {
    barsLen: number;
    firstTime: number;
    lastTime: number;
    settingsKey: string;
    pts: { time: Time; value: number }[];
  }>>(new Map());

  const getPoints = useCallback((bars: OHLCBar[], ind: AppliedIndicator) => {
    const cacheKey = ind.id;
    const cached = pointCacheRef.current.get(cacheKey);
    const firstTime = (bars[0]?.time ?? 0) as number;
    const lastTime = (bars[bars.length - 1]?.time ?? 0) as number;
    const settingsKey = getSettingsKey(ind);

    if (
      cached &&
      cached.barsLen === bars.length &&
      cached.firstTime === firstTime &&
      cached.lastTime === lastTime &&
      cached.settingsKey === settingsKey
    ) {
      return cached.pts;
    }

    const pts = buildPoints(bars, ind);
    pointCacheRef.current.set(cacheKey, {
      barsLen: bars.length,
      firstTime,
      lastTime,
      settingsKey,
      pts,
    });
    return pts;
  }, []);

  useEffect(() => {
    if (!chart || !barsLoaded) return;
    const bars = barsRef.current;
    if (!bars.length) return;
    const map = seriesMapRef.current;

    const currentIds = new Set(builtinInds.map(i => i.id));
    for (const [id, entry] of map) {
      if (!currentIds.has(id)) {
        try { chart.removeSeries(entry.series); } catch { /**/ }
        map.delete(id);
        pointCacheRef.current.delete(id);
      }
    }

    const firstTime = (bars[0]?.time ?? 0) as number;
    const lastTime = (bars[bars.length - 1]?.time ?? 0) as number;

    for (const ind of builtinInds) {
      const prevCached = pointCacheRef.current.get(ind.id);
      const settingsKey = getSettingsKey(ind);
      const dataChanged = !prevCached
        || prevCached.barsLen !== bars.length
        || prevCached.firstTime !== firstTime
        || prevCached.lastTime !== lastTime
        || prevCached.settingsKey !== settingsKey;

      const pts = getPoints(bars, ind);
      const existing = map.get(ind.id);

      if (existing) {
        try {
          existing.series.applyOptions({
            visible: ind.visible,
            color: ind.color,
            lineWidth: (ind.lineWidth || 1) as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(ind.lineStyle),
          });
          if (dataChanged) {
            existing.series.setData(pts as never[]);
          }
        } catch { /**/ }
      } else {
        try {
          const s = chart.addSeries(LineSeries, {
            color: ind.color,
            lineWidth: (ind.lineWidth || 1) as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(ind.lineStyle),
            visible: ind.visible,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
          }, 0);
          s.setData(pts as never[]);
          map.set(ind.id, { series: s });
        } catch { /**/ }
      }
    }
  }, [chart, barsLoaded, builtinInds, barsRef, getPoints, replayBarCount]);

  useEffect(() => {
    return subscribeToMessages((msg: unknown) => {
      if (!chart) return;
      const m = msg as { type?: string; bar?: OHLCBar };
      if ((m.type !== "bar_update" && m.type !== "new_bar") || !m.bar) return;
      const bars = barsRef.current;
      if (!bars.length) return;
      const map = seriesMapRef.current;

      for (const ind of indicatorsRef.current) {
        if (!ind.visible) continue;
        const entry = map.get(ind.id);
        if (!entry) continue;
        try {
          pointCacheRef.current.delete(ind.id);
          const pts = buildPoints(bars, ind);
          const last = pts[pts.length - 1];
          if (last) entry.series.update(last);
        } catch { /**/ }
      }
    });
  }, [chart, subscribeToMessages, barsRef]);

  useEffect(() => {
    return subscribePanRange((range) => {
      for (const entry of seriesMapRef.current.values()) {
        try {
          if (range !== null) {
            entry.series.applyOptions({
              autoscaleInfoProvider: () => {
                const r = getPanRange();
                return r ? { priceRange: { minValue: r.lo, maxValue: r.hi } } : null;
              },
            });
          } else {
            entry.series.applyOptions({ autoscaleInfoProvider: () => null });
          }
        } catch { /**/ }
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (!chart) return;
      for (const entry of seriesMapRef.current.values()) {
        try { chart.removeSeries(entry.series); } catch { /**/ }
      }
      seriesMapRef.current.clear();
      pointCacheRef.current.clear();
    };
  }, [chart]);

  return null;
}
