import { createRng, range } from "../rng";

export interface MockEquityPoint { date: string; equity: number; pnl: number }
export interface MockWeeklyPnlPoint { week: string; pnl: number; trades: number }

const ANCHOR_NOW = new Date("2026-07-10T09:30:00Z");
const STARTING_EQUITY = 10_655.17; // account value minus 12mo net pnl, for a smooth curve into 12,845.62

// 12 months of daily equity-curve points, deterministic and monotonically
// trending upward with realistic day-to-day noise.
export function buildEquityCurve(): MockEquityPoint[] {
  const rng = createRng(20260710);
  const points: MockEquityPoint[] = [];
  const start = new Date(ANCHOR_NOW);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);

  let equity = STARTING_EQUITY;
  const totalDays = Math.round((ANCHOR_NOW.getTime() - start.getTime()) / 86_400_000);
  const targetEquity = 12_845.62;
  const driftPerDay = (targetEquity - STARTING_EQUITY) / totalDays;

  for (let d = new Date(start); d <= ANCHOR_NOW; d.setDate(d.getDate() + 1)) {
    const noise = range(rng, -55, 65);
    const pnl = Math.round((driftPerDay + noise * 0.4) * 100) / 100;
    equity = Math.round((equity + pnl) * 100) / 100;
    points.push({ date: d.toISOString().slice(0, 10), equity, pnl });
  }
  // Force the final point to match the exact requested account value.
  if (points.length) points[points.length - 1]!.equity = targetEquity;
  return points;
}

export const MOCK_EQUITY_CURVE: MockEquityPoint[] = buildEquityCurve();

export function buildWeeklyPnl(): MockWeeklyPnlPoint[] {
  const rng = createRng(20260711);
  const weeks: MockWeeklyPnlPoint[] = [];
  const start = new Date(ANCHOR_NOW);
  start.setDate(start.getDate() - 7 * 51);

  for (let i = 0; i < 52; i++) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + i * 7);
    weeks.push({
      week: weekStart.toISOString().slice(0, 10),
      pnl: Math.round(range(rng, -240, 420) * 100) / 100,
      trades: 1 + Math.floor(rng() * 6),
    });
  }
  return weeks;
}

export const MOCK_WEEKLY_PNL: MockWeeklyPnlPoint[] = buildWeeklyPnl();

// Monthly rollup used by report views ("Daily / Weekly / Monthly / Yearly").
export const MOCK_MONTHLY_PNL = [
  { month: "2025-08", pnl: 180.4 }, { month: "2025-09", pnl: -95.2 },
  { month: "2025-10", pnl: 245.6 }, { month: "2025-11", pnl: 410.8 },
  { month: "2025-12", pnl: 302.1 }, { month: "2026-01", pnl: 588.5 },
  { month: "2026-02", pnl: 471.3 }, { month: "2026-03", pnl: 640.9 },
  { month: "2026-04", pnl: 355.7 }, { month: "2026-05", pnl: 720.2 },
  { month: "2026-06", pnl: 861.4 }, { month: "2026-07", pnl: 428.8 },
];

export const MOCK_YEARLY_PNL = [
  { year: "2025", pnl: 1044.2 },
  { year: "2026", pnl: 4067.4 },
];
