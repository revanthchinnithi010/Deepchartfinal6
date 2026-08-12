/**
 * candles.ts — authoritative historical OHLC + live current-candle merge.
 */
import { Router, type IRouter } from "express";
import type { CandleAggregator, OHLCBar, CandleInterval } from "../services/CandleAggregator.js";
import type { MarketDataService } from "../services/MarketDataService.js";
import { fetchDeltaCandles } from "../services/deltaHistoryService.js";
import { fetchSymbolsViaProtoOA } from "../lib/ctraderProtoOA.js";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const VALID_INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "D", "W"]);
const CTRADER_SYMBOLS = new Set([
  "NAS100", "US30", "US500", "SPX500", "GER40", "DE40", "UK100", "JP225",
  "XAUUSD", "XAGUSD", "USOIL", "UKOIL", "NATGAS",
  "EURUSD", "GBPUSD", "GBPJPY", "USDJPY", "AUDUSD", "USDCAD", "USDCHF",
  "EURGBP", "EURJPY", "EURAUD", "GBPAUD", "NZDUSD",
]);
const INTERVAL_LABEL: Partial<Record<string, string>> = {
  "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1H", "120": "2H", "240": "4H", "D": "Daily", "W": "Weekly",
};

/**
 * Historical OHLC is authoritative. The local aggregator is only a live-tick
 * supplement for the currently forming bucket. Never replace a block of
 * historical candles with locally reconstructed candles (which can have gaps
 * when ticks are missing). If the live candle belongs to the same bucket as
 * the last historical candle, preserve the historical OPEN and combine the
 * authoritative history with the live high/low/close.
 */
function mergeBars(historical: OHLCBar[], aggregated: OHLCBar[]): OHLCBar[] {
  const history = historical.slice(-500);
  const live = aggregated.at(-1);
  if (!live) return history;
  if (!history.length) return [live];

  const last = history.at(-1)!;

  if (live.time < last.time) return history;

  if (live.time === last.time) {
    const mergedCurrent: OHLCBar = {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, live.high, last.open, live.close),
      low: Math.min(last.low, live.low, last.open, live.close),
      close: live.close,
      volume: Math.max(last.volume, live.volume),
    };
    return [...history.slice(0, -1), mergedCurrent];
  }

  // If the live tick is in a newer bucket, append only that current bucket.
  // We intentionally do not append locally reconstructed intermediate candles.
  return [...history, live].slice(-501);
}

interface TrendbarsEntry { bars: OHLCBar[]; fetchedAt: number; }
const trendbarsCache = new Map<string, TrendbarsEntry>();
const TRENDBARS_CACHE_TTL = 5 * 60_000;
let symbolLoadPromise: Promise<void> | null = null;
let symbolLoadedAt = 0;
const SYMBOL_RELOAD_COOLDOWN = 30_000;

async function lookupSymbolId(symbol: string): Promise<{ symbolId: number; symbolName: string } | null> {
  const row = await pool.query<{ symbol_id: number; symbol_name: string }>(
    "SELECT symbol_id, symbol_name FROM ctrader_symbols WHERE UPPER(symbol_name) = UPPER($1) LIMIT 1", [symbol]);
  if (!row.rows.length) return null;
  return { symbolId: Number(row.rows[0].symbol_id), symbolName: row.rows[0].symbol_name };
}

async function saveSymbolsToDB(symbols: Array<{
  symbolId: number; symbolName: string; description: string; pipPosition: number; digits: number;
}>): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_symbols (
      symbol_id INTEGER PRIMARY KEY, symbol_name TEXT NOT NULL, description TEXT NOT NULL,
      pip_position INTEGER NOT NULL, digits INTEGER NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  for (const sym of symbols) {
    await pool.query(
      `INSERT INTO ctrader_symbols (symbol_id, symbol_name, description, pip_position, digits, fetched_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (symbol_id) DO UPDATE SET symbol_name=EXCLUDED.symbol_name,
       description=EXCLUDED.description, pip_position=EXCLUDED.pip_position,
       digits=EXCLUDED.digits, fetched_at=NOW()`,
      [sym.symbolId, sym.symbolName, sym.description, sym.pipPosition, sym.digits]);
  }
}

async function autoLoadSymbols(targetSymbol: string): Promise<{ symbolId: number; symbolName: string } | null> {
  const now = Date.now();
  if (!symbolLoadPromise && now - symbolLoadedAt < SYMBOL_RELOAD_COOLDOWN) return lookupSymbolId(targetSymbol);
  const creds = ctraderTickEngine.getEngineCredentials();
  if (!creds) {
    logger.warn({ targetSymbol }, "candles: symbol auto-load skipped — engine has no credentials");
    return null;
  }
  if (!symbolLoadPromise) {
    const t0 = Date.now();
    symbolLoadPromise = (async () => {
      try {
        const symbols = await fetchSymbolsViaProtoOA({
          ctidTraderAccountId: creds.ctidTraderAccountId, isLive: creds.isLive,
          accessToken: creds.accessToken, clientId: creds.clientId,
          clientSecret: creds.clientSecret, timeoutMs: 30_000,
        });
        await saveSymbolsToDB(symbols);
        symbolLoadedAt = Date.now();
        logger.info({ count: symbols.length, durationMs: Date.now() - t0 }, "candles: symbol catalog saved to DB ✓");
      } catch (err) {
        logger.error({ targetSymbol, err: String(err) }, "candles: symbol auto-load FAILED");
      } finally { symbolLoadPromise = null; }
    })();
  }
  await symbolLoadPromise.catch(() => {});
  return lookupSymbolId(targetSymbol);
}

