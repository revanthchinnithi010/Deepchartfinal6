import { Router } from "express";
import { validateDeltaCredentials } from "../services/deltaAuth.js";
import { deltaSocketManager } from "../ws/deltaSocket.js";
import { decrypt } from "../services/BrokerEncryption.js";
import { pool } from "@workspace/db";
import { requireDelta } from "../middleware/brokerAuth.js";
import {
  orderWriteLimiter,
  dataReadLimiter,
  connectLimiter,
} from "../middleware/rateLimiter.js";
import {
  validatePlaceOrder,
  validateClosePosition,
  validateModifyOrder,
} from "../middleware/validateOrder.js";
import type { DeltaTradingAdapter } from "../brokers/DeltaTradingAdapter.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Balance ──────────────────────────────────────────────────────────────────

router.get("/broker/delta/balance",
  dataReadLimiter,
  requireDelta,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    try {
      const balances = await adapter.getBalance();
      const usdt = balances.find(b => b.coin === "USDT") ?? balances[0];
      res.json({ ok: true, balance: usdt, all: balances });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/delta/balance failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Positions ─────────────────────────────────────────────────────────────────

router.get("/broker/delta/positions",
  dataReadLimiter,
  requireDelta,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    try {
      const positions = await adapter.getPositions();
      res.json({ ok: true, positions });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/delta/positions failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Open Orders ───────────────────────────────────────────────────────────────

router.get("/broker/delta/orders",
  dataReadLimiter,
  requireDelta,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    try {
      const orders = await adapter.getOrders();
      res.json({ ok: true, orders });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/delta/orders failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Order History ─────────────────────────────────────────────────────────────

router.get("/broker/delta/orders/history",
  dataReadLimiter,
  requireDelta,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "100"), 10), 500);
    try {
      const orders = await (adapter as DeltaTradingAdapter).getOrderHistory(limit);
      res.json({ ok: true, orders, total: orders.length });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/delta/orders/history failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Place Order (Market / Limit / Stop / StopLimit + TP/SL brackets) ─────────

router.post("/broker/delta/order",
  orderWriteLimiter,
  requireDelta,
  validatePlaceOrder,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    logger.info({ accountId, body: req.body }, "broker/delta: placeOrder");
    try {
      const result = await adapter.placeOrder(req.body);
      res.json({ ok: true, orderId: result.orderId });
    } catch (err) {
      logger.error({ err: String(err), body: req.body }, "broker/delta/order failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Modify Order (amend price / TP / SL / qty) ────────────────────────────────

router.patch("/broker/delta/order/:id",
  orderWriteLimiter,
  requireDelta,
  validateModifyOrder,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    const orderId = req.params["id"] as string;
    logger.info({ accountId, orderId, body: req.body }, "broker/delta: modifyOrder");
    try {
      await (adapter as DeltaTradingAdapter).modifyOrder(orderId, req.body);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: String(err), orderId }, "broker/delta/order PATCH failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Cancel Order ──────────────────────────────────────────────────────────────

router.delete("/broker/delta/order/:id",
  orderWriteLimiter,
  requireDelta,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    const orderId = req.params["id"] as string;
    logger.info({ accountId, orderId }, "broker/delta: cancelOrder");
    try {
      await adapter.cancelOrder(orderId);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: String(err), orderId }, "broker/delta/order DELETE failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Close Position ────────────────────────────────────────────────────────────

router.delete("/broker/delta/position/:productId",
  orderWriteLimiter,
  requireDelta,
  validateClosePosition,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    const productId = req.params["productId"] as string;
    const { size, side } = req.body as { size: number; side: "Long" | "Short" };
    logger.info({ accountId, productId, size, side }, "broker/delta: closePosition");
    try {
      await adapter.closePosition({
        id: productId,
        symbol: "",
        side,
        size,
        entryPrice: 0, markPrice: 0, unrealisedPnl: 0, leverage: "",
        raw: { product_id: Number(productId) },
      });
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: String(err), productId }, "broker/delta/position DELETE failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Credential Validation ─────────────────────────────────────────────────────

router.post("/broker/delta/validate",
  connectLimiter,
  async (req, res) => {
    const { api_key, api_secret } = req.body as { api_key?: string; api_secret?: string };
    if (!api_key?.trim() || !api_secret?.trim()) {
      res.status(400).json({ ok: false, error: "api_key and api_secret are required" });
      return;
    }
    try {
      const result = await validateDeltaCredentials(api_key.trim(), api_secret.trim());
      if (result.valid) {
        res.json({ ok: true, usdtBalance: result.usdtBalance });
      } else {
        res.status(401).json({ ok: false, error: result.error });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  },
);

// ── WebSocket Session Management ──────────────────────────────────────────────

router.post("/broker/delta/ws/start", async (req, res) => {
  const accountIdStr = (req.headers["x-broker-account-id"] as string)?.trim();
  const apiToken     = (req.headers["x-broker-token"]      as string)?.trim();

  if (!accountIdStr || !apiToken) {
    res.status(400).json({ ok: false, error: "X-Broker-Account-Id and X-Broker-Token headers required" });
    return;
  }
  const accountId = parseInt(accountIdStr, 10);
  if (isNaN(accountId) || accountId <= 0) {
    res.status(400).json({ ok: false, error: "Invalid X-Broker-Account-Id" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT api_key_enc, api_secret_enc, api_token, broker_id, meta FROM broker_accounts WHERE id=$1`,
      [accountId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ ok: false, error: "Account not found" });
      return;
    }
    const row = result.rows[0] as {
      api_key_enc:    string;
      api_secret_enc: string;
      api_token:      string;
      broker_id:      string;
      meta:           Record<string, unknown> | null;
    };

    if (row.api_token !== apiToken) {
      res.status(403).json({ ok: false, error: "Invalid broker account token" });
      return;
    }
    if (row.broker_id !== "delta") {
      res.status(400).json({ ok: false, error: "Account is not a Delta account" });
      return;
    }

    const apiKey    = decrypt(row.api_key_enc);
    const apiSecret = decrypt(row.api_secret_enc);
    const meta      = row.meta ?? {};
    const wsUrl     = typeof meta["ws_url"] === "string"
      ? meta["ws_url"]
      : "wss://socket.delta.exchange";

    deltaSocketManager.startSession(accountId, apiKey, apiSecret, wsUrl);
    res.json({ ok: true, message: "Delta WebSocket session started" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.delete("/broker/delta/ws/stop", async (req, res) => {
  const accountIdStr = (req.headers["x-broker-account-id"] as string)?.trim();
  if (!accountIdStr) {
    res.status(400).json({ ok: false, error: "X-Broker-Account-Id header required" });
    return;
  }
  const accountId = parseInt(accountIdStr, 10);
  deltaSocketManager.stopSession(accountId);
  res.json({ ok: true });
});

export { router as brokerDeltaRouter };
