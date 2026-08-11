import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const brokerAccounts = pgTable("broker_accounts", {
  id: serial("id").primaryKey(),
  brokerId: text("broker_id").notNull(),
  label: text("label").notNull().default(""),
  apiKeyEnc: text("api_key_enc").notNull(),
  apiSecretEnc: text("api_secret_enc").notNull(),
  apiToken: text("api_token").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrokerAccountRow = typeof brokerAccounts.$inferSelect;
export type InsertBrokerAccountRow = typeof brokerAccounts.$inferInsert;
