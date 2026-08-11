import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const calendarEventsTable = pgTable("calendar_events", {
  id:        serial("id").primaryKey(),
  date:      text("date").notNull(),
  title:     text("title").notNull(),
  content:   text("content"),
  eventType: text("event_type").notNull().default("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CalendarEvent   = typeof calendarEventsTable.$inferSelect;
export type InsertCalendarEvent = typeof calendarEventsTable.$inferInsert;
