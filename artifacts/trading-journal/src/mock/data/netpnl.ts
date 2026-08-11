import { MOCK_CLOSED_TRADES } from "./trades";

// Shape expected by NetPnLAnalytics.tsx's TradeRow (pnl, exit_date) — sourced
// from Supabase in production. In DEV_MODE this replaces that Supabase call.
export const MOCK_NETPNL_TRADE_ROWS = MOCK_CLOSED_TRADES.map(t => ({
  pnl: t.pnl,
  exit_date: t.exitDate,
}));

export const MOCK_NETPNL_STATS = {
  bestTrade: Math.max(...MOCK_CLOSED_TRADES.map(t => t.pnl)),
  worstTrade: Math.min(...MOCK_CLOSED_TRADES.map(t => t.pnl)),
  averageWin: 142.30,
  averageLoss: -68.75,
  winningStreak: 6,
  losingStreak: 3,
  roi: 20.55, // % — matches ~$2,190.45 net pnl over a ~$10.6k starting balance
};
