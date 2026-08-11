import { Router, type IRouter } from "express";
import { db, tradesTable } from "@workspace/db";
import { asc } from "drizzle-orm";

export function createAnalyticsRouter(): IRouter {
  const router: IRouter = Router();

  router.get("/analytics/all", async (_req, res): Promise<void> => {
    try {
      const trades = await db.select().from(tradesTable).orderBy(asc(tradesTable.exitDate));

      // ── Drawdown ───────────────────────────────────────────────────────────
      let peak = 10000, equity = 10000, maxDrawdown = 0, maxDrawdownPct = 0, currentDrawdown = 0;
      const drawdownPoints = trades.map((t) => {
        equity += t.pnl;
        if (equity > peak) peak = equity;
        currentDrawdown = peak - equity;
        const currentDrawdownPct = peak > 0 ? (currentDrawdown / peak) * 100 : 0;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
        if (currentDrawdownPct > maxDrawdownPct) maxDrawdownPct = currentDrawdownPct;
        return {
          date: t.exitDate.toISOString().split("T")[0],
          equity: Math.round(equity * 100) / 100,
          drawdown: Math.round(currentDrawdown * 100) / 100,
          drawdownPct: Math.round(currentDrawdownPct * 100) / 100,
        };
      });

      // ── Streaks ────────────────────────────────────────────────────────────
      let maxWinStreak = 0, maxLossStreak = 0, winStreak = 0, lossStreak = 0;
      for (const t of trades) {
        if (t.outcome === "win") { winStreak++; lossStreak = 0; }
        else if (t.outcome === "loss") { lossStreak++; winStreak = 0; }
        else { winStreak = 0; lossStreak = 0; }
        if (winStreak > maxWinStreak) maxWinStreak = winStreak;
        if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
      }
      const lastTrade = trades[trades.length - 1];
      const currentWinStreak  = lastTrade?.outcome === "win"  ? winStreak  : 0;
      const currentLossStreak = lastTrade?.outcome === "loss" ? lossStreak : 0;

      // ── Session performance ────────────────────────────────────────────────
      const sessions: Record<string, { pnl: number; trades: number; wins: number }> = {
        asian: { pnl: 0, trades: 0, wins: 0 },
        london: { pnl: 0, trades: 0, wins: 0 },
        newyork: { pnl: 0, trades: 0, wins: 0 },
        other: { pnl: 0, trades: 0, wins: 0 },
      };
      for (const t of trades) {
        const hour = t.exitDate.getUTCHours();
        let session: string;
        if (hour >= 0 && hour < 8) session = "asian";
        else if (hour >= 8 && hour < 12) session = "london";
        else if (hour >= 13 && hour < 21) session = "newyork";
        else session = "other";
        sessions[session]!.pnl += t.pnl;
        sessions[session]!.trades += 1;
        if (t.outcome === "win") sessions[session]!.wins += 1;
      }
      const sessionPerformance = Object.entries(sessions).map(([session, data]) => ({
        session,
        pnl: Math.round(data.pnl * 100) / 100,
        trades: data.trades,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
      }));

      // ── Risk metrics ───────────────────────────────────────────────────────
      let riskMetrics = { sharpeRatio: 0, sortinoRatio: 0, expectancy: 0, payoffRatio: 0, avgWin: 0, avgLoss: 0, totalTrades: trades.length };
      if (trades.length > 0) {
        const pnls = trades.map((t) => t.pnl);
        const avg = pnls.reduce((s, p) => s + p, 0) / pnls.length;
        const variance = pnls.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / pnls.length;
        const stddev = Math.sqrt(variance);
        const negPnls = pnls.filter((p) => p < 0);
        const downVariance = negPnls.length > 0 ? negPnls.reduce((s, p) => s + Math.pow(p, 2), 0) / negPnls.length : 0;
        const downDev = Math.sqrt(downVariance);
        const wins = trades.filter((t) => t.outcome === "win");
        const losses = trades.filter((t) => t.outcome === "loss");
        const avgW = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
        const avgL = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
        const wr = wins.length / trades.length;
        riskMetrics = {
          sharpeRatio: Math.round((stddev > 0 ? avg / stddev : 0) * 100) / 100,
          sortinoRatio: Math.round((downDev > 0 ? avg / downDev : 0) * 100) / 100,
          expectancy: Math.round((wr * avgW - (1 - wr) * avgL) * 100) / 100,
          payoffRatio: Math.round((avgL > 0 ? avgW / avgL : 0) * 100) / 100,
          avgWin: Math.round(avgW * 100) / 100,
          avgLoss: Math.round(avgL * 100) / 100,
          totalTrades: trades.length,
        };
      }

      // ── Day of week ────────────────────────────────────────────────────────
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const byDay: Record<number, { pnl: number; trades: number; wins: number }> = {};
      for (let i = 0; i < 7; i++) byDay[i] = { pnl: 0, trades: 0, wins: 0 };
      for (const t of trades) {
        const dow = t.exitDate.getDay();
        byDay[dow]!.pnl += t.pnl;
        byDay[dow]!.trades += 1;
        if (t.outcome === "win") byDay[dow]!.wins += 1;
      }
      const dayOfWeek = Object.entries(byDay).map(([dow, data]) => ({
        day: days[Number(dow)],
        pnl: Math.round(data.pnl * 100) / 100,
        trades: data.trades,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
      }));

      res.json({
        drawdown: {
          points: drawdownPoints,
          maxDrawdown: Math.round(maxDrawdown * 100) / 100,
          maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
          currentEquity: Math.round(equity * 100) / 100,
        },
        streaks: { maxWinStreak, maxLossStreak, currentWinStreak, currentLossStreak },
        sessionPerformance,
        riskMetrics,
        dayOfWeek,
      });
    } catch {
      res.status(500).json({ error: "Failed to compute analytics" });
    }
  });

  router.get("/analytics/drawdown", async (_req, res): Promise<void> => {
    try {
      const trades = await db.select().from(tradesTable).orderBy(asc(tradesTable.exitDate));

      let peak = 10000;
      let equity = 10000;
      let maxDrawdown = 0;
      let maxDrawdownPct = 0;
      let currentDrawdown = 0;

      const points = trades.map((t) => {
        equity += t.pnl;
        if (equity > peak) peak = equity;
        currentDrawdown = peak - equity;
        const currentDrawdownPct = peak > 0 ? (currentDrawdown / peak) * 100 : 0;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
        if (currentDrawdownPct > maxDrawdownPct) maxDrawdownPct = currentDrawdownPct;

        return {
          date: t.exitDate.toISOString().split("T")[0],
          equity: Math.round(equity * 100) / 100,
          drawdown: Math.round(currentDrawdown * 100) / 100,
          drawdownPct: Math.round(currentDrawdownPct * 100) / 100,
        };
      });

      res.json({
        points,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
        currentEquity: Math.round(equity * 100) / 100,
      });
    } catch {
      res.status(500).json({ error: "Failed to compute drawdown" });
    }
  });

  router.get("/analytics/streaks", async (_req, res): Promise<void> => {
    try {
      const trades = await db.select().from(tradesTable).orderBy(asc(tradesTable.exitDate));

      let maxWinStreak = 0;
      let maxLossStreak = 0;
      let currentWinStreak = 0;
      let currentLossStreak = 0;
      let winStreak = 0;
      let lossStreak = 0;

      for (const t of trades) {
        if (t.outcome === "win") {
          winStreak++;
          lossStreak = 0;
        } else if (t.outcome === "loss") {
          lossStreak++;
          winStreak = 0;
        } else {
          winStreak = 0;
          lossStreak = 0;
        }
        if (winStreak > maxWinStreak) maxWinStreak = winStreak;
        if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
      }

      const last = trades[trades.length - 1];
      if (last?.outcome === "win") currentWinStreak = winStreak;
      else if (last?.outcome === "loss") currentLossStreak = lossStreak;

      res.json({ maxWinStreak, maxLossStreak, currentWinStreak, currentLossStreak });
    } catch {
      res.status(500).json({ error: "Failed to compute streaks" });
    }
  });

  router.get("/analytics/session-performance", async (_req, res): Promise<void> => {
    try {
      const trades = await db.select().from(tradesTable).orderBy(asc(tradesTable.exitDate));

      const sessions: Record<string, { pnl: number; trades: number; wins: number }> = {
        asian: { pnl: 0, trades: 0, wins: 0 },
        london: { pnl: 0, trades: 0, wins: 0 },
        newyork: { pnl: 0, trades: 0, wins: 0 },
        other: { pnl: 0, trades: 0, wins: 0 },
      };

      for (const t of trades) {
        const hour = t.exitDate.getUTCHours();
        let session: string;
        if (hour >= 0 && hour < 8) session = "asian";
        else if (hour >= 8 && hour < 12) session = "london";
        else if (hour >= 13 && hour < 21) session = "newyork";
        else session = "other";

        sessions[session]!.pnl += t.pnl;
        sessions[session]!.trades += 1;
        if (t.outcome === "win") sessions[session]!.wins += 1;
      }

      const result = Object.entries(sessions).map(([session, data]) => ({
        session,
        pnl: Math.round(data.pnl * 100) / 100,
        trades: data.trades,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
      }));

      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to compute session performance" });
    }
  });

  router.get("/analytics/risk-metrics", async (_req, res): Promise<void> => {
    try {
      const trades = await db.select().from(tradesTable).orderBy(asc(tradesTable.exitDate));
      if (trades.length === 0) {
        res.json({ sharpeRatio: 0, sortinoRatio: 0, expectancy: 0, payoffRatio: 0 });
        return;
      }

      const pnls = trades.map((t) => t.pnl);
      const avg = pnls.reduce((s, p) => s + p, 0) / pnls.length;
      const variance = pnls.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / pnls.length;
      const stddev = Math.sqrt(variance);

      const negPnls = pnls.filter((p) => p < 0);
      const downVariance = negPnls.length > 0
        ? negPnls.reduce((s, p) => s + Math.pow(p, 2), 0) / negPnls.length
        : 0;
      const downDev = Math.sqrt(downVariance);

      const wins = trades.filter((t) => t.outcome === "win");
      const losses = trades.filter((t) => t.outcome === "loss");
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
      const winRate = trades.length > 0 ? wins.length / trades.length : 0;
      const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
      const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

      res.json({
        sharpeRatio: Math.round((stddev > 0 ? avg / stddev : 0) * 100) / 100,
        sortinoRatio: Math.round((downDev > 0 ? avg / downDev : 0) * 100) / 100,
        expectancy: Math.round(expectancy * 100) / 100,
        payoffRatio: Math.round(payoffRatio * 100) / 100,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        totalTrades: trades.length,
      });
    } catch {
      res.status(500).json({ error: "Failed to compute risk metrics" });
    }
  });

  router.get("/analytics/day-of-week", async (_req, res): Promise<void> => {
    try {
      const trades = await db.select().from(tradesTable);
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const byDay: Record<number, { pnl: number; trades: number; wins: number }> = {};
      for (let i = 0; i < 7; i++) byDay[i] = { pnl: 0, trades: 0, wins: 0 };

      for (const t of trades) {
        const dow = t.exitDate.getDay();
        byDay[dow]!.pnl += t.pnl;
        byDay[dow]!.trades += 1;
        if (t.outcome === "win") byDay[dow]!.wins += 1;
      }

      const result = Object.entries(byDay).map(([dow, data]) => ({
        day: days[Number(dow)],
        pnl: Math.round(data.pnl * 100) / 100,
        trades: data.trades,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
      }));

      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to compute day of week performance" });
    }
  });

  return router;
}
