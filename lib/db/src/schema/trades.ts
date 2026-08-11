import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // "long" | "short"
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price").notNull(),
  quantity: real("quantity").notNull(),
  pnl: real("pnl").notNull(),
  pnlPercent: real("pnl_percent"),
  outcome: text("outcome").notNull(), // "win" | "loss" | "breakeven"
  riskRewardRatio: real("risk_reward_ratio"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  notes: text("notes"),
  tags: text("tags"),
  tvLink: text("tv_link"),
  screenshot: text("screenshot"),
  setupTags: text("setup_tags"),
  mistakeTags: text("mistake_tags"),
  entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
  exitDate: timestamp("exit_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true, createdAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
