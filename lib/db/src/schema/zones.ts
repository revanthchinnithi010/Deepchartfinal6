import { pgTable, text, serial, timestamp, real, boolean, integer } from "drizzle-orm/pg-core";

export const zonesTable = pgTable("zones", {
  id:              serial("id").primaryKey(),
  symbol:          text("symbol").notNull(),
  upperPrice:      real("upper_price").notNull(),
  lowerPrice:      real("lower_price").notNull(),
  zoneType:        text("zone_type").notNull().default("support_resistance"),
  timeframe:       text("timeframe").notNull().default("1H"),
  condition:       text("condition").notNull().default("touch"),
  notes:           text("notes"),
  isActive:        boolean("is_active").notNull().default(true),
  isTriggered:     boolean("is_triggered").notNull().default(false),
  triggeredAt:     timestamp("triggered_at", { withTimezone: true }),
  triggeredPrice:  real("triggered_price"),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
  repeatMode: text("repeat_mode").notNull().default("three_reminders"),
  reminderCount: integer("reminder_count").notNull().default(0),
  nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }),
  cooldownUntil:   timestamp("cooldown_until", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Zone = typeof zonesTable.$inferSelect;
export type InsertZone = typeof zonesTable.$inferInsert;
