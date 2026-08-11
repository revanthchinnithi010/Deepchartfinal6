import { Router, type IRouter } from "express";
import { db, calendarEventsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const CreateBody = z.object({
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title:     z.string().min(1).max(200),
  content:   z.string().max(5000).optional(),
  eventType: z.enum(["note", "economic", "reminder", "trade_review"]).optional().default("note"),
});

const UpdateBody = z.object({
  title:     z.string().min(1).max(200).optional(),
  content:   z.string().max(5000).optional().nullable(),
  eventType: z.enum(["note", "economic", "reminder", "trade_review"]).optional(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const IdParam  = z.object({ id: z.coerce.number().int().positive() });
const RangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function serialize(e: typeof calendarEventsTable.$inferSelect) {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

router.get("/calendar-events", async (req, res): Promise<void> => {
  try {
    const q = RangeQuery.safeParse(req.query);
    let rows = db.select().from(calendarEventsTable);

    if (q.success && q.data.date) {
      const result = await db.select().from(calendarEventsTable)
        .where(eq(calendarEventsTable.date, q.data.date));
      res.json(result.map(serialize));
      return;
    }

    if (q.success && q.data.from && q.data.to) {
      const result = await db.select().from(calendarEventsTable)
        .where(and(
          gte(calendarEventsTable.date, q.data.from),
          lte(calendarEventsTable.date, q.data.to),
        ));
      res.json(result.map(serialize));
      return;
    }

    const result = await rows;
    res.json(result.map(serialize));
  } catch { res.status(500).json({ error: "Failed to fetch calendar events" }); }
});

router.post("/calendar-events", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [row] = await db.insert(calendarEventsTable).values({
      date:      parsed.data.date,
      title:     parsed.data.title,
      content:   parsed.data.content ?? null,
      eventType: parsed.data.eventType,
    }).returning();
    res.status(201).json(serialize(row));
  } catch { res.status(500).json({ error: "Failed to create calendar event" }); }
});

router.patch("/calendar-events/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const updates: Partial<typeof calendarEventsTable.$inferInsert> = {};
    if (parsed.data.title     !== undefined) updates.title     = parsed.data.title;
    if (parsed.data.content   !== undefined) updates.content   = parsed.data.content;
    if (parsed.data.eventType !== undefined) updates.eventType = parsed.data.eventType;
    if (parsed.data.date      !== undefined) updates.date      = parsed.data.date;
    updates.updatedAt = new Date();

    const [row] = await db.update(calendarEventsTable)
      .set(updates)
      .where(eq(calendarEventsTable.id, params.data.id))
      .returning();

    if (!row) { res.status(404).json({ error: "Event not found" }); return; }
    res.json(serialize(row));
  } catch { res.status(500).json({ error: "Failed to update calendar event" }); }
});

router.delete("/calendar-events/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [row] = await db.delete(calendarEventsTable)
      .where(eq(calendarEventsTable.id, params.data.id))
      .returning();
    if (!row) { res.status(404).json({ error: "Event not found" }); return; }
    res.sendStatus(204);
  } catch { res.status(500).json({ error: "Failed to delete calendar event" }); }
});

export default router;
