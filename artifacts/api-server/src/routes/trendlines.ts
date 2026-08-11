import { Router, type IRouter } from "express";
import { db, trendlinesTable, pool } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import type { AlertEngine } from "../services/AlertEngine.js";

const RepeatMode = z.enum(["three_reminders","repeat_until_dismissed","triple_ring"]);

const DRAWING_TYPES = ["trendline","ray","horizontal_line","rectangle","channel"] as const;
const TRENDLINE_CONDITIONS = ["touch","break","retest","cross_above","cross_below","breakout","atr_proximity"] as const;
const ZONE_CONDITIONS = ["enter_zone","exit_zone","breakout","rejection"] as const;
const PRICE_CONDITIONS = ["above_price","below_price","touch_price"] as const;
const ALL_CONDITIONS = [...TRENDLINE_CONDITIONS, ...ZONE_CONDITIONS, ...PRICE_CONDITIONS] as const;

const CreateTrendlineBody = z.object({
  symbol:            z.string().min(1).toUpperCase(),
  timeframe:         z.string().default("1H"),
  point1Price:       z.number().positive(),
  point1Time:        z.string().datetime(),
  point2Price:       z.number().positive(),
  point2Time:        z.string().datetime(),
  condition:         z.enum(ALL_CONDITIONS).default("breakout"),
  drawingType:       z.enum(DRAWING_TYPES).default("trendline"),
  notes:             z.string().max(500).optional(),
  telegramEnabled:   z.boolean().optional().default(true),
  atrPeriod:         z.number().int().min(5).max(50).optional().default(14),
  atrMultiplier:     z.number().min(0.05).max(1.0).optional().default(0.15),
  /** Display ID of the chart drawing this alert was created from (e.g. "TL-004") */
  drawingDisplayId:  z.string().optional(),
  repeatMode:        RepeatMode.optional().default("three_reminders"),
});

