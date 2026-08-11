import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";

export const alertEventsTable = pgTable("alert_events", {
  id:             serial("id").primaryKey(),
  alertId:        integer("alert_id"),
  alertType:      text("alert_type").notNull(),
  symbol:         text("symbol").notNull(),
  condition:      text("condition").notNull(),
  priceAtTrigger: real("price_at_trigger").notNull(),
  message:        text("message"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AlertEvent = typeof alertEventsTable.$inferSelect;
export type InsertAlertEvent = typeof alertEventsTable.$inferInsert;
