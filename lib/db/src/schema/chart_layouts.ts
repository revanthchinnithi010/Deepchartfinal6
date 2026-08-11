import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const chartLayoutsTable = pgTable("chart_layouts", {
  slot:          text("slot").primaryKey(),
  symbol:        text("symbol").notNull().default("BTCUSD"),
  interval:      text("interval").notNull().default("60"),
  market:        text("market").notNull().default("Crypto"),
  watchlistOpen: boolean("watchlist_open").notNull().default(true),
  bottomOpen:    boolean("bottom_open").notNull().default(true),
  bottomHeight:  integer("bottom_height").notNull().default(190),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChartLayout       = typeof chartLayoutsTable.$inferSelect;
export type InsertChartLayout = typeof chartLayoutsTable.$inferInsert;
