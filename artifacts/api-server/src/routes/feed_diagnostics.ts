import { Router, type IRouter } from "express";
import type { MarketDataService } from "../services/MarketDataService.js";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";

/**
 * GET /api/feed/diagnostics
 *
 * Returns per-symbol data provider routing, subscription status, last tick
 * time, and provider connection state. Merges cTrader engine data so the
 * frontend diagnostics panel shows: Provider: cTrader / Status: Streaming
 * for symbols coming from the ProtoOA spot feed.
 */

function ctraderAssetClass(sym: string): string {
  const s = sym.toUpperCase();
  if (s === "XAUUSD" || s === "XAGUSD" || s === "XPTUSD") return "metal";
  if (/^[A-Z]{6}$/.test(s)) return "forex";
  if (/^(US30|NAS100|SPX500|GER40|UK100|JP225|DE40)$/.test(s)) return "index";
  if (/^(USOIL|UKOIL|NGAS|COPPER)$/.test(s)) return "commodity";
  return "unknown";
}

export function createFeedDiagnosticsRouter(marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/feed/diagnostics", (_req, res): void => {
    try {
      const diag = marketData.getDiagnostics() as {
        providers:     { name: string; displayName?: string; status: string; tickCount: number; lastTickAt: number | null; subscriptions: string[] }[];
        perSymbol:     Record<string, { provider: string | undefined; assetClass: string; routingReason: string; subscribed: boolean; lastTickAt: number | null; lastPrice: number | null; lastTickAgo: number | null; symbolId: string | undefined; tickCount?: number }>;
        subscriptions: string[];
        symbolRouting: Record<string, string>;
        totalTicks:    number;
        ts:            number;
      };

      // ── Merge cTrader engine data ──────────────────────────────────────────
      const cStatus    = ctraderTickEngine.getStatus();
      const cTicks     = ctraderTickEngine.getAllLastTicks();
      const now        = Date.now();

      if (cTicks.length > 0 || cStatus.status !== "idle") {
        const totalCtraderTicks = Object.values(cStatus.tickCounts).reduce((a, b) => a + b, 0);
        diag.providers.push({
          name:          "ctrader",
          displayName:   "cTrader (ProtoOA)",
          status:        cStatus.status === "streaming" ? "connected" : cStatus.status,
          tickCount:     totalCtraderTicks,
          lastTickAt:    cStatus.lastTickAt,
          subscriptions: cStatus.subscribedSymbols ?? cTicks.map(t => t.symbol),
        });

        for (const tick of cTicks) {
          const sym = tick.symbol;
          diag.perSymbol[sym] = {
            provider:      "ctrader",
            assetClass:    ctraderAssetClass(sym),
            routingReason: "cTrader ProtoOA real-time spot subscription",
            subscribed:    cStatus.status === "streaming",
            lastTickAt:    tick.timestamp,
            lastPrice:     tick.price,
            lastTickAgo:   tick.timestamp ? now - tick.timestamp : null,
            symbolId:      String(tick.symbolId),
            tickCount:     cStatus.tickCounts[sym] ?? 0,
          };
          diag.symbolRouting[sym] = "ctrader";
        }
      }

      res.setHeader("Cache-Control", "no-store");
      res.json(diag);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Diagnostics failed: ${msg}` });
    }
  });

  return router;
}
