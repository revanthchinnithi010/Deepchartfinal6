import { Router, type IRouter } from "express";
import { db, alertEventsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { z } from "zod";

const QueryParams = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  symbol: z.string().optional(),
  alertType: z.enum(["price","zone","trendline"]).optional(),
});

const alertEventsRouter: IRouter = Router();

alertEventsRouter.get("/alert-events", async (req, res): Promise<void> => {
  const parsed = QueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const events = await db
      .select()
      .from(alertEventsTable)
      .orderBy(desc(alertEventsTable.createdAt))
      .limit(parsed.data.limit);

    res.json(events.map(e => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })));
  } catch { res.status(500).json({ error: "Failed to fetch alert events" }); }
});

export default alertEventsRouter;
