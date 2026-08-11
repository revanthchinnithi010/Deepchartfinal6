/**
 * candles.ts — serves real OHLCV bars.
 *
 * cTrader (forex, indices, metals, commodities):
 *   Always uses the STREAMING authenticated engine session via fetchTrendbarsOnSession.
 *   Never opens a separate standalone connection for trendbars.
 *
 *   Pre-flight checks before every trendbars request:
 *     1. Engine must be in STREAMING state
 *     2. symbolId must exist in ctrader_symbols table
 *        → if missing: auto-fetch symbol catalog from cTrader and populate DB
 *     3. Symbol is subscribed to the engine (idempotent addSymbol call)
 *
 * Delta Exchange India (crypto):
 *   fetchDeltaCandles() + CandleAggregator merge
 *
 * All sources return OHLCBar[] with time in unix seconds (UTC),
 * bars sorted ascending, capped at 500–501 entries.
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
 * Merge historical bars (older) with live aggregator bars (newer).
 * Never clears or replaces historical bars — only appends live ticks on top.
 */
function mergeBars(historical: OHLCBar[], aggregated: OHLCBar[]): OHLCBar[] {
  if (aggregated.length === 0) return historical.slice(-500);
  if (historical.length === 0) return aggregated.slice(-501);
  const firstAggTime = aggregated[0].time;
  const base = historical.filter(b => b.time < firstAggTime);
  return [...base, ...aggregated].slice(-501);
}

// ── Trendbars result cache (5 min TTL) ────────────────────────────────────────
interface TrendbarsEntry { bars: OHLCBar[]; fetchedAt: number; }
const trendbarsCache = new Map<string, TrendbarsEntry>();
const TRENDBARS_CACHE_TTL = 5 * 60_000;

// ── Symbol auto-load — shared promise so concurrent requests all wait together ─
let symbolLoadPromise: Promise<void> | null = null;
let symbolLoadedAt = 0;
const SYMBOL_RELOAD_COOLDOWN = 30_000;

/**
 * Look up a cTrader symbolId in the DB.
 * Returns null if not found.
 */
async function lookupSymbolId(symbol: string): Promise<{ symbolId: number; symbolName: string } | null> {
  const row = await pool.query<{ symbol_id: number; symbol_name: string }>(
    "SELECT symbol_id, symbol_name FROM ctrader_symbols WHERE UPPER(symbol_name) = UPPER($1) LIMIT 1",
    [symbol],
  );
  if (!row.rows.length) return null;
  return { symbolId: Number(row.rows[0].symbol_id), symbolName: row.rows[0].symbol_name };
}

/**
 * Save symbol catalog to ctrader_symbols table via upsert.
 * Called automatically when the symbol table is empty or a symbol is missing.
 */
async function saveSymbolsToDB(symbols: Array<{
  symbolId:    number;
  symbolName:  string;
  description: string;
  pipPosition: number;
  digits:      number;
}>): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_symbols (
      symbol_id    INTEGER PRIMARY KEY,
      symbol_name  TEXT NOT NULL,
      description  TEXT NOT NULL,
      pip_position INTEGER NOT NULL,
      digits       INTEGER NOT NULL,
      fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  for (const sym of symbols) {
    await pool.query(
      `INSERT INTO ctrader_symbols (symbol_id, symbol_name, description, pip_position, digits, fetched_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (symbol_id) DO UPDATE SET
         symbol_name  = EXCLUDED.symbol_name,
         description  = EXCLUDED.description,
         pip_position = EXCLUDED.pip_position,
         digits       = EXCLUDED.digits,
         fetched_at   = NOW()`,
      [sym.symbolId, sym.symbolName, sym.description, sym.pipPosition, sym.digits],
    );
  }
}

/**
 * Auto-load the full symbol catalog from cTrader using engine credentials.
 * Uses a shared Promise so concurrent requests all wait for the same fetch,
 * rather than one returning empty while another loads.
 *
 * Returns the symbolId for `targetSymbol` if found, null otherwise.
 */
