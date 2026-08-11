/**
 * DEMO DATA — purely for display purposes when no real trade history exists.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  To replace with live data: remove the demo fallback in             │
 * │  pnl-analytics.tsx where `IS_DEMO` is set. No other changes needed. │
 * └─────────────────────────────────────────────────────────────────────┘
 */

// ── Seeded LCG PRNG (deterministic — same seed = same data every render) ──
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 4294967295;
  };
}

// ── Build YYYY-MM-DD string without UTC offset drift ──────────────────────
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Types matching the API response shapes ────────────────────────────────
export interface DemoEquityPoint  { date: string; pnl: number; equity: number }
export interface DemoCalendarDay  { date: string; pnl: number; trades: number }
export interface DemoStats {
  netPnl: number; winRate: number; profitFactor: number; averageRR: number;
  totalTrades: number; winCount: number; lossCount: number; breakevenCount: number;
  averageWin: number; averageLoss: number; largestWin: number; largestLoss: number;
  currentStreak: number;
}

// ── Generate equity curve (past 12 months of weekday trading sessions) ─────
function buildEquityCurve(): DemoEquityPoint[] {
  const rng   = makePrng(0xc0ffee42);
  const today = new Date();
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);

  const raw: { date: string; pnl: number }[] = [];
  const cur = new Date(start);

  while (cur <= today) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && rng() < 0.76) {
      const isWin   = rng() < 0.68;
      // Win: $18 – $845 (right-skewed — most wins are moderate)
      // Loss: $10 – $312 (losses are tighter)
      const rawPnl  = isWin
        ? 18 + Math.pow(rng(), 1.6) * 827        // skewed right
        : -(10 + Math.pow(rng(), 1.4) * 302);    // tighter distribution
      raw.push({ date: ymd(cur), pnl: rawPnl });
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (raw.length === 0) return [];

  // Scale so net PNL lands exactly on $12,480
  const TARGET_NET = 12480;
  const actualNet  = raw.reduce((s, p) => s + p.pnl, 0);
  const scale      = TARGET_NET / actualNet;

  let runningEquity = 10000;
  return raw.map(p => {
    const pnl = Math.round(p.pnl * scale * 100) / 100;
    runningEquity = Math.round((runningEquity + pnl) * 100) / 100;
    return { date: p.date, pnl, equity: runningEquity };
  });
}

// ── Generate calendar heatmap for any given month ──────────────────────────
export function getDemoCalendarHeatmap(year: number, month: number): DemoCalendarDay[] {
  // Use year+month as seed so each month is different but always the same
  const rng      = makePrng(0xbeef0000 + year * 100 + month);
  const days: DemoCalendarDay[] = [];
  const daysInMo = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMo; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) continue;                  // skip weekends
    if (rng() > 0.78) continue;                            // ~22% no-trade days

    const isWin  = rng() < 0.68;
    const pnl    = isWin
      ? Math.round((20 + Math.pow(rng(), 1.6) * 600) * 100) / 100
      : -Math.round((12 + Math.pow(rng(), 1.4) * 240) * 100) / 100;
    const trades = Math.floor(rng() * 3) + 1;             // 1–3 trades per day

    const mm = String(month).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    days.push({ date: `${year}-${mm}-${dd}`, pnl, trades });
  }
  return days;
}

// ── Singleton equity curve (built once at module load) ─────────────────────
export const DEMO_EQUITY_CURVE: DemoEquityPoint[] = buildEquityCurve();

// ── Stats summary (pre-computed to match the user-specified target values) ───
export const DEMO_STATS: DemoStats = {
  // Exact values requested
  netPnl:        12480,
  winRate:        68,       // %
  profitFactor:    2.15,
  averageRR:       2.4,
  totalTrades:   186,
  winCount:      127,       // ceil(186 × 0.68)
  lossCount:      59,       // floor(186 × 0.32)
  breakevenCount:  0,
  averageWin:    186.02,    // grossProfit / winCount  (GP ≈ $23,624)
  averageLoss:   188.54,    // grossLoss   / lossCount (GL ≈ $11,124)
  largestWin:    845,
  largestLoss:   312,
  currentStreak:   3,       // 3-trade win streak
};
