import { logger } from "../lib/logger.js";

const BYBIT_BASE = "https://api.bybit.com/v5/market/kline";
const BYBIT_SYMBOL_MAP: Record<string, string> = {
  FARTCOINUSD: "FARTCOINUSDT",
};

export interface BybitOHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "D", "W"]);

function toBybitInterval(interval: string): string | null {
  if (!INTERVALS.has(interval)) return null;
  return interval;
}

/** Fetch authoritative historical OHLC from Bybit for symbols routed to Bybit live feed. */
export async function fetchBybitCandles(
  internalSymbol: string,
  interval: string,
  limit = 500,
  beforeSec?: number,
): Promise<BybitOHLCBar[]> {
  const symbol = BYBIT_SYMBOL_MAP[internalSymbol.toUpperCase()];
  const bybitInterval = toBybitInterval(interval);
  if (!symbol || !bybitInterval) return [];

  const params = new URLSearchParams({
    category: "linear",
    symbol,
    interval: bybitInterval,
    limit: String(Math.min(Math.max(limit, 1), 1000)),
  });
  if (beforeSec && beforeSec > 0) params.set("end", String(Math.floor(beforeSec * 1000)));

  const url = `${BYBIT_BASE}?${params.toString()}`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);

    const payload = await response.json() as {
      retCode?: number;
      retMsg?: string;
      result?: { list?: string[][] };
    };
    if (payload.retCode !== 0) {
      throw new Error(`Bybit ${payload.retCode}: ${payload.retMsg ?? "unknown error"}`);
    }

    const rows = Array.isArray(payload.result?.list) ? payload.result!.list! : [];
    return rows
      .map(row => ({
        time: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5] ?? 0),
      }))
      .filter(b =>
        Number.isFinite(b.time) &&
        Number.isFinite(b.open) && Number.isFinite(b.high) &&
        Number.isFinite(b.low) && Number.isFinite(b.close) &&
        b.time > 0,
      )
      .sort((a, b) => a.time - b.time);
  } catch (err) {
    logger.warn({ internalSymbol, interval, beforeSec, err: String(err) }, "Bybit historical OHLC fetch failed");
    return [];
  }
}

export function isBybitHistoricalSymbol(symbol: string): boolean {
  return !!BYBIT_SYMBOL_MAP[symbol.toUpperCase()];
}
