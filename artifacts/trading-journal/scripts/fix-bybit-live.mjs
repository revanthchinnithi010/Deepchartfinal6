import fs from "node:fs";

const file = "src/components/charts/CustomChartBase.tsx";
let s = fs.readFileSync(file, "utf8");

const marker = "  // ── Per-client candle subscription ────────────────────────────────────────";
if (s.includes("[Bybit direct tick bridge]")) {
  console.log("Bybit direct tick bridge already installed.");
  process.exit(0);
}
if (!s.includes(marker)) throw new Error("CustomChartBase: per-client subscription marker not found");

const bridge = `
  // [Bybit direct tick bridge]
  // Feed the chart from the browser's dedicated Bybit publicTrade stream.
  // This bypasses /api/ws completely for crypto and keeps the existing chart
  // RAF/aggregator path responsible for rendering the live candle.
  useEffect(() => {
    const onBybitTick = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        symbol?: string;
        price?: number;
        volume?: number;
        timestamp?: number;
      } | undefined;
      if (!detail || detail.symbol !== symRef.current || typeof detail.price !== "number") return;
      if (!isMarketOpenRef.current) return;

      const agg = tradeAggRef.current;
      if (!agg) return;
      const result = agg.ingest(
        detail.price,
        Number.isFinite(detail.volume) ? Number(detail.volume) : 0,
        toSec(Number(detail.timestamp) || Date.now()),
      );
      if (!result) return;

      const bar = result.bar;
      const stored = barsRef.current;
      const last = stored.length > 0 ? stored[stored.length - 1] : null;
      if (!last || bar.time >= last.time) {
        if (last && last.time === bar.time) stored[stored.length - 1] = { ...bar };
        else stored.push({ ...bar });
      }

      tickCountRef.current++;
      lastTickTimeRef.current = Date.now();
      tickDataRef.current.price = bar.close;
      tickDataRef.current.open = bar.open;
      livePxRef.current = bar.close;
      setLivePrice(bar.close);
      setLiveOpen(bar.open);
      doUpdatePriceLine(bar.close, symRef.current);
      pendingChartBarRef.current = { ...bar };
      scheduleChartUpdate();
    };

    window.addEventListener("bybit:tick", onBybitTick as EventListener);
    return () => window.removeEventListener("bybit:tick", onBybitTick as EventListener);
  }, [scheduleChartUpdate, setLivePrice, setLiveOpen, doUpdatePriceLine]);

`;
s = s.replace(marker, bridge + marker);
fs.writeFileSync(file, s, "utf8");
console.log("Bybit direct tick bridge installed in CustomChartBase.");
