/**
 * deltaHistoryService — fetches real OHLCV candles from Delta Exchange India REST API.
 *
 * Endpoint: GET https://api.india.delta.exchange/v2/history/candles
 *
 * Delta India symbol format: all perpetuals end in "USD" (e.g. BTCUSD, ETHUSD, SOLUSD).
 * The symbol used here matches the internal app symbol exactly — no conversion needed.
 *
 * Confirmed resolution strings (from API schema error):
 *   5s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w
 */

import { logger } from "../lib/logger.js";
import type { OHLCBar } from "./CandleAggregator.js";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";

// Map internal CandleInterval strings → Delta India API resolution strings
const RESOLUTION_MAP: Record<string, string> = {
  "1":   "1m",
  "3":   "3m",
  "5":   "5m",
  "15":  "15m",
  "30":  "30m",
  "60":  "1h",
  "120": "2h",
  "240": "4h",
  "480": "6h",
  "720": "12h",
  "D":   "1d",
  "W":   "1w",
};

// Interval length in minutes (for computing start timestamp)
const INTERVAL_MINUTES: Record<string, number> = {
  "1":   1,   "3":   3,   "5":   5,   "15":  15,  "30":  30,
  "60":  60,  "120": 120, "240": 240, "480": 480, "720": 720,
  "D":   1440, "W":  10080,
};

interface DeltaCandle {
  time:   number | string;
  open:   number | string;
  high:   number | string;
  low:    number | string;
  close:  number | string;
  volume: number | string;
}

interface DeltaCandleResponse {
  success: boolean;
  result:  DeltaCandle[] | null;
  error?:  unknown;
}

function toNum(v: number | string | undefined | null): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch real OHLCV candles from Delta Exchange India.
 *
 * @param symbol   Delta India product symbol, e.g. "BTCUSD", "ETHUSD", "SOLUSD"
 *                 (matches internal app symbol — no conversion needed)
 * @param interval Internal CandleInterval string, e.g. "1", "60", "240", "D"
 * @param limit    Max bars to return (default 500)
 * @param endSec   Unix seconds upper bound (exclusive). Defaults to now.
 *                 Pass the oldest loaded bar's timestamp to page backward.
 * @returns        Ascending-time OHLCBar[] — empty on any error, NO fake fallback
 */
export async function fetchDeltaCandles(
  symbol:   string,
  interval: string,
  limit     = 500,
  endSec?: number,
): Promise<OHLCBar[]> {
  const resolution = RESOLUTION_MAP[interval];
  if (!resolution) {
    logger.warn({ symbol, interval }, "deltaHistoryService: no resolution mapping for interval");
    return [];
  }

  const intervalMins = INTERVAL_MINUTES[interval] ?? 60;
  const end          = endSec ?? Math.floor(Date.now() / 1000);
  // Add extra buffer bars so we get at least `limit` after any gaps
  const startSec     = end - intervalMins * 60 * Math.min(limit + 100, 700);

  const qs = new URLSearchParams({
    resolution,
    symbol,
    start: String(startSec),
    end:   String(end),
  });

  const url = `${DELTA_INDIA_REST}/v2/history/candles?${qs}`;

  logger.info(
    { symbol, interval, resolution, limit, startSec, endSec },
    "deltaHistoryService: fetching real candles from Delta Exchange India",
  );

  try {
    const resp = await fetch(url, {
      signal:  AbortSignal.timeout(15_000),
      headers: {
        "Accept":     "application/json",
        "User-Agent": "TradeVault/1.0",
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      logger.warn(
        { symbol, status: resp.status, body: text.slice(0, 400) },
        "deltaHistoryService: non-OK HTTP status from Delta India",
      );
      return [];
    }

    const body = await resp.json() as DeltaCandleResponse;

    if (!body.success) {
      logger.warn(
        { symbol, interval, body: JSON.stringify(body).slice(0, 400) },
        "deltaHistoryService: Delta India returned success:false",
      );
      return [];
    }

    if (!Array.isArray(body.result)) {
      logger.warn(
        { symbol, interval, resultType: typeof body.result },
        "deltaHistoryService: result is not an array",
      );
      return [];
    }

    const bars: OHLCBar[] = body.result
      .map((c): OHLCBar => ({
        time:   Math.floor(toNum(c.time)),
        open:   toNum(c.open),
        high:   toNum(c.high),
        low:    toNum(c.low),
        close:  toNum(c.close),
        volume: toNum(c.volume),
      }))
      .filter(b =>
        b.time  > 0 &&
        b.open  > 0 &&
        b.high  >= b.low &&
        b.close > 0,
      )
      .sort((a, b) => a.time - b.time);  // ascending order

    const sliced = bars.slice(-limit);

    logger.info(
      {
        symbol,
        interval,
        raw:      body.result.length,
        valid:    bars.length,
        returned: sliced.length,
        firstBar: sliced[0]?.time    ? new Date(sliced[0].time * 1000).toISOString()    : null,
        lastBar:  sliced.at(-1)?.time ? new Date(sliced.at(-1)!.time * 1000).toISOString() : null,
      },
      "deltaHistoryService: real candles loaded from Delta Exchange India ✓",
    );

    return sliced;

  } catch (err) {
    logger.error(
      { err, symbol, interval },
      "deltaHistoryService: fetch error — returning empty (no fake fallback)",
    );
    return [];
  }
}
