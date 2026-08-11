import { Router, type IRouter } from "express";
import { db, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AlertEngine } from "../services/AlertEngine.js";

const RepeatMode = z.enum(["three_reminders","repeat_until_dismissed","triple_ring"]);

const CreateAlertBody = z.object({
  symbol:          z.string().min(1).toUpperCase(),
  condition:       z.enum(["price_above","price_below","touch_price","percent_change_up","percent_change_down"]),
  targetPrice:     z.number().positive(),
  message:         z.string().max(500).optional(),
  expiry:          z.string().datetime().optional().nullable(),
  telegramEnabled: z.boolean().optional().default(true),
  repeatMode: RepeatMode.optional().default("three_reminders"),
});

const UpdateAlertBody = z.object({
  isActive:        z.boolean().optional(),
  targetPrice:     z.number().positive().optional(),
  message:         z.string().max(500).optional().nullable(),
  telegramEnabled: z.boolean().optional(),
  repeatMode: RepeatMode.optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function serialize(a: typeof alertsTable.$inferSelect) {
  return {
    ...a,
    createdAt:  a.createdAt.toISOString(),
    triggeredAt: a.triggeredAt?.toISOString() ?? null,
  };
}

export function createAlertsRouter(alertEngine: AlertEngine): IRouter {
  const router: IRouter = Router();

  router.get("/alerts", async (_req, res): Promise<void> => {
    try {
      const alerts = await db.select().from(alertsTable).orderBy(alertsTable.createdAt);
      res.json(alerts.map(serialize));
    } catch { res.status(500).json({ error: "Failed to fetch alerts" }); }
  });

  router.post("/alerts", async (req, res): Promise<void> => {
    const parsed = CreateAlertBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    try {
      const [alert] = await db.insert(alertsTable).values({
        symbol:          parsed.data.symbol,
        condition:       parsed.data.condition,
        targetPrice:     parsed.data.targetPrice,
        message:         parsed.data.message ?? null,
        telegramEnabled: parsed.data.telegramEnabled,
        repeatMode: parsed.data.repeatMode,
        reminderCount: 0,
        nextReminderAt: null,
        isActive: true, isTriggered: false,
      }).returning();

      await alertEngine.reloadAlerts();
      res.status(201).json(serialize(alert));
    } catch { res.status(500).json({ error: "Failed to create alert" }); }
  });

  router.get("/alerts/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, params.data.id));
      if (!alert) { res.status(404).json({ error: "Alert not found" }); return; }
      res.json(serialize(alert));
    } catch { res.status(500).json({ error: "Failed to fetch alert" }); }
  });

  router.patch("/alerts/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = UpdateAlertBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    try {
      const [alert] = await db.update(alertsTable).set(parsed.data).where(eq(alertsTable.id, params.data.id)).returning();
      if (!alert) { res.status(404).json({ error: "Alert not found" }); return; }
      await alertEngine.reloadAlerts();
      res.json(serialize(alert));
    } catch { res.status(500).json({ error: "Failed to update alert" }); }
  });

  router.post("/alerts/:id/reset", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [alert] = await db.update(alertsTable)
        .set({
          isTriggered: false,
          triggeredAt: null,
          triggeredPrice: null,
          isActive: true,
          reminderCount: 0,
          nextReminderAt: null,
        })
        .where(eq(alertsTable.id, params.data.id)).returning();
      if (!alert) { res.status(404).json({ error: "Alert not found" }); return; }
      await alertEngine.reloadAlerts();
      res.json(serialize(alert));
    } catch { res.status(500).json({ error: "Failed to reset alert" }); }
  });

  router.delete("/alerts/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [alert] = await db.delete(alertsTable).where(eq(alertsTable.id, params.data.id)).returning();
      if (!alert) { res.status(404).json({ error: "Alert not found" }); return; }
      await alertEngine.reloadAlerts();
      res.sendStatus(204);
    } catch { res.status(500).json({ error: "Failed to delete alert" }); }
  });

  return router;
}
