import { EventEmitter } from "events";
import type { UnifiedTick } from "./MarketFeedManager.js";
import { logger } from "../lib/logger.js";

export interface OHLCBar { time: number; open: number; high: number; low: number; close: number; volume: number; }
export type CandleInterval = "1" | "3" | "5" | "15" | "30" | "60" | "240" | "D" | "W";
const SUPPORTED_INTERVALS: CandleInterval[] = ["1", "3", "5", "15", "30", "60", "240", "D", "W"];
const MAX_BARS = 500;
const CTRADER_SYMBOLS = new Set(["NAS100","US30","US500","SPX500","GER40","DE40","UK100","JP225","XAUUSD","XAGUSD","USOIL","UKOIL","NATGAS","EURUSD","GBPUSD","GBPJPY","USDJPY","AUDUSD","USDCAD","USDCHF","EURGBP","EURJPY","EURAUD","GBPAUD","NZDUSD"]);

function getBarStartSec(timestampMs: number, interval: CandleInterval): number {
  if (interval === "D") { const d = new Date(timestampMs); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000; }
  if (interval === "W") { const d = new Date(timestampMs); const dow = d.getUTCDay(); const daysToMon = dow === 0 ? 6 : dow - 1; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysToMon) / 1000; }
  const mins = parseInt(interval, 10); const intervalMs = mins * 60 * 1000; return Math.floor(timestampMs / intervalMs) * (mins * 60);
}
interface BucketState { completed: OHLCBar[]; current: OHLCBar | null; }

export class CandleAggregator extends EventEmitter {
  private buckets = new Map<string, BucketState>();
  private key(symbol: string, interval: CandleInterval): string { return `${symbol}:${interval}`; }
  private getOrCreate(symbol: string, interval: CandleInterval): BucketState { const k = this.key(symbol, interval); let b = this.buckets.get(k); if (!b) { b = { completed: [], current: null }; this.buckets.set(k, b); } return b; }

  ingestTick(tick: UnifiedTick): void {
    const metadata = tick as UnifiedTick & Record<string, unknown>;
    const authoritativeBar = metadata.authoritativeBar as OHLCBar | undefined;
    const authoritativeInterval = metadata.authoritativeInterval as CandleInterval | undefined;
    if (tick.provider === "delta" && authoritativeBar && authoritativeInterval && SUPPORTED_INTERVALS.includes(authoritativeInterval)) {
      this.applyAuthoritativeBar(tick.symbol, authoritativeInterval, authoritativeBar);
      return;
    }

    if (tick.provider === "delta" && tick.tickType === "quote") return;
    const { symbol, price, timestamp } = tick;
    const tsMs = timestamp ?? Date.now();
    if (!Number.isFinite(price) || price <= 0) return;

    for (const interval of SUPPORTED_INTERVALS) {
      const barStart = getBarStartSec(tsMs, interval);
      const b = this.getOrCreate(symbol, interval);
      if (!b.current) {
        b.current = { time: barStart, open: price, high: price, low: price, close: price, volume: 1 };
      } else if (barStart < b.current.time) {
        logger.debug({ symbol, interval, tickBarStart: barStart, currentBarStart: b.current.time }, "CandleAggregator: out-of-order tick discarded");
        continue;
      } else if (b.current.time !== barStart) {
        const closed = { ...b.current }; b.completed.push(closed); if (b.completed.length > MAX_BARS) b.completed.shift();
        b.current = { time: barStart, open: price, high: price, low: price, close: price, volume: 1 };
      } else {
        if (price > b.current.high) b.current.high = price;
        if (price < b.current.low) b.current.low = price;
        b.current.close = price; b.current.volume += 1;
      }
      this.emit("candle_update", { symbol, interval, bar: { ...b.current } });
    }
  }

  applyAuthoritativeBar(symbol: string, interval: CandleInterval, bar: OHLCBar): void {
    if (!Number.isFinite(bar.time) || bar.time <= 0) return;
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) || bar.low <= 0 || bar.high < bar.low) return;
    const b = this.getOrCreate(symbol, interval);
    const normalized: OHLCBar = { time: Math.floor(bar.time), open: bar.open, high: Math.max(bar.high, bar.open, bar.close), low: Math.min(bar.low, bar.open, bar.close), close: bar.close, volume: Math.max(0, Number.isFinite(bar.volume) ? bar.volume : 0) };

    if (b.current && normalized.time > b.current.time) {
      const previous = b.current;
      if (!b.completed.some(x => x.time === previous.time)) b.completed.push({ ...previous });
    }
    b.completed = b.completed.filter(x => x.time !== normalized.time);
    if (b.current?.time === normalized.time) b.current = normalized;
    else if (!b.current || normalized.time > b.current.time) b.current = normalized;
    else b.completed.push(normalized);
    b.completed.sort((a, c) => a.time - c.time);
    if (b.completed.length > MAX_BARS) b.completed.splice(0, b.completed.length - MAX_BARS);
    this.emit("candle_update", { symbol, interval, bar: { ...(b.current?.time === normalized.time ? b.current : normalized) } });
  }

  getBars(symbol: string, interval: CandleInterval): OHLCBar[] {
    const b = this.buckets.get(this.key(symbol, interval)); if (!b) return [];
    if (CTRADER_SYMBOLS.has(symbol.toUpperCase())) return b.current ? [{ ...b.current }] : [];
    const all = b.current ? [...b.completed, b.current] : [...b.completed]; return all.slice(-MAX_BARS);
  }
  getKnownSymbols(): string[] { const syms = new Set<string>(); for (const k of this.buckets.keys()) syms.add(k.split(":")[0]); return [...syms]; }
  log(): void { logger.debug({ buckets: this.buckets.size }, "CandleAggregator: state"); }
}
