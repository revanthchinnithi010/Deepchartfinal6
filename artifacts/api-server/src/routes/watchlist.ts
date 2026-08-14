import { Router, type IRouter } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import type { MarketDataService } from "../services/MarketDataService.js";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";
import { getCtraderSymbolRow } from "./ctrader_spots.js";

const PROVIDER_MAP: Record<string, string> = {
  NAS100: "ctrader", US30: "ctrader", XAUUSD: "ctrader", XAGUSD: "ctrader",
  EURUSD: "ctrader", GBPUSD: "ctrader", GBPJPY: "ctrader", USDJPY: "ctrader",
  AUDUSD: "ctrader", USDCAD: "ctrader", USOIL: "ctrader", UKOIL: "ctrader",
  SPX500: "ctrader", DE40: "ctrader",
  BTCUSD: "delta", ETHUSD: "delta", SOLUSD: "delta",
  DOGEUSD: "delta", PEPEUSD: "delta",
};

// Crypto symbols must never enter the cTrader subscription path. cTrader
// remains the source for FX, metals, indices and energies.
const NON_CRYPTO_USD_BASES = new Set([
  "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNH", "HKD", "SGD",
  "NOK", "SEK", "DKK", "PLN", "CZK", "HUF", "ZAR", "MXN", "TRY", "ILS",
  "AED", "SAR", "THB", "INR", "XAU", "XAG", "XPT", "XPD", "USOIL", "UKOIL",
  "NATGAS", "WTI", "BRENT", "US500", "SPX500", "NAS100", "US30", "GER40",
  "DE40", "UK100", "JP225", "AUS200", "FRA40", "EU50", "HK50", "STOXX50",
]);

function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase().trim().replace(/\.(pro|raw|ecn|std)$/i, "");
  if (!/^[A-Z0-9]{2,12}(USD|USDT)$/.test(s)) return false;
  const base = s.endsWith("USDT") ? s.slice(0, -4) : s.slice(0, -3);
  return !NON_CRYPTO_USD_BASES.has(base);
}

const AddSymbolBody = z.object({
  symbol: z.string().toUpperCase(),
  isFavorite: z.boolean().optional().default(false),
});

const UpdateBody = z.object({
  isFavorite: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function serialize(w: typeof watchlistTable.$inferSelect) {
  return { ...w, createdAt: w.createdAt.toISOString() };
}

export function createWatchlistRouter(marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/watchlist", async (_req, res): Promise<void> => {
    try {
      const items = await db.select().from(watchlistTable).orderBy(asc(watchlistTable.position), asc(watchlistTable.createdAt));
      res.json(items.map(serialize));
    } catch { res.status(500).json({ error: "Failed to fetch watchlist" }); }
  });

  router.post("/watchlist", async (req, res): Promise<void> => {
    const parsed = AddSymbolBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const sym = parsed.data.symbol;
    const provider = PROVIDER_MAP[sym] ?? "delta";
    try {
      const existing = await db.select().from(watchlistTable).where(eq(watchlistTable.symbol, sym));
      if (existing.length > 0) { res.status(409).json({ error: "Symbol already in watchlist" }); return; }

      const allItems = await db.select().from(watchlistTable);
      const [item] = await db.insert(watchlistTable).values({
        symbol: sym,
        provider,
        isFavorite: parsed.data.isFavorite,
        position: allItems.length,
      }).returning();

      // Exchange/general market subscription. Crypto is explicitly excluded
      // from the cTrader path below.
      marketData.subscribe(sym);

      if (!isCryptoSymbol(sym)) {
        getCtraderSymbolRow(sym)
          .then(row => {
            if (row) ctraderTickEngine.addSymbol(row.symbolId, row.symbolName);
          })
          .catch(() => { /* non-fatal */ });
      }

      res.status(201).json(serialize(item));
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === "23505") { res.status(409).json({ error: "Symbol already in watchlist" }); return; }
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  router.patch("/watchlist/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    try {
      const [item] = await db.update(watchlistTable).set(parsed.data).where(eq(watchlistTable.id, params.data.id)).returning();
      if (!item) { res.status(404).json({ error: "Not found" }); return; }
      res.json(serialize(item));
    } catch { res.status(500).json({ error: "Failed to update watchlist item" }); }
  });

  router.delete("/watchlist/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [item] = await db.delete(watchlistTable).where(eq(watchlistTable.id, params.data.id)).returning();
      if (!item) { res.status(404).json({ error: "Not found" }); return; }

      marketData.unsubscribe(item.symbol);

      if (!isCryptoSymbol(item.symbol)) {
        getCtraderSymbolRow(item.symbol)
          .then(row => {
            if (row) ctraderTickEngine.removeSymbol(row.symbolId, row.symbolName);
          })
          .catch(() => { /* non-fatal */ });
      }

      res.sendStatus(204);
    } catch { res.status(500).json({ error: "Failed to remove from watchlist" }); }
  });

  return router;
}
