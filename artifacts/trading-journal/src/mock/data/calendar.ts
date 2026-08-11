import { MOCK_CLOSED_TRADES } from "./trades";

export interface MockCalendarDay {
  date: string; // yyyy-mm-dd
  pnl: number;
  trades: number;
}

// Aggregate the generated trades by exit date (UTC slice).
// Only real trade days are included — no phantom backfill, so the calendar
// and the Daily Summary always draw from the same source of truth.
export function buildCalendarDays(_monthsBack: number, _endDate: Date): MockCalendarDay[] {
  const byDay = new Map<string, { pnl: number; trades: number }>();

  for (const t of MOCK_CLOSED_TRADES) {
    // Use the same UTC-slice the mock /api/trades filter uses.
    const day = t.exitDate.slice(0, 10);
    const existing = byDay.get(day);
    if (existing) { existing.pnl += t.pnl; existing.trades += 1; }
    else byDay.set(day, { pnl: t.pnl, trades: 1 });
  }

  return Array.from(byDay.entries())
    .map(([date, v]) => ({ date, pnl: Math.round(v.pnl * 100) / 100, trades: v.trades }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const ANCHOR_NOW = new Date("2026-07-10T09:30:00Z");
export const MOCK_CALENDAR_DAYS: MockCalendarDay[] = buildCalendarDays(3, ANCHOR_NOW);
