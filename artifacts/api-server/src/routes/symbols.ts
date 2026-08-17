import { Router, type IRouter } from "express";
import type { MarketDataService } from "../services/MarketDataService.js";
import { logger } from "../lib/logger.js";
import { pool } from "@workspace/db";

/**
 * GET /api/symbols
 * GET /api/symbols?broker=delta
 *
 * Returns the full tradable symbol catalog for Delta Exchange.
 * Delta India symbols are fetched live from the REST API and cached 10 min.
 */
type CtraderCategory = "forex" | "index" | "commodity" | "crypto" | "stock" | "other";

function inferCtraderType(symbolName: string): CtraderCategory {
  const s = symbolName.toUpperCase();
  // Precious metals / commodities (before forex check to avoid XAU → forex)
  if (/^(XAU|XAG|XPT|XPD)/.test(s)) return "commodity";
  if (/^(OIL|GAS|WTI|BRENT|NGAS|USOIL|UKOIL|COPP|WHEAT|CORN|COFF|SOYB|SUGAR|CACAO|NATGAS|NGAS)/.test(s)) return "commodity";
  // Crypto
  if (/USDT$/.test(s) || /^(BTC|ETH|SOL|DOG|PEPE|XRP|ADA|MATIC|LINK|DOT|AVAX|LTC|BCH|SHIB|UNI|ATOM|NEAR|FTM|ALGO|SAND|MANA|AXS|AAVE|COMP|MKR|SNX|SUSHI|1INCH|CRV|BAL|DYDX|IMX|APE|GMX|ARB|OP|SUI|SEI|TIA|BLUR|DOGE|BNB)/.test(s)) return "crypto";
  // Indices
  if (/^(US30|NAS|SPX|GER|UK1|JP2|DAX|CAC|FTSE|AUS|HSI|NIKKEI|DOW|SP5|ES3|FR4|IT4|ES35|IBEX|N225|HK5|CN50|CHINA|INDIA|VIX)/.test(s)) return "index";
  // Standard 6-char forex pairs
  if (/^[A-Z]{6}$/.test(s)) return "forex";
  // 3-char ISO currency + USD
  if (/^[A-Z]{3}USD$/.test(s) && !["XAUUSD","XAGUSD","XPTUSD","XPDUSD"].includes(s)) return "forex";
  // Stocks: 2-5 uppercase letters, no numbers, not matched above
  if (/^[A-Z]{2,5}$/.test(s)) return "stock";
  if (/^[A-Z]{2,6}\.[A-Z]{1,3}$/.test(s)) return "stock"; // e.g. AAPL.US
  return "other";
}

export function createSymbolsRouter(marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/symbols", async (req, res): Promise<void> => {
    const broker = (req.query["broker"] as string | undefined)?.toLowerCase();
    const forceRefresh = req.query["refresh"] === "1";

    logger.info({ broker, forceRefresh }, "symbols: fetching catalog");

    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=60");

    try {
      const svc = marketData.getSymbolService();

      if (broker === "ctrader") {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS ctrader_symbols (
            symbol_id    INTEGER PRIMARY KEY,
            symbol_name  TEXT NOT NULL,
            description  TEXT NOT NULL,
            pip_position INTEGER NOT NULL,
            digits       INTEGER NOT NULL,
            fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        const rows = await pool.query(
          "SELECT symbol_id, symbol_name, description, pip_position, digits FROM ctrader_symbols ORDER BY symbol_name",
        );
        const symbols = (rows.rows as Array<{
          symbol_id: number; symbol_name: string; description: string;
          pip_position: number; digits: number;
        }>).map(r => {
          const cat = inferCtraderType(r.symbol_name);
          return {
            symbol:       r.symbol_name,
            name:         r.description || r.symbol_name,
            contractType: cat,
            category:     cat,
            broker:       "ctrader",
            underlying:   r.symbol_name.length >= 6 ? r.symbol_name.slice(0, 3) : r.symbol_name,
            quoteAsset:   r.symbol_name.length >= 6 ? r.symbol_name.slice(-3) : "",
            active:       true,
          };
        });
        res.json({ broker: "ctrader", count: symbols.length, symbols });
        return;
      }

      if (broker === "delta" || !broker) {
        const symbols = await svc.getDeltaSymbols(forceRefresh);
        res.json({ broker: "delta", count: symbols.length, symbols });
        return;
      }

      const { delta } = await svc.getAllSymbols();
      res.json({
        delta: { count: delta.length, symbols: delta },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "symbols: failed to fetch catalog");
      res.status(502).json({ error: `Failed to fetch symbol catalog: ${msg}` });
    }
  });

  return router;
}
