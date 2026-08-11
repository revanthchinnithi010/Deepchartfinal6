import { Router, type IRouter } from "express";
import { db, zonesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { AlertEngine } from "../services/AlertEngine.js";
const RepeatMode = z.enum(["three_reminders","repeat_until_dismissed","triple_ring"]);

const CreateZoneBody = z.object({
  symbol:          z.string().min(1).toUpperCase(),
  upperPrice:      z.number().positive(),
  lowerPrice:      z.number().positive(),
  zoneType:        z.enum(["supply","demand","support_resistance","order_block"]).default("support_resistance"),
  timeframe:       z.string().default("1H"),
  condition:       z.enum(["enter","touch","break","retest"]).default("enter"),
  notes:           z.string().max(500).optional(),
  telegramEnabled: z.boolean().optional().default(true),
  repeatMode: RepeatMode.optional().default("three_reminders"),
}).refine(d => d.upperPrice > d.lowerPrice, { message: "upperPrice must be greater than lowerPrice" });

const UpdateZoneBody = z.object({
  isActive:        z.boolean().optional(),
  upperPrice:      z.number().positive().optional(),
  lowerPrice:      z.number().positive().optional(),
  notes:           z.string().max(500).optional().nullable(),
  telegramEnabled: z.boolean().optional(),
  repeatMode: RepeatMode.optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function serialize(z: typeof zonesTable.$inferSelect) {
  return {
    ...z,
    createdAt:    z.createdAt.toISOString(),
    triggeredAt:  z.triggeredAt?.toISOString() ?? null,
    cooldownUntil: z.cooldownUntil?.toISOString() ?? null,
  };
}

export function createZonesRouter(alertEngine: AlertEngine): IRouter {
  const router: IRouter = Router();

  router.get("/zones", async (_req, res): Promise<void> => {
    try {
      const zones = await db.select().from(zonesTable).orderBy(zonesTable.createdAt);
      res.json(zones.map(serialize));
    } catch { res.status(500).json({ error: "Failed to fetch zones" }); }
  });

  router.post("/zones", async (req, res): Promise<void> => {
    const parsed = CreateZoneBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    try {
      const [zone] = await db.insert(zonesTable).values({
        symbol:          parsed.data.symbol,
        upperPrice:      parsed.data.upperPrice,
        lowerPrice:      parsed.data.lowerPrice,
        zoneType:        parsed.data.zoneType,
        timeframe:       parsed.data.timeframe,
        condition:       parsed.data.condition,
        notes:           parsed.data.notes ?? null,
        telegramEnabled: parsed.data.telegramEnabled,
        repeatMode: parsed.data.repeatMode,
        reminderCount: 0,
        nextReminderAt: null,
        isActive: true, isTriggered: false,
      }).returning();

      await alertEngine.reloadAlerts();
      res.status(201).json(serialize(zone));
    } catch { res.status(500).json({ error: "Failed to create zone" }); }
  });

  router.get("/zones/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, params.data.id));
      if (!zone) { res.status(404).json({ error: "Zone not found" }); return; }
      res.json(serialize(zone));
    } catch { res.status(500).json({ error: "Failed to fetch zone" }); }
  });

  router.patch("/zones/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = UpdateZoneBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    try {
      const [zone] = await db.update(zonesTable).set(parsed.data).where(eq(zonesTable.id, params.data.id)).returning();
      if (!zone) { res.status(404).json({ error: "Zone not found" }); return; }
      await alertEngine.reloadAlerts();
      res.json(serialize(zone));
    } catch { res.status(500).json({ error: "Failed to update zone" }); }
  });

  router.post("/zones/:id/reset", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [zone] = await db.update(zonesTable)
        .set({
          isTriggered: false,
          triggeredAt: null,
          triggeredPrice: null,
          isActive: true,
          cooldownUntil: null,
          reminderCount: 0,
          nextReminderAt: null,
        })
        .where(eq(zonesTable.id, params.data.id)).returning();
      if (!zone) { res.status(404).json({ error: "Zone not found" }); return; }
      await alertEngine.reloadAlerts();
      res.json(serialize(zone));
    } catch { res.status(500).json({ error: "Failed to reset zone" }); }
  });

  router.delete("/zones/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [zone] = await db.delete(zonesTable).where(eq(zonesTable.id, params.data.id)).returning();
      if (!zone) { res.status(404).json({ error: "Zone not found" }); return; }
      await alertEngine.reloadAlerts();
      res.sendStatus(204);
    } catch { res.status(500).json({ error: "Failed to delete zone" }); }
  });

  return router;
}
