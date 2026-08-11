/**
 * In-memory candle cache — persists across tab switches and symbol changes.
 *
 * Goal: when the user returns to a symbol/interval they've already viewed,
 * apply bars instantly (zero latency) while a background fetch updates the
 * trailing candles. Keeps at most MAX_ENTRIES entries to bound memory use.
 *
 * This cache lives at module scope so it survives React component
 * unmount/remount (though with the keep-alive approach Charts never unmounts).
 */

import type { OHLCBar } from "@/store/chartStore";

const MAX_ENTRIES = 12;

interface CacheEntry {
  bars: OHLCBar[];
  ts:   number; // wall-clock ms at write time — used for LRU eviction
}

const cache = new Map<string, CacheEntry>();

function key(sym: string, iv: string): string {
  return `${sym}:${iv}`;
}

export function getCachedCandles(sym: string, iv: string): OHLCBar[] | null {
  const entry = cache.get(key(sym, iv));
  if (!entry) return null;
  entry.ts = Date.now(); // bump access time
  return entry.bars;
}

export function setCachedCandles(sym: string, iv: string, bars: OHLCBar[]): void {
  const k = key(sym, iv);
  if (cache.size >= MAX_ENTRIES && !cache.has(k)) {
    // Evict the least-recently-used entry
    let lruKey = "";
    let lruTs  = Infinity;
    for (const [ek, ev] of cache) {
      if (ev.ts < lruTs) { lruTs = ev.ts; lruKey = ek; }
    }
    if (lruKey) cache.delete(lruKey);
  }
  cache.set(k, { bars, ts: Date.now() });
}

/** Invalidate a specific symbol/interval (e.g. after a failed fetch). */
export function invalidateCachedCandles(sym: string, iv: string): void {
  cache.delete(key(sym, iv));
}
