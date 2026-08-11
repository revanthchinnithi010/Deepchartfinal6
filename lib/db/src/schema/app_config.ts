import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const appConfig = pgTable("app_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  valueEnc: text("value_enc").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppConfigRow = typeof appConfig.$inferSelect;
export type InsertAppConfigRow = typeof appConfig.$inferInsert;
