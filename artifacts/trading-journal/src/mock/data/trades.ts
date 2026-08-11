import { createRng } from "../rng";

export interface MockTrade {
  id: number;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  outcome: "win" | "loss" | "breakeven";
  riskRewardRatio: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  notes: string | null;
  tags: string | null;
  entryDate: string;
  exitDate: string;
  durationMinutes: number;
}

const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "NAS100", "US30", "XAUUSD", "EURUSD", "GBPUSD", "USOIL",
];

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Generates N trades ending on `endDate`, walking backwards, deterministically.
function buildTrades(count: number, endDate: Date): MockTrade[] {
  const rng = createRng(20260710);
  const trades: MockTrade[] = [];
  let cursor = new Date(endDate);

  for (let i = 0; i < count; i++) {
    const symbol = SYMBOLS[i % SYMBOLS.length]!;
    const side: "long" | "short" = rng() > 0.48 ? "long" : "short";
    const isWin = rng() < 0.648; // ~64.8% win rate to match dashboard
    const basePrice =
      symbol === "BTCUSDT" ? 64000 : symbol === "ETHUSDT" ? 3400 : symbol === "SOLUSDT" ? 148 :
      symbol === "NAS100" ? 18450 : symbol === "US30" ? 39600 : symbol === "XAUUSD" ? 2345 :
      symbol === "EURUSD" ? 1.091 : symbol === "GBPUSD" ? 1.271 : 82.4;

    const entryPrice = Math.round(basePrice * (1 + (rng() - 0.5) * 0.02) * 10000) / 10000;
    const moveFrac = (isWin ? 1 : -1) * (0.002 + rng() * 0.018) * (side === "long" ? 1 : -1);
    const exitPrice = Math.round(entryPrice * (1 + moveFrac) * 10000) / 10000;

    const quantity = symbol.endsWith("USDT")
      ? Math.round((0.1 + rng() * 2) * 100) / 100
      : Math.round((1 + rng() * 4));

    const rawPnl = (side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice) * quantity;
    const pnl = Math.round(rawPnl * 100) / 100;
    const pnlPercent = Math.round((pnl / (entryPrice * quantity)) * 10000) / 100;
    const outcome: MockTrade["outcome"] = pnl > 1 ? "win" : pnl < -1 ? "loss" : "breakeven";

    const durationMinutes = Math.round(15 + rng() * 600);
    const exit = new Date(cursor);
    const entry = new Date(exit.getTime() - durationMinutes * 60_000);

    trades.push({
      id: count - i,
      symbol,
      side,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      pnlPercent,
      outcome,
      riskRewardRatio: Math.round((0.8 + rng() * 2.2) * 100) / 100,
      stopLoss: side === "long" ? Math.round(entryPrice * 0.985 * 100) / 100 : Math.round(entryPrice * 1.015 * 100) / 100,
      takeProfit: side === "long" ? Math.round(entryPrice * 1.03 * 100) / 100 : Math.round(entryPrice * 0.97 * 100) / 100,
      notes: rng() > 0.5 ? "Followed plan, clean execution." : "Entered a bit late, managed risk well.",
      tags: rng() > 0.5 ? "trend,breakout" : "reversal,support",
      entryDate: entry.toISOString(),
      exitDate: exit.toISOString(),
      durationMinutes,
    });

    // Walk cursor backwards 4-20 hours for the next (older) trade.
    cursor = new Date(cursor.getTime() - (4 + rng() * 16) * 3_600_000);
  }

  return trades;
}

// Anchor "now" — matches the project's current date context (2026-07-10).
const ANCHOR_NOW = new Date("2026-07-10T09:30:00Z");

const RAW_CLOSED_TRADES: MockTrade[] = buildTrades(60, ANCHOR_NOW);

