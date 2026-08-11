import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const watchlistTable = pgTable("watchlist", {
  id:         serial("id").primaryKey(),
  symbol:     text("symbol").notNull().unique(),
  provider:   text("provider").notNull(),
  position:   integer("position").notNull().default(0),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WatchlistItem = typeof watchlistTable.$inferSelect;
export type InsertWatchlistItem = typeof watchlistTable.$inferInsert;
