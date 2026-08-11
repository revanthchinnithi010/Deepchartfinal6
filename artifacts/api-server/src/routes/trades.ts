import { Router, type IRouter } from "express";
import { desc, eq, and, sql, gte, lt } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import {
  ListTradesQueryParams,
  CreateTradeBody,
  GetTradeParams,
  GetTradeResponse,
  UpdateTradeParams,
  UpdateTradeBody,
  UpdateTradeResponse,
  DeleteTradeParams,
  ListTradesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/trades", async (req, res): Promise<void> => {
  const query = ListTradesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { page = 1, limit = 20, symbol, outcome, date } = query.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (symbol)  conditions.push(eq(tradesTable.symbol, symbol));
  if (outcome) conditions.push(eq(tradesTable.outcome, outcome));
  if (date) {
    // Match exactly how the calendar heatmap groups: by calendar date in DB timezone.
    // Using date(exit_date) = ? avoids UTC-boundary mismatches with TIMESTAMPTZ.
    conditions.push(sql`date(${tradesTable.exitDate}) = ${date}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [trades, countResult] = await Promise.all([
    db
      .select()
      .from(tradesTable)
      .where(whereClause)
      .orderBy(desc(tradesTable.exitDate))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(tradesTable)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const serialized = trades.map((t) => ({
    ...t,
    entryDate: t.entryDate.toISOString(),
    exitDate: t.exitDate.toISOString(),
    createdAt: t.createdAt.toISOString(),
  }));

  res.json(
    ListTradesResponse.parse({
      trades: serialized,
      total,
      page,
      limit,
    })
  );
});

router.post("/trades", async (req, res): Promise<void> => {
  const parsed = CreateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { entryPrice, exitPrice, quantity, side } = parsed.data;
  const rawPnl = side === "long"
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
  const pnl = Math.round(rawPnl * 100) / 100;
  const pnlPercent = Math.round((rawPnl / (entryPrice * quantity)) * 10000) / 100;
  const outcome = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";

  let riskRewardRatio: number | null = null;
  if (parsed.data.stopLoss && parsed.data.takeProfit) {
    const risk = Math.abs(entryPrice - parsed.data.stopLoss);
    const reward = Math.abs(parsed.data.takeProfit - entryPrice);
    riskRewardRatio = risk > 0 ? Math.round((reward / risk) * 100) / 100 : null;
  }

  const [trade] = await db
    .insert(tradesTable)
    .values({
      ...parsed.data,
      pnl,
      pnlPercent,
      outcome,
      riskRewardRatio,
      entryDate: new Date(parsed.data.entryDate),
      exitDate: new Date(parsed.data.exitDate),
    })
    .returning();

  res.status(201).json(
    GetTradeResponse.parse({
      ...trade,
      entryDate: trade.entryDate.toISOString(),
      exitDate: trade.exitDate.toISOString(),
      createdAt: trade.createdAt.toISOString(),
    })
  );
});

router.get("/trades/:id", async (req, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.id, params.data.id));

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(
    GetTradeResponse.parse({
      ...trade,
      entryDate: trade.entryDate.toISOString(),
      exitDate: trade.exitDate.toISOString(),
      createdAt: trade.createdAt.toISOString(),
    })
  );
});

router.patch("/trades/:id", async (req, res): Promise<void> => {
  const params = UpdateTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.entryDate) updateData.entryDate = new Date(parsed.data.entryDate);
  if (parsed.data.exitDate) updateData.exitDate = new Date(parsed.data.exitDate);

  const existing = await db.select().from(tradesTable).where(eq(tradesTable.id, params.data.id));
  if (!existing[0]) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const merged = { ...existing[0], ...parsed.data };
  const rawPnl =
    merged.side === "long"
      ? (merged.exitPrice - merged.entryPrice) * merged.quantity
      : (merged.entryPrice - merged.exitPrice) * merged.quantity;

  updateData.pnl = Math.round(rawPnl * 100) / 100;
  updateData.pnlPercent = Math.round((rawPnl / (merged.entryPrice * merged.quantity)) * 10000) / 100;
  updateData.outcome = rawPnl > 0 ? "win" : rawPnl < 0 ? "loss" : "breakeven";

  const [trade] = await db
    .update(tradesTable)
    .set(updateData)
    .where(eq(tradesTable.id, params.data.id))
    .returning();

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(
    UpdateTradeResponse.parse({
      ...trade,
      entryDate: trade.entryDate.toISOString(),
      exitDate: trade.exitDate.toISOString(),
      createdAt: trade.createdAt.toISOString(),
    })
  );
});

router.delete("/trades/:id", async (req, res): Promise<void> => {
  const params = DeleteTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db
    .delete(tradesTable)
    .where(eq(tradesTable.id, params.data.id))
    .returning();

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
