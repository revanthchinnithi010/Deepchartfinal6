import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";
const CACHE_TTL_MS     = 20 * 1_000; // 20s — funding changes every 8h, OI every block

export interface TickerInfo {
  symbol:       string;
  markPrice:    string;
  indexPrice:   string;
  volume24h:    string;
  openInterest: string;
  fundingRate:  string;
  fetchedAt:    number;
}

const cache = new Map<string, { data: TickerInfo; fetchedAt: number }>();

function fmtUSD(v: unknown): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n) || n === 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(v: unknown): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n) || n === 0) return "—";
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1_000)  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (n >= 1)      return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtFunding(v: unknown): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "—";
  // Delta Exchange returns funding_rate already as a percentage value
  // e.g. 0.0100 = 0.0100% per 8h (NOT a decimal fraction — do not multiply by 100)
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(4)}%`;
}

interface RawTicker {
  symbol:        string;
  mark_price?:   string | number;
  spot_price?:   string | number;
  turnover_usd?: string | number;
  oi_value_usd?: string | number;
  funding_rate?: string | number;
  product_id?:   number;
}

export function createTickerRouter(): IRouter {
  const router = Router();

  router.get("/ticker/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    if (!symbol) {
      res.status(400).json({ success: false, error: "Symbol is required" });
      return;
    }

    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
      res.json({ success: true, ...cached.data });
      return;
    }

    try {
      // Delta /v2/tickers returns ALL tickers as an array — filter by symbol client-side
      const url  = `${DELTA_INDIA_REST}/v2/tickers`;
      const resp = await fetch(url, {
        signal:  AbortSignal.timeout(8_000),
        headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
      });
      if (!resp.ok) throw new Error(`Delta API HTTP ${resp.status}`);

      const body = await resp.json() as { result?: RawTicker[]; success?: boolean };
      if (!Array.isArray(body.result)) throw new Error("Unexpected Delta ticker response shape");

      const r = body.result.find(t => t.symbol === symbol);
      if (!r) {
        res.status(404).json({ success: false, error: `No ticker found for ${symbol}` });
        return;
      }

      const info: TickerInfo = {
        symbol,
        markPrice:    fmtPrice(r.mark_price),
        indexPrice:   fmtPrice(r.spot_price),
        volume24h:    fmtUSD(r.turnover_usd),
        openInterest: fmtUSD(r.oi_value_usd),
        fundingRate:  fmtFunding(r.funding_rate),
        fetchedAt:    Date.now(),
      };

      cache.set(symbol, { data: info, fetchedAt: Date.now() });
      logger.info({ symbol, markPrice: info.markPrice, fundingRate: info.fundingRate, oi: info.openInterest, vol: info.volume24h }, "ticker: fetched");

      res.setHeader("Cache-Control", `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
      res.json({ success: true, ...info });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, err: msg }, "ticker: fetch failed");

      if (cached) {
        res.json({ success: true, ...cached.data, stale: true });
        return;
      }
      res.status(502).json({ success: false, error: `Failed to fetch ticker: ${msg}` });
    }
  });

  return router;
}
