import { pgTable, text, serial, timestamp, real, boolean, integer } from "drizzle-orm/pg-core";

export const trendlinesTable = pgTable("trendlines", {
  id:              serial("id").primaryKey(),
  symbol:          text("symbol").notNull(),
  timeframe:       text("timeframe").notNull().default("1H"),
  point1Price:     real("point1_price").notNull(),
  point1Time:      timestamp("point1_time", { withTimezone: true }).notNull(),
  point2Price:     real("point2_price").notNull(),
  point2Time:      timestamp("point2_time", { withTimezone: true }).notNull(),
  condition:       text("condition").notNull().default("break"),
  drawingType:     text("drawing_type").notNull().default("trendline"),
  alertStatus:     text("alert_status").notNull().default("active"),
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
  // ATR-Based Proximity fields
  atrPeriod:         integer("atr_period").notNull().default(14),
  atrMultiplier:     real("atr_multiplier").notNull().default(0.15),
  // Link back to the chart drawing that spawned this alert (e.g. "TL-004")
  drawingDisplayId:  text("drawing_display_id"),
});

export type Trendline = typeof trendlinesTable.$inferSelect;
export type InsertTrendline = typeof trendlinesTable.$inferInsert;
