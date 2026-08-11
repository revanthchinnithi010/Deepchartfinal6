import { EventEmitter } from "events";
import type { UnifiedTick } from "./MarketFeedManager.js";
import { logger } from "../lib/logger.js";

export interface OHLCBar {
  time:   number; // unix seconds (UTC)
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number; // tick-count proxy
}

export type CandleInterval = "1" | "3" | "5" | "15" | "30" | "60" | "240" | "D" | "W";

const SUPPORTED_INTERVALS: CandleInterval[] = ["1", "3", "5", "15", "30", "60", "240", "D", "W"];
const MAX_BARS = 500;

function getBarStartSec(timestampMs: number, interval: CandleInterval): number {
  if (interval === "D") {
    const d = new Date(timestampMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
  }
  if (interval === "W") {
    const d   = new Date(timestampMs);
    const dow = d.getUTCDay();
    const daysToMon = dow === 0 ? 6 : dow - 1;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysToMon) / 1000;
  }
  const mins       = parseInt(interval, 10);
  const intervalMs = mins * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * (mins * 60);
}

interface BucketState {
  completed: OHLCBar[];
  current:   OHLCBar | null;
}

export class CandleAggregator extends EventEmitter {
  private buckets = new Map<string, BucketState>();

  private key(symbol: string, interval: CandleInterval): string {
    return `${symbol}:${interval}`;
  }

  private getOrCreate(symbol: string, interval: CandleInterval): BucketState {
    const k = this.key(symbol, interval);
    let b = this.buckets.get(k);
    if (!b) { b = { completed: [], current: null }; this.buckets.set(k, b); }
    return b;
  }

  ingestTick(tick: UnifiedTick): void {
    const { symbol, price, timestamp } = tick;
    const tsMs = timestamp ?? Date.now();

    // Guard: reject clearly invalid prices
    if (!Number.isFinite(price) || price <= 0) return;

    for (const interval of SUPPORTED_INTERVALS) {
      const barStart = getBarStartSec(tsMs, interval);
      const b        = this.getOrCreate(symbol, interval);

      if (!b.current) {
        // First tick ever for this symbol+interval
        b.current = { time: barStart, open: price, high: price, low: price, close: price, volume: 1 };

        logger.debug({
          symbol, interval,
          timestamp: tsMs,
          price,
          candleStart: barStart,
          open: price, high: price, low: price, close: price,
          event: "new_bar",
        }, "CandleAggregator: new bar (first tick)");

      } else if (barStart < b.current.time) {
        // ── Out-of-order tick: timestamp is OLDER than the current bar ──────
        // Accepting it would either corrupt the current bar or resurrect a
        // completed bar. Silently discard — the next in-order tick will be fine.
        logger.debug({
          symbol, interval,
          tickBarStart: barStart,
          currentBarStart: b.current.time,
          priceDrop: price,
        }, "CandleAggregator: out-of-order tick discarded");
        continue;

      } else if (b.current.time !== barStart) {
        // ── New candle boundary ───────────────────────────────────────────────
        const closed = { ...b.current };
        b.completed.push(closed);
        if (b.completed.length > MAX_BARS) b.completed.shift();
        b.current = { time: barStart, open: price, high: price, low: price, close: price, volume: 1 };

        logger.debug({
          symbol, interval,
          timestamp: tsMs,
          price,
          candleStart: barStart,
          open: price, high: price, low: price, close: price,
          closedBar: closed,
          event: "new_bar",
        }, "CandleAggregator: bar closed, new bar opened");

      } else {
        // ── Update existing candle in-place (O(1), no allocation) ────────────
        if (price > b.current.high) b.current.high = price;
        if (price < b.current.low)  b.current.low  = price;
        b.current.close   = price;
        b.current.volume += 1;

        // Log tick details at debug level for the 1m interval only
        // (logging all 9 intervals would be prohibitively verbose)
        if (interval === "1") {
          logger.debug({
            symbol,
            timestamp: tsMs,
            price,
            candleStart: b.current.time,
            open:  b.current.open,
            high:  b.current.high,
            low:   b.current.low,
            close: b.current.close,
          }, "CandleAggregator: tick");
        }
      }

      this.emit("candle_update", { symbol, interval, bar: { ...b.current } });
    }
  }

  getBars(symbol: string, interval: CandleInterval): OHLCBar[] {
    const b = this.buckets.get(this.key(symbol, interval));
    if (!b) return [];
    const all = b.current ? [...b.completed, b.current] : [...b.completed];
    return all.slice(-MAX_BARS);
  }

  getKnownSymbols(): string[] {
    const syms = new Set<string>();
    for (const k of this.buckets.keys()) syms.add(k.split(":")[0]);
    return [...syms];
  }

  log(): void {
    logger.debug({ buckets: this.buckets.size }, "CandleAggregator: state");
  }
}