const UpdateTrendlineBody = z.object({
  isActive:        z.boolean().optional(),
  alertStatus:     z.enum(["active","paused","expired","triggered"]).optional(),
  notes:           z.string().max(500).optional().nullable(),
  telegramEnabled: z.boolean().optional(),
  condition:       z.enum(ALL_CONDITIONS).optional(),
  point1Price:     z.number().positive().optional(),
  point1Time:      z.string().datetime().optional(),
  point2Price:     z.number().positive().optional(),
  point2Time:      z.string().datetime().optional(),
  atrPeriod:       z.number().int().min(5).max(50).optional(),
  atrMultiplier:   z.number().min(0.05).max(1.0).optional(),
  repeatMode:       RepeatMode.optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function serialize(t: typeof trendlinesTable.$inferSelect) {
  return {
    ...t,
    point1Time:    t.point1Time.toISOString(),
    point2Time:    t.point2Time.toISOString(),
    createdAt:     t.createdAt.toISOString(),
    triggeredAt:   t.triggeredAt?.toISOString() ?? null,
    cooldownUntil: t.cooldownUntil?.toISOString() ?? null,
  };
}

export function createTrendlinesRouter(alertEngine: AlertEngine): IRouter {
  const router: IRouter = Router();

  router.get("/trendlines", async (_req, res): Promise<void> => {
    try {
      const rows = await db.select().from(trendlinesTable)
        .orderBy(desc(trendlinesTable.createdAt));
      res.json(rows.map(serialize));
    } catch { res.status(500).json({ error: "Failed to fetch trendlines" }); }
  });

  router.post("/trendlines", async (req, res): Promise<void> => {
    const parsed = CreateTrendlineBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    try {
      const d = parsed.data;
      const p1t = new Date(d.point1Time);
      const p2t = new Date(d.point2Time);

      const p2Price = d.drawingType === "horizontal_line" ? d.point1Price : d.point2Price;
      const p2time  = d.drawingType === "horizontal_line" ? new Date(p1t.getTime() + 3_600_000) : p2t;

      const [row] = await db.insert(trendlinesTable).values({
        symbol:           d.symbol,
        timeframe:        d.timeframe,
        point1Price:      d.point1Price,
        point1Time:       p1t,
        point2Price:      p2Price,
        point2Time:       p2time,
        condition:        d.condition,
        drawingType:      d.drawingType,
        alertStatus:      "active",
        notes:            d.notes ?? null,
        telegramEnabled:  d.telegramEnabled,
        isActive:         true,
        isTriggered:      false,
        atrPeriod:        d.atrPeriod ?? 14,
        atrMultiplier:    d.atrMultiplier ?? 0.15,
        drawingDisplayId: d.drawingDisplayId ?? null,
        repeatMode:       d.repeatMode,
        reminderCount:    0,
        nextReminderAt:   null,
      }).returning();

      await alertEngine.reloadAlerts();
      res.status(201).json(serialize(row));
    } catch { res.status(500).json({ error: "Failed to create drawing alert" }); }
  });

  router.get("/trendlines/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [row] = await db.select().from(trendlinesTable).where(eq(trendlinesTable.id, params.data.id));
      if (!row) { res.status(404).json({ error: "Drawing alert not found" }); return; }
      res.json(serialize(row));
    } catch { res.status(500).json({ error: "Failed to fetch drawing alert" }); }
  });

  router.patch("/trendlines/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = UpdateTrendlineBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    try {
      const updates: Partial<typeof trendlinesTable.$inferInsert> = {};
      const d = parsed.data;
      if (d.isActive !== undefined) updates.isActive = d.isActive;
      if (d.alertStatus !== undefined) {
        updates.alertStatus = d.alertStatus;
        if (d.alertStatus === "paused") updates.isActive = false;
        if (d.alertStatus === "active") updates.isActive = true;
      }
      if (d.notes !== undefined) updates.notes = d.notes;
      if (d.telegramEnabled !== undefined) updates.telegramEnabled = d.telegramEnabled;
      if (d.condition !== undefined) updates.condition = d.condition;
      if (d.point1Price !== undefined) updates.point1Price = d.point1Price;
      if (d.point1Time !== undefined) updates.point1Time = new Date(d.point1Time);
      if (d.point2Price !== undefined) updates.point2Price = d.point2Price;
      if (d.point2Time !== undefined) updates.point2Time = new Date(d.point2Time);
      if (d.atrPeriod !== undefined) updates.atrPeriod = d.atrPeriod;
      if (d.atrMultiplier !== undefined) updates.atrMultiplier = d.atrMultiplier;
      if (d.repeatMode !== undefined) {
        updates.repeatMode = d.repeatMode;
        // Editing repeat policy before a trigger must not leave an old timer.
        if (d.repeatMode === "triple_ring") {
          updates.nextReminderAt = null;
        }
      }

      const [row] = await db.update(trendlinesTable).set(updates).where(eq(trendlinesTable.id, params.data.id)).returning();
      if (!row) { res.status(404).json({ error: "Drawing alert not found" }); return; }
      await alertEngine.reloadAlerts();
      res.json(serialize(row));
    } catch { res.status(500).json({ error: "Failed to update drawing alert" }); }
  });

  router.post("/trendlines/:id/reset", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [row] = await db.update(trendlinesTable)
        .set({
          isTriggered:  false,
          triggeredAt:  null,
          triggeredPrice: null,
          isActive:     true,
          alertStatus:  "active",
          cooldownUntil: null,
          reminderCount: 0,
          nextReminderAt: null,
        })
        .where(eq(trendlinesTable.id, params.data.id)).returning();
      if (!row) { res.status(404).json({ error: "Drawing alert not found" }); return; }
      await alertEngine.reloadAlerts();
      res.json(serialize(row));
    } catch { res.status(500).json({ error: "Failed to reset drawing alert" }); }
  });

  router.post("/trendlines/:id/clone", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [original] = await db.select().from(trendlinesTable).where(eq(trendlinesTable.id, params.data.id));
      if (!original) { res.status(404).json({ error: "Drawing alert not found" }); return; }

      const [row] = await db.insert(trendlinesTable).values({
        symbol:          original.symbol,
        timeframe:       original.timeframe,
        point1Price:     original.point1Price,
        point1Time:      original.point1Time,
        point2Price:     original.point2Price,
        point2Time:      original.point2Time,
        condition:       original.condition,
        drawingType:     original.drawingType,
        alertStatus:     "active",
        notes:           original.notes ? `${original.notes} (copy)` : "(copy)",
        telegramEnabled: original.telegramEnabled,
        isActive:        true,
        isTriggered:     false,
        atrPeriod:       original.atrPeriod,
        atrMultiplier:   original.atrMultiplier,
      }).returning();

      await alertEngine.reloadAlerts();
      res.status(201).json(serialize(row));
    } catch { res.status(500).json({ error: "Failed to clone drawing alert" }); }
  });

  router.delete("/trendlines/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [row] = await db.delete(trendlinesTable).where(eq(trendlinesTable.id, params.data.id)).returning();
      if (!row) { res.status(404).json({ error: "Drawing alert not found" }); return; }
      await alertEngine.reloadAlerts();
      res.sendStatus(204);
    } catch { res.status(500).json({ error: "Failed to delete drawing alert" }); }
  });

  router.get("/alert-history", async (req, res): Promise<void> => {
    const symbol = typeof req.query["symbol"] === "string" ? req.query["symbol"].toUpperCase() : null;
    try {
      const client = await pool.connect();
      try {
        let result;
        if (symbol) {
          result = await client.query(
            `SELECT * FROM alert_events_v2 WHERE symbol = $1 ORDER BY created_at DESC LIMIT 200`,
            [symbol]
          );
        } else {
          result = await client.query(
            `SELECT * FROM alert_events_v2 ORDER BY created_at DESC LIMIT 200`
          );
        }
        res.json(result.rows.map((r: Record<string,unknown>) => ({
          id:             r["id"],
          sourceId:       r["source_id"],
          sourceType:     r["source_type"],
          symbol:         r["symbol"],
          timeframe:      r["timeframe"],
          drawingType:    r["drawing_type"],
          condition:      r["condition"],
          priceAtTrigger: r["price_at_trigger"],
          projectedPrice: r["projected_price"],
          message:        r["message"],
          createdAt:      r["created_at"],
        })));
      } finally {
        client.release();
      }
    } catch { res.status(500).json({ error: "Failed to fetch alert history" }); }
  });

  return router;
}
