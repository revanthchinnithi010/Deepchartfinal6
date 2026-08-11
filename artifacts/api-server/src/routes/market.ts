import { Router, type IRouter } from "express";
import { z } from "zod";
import type { MarketDataService } from "../services/MarketDataService.js";
import type { FeedHealthMonitor } from "../services/FeedHealthMonitor.js";

const SymbolParam = z.object({ symbol: z.string().toUpperCase() });

export function createMarketRouter(
  marketData: MarketDataService,
  healthMonitor: FeedHealthMonitor,
): IRouter {
  const router: IRouter = Router();

  router.get("/market/status", (_req, res): void => {
    const health = healthMonitor.getHealth();
    res.json({
      ...health,
      subscriptions: marketData.getSubscriptions(),
      supportedSymbols: marketData.getSupportedSymbols(),
      clientCount: 0,
    });
  });

  router.get("/market/providers", (_req, res): void => {
    res.json(marketData.getProviderStats());
  });

  router.get("/market/feed-stats", (_req, res): void => {
    res.json(marketData.getFeedManagerStats());
  });

  router.get("/market/ticks", (_req, res): void => {
    res.json(marketData.getAllLatestTicks());
  });

  router.get("/market/ticks/:symbol", (req, res): void => {
    const parsed = SymbolParam.safeParse(req.params);
    if (!parsed.success) { res.status(400).json({ error: "Invalid symbol" }); return; }

    const { symbol } = parsed.data;
    const history = marketData.getTickHistory(symbol);

    if (history.length === 0) {
      const latest = marketData.getLatestTick(symbol);
      if (!latest) { res.status(404).json({ error: "No tick data for symbol" }); return; }
      res.json([latest]);
      return;
    }

    res.json(history);
  });

  router.get("/market/latest/:symbol", (req, res): void => {
    const parsed = SymbolParam.safeParse(req.params);
    if (!parsed.success) { res.status(400).json({ error: "Invalid symbol" }); return; }

    const tick = marketData.getLatestTick(parsed.data.symbol);
    if (!tick) { res.status(404).json({ error: "No tick data for symbol" }); return; }
    res.json(tick);
  });

  router.post("/market/subscribe", (req, res): void => {
    const parsed = z.object({ symbol: z.string() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "symbol is required" }); return; }

    const symbol = parsed.data.symbol.toUpperCase();
    const ok = marketData.subscribe(symbol);
    if (!ok) {
      res.status(400).json({
        error: `Unsupported symbol: ${symbol}`,
        supported: marketData.getSupportedSymbols(),
      });
      return;
    }
    res.json({ subscribed: symbol, subscriptions: marketData.getSubscriptions() });
  });

  /**
   * POST /api/market/subscribe-batch
   * Body: { symbols: string[] }
   * Subscribes multiple symbols at once without touching the watchlist.
   * Used by the Markets page to keep prices live regardless of watchlist state.
   */
  router.post("/market/subscribe-batch", (req, res): void => {
    const parsed = z.object({ symbols: z.array(z.string()).min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "symbols[] array required" }); return; }

    const subscribed: string[] = [];
    const skipped:    string[] = [];
    for (const raw of parsed.data.symbols) {
      const sym = raw.toUpperCase();
      const ok  = marketData.subscribe(sym);
      (ok ? subscribed : skipped).push(sym);
    }
    res.json({ subscribed: subscribed.length, skipped: skipped.length });
  });

  router.delete("/market/subscribe/:symbol", (req, res): void => {
    const parsed = SymbolParam.safeParse(req.params);
    if (!parsed.success) { res.status(400).json({ error: "Invalid symbol" }); return; }

    const ok = marketData.unsubscribe(parsed.data.symbol);
    if (!ok) { res.status(404).json({ error: "Symbol not subscribed" }); return; }
    res.json({ unsubscribed: parsed.data.symbol, subscriptions: marketData.getSubscriptions() });
  });

  return router;
}
