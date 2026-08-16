import { useEffect, useMemo, useState } from "react";
import { useChartContext } from "@/contexts/ChartContext";
import { useChartBars } from "@/contexts/ChartBarsContext";

function intervalSeconds(iv: string): number {
  if (iv === "D" || iv === "1D") return 86400;
  if (iv === "W" || iv === "1W") return 604800;
  const mins = parseInt(iv, 10);
  return Number.isFinite(mins) && mins > 0 ? mins * 60 : 60;
}

function formatSyntheticTime(base: number, index: number, iv: string): string {
  const d = new Date((base + index * intervalSeconds(iv)) * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (iv === "D" || iv === "1D" || iv === "W" || iv === "1W") {
    return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString(undefined, { month: "short" })}`;
  }
  return `${hh}:${mm}`;
}

/**
 * Replaces only the displayed time labels. Candle timestamps remain real
 * exchange timestamps, so drawings, alerts and crosshair data are untouched.
 * The labels advance by candle index, which keeps hidden session gaps from
 * reappearing as timestamp jumps on the axis.
 */
export default function CompressedTimeAxisOverlay({ interval }: { interval: string }) {
  const { chart } = useChartContext();
  const { barsRef, replayBarCount } = useChartBars();
  const [, bump] = useState(0);

  useEffect(() => {
    if (!chart) return;
    const redraw = () => bump(v => v + 1);
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(redraw);
    ts.subscribeSizeChange(redraw);
    window.addEventListener("resize", redraw);
    redraw();
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(redraw);
      ts.unsubscribeSizeChange(redraw);
      window.removeEventListener("resize", redraw);
    };
  }, [chart]);

  const labels = useMemo(() => {
    if (!chart || barsRef.current.length < 2) return [];
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return [];

    const bars = barsRef.current;
    const from = Math.max(0, Math.floor(range.from as number));
    const to = Math.min(bars.length - 1, Math.ceil(range.to as number));
    if (to < from) return [];

    const visible = to - from + 1;
    const targetLabels = 5;
    const step = Math.max(1, Math.ceil(visible / targetLabels));
    const out: { index: number; text: string; x: number }[] = [];

    for (let i = from; i <= to; i += step) {
      const x = chart.timeScale().logicalToCoordinate(i);
      if (x == null || !Number.isFinite(x)) continue;
      out.push({ index: i, text: formatSyntheticTime(bars[0].time, i, interval), x });
    }

    if (to !== from && (out.length === 0 || out[out.length - 1].index !== to)) {
      const x = chart.timeScale().logicalToCoordinate(to);
      if (x != null && Number.isFinite(x)) {
        out.push({ index: to, text: formatSyntheticTime(bars[0].time, to, interval), x });
      }
    }
    return out;
  }, [chart, barsRef, interval, replayBarCount]);

  if (!chart || labels.length === 0) return null;

  let priceWidth = 70;
  try { priceWidth = chart.priceScale("right").width(); } catch { /* chart may be resizing */ }
  const height = Math.max(28, chart.timeScale().height());

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: `${Math.max(0, priceWidth)}px`,
        bottom: 0,
        height,
        zIndex: 22,
        pointerEvents: "none",
        background: "rgba(0,0,0,0.98)",
        borderTop: "1px solid rgba(57,91,67,0.35)",
        overflow: "hidden",
      }}
    >
      {labels.map(label => (
        <span
          key={label.index}
          style={{
            position: "absolute",
            left: label.x,
            bottom: 6,
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.72)",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: "14px",
            whiteSpace: "nowrap",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}