// Calibrate the total realized PNL across all closed trades to exactly match
// the Dashboard's requested Realized PNL ($1,942.10), so it's consistent with
// the combined Delta + cTrader portfolio math (see accountTypes.realizedPnlUSD).
const TARGET_REALIZED_PNL = 1942.10;
(function calibrateRealizedPnl() {
  const currentTotal = RAW_CLOSED_TRADES.reduce((sum, t) => sum + t.pnl, 0);
  const adjustment = Math.round((TARGET_REALIZED_PNL - currentTotal) * 100) / 100;
  const anchor = RAW_CLOSED_TRADES[0]!;
  anchor.pnl = Math.round((anchor.pnl + adjustment) * 100) / 100;
  anchor.outcome = anchor.pnl > 1 ? "win" : anchor.pnl < -1 ? "loss" : "breakeven";
  anchor.pnlPercent = Math.round((anchor.pnl / (anchor.entryPrice * anchor.quantity)) * 10000) / 100;
})();

export const MOCK_CLOSED_TRADES: MockTrade[] = RAW_CLOSED_TRADES;

// Four open positions, mirroring the broker positions in data/portfolio.ts,
// surfaced through the journal's own /api/trades feed (exitPrice === null)
// so the Dashboard's "Open Positions" count and widgets stay consistent.
export const MOCK_OPEN_TRADES: MockTrade[] = [
  { id: 9001, symbol: "BTCUSDT", side: "long",  entryPrice: 64180.5, exitPrice: NaN, quantity: 0.25, pnl: 165.4,  pnlPercent: 1.02,  outcome: "win",  riskRewardRatio: 2.1, stopLoss: 62500,   takeProfit: 68500,  notes: "Open — riding the breakout continuation.", tags: "trend,breakout", entryDate: "2026-07-08T10:15:00Z", exitDate: "", durationMinutes: 0 },
  { id: 9002, symbol: "ETHUSDT", side: "short", entryPrice: 3412.8,  exitPrice: NaN, quantity: 1.5,  pnl: 51.9,   pnlPercent: 1.01,  outcome: "win",  riskRewardRatio: 1.8, stopLoss: 3520,     takeProfit: 3150,   notes: "Open — fading the local high.",           tags: "reversal",       entryDate: "2026-07-09T06:40:00Z", exitDate: "", durationMinutes: 0 },
  { id: 9003, symbol: "SOLUSDT", side: "long",  entryPrice: 148.2,   exitPrice: NaN, quantity: 12,   pnl: -30.6,  pnlPercent: -1.72, outcome: "loss", riskRewardRatio: 1.5, stopLoss: 140,      takeProfit: 165,    notes: "Open — range breakout thesis, underwater.", tags: "range",        entryDate: "2026-07-09T09:05:00Z", exitDate: "", durationMinutes: 0 },
  { id: 9004, symbol: "NAS100",  side: "long",  entryPrice: 18420.4, exitPrice: NaN, quantity: 2,    pnl: 62.65,  pnlPercent: 0.34,  outcome: "win",  riskRewardRatio: 2.4, stopLoss: 18150,   takeProfit: 18900,  notes: "Open — momentum continuation above ATH.", tags: "trend,indices", entryDate: "2026-07-09T13:20:00Z", exitDate: "", durationMinutes: 0 },
];

// Newest-first: open positions (no exit yet) surface above closed history.
export const MOCK_TRADES: MockTrade[] = [...MOCK_OPEN_TRADES, ...MOCK_CLOSED_TRADES];

export const MOCK_RECENT_TRADES = MOCK_CLOSED_TRADES.slice(0, 25);

export function mockTradeDuration(t: MockTrade): string {
  return fmtDuration(t.durationMinutes);
}

// Shape matching the generated `Trade` schema used by react-query hooks.
export function toApiTrade(t: MockTrade) {
  const isOpen = !t.exitDate;
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    entryPrice: t.entryPrice,
    exitPrice: isOpen ? null : t.exitPrice,
    quantity: t.quantity,
    pnl: t.pnl,
    pnlPercent: t.pnlPercent,
    outcome: t.outcome,
    riskRewardRatio: t.riskRewardRatio,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    notes: t.notes,
    tags: t.tags,
    entryDate: t.entryDate,
    exitDate: isOpen ? null : t.exitDate,
  };
}
