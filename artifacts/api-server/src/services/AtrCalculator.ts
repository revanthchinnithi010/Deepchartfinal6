/**
 * AtrCalculator — Wilder's Average True Range computed from CandleAggregator bars.
 *
 * Architecture:
 *   - Reads bars directly from CandleAggregator (in-process, zero HTTP overhead).
 *   - Per-key cache invalidated only when the latest candle timestamp changes
 *     (i.e. a new bar has closed). O(n) on first call per candle, O(1) after.
 *   - Fully synchronous; safe to call on every tick without performance cost.
 */

import type { CandleAggregator, CandleInterval } from "./CandleAggregator.js";

// Human timeframe labels used in the UI/DB → CandleAggregator interval keys
const TF_TO_INTERVAL: Record<string, CandleInterval> = {
  "1M": "1",   "1m": "1",
  "5M": "5",   "5m": "5",
  "10M": "5",  // nearest supported interval
  "15M": "15", "15m": "15",
  "30M": "30", "30m": "30",
  "1H": "60",  "1h": "60",
  "2H": "60",  // nearest supported interval
  "4H": "240", "4h": "240",
  "1D": "D",   "1d": "D",
  "1W": "W",   "1w": "W",
};

interface CachedATR {
  atr: number;
  lastBarTime: number; // unix seconds of last bar used for calculation
}

export class AtrCalculator {
  private cache = new Map<string, CachedATR>();

  constructor(private candleAggregator: CandleAggregator) {}

  /**
   * Returns ATR for the given symbol and human timeframe.
   * Returns null if not enough bars are available yet (< period + 1).
   */
  getAtr(symbol: string, timeframe: string, period: number): number | null {
    const interval = TF_TO_INTERVAL[timeframe];
    if (!interval) return null;

    const bars = this.candleAggregator.getBars(symbol, interval);
    if (bars.length < period + 1) return null; // need at least period+1 bars for first TR

    const lastBar = bars[bars.length - 1]!;
    const cacheKey = `${symbol}:${interval}:${period}`;
    const cached = this.cache.get(cacheKey);

    // Cache hit: same candle as last calculation
    if (cached && cached.lastBarTime === lastBar.time) {
      return cached.atr;
    }

    const atr = this.calcWilderATR(bars, period);
    this.cache.set(cacheKey, { atr, lastBarTime: lastBar.time });
    return atr;
  }

  private calcWilderATR(
    bars: ReadonlyArray<{ high: number; low: number; close: number }>,
    period: number,
  ): number {
    // Compute True Ranges (starting from bar[1] since TR needs previous close)
    const trs: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const curr = bars[i]!;
      const prev = bars[i - 1]!;
      trs.push(Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low  - prev.close),
      ));
    }

    if (trs.length === 0) return 0;
    if (trs.length < period) {
      // Not enough bars for full smoothing — return simple mean
      return trs.reduce((a, b) => a + b, 0) / trs.length;
    }

    // Seed with SMA of first `period` TRs
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Wilder's smoothing (RMA) for remaining TRs
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]!) / period;
    }

    return atr;
  }
}
