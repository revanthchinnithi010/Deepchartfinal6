import { Router, type IRouter } from "express";
import { db, chartLayoutsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const SlotParam = z.object({ slot: z.string().min(1).max(50) });

const UpsertBody = z.object({
  symbol:        z.string().min(1).max(30).optional(),
  interval:      z.string().min(1).max(10).optional(),
  market:        z.string().min(1).max(30).optional(),
  watchlistOpen: z.boolean().optional(),
  bottomOpen:    z.boolean().optional(),
  bottomHeight:  z.number().int().min(0).max(800).optional(),
});

function serialize(r: typeof chartLayoutsTable.$inferSelect) {
  return { ...r, updatedAt: r.updatedAt.toISOString() };
}

router.get("/chart-layouts/:slot", async (req, res): Promise<void> => {
  const params = SlotParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid slot" }); return; }

  try {
    const [row] = await db.select().from(chartLayoutsTable)
      .where(eq(chartLayoutsTable.slot, params.data.slot));
    if (!row) { res.status(404).json({ error: "Layout not found" }); return; }
    res.json(serialize(row));
  } catch { res.status(500).json({ error: "Failed to fetch chart layout" }); }
});

router.put("/chart-layouts/:slot", async (req, res): Promise<void> => {
  const params = SlotParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid slot" }); return; }

  const parsed = UpsertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const values: typeof chartLayoutsTable.$inferInsert = {
      slot:          params.data.slot,
      symbol:        parsed.data.symbol        ?? "BTCUSD",
      interval:      parsed.data.interval      ?? "60",
      market:        parsed.data.market        ?? "Crypto",
      watchlistOpen: parsed.data.watchlistOpen ?? true,
      bottomOpen:    parsed.data.bottomOpen    ?? true,
      bottomHeight:  parsed.data.bottomHeight  ?? 190,
      updatedAt:     new Date(),
    };

    const existing = await db.select().from(chartLayoutsTable)
      .where(eq(chartLayoutsTable.slot, params.data.slot));

    let row: typeof chartLayoutsTable.$inferSelect;
    if (existing.length > 0) {
      const updates: Partial<typeof chartLayoutsTable.$inferInsert> = { updatedAt: new Date() };
      if (parsed.data.symbol        !== undefined) updates.symbol        = parsed.data.symbol;
      if (parsed.data.interval      !== undefined) updates.interval      = parsed.data.interval;
      if (parsed.data.market        !== undefined) updates.market        = parsed.data.market;
      if (parsed.data.watchlistOpen !== undefined) updates.watchlistOpen = parsed.data.watchlistOpen;
      if (parsed.data.bottomOpen    !== undefined) updates.bottomOpen    = parsed.data.bottomOpen;
      if (parsed.data.bottomHeight  !== undefined) updates.bottomHeight  = parsed.data.bottomHeight;

      [row] = await db.update(chartLayoutsTable)
        .set(updates)
        .where(eq(chartLayoutsTable.slot, params.data.slot))
        .returning();
    } else {
      [row] = await db.insert(chartLayoutsTable).values(values).returning();
    }

    res.json(serialize(row));
  } catch { res.status(500).json({ error: "Failed to save chart layout" }); }
});

export default router;
