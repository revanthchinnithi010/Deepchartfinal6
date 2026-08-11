import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

export const livePricesTable = pgTable("live_prices", {
  symbol:    text("symbol").primaryKey(),
  price:     real("price").notNull(),
  provider:  text("provider").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LivePrice    = typeof livePricesTable.$inferSelect;
export type NewLivePrice = typeof livePricesTable.$inferInsert;
