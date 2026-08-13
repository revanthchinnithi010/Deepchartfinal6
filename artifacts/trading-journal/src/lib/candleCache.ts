/**
 * In-memory candle cache.
 *
 * Historical OHLC must never stay stale long enough to hide an authoritative
 * Delta refresh. The cache is intentionally short-lived: it is only a fast
 * paint aid while the REST candle request is made in the background.
 */

import type { OHLCBar } from "@/store/chartStore";

const MAX_ENTRIES = 12;
const CACHE_TTL_MS = 2_000;
const VIEWPORT_PREFIX = "tv_vp_v2_";

interface CacheEntry {
  bars: OHLCBar[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();

function key(sym: string, iv: string): string {
  return `${sym}:${iv}`;
}

export function getCachedCandles(sym: string, iv: string): OHLCBar[] | null {
  const k = key(sym, iv);
  const entry = cache.get(k);
  if (!entry) return null;

  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(k);
    return null;
  }

  entry.ts = Date.now();
  return entry.bars;
}

export function setCachedCandles(sym: string, iv: string, bars: OHLCBar[]): void {
  const k = key(sym, iv);
  if (cache.size >= MAX_ENTRIES && !cache.has(k)) {
    let lruKey = "";
    let lruTs = Infinity;
    for (const [ek, ev] of cache) {
      if (ev.ts < lruTs) {
        lruTs = ev.ts;
        lruKey = ek;
      }
    }
    if (lruKey) cache.delete(lruKey);
  }
  cache.set(k, { bars, ts: Date.now() });
}

/** Invalidate a specific symbol/interval. */
export function invalidateCachedCandles(sym: string, iv: string): void {
  cache.delete(key(sym, iv));
}

// ---------------------------------------------------------------------------
// Viewport recovery
// ---------------------------------------------------------------------------
// The chart historically persisted a manual price-range lock together with
// the horizontal viewport. When the instrument changed price regime (most
// visible with EURUSD), that old range could compress real candles into thin
// horizontal dashes. Keep the useful horizontal from/to position, but never
// restore a stale vertical price lock.
//
// This is installed here because candleCache is imported by CustomChart before
// viewport restoration runs. It also sanitizes locks already stored on-device
// and prevents the chart from writing them back on future viewport saves.
function sanitizeViewportValue(value: string | null): string | null {
  if (!value) return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return value;
    if (!("priceMin" in parsed) && !("priceMax" in parsed)) return value;
    delete parsed.priceMin;
    delete parsed.priceMax;
    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}

if (typeof window !== "undefined" && typeof Storage !== "undefined") {
  const storagePatched = "__tjViewportStoragePatched" in window;
  if (!storagePatched) {
    Object.defineProperty(window, "__tjViewportStoragePatched", { value: true, configurable: false });

    const nativeGetItem = Storage.prototype.getItem;
    const nativeSetItem = Storage.prototype.setItem;

    Storage.prototype.getItem = function (keyName: string): string | null {
      const value = nativeGetItem.call(this, keyName);
      if (!keyName.startsWith(VIEWPORT_PREFIX)) return value;
      return sanitizeViewportValue(value);
    };

    Storage.prototype.setItem = function (keyName: string, value: string): void {
      if (keyName.startsWith(VIEWPORT_PREFIX)) {
        value = sanitizeViewportValue(value) ?? value;
      }
      nativeSetItem.call(this, keyName, value);
    };

    // Clean existing persisted locks immediately. Do not delete the horizontal
    // viewport so the user's normal chart position/zoom is retained.
    for (let i = 0; i < window.localStorage.length; i++) {
      const keyName = window.localStorage.key(i);
      if (!keyName?.startsWith(VIEWPORT_PREFIX)) continue;
      const value = nativeGetItem.call(window.localStorage, keyName);
      const clean = sanitizeViewportValue(value);
      if (clean !== value && clean != null) {
        nativeSetItem.call(window.localStorage, keyName, clean);
      }
    }
  }
}
