import { Router, type IRouter, type Request, type Response } from "express";
import { db, settingsTable, watchlistTable, alertsTable, zonesTable, trendlinesTable } from "@workspace/db";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger.js";

const configRouter: IRouter = Router();

configRouter.get("/config/export", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [settings, watchlist, alerts, zones, trendlines] = await Promise.all([
      db.select().from(settingsTable),
      db.select().from(watchlistTable).orderBy(asc(watchlistTable.position)),
      db.select().from(alertsTable),
      db.select().from(zonesTable),
      db.select().from(trendlinesTable),
    ]);

    const config = {
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: settings.map(s => ({ key: s.key, value: s.value })),
      watchlist: watchlist.map(w => ({
        symbol: w.symbol,
        provider: w.provider,
        position: w.position,
        isFavorite: w.isFavorite,
      })),
      alerts: alerts.map(a => ({
        symbol: a.symbol,
        condition: a.condition,
        targetPrice: a.targetPrice,
        message: a.message,
        isActive: a.isActive,
        telegramEnabled: a.telegramEnabled,
      })),
      zones: zones.map(z => ({
        symbol: z.symbol,
        upperPrice: z.upperPrice,
        lowerPrice: z.lowerPrice,
        zoneType: z.zoneType,
        timeframe: z.timeframe,
        condition: z.condition,
        notes: z.notes,
        isActive: z.isActive,
        telegramEnabled: z.telegramEnabled,
      })),
      trendlines: trendlines.map(t => ({
        symbol: t.symbol,
        timeframe: t.timeframe,
        point1Price: t.point1Price,
        point1Time: t.point1Time.toISOString(),
        point2Price: t.point2Price,
        point2Time: t.point2Time.toISOString(),
        condition: t.condition,
        notes: t.notes,
        isActive: t.isActive,
        telegramEnabled: t.telegramEnabled,
      })),
    };

    const filename = `tradevault-config-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.json(config);
  } catch (err) {
    logger.error({ err }, "Config export failed");
    res.status(500).json({ error: "Export failed" });
  }
});

const ImportSettingSchema = z.object({ key: z.string(), value: z.string().nullable().optional() });
const ImportWatchlistSchema = z.object({
  symbol: z.string(), provider: z.string(), position: z.number().default(0), isFavorite: z.boolean().default(false),
});
const ImportAlertSchema = z.object({
  symbol: z.string(), condition: z.string(), targetPrice: z.number(),
  message: z.string().nullable().optional(), isActive: z.boolean().default(true), telegramEnabled: z.boolean().default(true),
});
const ImportZoneSchema = z.object({
  symbol: z.string(), upperPrice: z.number(), lowerPrice: z.number(),
  zoneType: z.string().default("support_resistance"), timeframe: z.string().default("1H"),
  condition: z.string().default("touch"), notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true), telegramEnabled: z.boolean().default(true),
});
const ImportTrendlineSchema = z.object({
  symbol: z.string(), timeframe: z.string().default("1H"),
  point1Price: z.number(), point1Time: z.string(),
  point2Price: z.number(), point2Time: z.string(),
  condition: z.string().default("break"), notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true), telegramEnabled: z.boolean().default(true),
});
const ImportConfigSchema = z.object({
  version: z.number().optional(),
  settings:   z.array(ImportSettingSchema).optional().default([]),
  watchlist:  z.array(ImportWatchlistSchema).optional().default([]),
  alerts:     z.array(ImportAlertSchema).optional().default([]),
  zones:      z.array(ImportZoneSchema).optional().default([]),
  trendlines: z.array(ImportTrendlineSchema).optional().default([]),
});

configRouter.post("/config/import", async (req: Request, res: Response): Promise<void> => {
  const parsed = ImportConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid config format", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  try {
    const summary = { settings: 0, watchlist: 0, alerts: 0, zones: 0, trendlines: 0 };

    if (data.settings.length > 0) {
      for (const s of data.settings) {
        await db.insert(settingsTable).values({ key: s.key, value: s.value ?? null })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: s.value ?? null, updatedAt: new Date() } });
      }
      summary.settings = data.settings.length;
    }

    if (data.watchlist.length > 0) {
      await db.delete(watchlistTable);
      for (const w of data.watchlist) {
        await db.insert(watchlistTable).values({
          symbol: w.symbol.toUpperCase(),
          provider: w.provider,
          position: w.position,
          isFavorite: w.isFavorite,
        }).onConflictDoNothing();
      }
      summary.watchlist = data.watchlist.length;
    }

    if (data.alerts.length > 0) {
      await db.delete(alertsTable);
      for (const a of data.alerts) {
        await db.insert(alertsTable).values({
          symbol: a.symbol,
          condition: a.condition,
          targetPrice: a.targetPrice,
          message: a.message ?? null,
          isActive: a.isActive,
          telegramEnabled: a.telegramEnabled,
        });
      }
      summary.alerts = data.alerts.length;
    }

    if (data.zones.length > 0) {
      await db.delete(zonesTable);
      for (const z of data.zones) {
        await db.insert(zonesTable).values({
          symbol: z.symbol,
          upperPrice: z.upperPrice,
          lowerPrice: z.lowerPrice,
          zoneType: z.zoneType,
          timeframe: z.timeframe,
          condition: z.condition,
          notes: z.notes ?? null,
          isActive: z.isActive,
          telegramEnabled: z.telegramEnabled,
        });
      }
      summary.zones = data.zones.length;
    }

    if (data.trendlines.length > 0) {
      await db.delete(trendlinesTable);
      for (const t of data.trendlines) {
        await db.insert(trendlinesTable).values({
          symbol: t.symbol,
          timeframe: t.timeframe,
          point1Price: t.point1Price,
          point1Time: new Date(t.point1Time),
          point2Price: t.point2Price,
          point2Time: new Date(t.point2Time),
          condition: t.condition,
          notes: t.notes ?? null,
          isActive: t.isActive,
          telegramEnabled: t.telegramEnabled,
        });
      }
      summary.trendlines = data.trendlines.length;
    }

    logger.info({ summary }, "Config import complete");
    res.json({ success: true, summary });
  } catch (err) {
    logger.error({ err }, "Config import failed");
    res.status(500).json({ error: "Import failed" });
  }
});

export { configRouter };