export function createCandlesRouter(aggregator: CandleAggregator, _marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/candles/ctrader/diagnostic/:symbol/:interval", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase().trim();
    const interval = req.params["interval"] ?? "";
    const engineStatus = ctraderTickEngine.getStatus();
    const engineCreds = ctraderTickEngine.getEngineCredentials();
    const symRow = await lookupSymbolId(symbol).catch(() => null);
    const aggBars = aggregator.getBars(symbol, interval as CandleInterval);
    const diag: Record<string, unknown> = {
      symbol, interval, timeframeLabel: INTERVAL_LABEL[interval] ?? interval,
      isCtraderSymbol: CTRADER_SYMBOLS.has(symbol), engineStatus: engineStatus.status,
      engineAccountId: engineStatus.accountId, engineIsLive: engineStatus.isLive,
      engineSubscribedSymbols: engineStatus.subscribedSymbols, engineHasCreds: !!engineCreds,
      symbolId: symRow?.symbolId ?? null, symbolIdFound: !!symRow, aggregatorBars: aggBars.length,
      cacheKey: `${symbol}:${interval}`, cached: trendbarsCache.has(`${symbol}:${interval}`),
    };
    if (engineStatus.status === "streaming" && symRow) {
      const t0 = Date.now();
      try {
        const bars = await ctraderTickEngine.fetchTrendbarsOnSession(symRow.symbolId, interval, 5, 10_000);
        diag["testFetch"] = { ok: true, bars: bars.length, durationMs: Date.now() - t0,
          firstTime: bars[0] ? new Date(bars[0].time * 1000).toISOString() : null,
          lastTime: bars.at(-1) ? new Date(bars.at(-1)!.time * 1000).toISOString() : null };
      } catch (e) { diag["testFetch"] = { ok: false, error: String(e), durationMs: Date.now() - t0 }; }
    }
    res.json(diag);
  });

  router.get("/candles/:symbol/:interval", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase().trim();
    const interval = req.params["interval"] ?? "";
    if (!symbol || !VALID_INTERVALS.has(interval)) { res.status(400).json({ error: "Invalid symbol or interval" }); return; }
    const beforeRaw = req.query["before"];
    const beforeSec = typeof beforeRaw === "string" ? parseInt(beforeRaw, 10) : NaN;
    const beforeSecOpt = (!isNaN(beforeSec) && beforeSec > 0) ? beforeSec : undefined;
    const iv = interval as CandleInterval;

    if (CTRADER_SYMBOLS.has(symbol)) {
      if (beforeSecOpt) {
        const engineStatus = ctraderTickEngine.getStatus();
        if (engineStatus.status !== "streaming") { res.json([]); return; }
        const symRow = await lookupSymbolId(symbol).catch(() => null);
        if (!symRow) { res.json([]); return; }
        const toMs = beforeSecOpt * 1000;
        let bars: OHLCBar[] = [];
        try { bars = await ctraderTickEngine.fetchTrendbarsOnSession(symRow.symbolId, interval, 500, 15_000, toMs) as OHLCBar[]; }
        catch (firstErr) {
          logger.warn({ symbol, interval, beforeSecOpt, err: String(firstErr) }, "candles: cTrader history page failed — retrying once");
          try { bars = await ctraderTickEngine.fetchTrendbarsOnSession(symRow.symbolId, interval, 500, 15_000, toMs) as OHLCBar[]; }
          catch (retryErr) { logger.error({ symbol, interval, beforeSecOpt, err: String(retryErr) }, "candles: cTrader history page retry also failed — returning []"); res.json([]); return; }
        }
        res.json(bars.filter(b => b.time < beforeSecOpt)); return;
      }
      const cacheKey = `${symbol}:${interval}`;
      const aggBars = aggregator.getBars(symbol, iv);
      const cached = trendbarsCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < TRENDBARS_CACHE_TTL) { res.json(mergeBars(cached.bars, aggBars)); return; }
      const engineStatus = ctraderTickEngine.getStatus();
      if (engineStatus.status !== "streaming") { res.json(aggBars.slice(-501)); return; }
      let symRow = await lookupSymbolId(symbol).catch(() => null);
      if (!symRow) symRow = await autoLoadSymbols(symbol);
      if (!symRow) { res.json(aggBars.slice(-501)); return; }
      const { symbolId, symbolName } = symRow;
      if (!engineStatus.subscribedSymbols.includes(symbolName)) ctraderTickEngine.addSymbol(symbolId, symbolName);
      let trendbars: OHLCBar[];
      try { trendbars = await ctraderTickEngine.fetchTrendbarsOnSession(symbolId, interval, 500) as OHLCBar[]; }
      catch (err) { logger.error({ symbol, symbolId, interval, err: String(err) }, "candles: ProtoOAGetTrendbarsReq FAILED"); res.json(aggBars.slice(-501)); return; }
      if (!trendbars.length) { res.json(aggregator.getBars(symbol, iv).slice(-501)); return; }
      trendbarsCache.set(cacheKey, { bars: trendbars, fetchedAt: Date.now() });
      res.json(mergeBars(trendbars, aggregator.getBars(symbol, iv)));
      return;
    }

    if (beforeSecOpt) { res.json(await fetchDeltaCandles(symbol, interval, 500, beforeSecOpt)); return; }
    const historicalBars = await fetchDeltaCandles(symbol, interval, 500);
    const aggBars = aggregator.getBars(symbol, iv);
    if (!historicalBars.length) { res.json(aggBars.slice(-501)); return; }
    res.json(mergeBars(historicalBars, aggBars));
  });
  return router;
}