async function autoLoadSymbols(targetSymbol: string): Promise<{ symbolId: number; symbolName: string } | null> {
  // If a load just finished recently, go straight to the DB retry
  const now = Date.now();
  if (!symbolLoadPromise && now - symbolLoadedAt < SYMBOL_RELOAD_COOLDOWN) {
    return lookupSymbolId(targetSymbol);
  }

  const creds = ctraderTickEngine.getEngineCredentials();
  if (!creds) {
    logger.warn({ targetSymbol }, "candles: symbol auto-load skipped — engine has no credentials");
    return null;
  }

  // Start a shared load if one is not already running
  if (!symbolLoadPromise) {
    const t0 = Date.now();
    logger.info({ targetSymbol, accountId: creds.ctidTraderAccountId, isLive: creds.isLive },
      "candles: symbolId not in DB — auto-fetching cTrader symbol catalog via new TLS conn");

    symbolLoadPromise = (async () => {
      try {
        const symbols = await fetchSymbolsViaProtoOA({
          ctidTraderAccountId: creds.ctidTraderAccountId,
          isLive:              creds.isLive,
          accessToken:         creds.accessToken,
          clientId:            creds.clientId,
          clientSecret:        creds.clientSecret,
          timeoutMs:           30_000,
        });

        await saveSymbolsToDB(symbols);
        symbolLoadedAt = Date.now();

        logger.info({ count: symbols.length, durationMs: Date.now() - t0 },
          "candles: symbol catalog saved to DB ✓");
      } catch (err) {
        logger.error({ targetSymbol, err: String(err) }, "candles: symbol auto-load FAILED");
      } finally {
        symbolLoadPromise = null;
      }
    })();
  } else {
    logger.info({ targetSymbol }, "candles: waiting for in-progress symbol auto-load");
  }

  // All concurrent requests wait for the same load
  await symbolLoadPromise.catch(() => {});

  return lookupSymbolId(targetSymbol);
}

