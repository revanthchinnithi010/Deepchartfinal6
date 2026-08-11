import { pgTable, text, serial, timestamp, real, boolean, integer } from "drizzle-orm/pg-core";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  condition: text("condition").notNull(),
  targetPrice: real("target_price").notNull(),
  message: text("message"),
  isActive: boolean("is_active").notNull().default(true),
  isTriggered: boolean("is_triggered").notNull().default(false),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  triggeredPrice: real("triggered_price"),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
  // Repeat-notification policy persisted in DB so the backend is authoritative.
  repeatMode: text("repeat_mode").notNull().default("three_reminders"),
  // Total notifications already sent, including the initial trigger.
  reminderCount: integer("reminder_count").notNull().default(0),
  // Next backend reminder time. NULL means no pending reminder.
  nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Alert = typeof alertsTable.$inferSelect;
export type InsertAlert = typeof alertsTable.$inferInsert;
