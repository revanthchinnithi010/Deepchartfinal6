/**
 * Broker Connection Management Routes
 *
 * GET  /api/broker/connection/status          — health of all known accounts
 * GET  /api/broker/connection/:id/status      — health of a single account
 * POST /api/broker/connection/:id/test        — live credential test
 * POST /api/broker/connection/:id/reconnect   — evict cached adapter + re-verify
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { BrokerService } from "../brokers/BrokerService.js";
import { requireAny } from "../middleware/brokerAuth.js";
import { connectLimiter, dataReadLimiter } from "../middleware/rateLimiter.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── GET /api/broker/connection/status ─────────────────────────────────────────
// Returns a lightweight health record for every account in the DB.
// No credentials are ever returned.

router.get("/broker/connection/status",
  dataReadLimiter,
  async (_req, res) => {
    try {
      const result = await pool.query<{
        id: number;
        broker_id: string;
        label: string;
        is_active: boolean;
        created_at: string;
      }>(
        `SELECT id, broker_id, label, is_active, created_at
         FROM broker_accounts
         ORDER BY created_at DESC`,
      );

      const accounts = result.rows.map(row => ({
        id:         row.id,
        brokerId:   row.broker_id,
        label:      row.label,
        isActive:   row.is_active,
        createdAt:  row.created_at,
        // Note: no credentials, no encrypted fields
      }));

      res.json({ ok: true, accounts, total: accounts.length });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/connection/status failed");
      res.status(500).json({ ok: false, error: String(err) });
    }
  },
);

// ── GET /api/broker/connection/:id/status ────────────────────────────────────

router.get("/broker/connection/:id/status",
  dataReadLimiter,
  requireAny,
  async (req, res) => {
    const { accountId, brokerId } = req.brokerCtx!;
    try {
      const result = await pool.query<{
        label: string;
        is_active: boolean;
        created_at: string;
      }>(
        `SELECT label, is_active, created_at FROM broker_accounts WHERE id=$1`,
        [accountId],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ ok: false, error: "Account not found" });
        return;
      }
      const row = result.rows[0]!;
      res.json({
        ok:        true,
        accountId,
        brokerId,
        label:     row.label,
        isActive:  row.is_active,
        createdAt: row.created_at,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  },
);

// ── POST /api/broker/connection/:id/test ─────────────────────────────────────
// Runs a live testConnection() against the broker API.

router.post("/broker/connection/:id/test",
  connectLimiter,
  requireAny,
  async (req, res) => {
    const { adapter, brokerId, accountId } = req.brokerCtx!;
    logger.info({ accountId, brokerId }, "broker/connection: live test");
    try {
      const ok = await adapter.testConnection();
      res.json({ ok, brokerId, accountId, message: ok ? "Connection successful" : "Connection test failed" });
    } catch (err) {
      res.status(502).json({ ok: false, brokerId, accountId, error: String(err) });
    }
  },
);

// ── POST /api/broker/connection/:id/reconnect ─────────────────────────────────
// Evicts the cached adapter (forces credential re-read from DB) and runs
// a live connection test. Useful after credential rotation.

router.post("/broker/connection/:id/reconnect",
  connectLimiter,
  requireAny,
  async (req, res) => {
    const { accountId, brokerId } = req.brokerCtx!;
    logger.info({ accountId, brokerId }, "broker/connection: reconnect requested");

    // Evict the cache entry — next request will re-read + re-decrypt from DB
    BrokerService.evict(accountId);

    // Re-load to verify credentials are still valid
    const apiToken = (req.headers["x-broker-token"] as string)?.trim();
    try {
      const freshAdapter = await BrokerService.getAdapter(accountId, apiToken);
      const ok = await freshAdapter.testConnection();
      logger.info({ accountId, brokerId, ok }, "broker/connection: reconnect result");
      res.json({ ok, brokerId, accountId, message: ok ? "Reconnected successfully" : "Reconnect failed — check credentials" });
    } catch (err) {
      logger.error({ accountId, brokerId, err: String(err) }, "broker/connection: reconnect error");
      res.status(502).json({ ok: false, brokerId, accountId, error: String(err) });
    }
  },
);

export { router as brokerConnectionRouter };
