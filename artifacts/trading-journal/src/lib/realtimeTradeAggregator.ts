/**
 * realtimeTradeAggregator.ts
 *
 * Client-side in-memory OHLC aggregator — MT5/TradingView architecture.
 *
 * Receives raw price ticks and builds live OHLC candles without waiting for
 * the server-side CandleAggregator (which is gated on tick arrival frequency).
 *
 * Design:
 *   - O(1) per tick — no array iteration, no allocations on hot path
 *   - Interval-aware: 1m, 3m, 5m, 15m, 30m, 1H, 4H, D, W
 *   - New-bar detection: bar.time changes at each candle boundary
 *   - Seed from historical bars so the live bar continues correctly on load
 *   - Price deduplication: identical consecutive prices are dropped
 *   - Self-healing interval switch: setInterval() resets state cleanly
 */

export interface AggBar {
  time:   number; // unix seconds (matches LWC Time)
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/** Seconds per interval — must match CandleAggregator on the server */
export const INTERVAL_SECS: Record<string, number> = {
  "1":   60,
  "3":   180,
  "5":   300,
  "15":  900,
  "30":  1800,
  "60":  3600,
  "240": 14400,
  "D":   86400,
  "W":   604800,
};

function barStartSec(tsSec: number, intervalSec: number): number {
  if (intervalSec === 604800) {
    // Weekly: align to Monday 00:00 UTC
    const d      = new Date(tsSec * 1000);
    const dow    = d.getUTCDay();
    const offset = dow === 0 ? 6 : dow - 1; // days since Monday
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset) / 1000;
  }
  if (intervalSec === 86400) {
    // Daily: align to midnight UTC
    return Math.floor(tsSec / 86400) * 86400;
  }
  return Math.floor(tsSec / intervalSec) * intervalSec;
}

/** Normalize any timestamp to unix seconds */
export function toSec(ts: number): number {
  if (ts > 1e15) return Math.floor(ts / 1_000_000); // microseconds → seconds
  if (ts > 1e12) return Math.floor(ts / 1_000);     // milliseconds → seconds
  return ts;                                          // already seconds
}

/** Normalize any timestamp to unix milliseconds */
export function toMs(ts: number): number {
  if (ts > 1e15) return Math.floor(ts / 1_000);     // microseconds → ms
  if (ts > 1e12) return ts;                          // already ms
  return ts * 1_000;                                 // seconds → ms
}

export class RealtimeTradeAggregator {
  private bar:          AggBar | null = null;
  private intervalSec:  number;
  private lastPrice:    number | null = null;

  /** The current interval string (e.g. "1", "5", "60") */
  currentInterval: string;

  constructor(interval: string) {
    this.currentInterval = interval;
    this.intervalSec     = INTERVAL_SECS[interval] ?? 60;
  }

  /**
   * Change the active interval.
   * Resets all state so the next ingest() starts a fresh bar.
   */
  setInterval(interval: string): void {
    this.currentInterval = interval;
    this.intervalSec     = INTERVAL_SECS[interval] ?? 60;
    this.bar             = null;
    this.lastPrice       = null;
  }

  /**
   * Seed from the last known bar (from REST historical data).
   * Ensures the live bar continues OHLC correctly from where history ends.
   * Call this after historical bars are applied to the chart series.
   */
  seed(bar: AggBar): void {
    this.bar       = { ...bar };
    this.lastPrice = bar.close;
  }

  /**
   * Ingest a raw price tick.
   *
   * @param price  Execution price
   * @param volume Trade size (contracts/lots)
   * @param tsSec  Unix timestamp in SECONDS
   * @returns      { bar, isNewBar } or null if the tick was deduplicated
   */
  ingest(price: number, volume: number, tsSec: number): { bar: AggBar; isNewBar: boolean } | null {
    // Deduplication: drop if price unchanged AND bar already exists
    if (price === this.lastPrice && this.bar !== null) return null;
    this.lastPrice = price;

    const barStart  = barStartSec(tsSec, this.intervalSec);
    let   isNewBar  = false;

    if (!this.bar || this.bar.time !== barStart) {
      // New candle boundary — open a fresh bar
      this.bar   = { time: barStart, open: price, high: price, low: price, close: price, volume };
      isNewBar   = true;
    } else {
      // Update existing candle in-place (O(1), no allocation)
      if (price > this.bar.high) this.bar.high = price;
      if (price < this.bar.low)  this.bar.low  = price;
      this.bar.close   = price;
      this.bar.volume += volume;
    }

    // Return the internal bar reference directly — callers only read primitives
    // synchronously, and LWC copies the values internally on series.update().
    // Avoids one heap allocation per tick (hot path at 50+ ticks/sec on Delta).
    return { bar: this.bar, isNewBar };
  }

  getCurrentBar(): AggBar | null {
    return this.bar ? { ...this.bar } : null;
  }

  reset(): void {
    this.bar       = null;
    this.lastPrice = null;
  }
}
