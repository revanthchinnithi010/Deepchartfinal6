import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";

export function createOrderbookRouter(): IRouter {
  const router: IRouter = Router();

  // ── GET /api/ctrader/dom/:symbol — live Depth of Market via ProtoOA ────────
  // Returns the current in-memory DOM book from the streaming engine.
  // Subscribes to DEPTH_QUOTES_EVENT for the symbol on first call (idempotent).
  // Never returns a broker-limitation message unless the API confirms unavailability.
  router.get("/ctrader/dom/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    if (!symbol) { res.status(400).json({ available: false, reason: "Symbol required" }); return; }

    try {
      // Look up symbolId in the synced catalog
      const symRow = await pool.query<{ symbol_id: number }>(
        "SELECT symbol_id FROM ctrader_symbols WHERE UPPER(symbol_name) = $1 LIMIT 1",
        [symbol],
      );
      if (!symRow.rows.length) {
        res.json({ available: false, reason: "Symbol not found in cTrader catalog. Connect a cTrader account first.", symbol });
        return;
      }
      const symbolId = symRow.rows[0].symbol_id;

      const engineStatus = ctraderTickEngine.getStatus();
      if (engineStatus.status !== "streaming") {
        res.json({ available: false, reason: "cTrader engine not streaming. Check broker connection.", symbol, engineStatus: engineStatus.status });
        return;
      }

      // Confirmed unavailable by broker
      if (ctraderTickEngine.isDomUnavailable(symbolId)) {
        res.json({ available: false, reason: "DOM (Depth of Market) is not available for this symbol from the connected broker.", symbol });
        return;
      }

      // Symbol must be spot-subscribed for DOM to work
      const spotSubscribed = engineStatus.subscribedSymbols.includes(symbol);
      if (!spotSubscribed) {
        res.json({ available: false, reason: "Symbol not in active spot subscription. Add it to watchlist first.", symbol });
        return;
      }

      // Subscribe to DOM if not already (idempotent)
      if (!ctraderTickEngine.isDomSubscribed(symbolId)) {
        ctraderTickEngine.subscribeDom(symbolId);
      }

      const depth = Math.min(Number(req.query["depth"] ?? 20), 40);
      const book  = ctraderTickEngine.getDomBook(symbolId, depth);

      res.json({
        symbol,
        symbolId,
        available: book.available,
        pending:   book.pending,
        bids:      book.bids,
        asks:      book.asks,
        updatedAt: book.updatedAt,
        ts:        Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ available: false, reason: `Internal error: ${msg}`, symbol });
    }
  });


  router.get("/orderbook/:symbol", async (req, res): Promise<void> => {
    const { symbol } = req.params;
    const depth = Math.min(Number(req.query.depth ?? 20), 40);

    if (!symbol || !/^[A-Z0-9]+$/.test(symbol)) {
      res.status(400).json({ success: false, error: "Invalid symbol" });
      return;
    }

    try {
      const url = `${DELTA_INDIA_REST}/v2/l2orderbook/${symbol}?depth=${depth}`;
      const resp = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        res.status(resp.status).json({
          success: false,
          error: `Delta API error: ${resp.status}`,
          detail: text.slice(0, 200),
        });
        return;
      }

      const data = await resp.json() as {
        success: boolean;
        result?: { buy?: unknown[]; sell?: unknown[] };
        error?: unknown;
      };

      if (!data.success || !data.result) {
        res.status(502).json({
          success: false,
          error: "Delta returned no result",
          upstream: data.error ?? null,
        });
        return;
      }

      res.json({
        success: true,
        symbol,
        buy:  (data.result.buy  ?? []).slice(0, depth),
        sell: (data.result.sell ?? []).slice(0, depth),
        ts: Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(503).json({ success: false, error: msg });
    }
  });

  return router;
}
