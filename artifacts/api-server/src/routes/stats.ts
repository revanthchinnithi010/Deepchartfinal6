import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import {
  GetStatsSummaryResponse,
  GetEquityCurveResponse,
  GetWeeklyPnlResponse,
  GetCalendarHeatmapQueryParams,
  GetCalendarHeatmapResponse,
  GetSymbolBreakdownResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/summary", async (_req, res): Promise<void> => {
  const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.exitDate));

  if (trades.length === 0) {
    res.json(
      GetStatsSummaryResponse.parse({
        netPnl: 0,
        winRate: 0,
        profitFactor: 0,
        averageRR: 0,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        averageWin: 0,
        averageLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        currentStreak: 0,
      })
    );
    return;
  }

  const wins = trades.filter((t) => t.outcome === "win");
  const losses = trades.filter((t) => t.outcome === "loss");
  const breakevens = trades.filter((t) => t.outcome === "breakeven");

  const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

  const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

  const rrTrades = trades.filter((t) => t.riskRewardRatio != null);
  const averageRR =
    rrTrades.length > 0
      ? rrTrades.reduce((sum, t) => sum + (t.riskRewardRatio ?? 0), 0) / rrTrades.length
      : 0;

  const averageWin = wins.length > 0 ? totalWins / wins.length : 0;
  const averageLoss = losses.length > 0 ? totalLosses / losses.length : 0;
  const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0;
  const largestLoss = losses.length > 0 ? Math.abs(Math.min(...losses.map((t) => t.pnl))) : 0;

  // current streak
  let currentStreak = 0;
  const sorted = [...trades].sort((a, b) => b.exitDate.getTime() - a.exitDate.getTime());
  if (sorted.length > 0) {
    const firstOutcome = sorted[0].outcome;
    if (firstOutcome === "win") {
      for (const t of sorted) {
        if (t.outcome === "win") currentStreak++;
        else break;
      }
    } else if (firstOutcome === "loss") {
      for (const t of sorted) {
        if (t.outcome === "loss") currentStreak--;
        else break;
      }
    }
  }

  res.json(
    GetStatsSummaryResponse.parse({
      netPnl: Math.round(netPnl * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      averageRR: Math.round(averageRR * 100) / 100,
      totalTrades: trades.length,
      winCount: wins.length,
      lossCount: losses.length,
      breakevenCount: breakevens.length,
      averageWin: Math.round(averageWin * 100) / 100,
      averageLoss: Math.round(averageLoss * 100) / 100,
      largestWin: Math.round(largestWin * 100) / 100,
      largestLoss: Math.round(largestLoss * 100) / 100,
      currentStreak,
    })
  );
});

router.get("/stats/equity-curve", async (_req, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .orderBy(tradesTable.exitDate);

  let equity = 10000;
  const points = trades.map((t) => {
    equity += t.pnl;
    return {
      date: t.exitDate.toISOString().split("T")[0],
      equity: Math.round(equity * 100) / 100,
      pnl: Math.round(t.pnl * 100) / 100,
    };
  });

  res.json(GetEquityCurveResponse.parse(points));
});

router.get("/stats/weekly-pnl", async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT
      to_char(date_trunc('week', exit_date), 'YYYY-MM-DD') AS week,
      SUM(pnl)::float AS pnl,
      COUNT(*)::int AS trades
    FROM trades
    GROUP BY date_trunc('week', exit_date)
    ORDER BY date_trunc('week', exit_date)
  `);

  const rows = (result as unknown as { rows: Array<{ week: string; pnl: number; trades: number }> }).rows;

  res.json(
    GetWeeklyPnlResponse.parse(
      rows.map((r) => ({
        week: r.week,
        pnl: Math.round(r.pnl * 100) / 100,
        trades: r.trades,
      }))
    )
  );
});

router.get("/stats/calendar-heatmap", async (req, res): Promise<void> => {
  const query = GetCalendarHeatmapQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { year, month } = query.data;

  let sqlQuery;
  if (year && month) {
    sqlQuery = sql`
      SELECT
        to_char(exit_date, 'YYYY-MM-DD') AS date,
        SUM(pnl)::float AS pnl,
        COUNT(*)::int AS trades
      FROM trades
      WHERE EXTRACT(YEAR FROM exit_date) = ${year}
        AND EXTRACT(MONTH FROM exit_date) = ${month}
      GROUP BY to_char(exit_date, 'YYYY-MM-DD')
      ORDER BY date
    `;
  } else if (year) {
    sqlQuery = sql`
      SELECT
        to_char(exit_date, 'YYYY-MM-DD') AS date,
        SUM(pnl)::float AS pnl,
        COUNT(*)::int AS trades
      FROM trades
      WHERE EXTRACT(YEAR FROM exit_date) = ${year}
      GROUP BY to_char(exit_date, 'YYYY-MM-DD')
      ORDER BY date
    `;
  } else {
    sqlQuery = sql`
      SELECT
        to_char(exit_date, 'YYYY-MM-DD') AS date,
        SUM(pnl)::float AS pnl,
        COUNT(*)::int AS trades
      FROM trades
      GROUP BY to_char(exit_date, 'YYYY-MM-DD')
      ORDER BY date
    `;
  }

  const result = await db.execute(sqlQuery);
  const rows = (result as unknown as { rows: Array<{ date: string; pnl: number; trades: number }> }).rows;

  res.json(
    GetCalendarHeatmapResponse.parse(
      rows.map((r) => ({
        date: r.date,
        pnl: Math.round(r.pnl * 100) / 100,
        trades: r.trades,
      }))
    )
  );
});

router.get("/stats/symbol-breakdown", async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT
      symbol,
      SUM(pnl)::float AS pnl,
      COUNT(*)::int AS trades,
      ROUND(
        COUNT(CASE WHEN outcome = 'win' THEN 1 END) * 100.0 / COUNT(*),
        2
      )::float AS win_rate
    FROM trades
    GROUP BY symbol
    ORDER BY SUM(pnl) DESC
  `);

  const rows = (result as unknown as { rows: Array<{ symbol: string; pnl: number; trades: number; win_rate: number }> }).rows;

  res.json(
    GetSymbolBreakdownResponse.parse(
      rows.map((r) => ({
        symbol: r.symbol,
        pnl: Math.round(r.pnl * 100) / 100,
        trades: r.trades,
        winRate: r.win_rate,
      }))
    )
  );
});

export default router;