export function createCandlesRouter(
  aggregator:  CandleAggregator,
  _marketData: MarketDataService,
): IRouter {
  const router: IRouter = Router();

  // ── GET /api/candles/ctrader/diagnostic/:symbol/:interval ─────────────────
  router.get("/candles/ctrader/diagnostic/:symbol/:interval", async (req, res): Promise<void> => {
    const symbol   = (req.params["symbol"]   ?? "").toUpperCase().trim();
    const interval =  req.params["interval"] ?? "";

    const engineStatus = ctraderTickEngine.getStatus();
    const engineCreds  = ctraderTickEngine.getEngineCredentials();
    const symRow       = await lookupSymbolId(symbol).catch(() => null);
    const aggBars      = aggregator.getBars(symbol, interval as CandleInterval);

    const diag: Record<string, unknown> = {
      symbol,
      interval,
      timeframeLabel:  INTERVAL_LABEL[interval] ?? interval,
      isCtraderSymbol: CTRADER_SYMBOLS.has(symbol),
      engineStatus:    engineStatus.status,
      engineAccountId: engineStatus.accountId,
      engineIsLive:    engineStatus.isLive,
      engineSubscribedSymbols: engineStatus.subscribedSymbols,
      engineHasCreds:  !!engineCreds,
      symbolId:        symRow?.symbolId ?? null,
      symbolIdFound:   !!symRow,
      aggregatorBars:  aggBars.length,
      cacheKey:        `${symbol}:${interval}`,
      cached:          trendbarsCache.has(`${symbol}:${interval}`),
    };

    if (engineStatus.status === "streaming" && symRow) {
      const t0 = Date.now();
      try {
        const bars = await ctraderTickEngine.fetchTrendbarsOnSession(symRow.symbolId, interval, 5, 10_000);
        diag["testFetch"] = {
          ok:         true,
          bars:       bars.length,
          durationMs: Date.now() - t0,
          firstTime:  bars[0]     ? new Date(bars[0].time * 1000).toISOString()     : null,
          lastTime:   bars.at(-1) ? new Date(bars.at(-1)!.time * 1000).toISOString() : null,
        };
      } catch (e) {
        diag["testFetch"] = { ok: false, error: String(e), durationMs: Date.now() - t0 };
      }
    }

    res.json(diag);
  });

  // ── GET /api/candles/:symbol/:interval ────────────────────────────────────
  router.get("/candles/:symbol/:interval", async (req, res): Promise<void> => {
    const symbol   = (req.params["symbol"]   ?? "").toUpperCase().trim();
    const interval =  req.params["interval"] ?? "";

    if (!symbol || !VALID_INTERVALS.has(interval)) {
      res.status(400).json({ error: "Invalid symbol or interval" });
      return;
    }

    const beforeRaw = req.query["before"];
    const beforeSec = typeof beforeRaw === "string" ? parseInt(beforeRaw, 10) : NaN;
    const beforeSecOpt = (!isNaN(beforeSec) && beforeSec > 0) ? beforeSec : undefined;

    const iv = interval as CandleInterval;

    // ══════════════════════════════════════════════════════════════════════════
    // cTrader path — always uses the authenticated streaming session
    // ══════════════════════════════════════════════════════════════════════════
    if (CTRADER_SYMBOLS.has(symbol)) {

      // ── 0. Infinite history page (before= parameter) ──────────────────────
      // Skip the 5-min cache entirely and request a page of bars ending at
      // beforeSecOpt. No aggregator merge — these are pure historical bars.
      if (beforeSecOpt) {
        const engineStatus = ctraderTickEngine.getStatus();
        if (engineStatus.status !== "streaming") {
          res.json([]);
          return;
        }
        const symRow = await lookupSymbolId(symbol).catch(() => null);
        if (!symRow) {
          res.json([]);
          return;
        }
        const toMs = beforeSecOpt * 1000; // convert seconds → ms
        let bars: OHLCBar[] = [];
        try {
          bars = await ctraderTickEngine.fetchTrendbarsOnSession(
            symRow.symbolId, interval, 500, 15_000, toMs,
          ) as OHLCBar[];
        } catch (firstErr) {
          logger.warn({ symbol, interval, beforeSecOpt, err: String(firstErr) },
            "candles: cTrader history page failed — retrying once");
          try {
            bars = await ctraderTickEngine.fetchTrendbarsOnSession(
              symRow.symbolId, interval, 500, 15_000, toMs,
            ) as OHLCBar[];
          } catch (retryErr) {
            logger.error({ symbol, interval, beforeSecOpt, err: String(retryErr) },
              "candles: cTrader history page retry also failed — returning []");
            res.json([]);
            return;
          }
        }
        // Exclude bars at or after beforeSecOpt (the client already has those)
        const page = bars.filter(b => b.time < beforeSecOpt);
        logger.info({ symbol, interval, beforeSecOpt, fetched: bars.length, returned: page.length },
          "candles: cTrader history page ✓");
        res.json(page);
        return;
      }

      const cacheKey = `${symbol}:${interval}`;
      const aggBars  = aggregator.getBars(symbol, iv);

      // ── 1. Cache hit ───────────────────────────────────────────────────────
      const cached = trendbarsCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < TRENDBARS_CACHE_TTL) {
        const merged = mergeBars(cached.bars, aggBars);
        logger.info({
          symbol, interval, tf: INTERVAL_LABEL[interval],
          cached: cached.bars.length, agg: aggBars.length, merged: merged.length,
        }, "candles: cTrader cache-hit ✓");
        res.json(merged);
        return;
      }

      // ── 2. Verify engine is STREAMING ─────────────────────────────────────
      const engineStatus = ctraderTickEngine.getStatus();
      if (engineStatus.status !== "streaming") {
        logger.warn({
          symbol, interval, engineStatus: engineStatus.status,
        }, "candles: cTrader engine not streaming — returning aggregator bars only");
        // Return whatever the aggregator has; client will retry when engine connects
        res.json(aggBars.slice(-501));
        return;
      }

      logger.info({
        symbol, interval, tf: INTERVAL_LABEL[interval],
        engineStatus: engineStatus.status,
        accountId:    engineStatus.accountId,
        isLive:       engineStatus.isLive,
      }, "candles: cTrader pre-flight checks passed — resolving symbolId");

      // ── 3. Resolve symbolId — auto-load if missing ─────────────────────────
      let symRow = await lookupSymbolId(symbol).catch(() => null);

      if (!symRow) {
        logger.warn({ symbol }, "candles: symbolId not in DB — triggering auto-load");
        symRow = await autoLoadSymbols(symbol);

        if (!symRow) {
          logger.error({ symbol },
            "candles: symbolId still missing after auto-load — cannot fetch history");
          res.json(aggBars.slice(-501));
          return;
        }
      }

      const { symbolId, symbolName } = symRow;

      // ── 4. Ensure symbol is subscribed to the engine ───────────────────────
      // addSymbol() is idempotent — safe to call even if already subscribed.
      // This guarantees live ticks will update the CandleAggregator for this symbol.
      const wasSubscribed = engineStatus.subscribedSymbols.includes(symbolName);
      if (!wasSubscribed) {
        ctraderTickEngine.addSymbol(symbolId, symbolName);
        logger.info({ symbol, symbolId }, "candles: subscribed symbol to live engine");
      }

      // ── 5. Send ProtoOAGetTrendbarsReq on the streaming session ───────────
      const toMs = Date.now() + 60_000; // 1 min future margin
      logger.info({
        symbol, symbolId, symbolName,
        interval, tf: INTERVAL_LABEL[interval],
        count: 500,
        toISO: new Date(toMs).toISOString(),
        engineStatus: engineStatus.status,
        accountId:    engineStatus.accountId,
        "→ ProtoOAGetTrendbarsReq": { symbolId, interval, count: 500 },
      }, "candles: → sending ProtoOAGetTrendbarsReq on streaming session");

      const t0 = Date.now();
      let trendbars: OHLCBar[];

      try {
        trendbars = await ctraderTickEngine.fetchTrendbarsOnSession(symbolId, interval, 500) as OHLCBar[];
      } catch (err) {
        logger.error({
          symbol, symbolId, interval, err: String(err),
          durationMs: Date.now() - t0,
        }, "candles: ProtoOAGetTrendbarsReq FAILED");
        res.json(aggBars.slice(-501));
        return;
      }

      // ── 6. Log ProtoOAGetTrendbarsRes ─────────────────────────────────────
      logger.info({
        "← ProtoOAGetTrendbarsRes": {
          symbol, symbolId, interval, tf: INTERVAL_LABEL[interval],
          trendbarCount: trendbars.length,
          firstTimestamp: trendbars[0]     ? trendbars[0].time     : null,
          lastTimestamp:  trendbars.at(-1) ? trendbars.at(-1)!.time : null,
          firstISO: trendbars[0]     ? new Date(trendbars[0].time * 1000).toISOString()     : null,
          lastISO:  trendbars.at(-1) ? new Date(trendbars.at(-1)!.time * 1000).toISOString() : null,
          durationMs: Date.now() - t0,
        },
      }, trendbars.length > 0
        ? `candles: ← ProtoOAGetTrendbarsRes — ${trendbars.length} trendbars received ✓`
        : "candles: ← ProtoOAGetTrendbarsRes — 0 trendbars (check symbolId, period, or account access)");

      if (trendbars.length === 0) {
        // Don't cache empty results — server may have no data for this period yet
        const freshAgg = aggregator.getBars(symbol, iv);
        res.json(freshAgg.slice(-501));
        return;
      }

      // ── 7. Cache and merge with live aggregator ────────────────────────────
      trendbarsCache.set(cacheKey, { bars: trendbars, fetchedAt: Date.now() });

      const freshAgg = aggregator.getBars(symbol, iv);
      const merged   = mergeBars(trendbars, freshAgg);

      logger.info({
        symbol, symbolId, interval, tf: INTERVAL_LABEL[interval],
        historical: trendbars.length,
        agg:        freshAgg.length,
        merged:     merged.length,
        firstTime:  merged[0]     ? new Date(merged[0].time * 1000).toISOString()     : null,
        lastTime:   merged.at(-1) ? new Date(merged.at(-1)!.time * 1000).toISOString() : null,
      }, "candles: cTrader trendbars merged and ready ✓");

      res.json(merged);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Delta Exchange path — crypto symbols
    // ══════════════════════════════════════════════════════════════════════════

    if (beforeSecOpt) {
      logger.info({ symbol, interval, beforeSec: beforeSecOpt }, "candles: history page");
      const bars = await fetchDeltaCandles(symbol, interval, 500, beforeSecOpt);
      logger.info({ symbol, interval, returned: bars.length }, "candles: history page served");
      res.json(bars);
      return;
    }

    logger.info({ symbol, interval }, "candles: fetching Delta Exchange India bars");
    const historicalBars = await fetchDeltaCandles(symbol, interval, 500);
    const aggBars        = aggregator.getBars(symbol, iv);

    if (historicalBars.length === 0) {
      logger.warn({ symbol, interval, aggBars: aggBars.length },
        "candles: Delta India returned 0 bars — serving aggregated ticks only");
      res.json(aggBars.slice(-501));
      return;
    }

    const merged = mergeBars(historicalBars, aggBars);
    logger.info({ symbol, interval, historical: historicalBars.length, aggregated: aggBars.length, merged: merged.length },
      "candles: Delta Exchange bars served ✓");
    res.json(merged);
  });

  return router;
}
