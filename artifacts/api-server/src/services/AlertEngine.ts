import { db, pool, alertsTable, zonesTable, trendlinesTable, alertEventsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { MarketDataService, LatestTick } from "./MarketDataService.js";
import type { TelegramService } from "./TelegramService.js";
import type { WSManager } from "../ws/WSManager.js";
import type { CandleAggregator } from "./CandleAggregator.js";
import { AtrCalculator } from "./AtrCalculator.js";
import { logger } from "../lib/logger.js";

const COOLDOWN_MS = 120_000;
// Relative tolerance used for price/trendline "touch" conditions. 0.02%
// is tight enough for liquid markets while still allowing a real tick to
// register as a touch instead of requiring an impossible exact float match.
const TOUCH_TOLERANCE = 0.0002;
const ZONE_TOUCH_TOLERANCE = 0.0002;

type AlertCondition = "price_above" | "price_below" | "touch_price" | "percent_change_up" | "percent_change_down";
type ZoneState = "inside" | "above" | "below";
type TrendlineSide = "above" | "below";
type RepeatMode = "three_reminders" | "repeat_until_dismissed" | "triple_ring";
const THREE_REMINDER_INTERVAL_MS = 5 * 60 * 1000;
const UNTIL_DISMISSED_INTERVAL_MS = 10 * 60 * 1000;

interface PriceAlertRow {
  id: number;
  symbol: string;
  condition: string;
  targetPrice: number;
  message: string | null;
  telegramEnabled: boolean;
  repeatMode: RepeatMode;
  reminderCount: number;
  nextReminderAt: Date | null;
}

interface ZoneRow {
  id: number;
  symbol: string;
  upperPrice: number;
  lowerPrice: number;
  zoneType: string;
  condition: string;
  notes: string | null;
  telegramEnabled: boolean;
  repeatMode: RepeatMode;
  reminderCount: number;
  nextReminderAt: Date | null;
  cooldownUntil: Date | null;
}

interface TrendlineRow {
  id: number;
  symbol: string;
  timeframe: string;
  point1Price: number;
  point1Time: Date;
  point2Price: number;
  point2Time: Date;
  condition: string;
  drawingType: string;
  alertStatus: string;
  notes: string | null;
  telegramEnabled: boolean;
  repeatMode: RepeatMode;
  reminderCount: number;
  nextReminderAt: Date | null;
  cooldownUntil: Date | null;
  atrPeriod: number;
  atrMultiplier: number;
  drawingDisplayId: string | null;
}

export class AlertEngine {
  private activeAlerts: Map<number, PriceAlertRow> = new Map();
  private activeZones: Map<number, ZoneRow> = new Map();
  private activeTrendlines: Map<number, TrendlineRow> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  // Backend-authoritative reminder timers. DB remains the source of truth so
  // reminders survive page refreshes and API restarts.
  private reminderTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // Prevent concurrent ticks from firing the same alert before the DB update
  // completes. This complements the DB conditional update below.
  private firingAlerts: Set<string> = new Set();

  private openPrices: Map<string, number> = new Map();
  private zoneStates: Map<number, ZoneState> = new Map();
  private trendlineSides: Map<number, TrendlineSide> = new Map();

  // Price-touch state: true while the price is inside the target touch band.
  // The alert fires only on outside → inside, so one alert cannot spam every tick.
  private priceTouchInBand: Map<number, boolean> = new Map();

  // Zone touch state: tracks whether price is currently touching either boundary.
  private zoneTouchInBand: Map<number, boolean> = new Map();
  // Zone retest state: populated only after a real break, then consumed when price
  // returns from the broken side into the zone/boundary.
  private zoneRetestBreakSide: Map<number, TrendlineSide> = new Map();

  // Previous price/line sample used by trendline touch detection. A touch is
  // a real contact/crossing of the line, not merely being a few pips away.
  private trendlineTouchSamples: Map<number, { price: number; projected: number }> = new Map();
  // Tracks side at which a trendline breakout occurred (for retest).
  private retestBreakouts: Map<number, TrendlineSide> = new Map();
  private retestMovedAway: Set<number> = new Set();
  private rejectionTouchedSide: Map<number, TrendlineSide> = new Map();
  // In-memory dedup: prevent same alert firing twice within 10 s
  private recentlyFired: Map<number, number> = new Map();

  // "enter" condition: suppress re-fire while price stays inside; reset on exit
  private enterSuppressed: Set<number> = new Set();

  // ATR proximity: tracks whether price is currently inside the ATR band.
  private atrProximityInZone: Map<number, boolean> = new Map();
  // Generic trendline proximity state for enter_zone / exit_zone conditions.
  private trendlineTouchInBand: Map<number, boolean> = new Map();
  private atrCalculator: AtrCalculator;

  constructor(
    private marketData: MarketDataService,
    private telegram: TelegramService,
    private wsManager: WSManager,
    candleAggregator: CandleAggregator,
  ) {
    this.atrCalculator = new AtrCalculator(candleAggregator);
  }

  async start(): Promise<void> {
    await this.loadAlerts();

    this.marketData.on("tick", (tick: LatestTick) => {
      this.evaluateTick(tick).catch((err) =>
        logger.error({ err }, "AlertEngine: error evaluating tick"),
      );
    });

    this.refreshTimer = setInterval(() => {
      this.loadAlerts().catch((err) =>
        logger.error({ err }, "AlertEngine: error refreshing alerts"),
      );
    }, 60_000);

    logger.info(
      {
        priceAlerts: this.activeAlerts.size,
        zones: this.activeZones.size,
        trendlines: this.activeTrendlines.size,
      },
      "AlertEngine: started",
    );
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const handle of this.reminderTimers.values()) clearTimeout(handle);
    this.reminderTimers.clear();
    this.firingAlerts.clear();
  }

  async reloadAlerts(): Promise<void> {
    await this.loadAlerts();
  }

  private async loadAlerts(): Promise<void> {
    try {
      const now = new Date();

      const priceRows = await db
        .select()
        .from(alertsTable)
        .where(and(eq(alertsTable.isActive, true), eq(alertsTable.isTriggered, false)));

      this.activeAlerts.clear();
      for (const a of priceRows) {
        this.activeAlerts.set(a.id, {
          id: a.id,
          symbol: a.symbol,
          condition: a.condition,
          targetPrice: a.targetPrice,
          message: a.message ?? null,
          telegramEnabled: a.telegramEnabled,
          repeatMode: (a.repeatMode ?? "three_reminders") as RepeatMode,
          reminderCount: a.reminderCount ?? 0,
          nextReminderAt: a.nextReminderAt ?? null,
        });
      }

      // Remove touch state for alerts that no longer exist/are inactive.
      const incomingPriceIds = new Set(priceRows.map(r => r.id));
      for (const id of this.priceTouchInBand.keys()) {
        if (!incomingPriceIds.has(id)) this.priceTouchInBand.delete(id);
      }
      // Seed a touch alert from the latest cached price. This prevents a newly
      // created touch alert from firing merely because the current price was
      // already inside its touch band before the alert was created.
      for (const a of priceRows) {
        if (a.condition !== "touch_price") continue;
        const latest = this.marketData.getLatestTick(a.symbol);
        if (latest) {
          const tolerance = Math.max(Math.abs(a.targetPrice) * TOUCH_TOLERANCE, Number.EPSILON);
          this.priceTouchInBand.set(a.id, Math.abs(latest.price - a.targetPrice) <= tolerance);
        }
      }

      const zoneRows = await db
        .select()
        .from(zonesTable)
        .where(eq(zonesTable.isActive, true));

      this.activeZones.clear();
      const incomingZoneIds = new Set(zoneRows.map(r => r.id));
      for (const id of this.zoneTouchInBand.keys()) {
        if (!incomingZoneIds.has(id)) this.zoneTouchInBand.delete(id);
      }
      for (const id of this.zoneStates.keys()) {
        if (!incomingZoneIds.has(id)) this.zoneStates.delete(id);
      }
      for (const id of this.zoneRetestBreakSide.keys()) {
        if (!incomingZoneIds.has(id)) this.zoneRetestBreakSide.delete(id);
      }
      for (const z of zoneRows) {
        if (z.cooldownUntil && z.cooldownUntil > now) continue;
        this.activeZones.set(z.id, {
          id: z.id,
          symbol: z.symbol,
          upperPrice: z.upperPrice,
          lowerPrice: z.lowerPrice,
          zoneType: z.zoneType,
          condition: z.condition,
          notes: z.notes ?? null,
          telegramEnabled: z.telegramEnabled,
          repeatMode: (z.repeatMode ?? "three_reminders") as RepeatMode,
          reminderCount: z.reminderCount ?? 0,
          nextReminderAt: z.nextReminderAt ?? null,
          cooldownUntil: z.cooldownUntil,
        });
      }

      const trendlineRows = await db
        .select()
        .from(trendlinesTable)
        .where(eq(trendlinesTable.isActive, true));

      this.activeTrendlines.clear();
      // Prune proximity state for trendlines no longer active
      const incomingIds = new Set(trendlineRows.map(r => r.id));
      for (const id of this.atrProximityInZone.keys()) {
        if (!incomingIds.has(id)) this.atrProximityInZone.delete(id);
      }
      for (const id of this.trendlineTouchInBand.keys()) {
        if (!incomingIds.has(id)) this.trendlineTouchInBand.delete(id);
      }
      for (const id of this.trendlineSides.keys()) {
        if (!incomingIds.has(id)) this.trendlineSides.delete(id);
      }
      for (const id of this.retestBreakouts.keys()) {
        if (!incomingIds.has(id)) this.retestBreakouts.delete(id);
      }
      for (const id of this.retestMovedAway) {
        if (!incomingIds.has(id)) this.retestMovedAway.delete(id);
      }
      for (const id of this.rejectionTouchedSide.keys()) {
        if (!incomingIds.has(id)) this.rejectionTouchedSide.delete(id);
      }
      for (const id of this.trendlineTouchSamples.keys()) {
        if (!incomingIds.has(id)) this.trendlineTouchSamples.delete(id);
      }
      for (const t of trendlineRows) {
        if (t.isTriggered && t.condition !== "atr_proximity") continue; // atr_proximity is never permanently triggered
        if (t.cooldownUntil && t.cooldownUntil > now) continue;
        if ((t.alertStatus ?? "active") === "paused") continue;
        this.activeTrendlines.set(t.id, {
          id: t.id,
          symbol: t.symbol,
          timeframe: t.timeframe,
          point1Price: t.point1Price,
          point1Time: t.point1Time,
          point2Price: t.point2Price,
          point2Time: t.point2Time,
          condition: t.condition,
          drawingType: (t.drawingType ?? "trendline") as string,
          alertStatus: (t.alertStatus ?? "active") as string,
          notes: t.notes ?? null,
          telegramEnabled: t.telegramEnabled,
          repeatMode: (t.repeatMode ?? "three_reminders") as RepeatMode,
          reminderCount: t.reminderCount ?? 0,
          nextReminderAt: t.nextReminderAt ?? null,
          cooldownUntil: t.cooldownUntil,
          atrPeriod:        t.atrPeriod ?? 14,
          atrMultiplier:    t.atrMultiplier ?? 0.15,
          drawingDisplayId: t.drawingDisplayId ?? null,
        });
      }

      logger.debug(
        {
          priceAlerts: this.activeAlerts.size,
          zones: this.activeZones.size,
          trendlines: this.activeTrendlines.size,
        },
        "AlertEngine: alerts loaded",
      );

      // ── Fix D: Ensure live ticks flow for every active alert symbol ──────────
      // marketData.start([]) boots with zero subscriptions; symbols reach the
      // engine only via the watchlist.  Any alert whose symbol is not in the
      // watchlist would never receive a tick and therefore never evaluate.
      // Subscribing here after every reload (including the 60-second refresh)
      // guarantees coverage regardless of watchlist state.
      const alertSymbols = new Set<string>();
      for (const a of this.activeAlerts.values())     alertSymbols.add(a.symbol);
      for (const z of this.activeZones.values())      alertSymbols.add(z.symbol);
      for (const t of this.activeTrendlines.values()) alertSymbols.add(t.symbol);
      for (const sym of alertSymbols) {
        this.marketData.subscribe(sym);
      }

      // Resume any pending backend reminder schedules from DB. This is safe on
      // every reload because each alert owns exactly one timer.
      await this.resumePendingReminders();

      // ── Fix B: Seed zone states from latest price; clear stale suppression ──
      // On every reload (startup, 60-second refresh, and post-cooldown restore)
      // we snapshot the current price for each active zone.  This has two
      // effects:
      //   1. A newly registered zone whose price is already inside gets its
      //      state seeded to "inside" without adding to enterSuppressed, so the
      //      engine correctly waits for an outside→inside transition to fire.
      //   2. After the 120 s cooldown expires, if price has moved outside while
      //      the zone was absent from activeZones (and therefore evaluateZones
      //      could not clear enterSuppressed), we clear it here so the next
      //      re-entry fires correctly.
      for (const [id, zone] of this.activeZones.entries()) {
        const latestTick = this.marketData.getLatestTick(zone.symbol);
        if (latestTick !== undefined) {
          const p = latestTick.price;
          const seeded: ZoneState =
            p < zone.lowerPrice ? "below" :
            p > zone.upperPrice ? "above" : "inside";
          this.zoneStates.set(id, seeded);
          const touching = this.isZoneBoundaryTouch(zone, p);
          this.zoneTouchInBand.set(id, touching);
          // Price is currently outside — any leftover suppression is stale.
          if (seeded !== "inside") {
            this.enterSuppressed.delete(id);
          }
          // If the price is still on the broken side, preserve the retest arm.
          // If it has already returned inside before the engine reloads, consume
          // the stale arm rather than generating a false retest.
          const armed = this.zoneRetestBreakSide.get(id);
          if (armed && ((armed === "above" && seeded === "below") || (armed === "below" && seeded === "above"))) {
            this.zoneRetestBreakSide.delete(id);
          }
        }
      }

    } catch (err) {
      logger.error({ err }, "AlertEngine: failed to load alerts");
    }
  }


  private reminderKey(type: "price" | "zone" | "trendline", id: number): string {
    return `${type}:${id}`;
  }

  private clearReminderTimer(type: "price" | "zone" | "trendline", id: number): void {
    const key = this.reminderKey(type, id);
    const handle = this.reminderTimers.get(key);
    if (handle) clearTimeout(handle);
    this.reminderTimers.delete(key);
  }

  private scheduleReminder(
    type: "price" | "zone" | "trendline",
    id: number,
    nextReminderAt: Date | null,
  ): void {
    this.clearReminderTimer(type, id);
    if (!nextReminderAt) return;

    const delay = Math.max(0, nextReminderAt.getTime() - Date.now());
    const key = this.reminderKey(type, id);
    const handle = setTimeout(() => {
      this.reminderTimers.delete(key);
      void this.processReminder(type, id);
    }, delay);

    this.reminderTimers.set(key, handle);
  }

  private async resumePendingReminders(): Promise<void> {
    const now = new Date();

    try {
      // Rebuild the timer registry from DB so deletes, disables and resets
      // immediately cancel any old in-memory timer.
      for (const handle of this.reminderTimers.values()) clearTimeout(handle);
      this.reminderTimers.clear();

      const priceResult = await pool.query(
        `SELECT id, next_reminder_at
           FROM alerts
          WHERE is_active = true
            AND is_triggered = true
            AND next_reminder_at IS NOT NULL
            AND repeat_mode <> 'triple_ring'
            AND (repeat_mode <> 'three_reminders' OR reminder_count < 3)`
      );
      for (const row of priceResult.rows as Array<{ id: number; next_reminder_at: Date }>) {
        this.scheduleReminder("price", row.id, new Date(row.next_reminder_at));
      }

      const zoneResult = await pool.query(
        `SELECT id, next_reminder_at
           FROM zones
          WHERE is_active = true
            AND is_triggered = true
            AND next_reminder_at IS NOT NULL
            AND repeat_mode <> 'triple_ring'
            AND (repeat_mode <> 'three_reminders' OR reminder_count < 3)`
      );
      for (const row of zoneResult.rows as Array<{ id: number; next_reminder_at: Date }>) {
        this.scheduleReminder("zone", row.id, new Date(row.next_reminder_at));
      }

      const trendResult = await pool.query(
        `SELECT id, next_reminder_at
           FROM trendlines
          WHERE is_active = true
            AND is_triggered = true
            AND next_reminder_at IS NOT NULL
            AND repeat_mode <> 'triple_ring'
            AND (repeat_mode <> 'three_reminders' OR reminder_count < 3)`
      );
      for (const row of trendResult.rows as Array<{ id: number; next_reminder_at: Date }>) {
        this.scheduleReminder("trendline", row.id, new Date(row.next_reminder_at));
      }

      logger.info(
        {
          price: priceResult.rowCount ?? 0,
          zone: zoneResult.rowCount ?? 0,
          trendline: trendResult.rowCount ?? 0,
          resumedAt: now.toISOString(),
        },
        "AlertEngine: pending reminder schedules resumed",
      );
    } catch (err) {
      logger.error({ err }, "AlertEngine: failed to resume reminder schedules");
    }
  }

  private async processReminder(
    type: "price" | "zone" | "trendline",
    id: number,
  ): Promise<void> {
    let row: Record<string, unknown> | undefined;

    try {
      if (type === "price") {
        const result = await pool.query(
          `UPDATE alerts
              SET reminder_count = reminder_count + 1,
                  next_reminder_at = CASE
                    WHEN repeat_mode = 'three_reminders' AND reminder_count + 1 >= 3
                      THEN NULL
                    WHEN repeat_mode = 'repeat_until_dismissed'
                      THEN NOW() + INTERVAL '10 minutes'
                    ELSE NOW() + INTERVAL '5 minutes'
                  END
            WHERE id = $1
              AND is_active = true
              AND is_triggered = true
              AND next_reminder_at IS NOT NULL
              AND next_reminder_at <= NOW()
              AND repeat_mode <> 'triple_ring'
              AND (repeat_mode <> 'three_reminders' OR reminder_count < 3)
            RETURNING *`,
          [id],
        );
        row = result.rows[0] as Record<string, unknown> | undefined;
      } else if (type === "zone") {
        const result = await pool.query(
          `UPDATE zones
              SET reminder_count = reminder_count + 1,
                  next_reminder_at = CASE
                    WHEN repeat_mode = 'three_reminders' AND reminder_count + 1 >= 3
                      THEN NULL
                    WHEN repeat_mode = 'repeat_until_dismissed'
                      THEN NOW() + INTERVAL '10 minutes'
                    ELSE NOW() + INTERVAL '5 minutes'
                  END
            WHERE id = $1
              AND is_active = true
              AND is_triggered = true
              AND next_reminder_at IS NOT NULL
              AND next_reminder_at <= NOW()
              AND repeat_mode <> 'triple_ring'
              AND (repeat_mode <> 'three_reminders' OR reminder_count < 3)
            RETURNING *`,
          [id],
        );
        row = result.rows[0] as Record<string, unknown> | undefined;
      } else {
        const result = await pool.query(
          `UPDATE trendlines
              SET reminder_count = reminder_count + 1,
                  next_reminder_at = CASE
                    WHEN repeat_mode = 'three_reminders' AND reminder_count + 1 >= 3
                      THEN NULL
                    WHEN repeat_mode = 'repeat_until_dismissed'
                      THEN NOW() + INTERVAL '10 minutes'
                    ELSE NOW() + INTERVAL '5 minutes'
                  END
            WHERE id = $1
              AND is_active = true
              AND is_triggered = true
              AND next_reminder_at IS NOT NULL
              AND next_reminder_at <= NOW()
              AND repeat_mode <> 'triple_ring'
              AND (repeat_mode <> 'three_reminders' OR reminder_count < 3)
            RETURNING *`,
          [id],
        );
        row = result.rows[0] as Record<string, unknown> | undefined;
      }

      // Another process/server instance may have claimed the reminder first.
      if (!row) return;

      const reminderNumber = Number(row["reminder_count"] ?? 0);
      const mode = String(row["repeat_mode"] ?? "three_reminders") as RepeatMode;
      const total = mode === "three_reminders" ? 3 : null;

      const symbol = String(row["symbol"] ?? "");
      const triggeredPrice = Number(row["triggered_price"] ?? 0);
      const condition = String(row["condition"] ?? "");
      const telegramEnabled = Boolean(row["telegram_enabled"] ?? true);

      if (telegramEnabled) {
        await this.telegram.sendAlertReminder({
          alertType: type,
          reminderNumber,
          totalReminders: total,
          symbol,
          condition,
          targetPrice: type === "price" ? Number(row["target_price"] ?? 0) : undefined,
          upperPrice: type === "zone" ? Number(row["upper_price"] ?? 0) : undefined,
          lowerPrice: type === "zone" ? Number(row["lower_price"] ?? 0) : undefined,
          zoneType: type === "zone" ? String(row["zone_type"] ?? "") : undefined,
          triggeredPrice,
          message: String(row["message"] ?? row["notes"] ?? "") || undefined,
          drawingType: type === "trendline" ? String(row["drawing_type"] ?? "trendline") : undefined,
        });
      }

      const next = row["next_reminder_at"] ? new Date(String(row["next_reminder_at"])) : null;

      this.wsManager.broadcast({
        type: "alert_reminder",
        alertType: type,
        alertId: id,
        symbol,
        condition,
        reminderNumber,
        totalReminders: total,
        triggeredPrice,
        nextReminderAt: next?.toISOString() ?? null,
      });

      if (mode === "three_reminders" && reminderNumber >= 3) {
        if (type === "price") {
          await pool.query(`DELETE FROM alerts WHERE id = $1`, [id]);
        } else if (type === "zone") {
          await pool.query(`DELETE FROM zones WHERE id = $1`, [id]);
        } else {
          await pool.query(`DELETE FROM trendlines WHERE id = $1`, [id]);
        }
        this.clearReminderTimer(type, id);
        this.wsManager.broadcast({
          type: "alert_deleted_after_reminders",
          alertType: type,
          alertId: id,
          symbol,
        });
        logger.info({ type, id, symbol }, "AlertEngine: three reminders completed — alert deleted");
        await this.reloadAlerts();
        return;
      }

      this.scheduleReminder(type, id, next);
    } catch (err) {
      logger.error({ err, type, id }, "AlertEngine: reminder processing failed");
      // Retry in 5 minutes rather than firing multiple reminders immediately.
      this.scheduleReminder(type, id, new Date(Date.now() + THREE_REMINDER_INTERVAL_MS));
    }
  }

  private async evaluateTick(tick: LatestTick): Promise<void> {
    if (!this.openPrices.has(tick.symbol)) {
      this.openPrices.set(tick.symbol, tick.price);
    }

    // Diagnostic: emit a log whenever a tick arrives for a symbol that has an active zone
    const watchedZones = [...this.activeZones.values()].filter(z => z.symbol === tick.symbol);
    if (watchedZones.length > 0) {
      logger.info(
        { symbol: tick.symbol, price: tick.price, provider: (tick as { provider?: string }).provider ?? "unknown", zoneCount: watchedZones.length },
        "AlertEngine: ✔ tick received — evaluating zones",
      );
    }

    await this.evaluatePriceAlerts(tick);
    await this.evaluateZones(tick);
    await this.evaluateTrendlines(tick);
  }

  private async evaluatePriceAlerts(tick: LatestTick): Promise<void> {
    const triggered: number[] = [];

    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.symbol !== tick.symbol) continue;

      const condition = alert.condition as AlertCondition;
      let shouldTrigger = false;

      switch (condition) {
        case "price_above":
          shouldTrigger = tick.price >= alert.targetPrice;
          break;

        case "price_below":
          shouldTrigger = tick.price <= alert.targetPrice;
          break;

        case "touch_price": {
          const tolerance = Math.max(Math.abs(alert.targetPrice) * TOUCH_TOLERANCE, Number.EPSILON);
          const inBand = Math.abs(tick.price - alert.targetPrice) <= tolerance;
          const wasInBand = this.priceTouchInBand.get(id) ?? false;
          shouldTrigger = inBand && !wasInBand;
          this.priceTouchInBand.set(id, inBand);
          break;
        }

        case "percent_change_up": {
          const changePct = typeof tick.changePct24h === "number"
            ? tick.changePct24h
            : this.getSessionChangePct(tick.symbol, tick.price);
          shouldTrigger = changePct >= Math.abs(alert.targetPrice);
          break;
        }

        case "percent_change_down": {
          const changePct = typeof tick.changePct24h === "number"
            ? tick.changePct24h
            : this.getSessionChangePct(tick.symbol, tick.price);
          shouldTrigger = changePct <= -Math.abs(alert.targetPrice);
          break;
        }
      }

      if (shouldTrigger) {
        triggered.push(id);
        await this.firePriceAlert(alert, tick.price);
      }
    }

    for (const id of triggered) {
      this.activeAlerts.delete(id);
      this.priceTouchInBand.delete(id);
    }
  }

  private getSessionChangePct(symbol: string, price: number): number {
    const open = this.openPrices.get(symbol) ?? price;
    return open !== 0 ? ((price - open) / open) * 100 : 0;
  }

  private async evaluateZones(tick: LatestTick): Promise<void> {
    const price = tick.price;

    for (const [id, zone] of this.activeZones.entries()) {
      if (zone.symbol !== tick.symbol) continue;

      const currentState: ZoneState =
        price < zone.lowerPrice ? "below" :
        price > zone.upperPrice ? "above" : "inside";

      const lastState = this.zoneStates.get(id);
      this.zoneStates.set(id, currentState);

      if (lastState === undefined) {
        logger.debug({ zoneId: id, symbol: zone.symbol, currentState }, "AlertEngine: zone state seeded");
        continue;
      }

      const cond = zone.condition;
      let shouldFire = false;
      let eventDirection = currentState;

      if (cond === "enter") {
        // True entry: outside → inside. Staying inside never repeats.
        if (currentState !== "inside") {
          this.enterSuppressed.delete(id);
        } else if (lastState !== "inside" && !this.enterSuppressed.has(id)) {
          this.enterSuppressed.add(id);
          shouldFire = true;
          eventDirection = "inside";
        }

      } else if (cond === "touch") {
        // Touch means the price reaches a zone boundary, not merely enters the
        // middle of the zone. It fires once when entering the boundary tolerance.
        const touching = this.isZoneBoundaryTouch(zone, price);
        const wasTouching = this.zoneTouchInBand.get(id) ?? false;
        shouldFire = touching && !wasTouching;
        this.zoneTouchInBand.set(id, touching);
        if (touching) eventDirection = price >= zone.upperPrice ? "above" : "below";

      } else if (cond === "break") {
        // A break requires a transition from inside to outside. A single tick
        // jumping completely across the zone is also a break.
        shouldFire = currentState !== "inside" && lastState !== currentState;
        eventDirection = currentState;

      } else if (cond === "retest") {
        // Retest is deliberately NOT the same as enter. First a real break must
        // happen; only then does a return from the broken side into the zone arm
        // the Retested Zone event.
        if (lastState === "inside" && currentState !== "inside") {
          this.zoneRetestBreakSide.set(id, currentState === "above" ? "above" : "below");
        }
        const brokenSide = this.zoneRetestBreakSide.get(id);
        if (brokenSide && lastState === brokenSide && currentState === "inside") {
          shouldFire = true;
          eventDirection = "inside";
          this.zoneRetestBreakSide.delete(id);
        }
      }

      logger.debug(
        { zoneId: id, symbol: zone.symbol, price, condition: cond, lastState, currentState, shouldFire },
        "AlertEngine: zone decision",
      );

      if (shouldFire) {
        await this.fireZoneAlert(zone, tick.price, currentState, eventDirection);
        // Every zone alert is cooled down in the DB and removed from the live
        // map. On reload, the state machine resumes from the latest price.
        this.activeZones.delete(id);
      }
    }
  }

  private isZoneBoundaryTouch(zone: ZoneRow, price: number): boolean {
    const range = Math.max(zone.upperPrice - zone.lowerPrice, Number.EPSILON);
    const tolerance = Math.max(range * ZONE_TOUCH_TOLERANCE, Math.abs(price) * TOUCH_TOLERANCE);
    return Math.abs(price - zone.lowerPrice) <= tolerance || Math.abs(price - zone.upperPrice) <= tolerance;
  }

  private async evaluateTrendlines(tick: LatestTick): Promise<void> {
    const price = tick.price;
    const now = Date.now();

    for (const [id, tl] of this.activeTrendlines.entries()) {
      if (tl.symbol !== tick.symbol) continue;

      const projected = this.calcTrendlinePrice(tl, now);
      if (projected === null || projected === 0) continue;

      const currentSide: TrendlineSide = price >= projected ? "above" : "below";
      const lastSide = this.trendlineSides.get(id);
      this.trendlineSides.set(id, currentSide);

      const distancePct = Math.abs(price - projected) / Math.abs(projected);
      const inTouchBand = distancePct <= TOUCH_TOLERANCE;
      const cond = tl.condition;
      let shouldFire = false;

      if (lastSide === undefined) {
        // Seed state only. A newly-created alert must not instantly fire merely
        // because the current price is already at/near its line. We DO save the
        // first price/line sample so a genuine crossing on the next tick can be
        // detected.
        this.trendlineTouchSamples.set(id, { price, projected });
        if (cond === "atr_proximity") {
          const atr = this.atrCalculator.getAtr(tl.symbol, tl.timeframe, tl.atrPeriod);
          if (atr !== null) this.atrProximityInZone.set(id, Math.abs(price - projected) <= atr * tl.atrMultiplier);
        }
        continue;
      }

      if (cond === "breakout" || cond === "break") {
        // Break = a genuine side crossover of the projected line.
        shouldFire = currentSide !== lastSide;

      } else if (cond === "retest") {
        // Phase 1: record a real breakout.
        const breakoutSide = this.retestBreakouts.get(id);
        if (breakoutSide === undefined) {
          if (currentSide !== lastSide) {
            this.retestBreakouts.set(id, currentSide);
            this.retestMovedAway.delete(id);
          }
        } else if (!this.retestMovedAway.has(id)) {
          // The price must first move away from the line after breaking.
          if (!inTouchBand) this.retestMovedAway.add(id);
        } else if (inTouchBand) {
          // Phase 2: return to the line after moving away = true retest.
          shouldFire = true;
          this.retestBreakouts.delete(id);
          this.retestMovedAway.delete(id);
        }

      } else if (cond === "cross_above") {
        shouldFire = currentSide === "above" && lastSide === "below";
      } else if (cond === "cross_below") {
        shouldFire = currentSide === "below" && lastSide === "above";

      } else if (cond === "touch" || cond === "touch_price") {
        // IMPORTANT: do not use a percentage proximity band here. A 0.02% band
        // is several pips on EURUSD and caused visible false touches.
        // Require an actual contact or a side-crossing between consecutive ticks.
        shouldFire = this.isTrendlineTouch(id, tl.symbol, price, projected);

      } else if (cond === "above_price") {
        shouldFire = currentSide === "above" && lastSide === "below";
      } else if (cond === "below_price") {
        shouldFire = currentSide === "below" && lastSide === "above";

      } else if (cond === "enter_zone") {
        const wasIn = this.trendlineTouchInBand.get(id) ?? false;
        shouldFire = inTouchBand && !wasIn;
        this.trendlineTouchInBand.set(id, inTouchBand);
      } else if (cond === "exit_zone") {
        const wasIn = this.trendlineTouchInBand.get(id) ?? inTouchBand;
        shouldFire = !inTouchBand && wasIn;
        this.trendlineTouchInBand.set(id, inTouchBand);
      } else if (cond === "rejection") {
        // Touch the line, then move away without crossing to the other side.
        const armedSide = this.rejectionTouchedSide.get(id);
        if (inTouchBand) {
          this.rejectionTouchedSide.set(id, currentSide);
        } else if (armedSide && currentSide === armedSide) {
          shouldFire = true;
          this.rejectionTouchedSide.delete(id);
        } else if (armedSide && currentSide !== armedSide) {
          // A cross is a breakout, not a rejection.
          this.rejectionTouchedSide.delete(id);
        }

      } else if (cond === "atr_proximity") {
        const atr = this.atrCalculator.getAtr(tl.symbol, tl.timeframe, tl.atrPeriod);
        if (atr !== null) {
          const buffer = atr * tl.atrMultiplier;
          const inZone = Math.abs(price - projected) <= buffer;
          const wasInZone = this.atrProximityInZone.get(id) ?? false;
          if (inZone && !wasInZone) {
            this.atrProximityInZone.set(id, true);
            shouldFire = true;
          } else if (!inZone && wasInZone) {
            this.atrProximityInZone.set(id, false);
          }
        }
      }

      // Store the current world-price/line sample only after the condition has
      // been evaluated. This makes the next tick capable of detecting a real
      // crossing without turning the current tick into an automatic touch.
      this.trendlineTouchSamples.set(id, { price, projected });

      if (shouldFire) {
        this.trendlineTouchSamples.delete(id);
        if (cond === "atr_proximity") {
          // ATR proximity is a repeatable proximity alert. Keep it active and
          // let the in-zone state reset when price leaves the ATR band.
          await this.fireAtrProximityAlert(tl, tick.price, projected);
        } else {
          await this.fireDrawingAlert(tl, tick.price, projected, currentSide);
          this.activeTrendlines.delete(id);
        }
      }
    }
  }

  /**
   * Return a very small, instrument-aware tolerance for a genuine line touch.
   *
   * The previous implementation used 0.02% of price. On EURUSD that is about
   * 3.2 pips, so a price could be visibly below the trendline and still trigger
   * a "touch" alert. That is exactly the false-positive seen in the screenshot.
   *
   * We instead use a sub-pip tolerance for FX and a small absolute tolerance for
   * crypto/other symbols. A crossing between two ticks is also considered a
   * touch, so sparse ticks do not make the alert unreliable.
   */
  private trendlineTouchTolerance(symbol: string, price: number): number {
    const s = symbol.toUpperCase().replace(/\.(pro|raw|ecn|std)$/i, "");

    // JPY pairs normally quote to 3 decimals; use 0.1 pip.
    if (/JPY$/.test(s)) return 0.0001;

    // Standard 5-decimal FX pairs: 0.1 pip.
    if (/^[A-Z]{6}$/.test(s)) return 0.00001;

    // Crypto/other instruments: 0.001% is still deliberately tight.
    // Cap it so high-priced assets cannot get a multi-dollar false band.
    return Math.max(0.0001, Math.min(Math.abs(price) * 0.00001, 0.10));
  }

  private isTrendlineTouch(
    id: number,
    symbol: string,
    price: number,
    projected: number,
  ): boolean {
    const tolerance = this.trendlineTouchTolerance(symbol, price);
    const distance = Math.abs(price - projected);

    // Direct contact within a tiny instrument-aware tolerance.
    if (distance <= tolerance) return true;

    // If the line was crossed between two received ticks, the exact tick at the
    // intersection may not have been delivered. Treat the crossing as a touch.
    const previous = this.trendlineTouchSamples.get(id);
    if (!previous) return false;

    const previousDelta = previous.price - previous.projected;
    const currentDelta = price - projected;

    return (
      previousDelta !== 0 &&
      currentDelta !== 0 &&
      Math.sign(previousDelta) !== Math.sign(currentDelta)
    );
  }

  private calcTrendlinePrice(tl: TrendlineRow, nowMs: number): number | null {
    const t1 = tl.point1Time.getTime();
    const t2 = tl.point2Time.getTime();
    if (t2 === t1) return null;

    if (tl.drawingType === "horizontal_line") {
      return tl.point1Price;
    }

    const slope = (tl.point2Price - tl.point1Price) / (t2 - t1);

    if (tl.drawingType === "ray" || tl.drawingType === "trendline") {
      return tl.point1Price + slope * (nowMs - t1);
    }

    if (tl.drawingType === "channel") {
      return tl.point1Price + slope * (nowMs - t1);
    }

    return tl.point1Price + slope * (nowMs - t1);
  }

  private async firePriceAlert(alert: PriceAlertRow, triggeredPrice: number): Promise<void> {
    logger.info({ alertId: alert.id, symbol: alert.symbol, triggeredPrice }, "AlertEngine: price alert fired");

    try {
      const now = new Date();
      const nextReminderAt =
        alert.repeatMode === "three_reminders"
          ? new Date(now.getTime() + THREE_REMINDER_INTERVAL_MS)
          : alert.repeatMode === "repeat_until_dismissed"
            ? new Date(now.getTime() + UNTIL_DISMISSED_INTERVAL_MS)
            : null;

      // Atomic claim: only the first concurrent tick is allowed to trigger.
      const [claimed] = await db.update(alertsTable)
        .set({
          isTriggered: true,
          triggeredAt: now,
          triggeredPrice,
          reminderCount: 1,
          nextReminderAt,
        })
        .where(and(
          eq(alertsTable.id, alert.id),
          eq(alertsTable.isActive, true),
          eq(alertsTable.isTriggered, false),
        ))
        .returning();

      if (!claimed) {
        logger.debug({ alertId: alert.id }, "AlertEngine: price trigger already claimed");
        this.activeAlerts.delete(alert.id);
        return;
      }

      this.activeAlerts.delete(alert.id);
      this.scheduleReminder("price", alert.id, nextReminderAt);

      await db.insert(alertEventsTable).values({
        alertId: alert.id, alertType: "price",
        symbol: alert.symbol, condition: alert.condition,
        priceAtTrigger: triggeredPrice, message: alert.message,
      });

      this.wsManager.broadcast({
        type: "alert_triggered",
        alertType: "price",
        alertId: alert.id,
        symbol: alert.symbol,
        condition: alert.condition,
        targetPrice: alert.targetPrice,
        triggeredPrice,
        message: alert.message,
        triggeredAt: new Date().toISOString(),
      });

      if (alert.telegramEnabled) {
        await this.telegram.sendAlertTriggered({
          symbol: alert.symbol,
          condition: alert.condition,
          targetPrice: alert.targetPrice,
          triggeredPrice,
          message: alert.message,
        });
      }
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "AlertEngine: failed to fire price alert");
    }
  }

  private async fireZoneAlert(zone: ZoneRow, triggeredPrice: number, state: ZoneState, eventDirection: string): Promise<void> {
    logger.info({ zoneId: zone.id, symbol: zone.symbol, triggeredPrice, state, eventDirection }, "AlertEngine: fireZoneAlert — ENTRY");

    // In-memory dedup: prevent same zone firing twice within 10 s
    const lastFired = this.recentlyFired.get(zone.id);
    if (lastFired && Date.now() - lastFired < 10_000) {
      logger.warn({ zoneId: zone.id, dedupAgeMs: Date.now() - lastFired }, "AlertEngine: fireZoneAlert — SKIPPED by 10s dedup");
      return;
    }
    this.recentlyFired.set(zone.id, Date.now());

    const direction =
      zone.condition === "enter" ? "entered" :
      zone.condition === "touch" ? (eventDirection === "above" ? "touched the upper boundary of" : "touched the lower boundary of") :
      zone.condition === "break" ? (eventDirection === "above" ? "broke above" : "broke below") :
      zone.condition === "retest" ? "returned into" :
      eventDirection === "above" ? "moved above" : "moved below";
    logger.info({ zoneId: zone.id, symbol: zone.symbol, triggeredPrice, direction }, "AlertEngine: zone alert fired");

    try {
      const now = new Date();
      const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS);
      const nextReminderAt =
        zone.repeatMode === "three_reminders"
          ? new Date(now.getTime() + THREE_REMINDER_INTERVAL_MS)
          : zone.repeatMode === "repeat_until_dismissed"
            ? new Date(now.getTime() + UNTIL_DISMISSED_INTERVAL_MS)
            : null;

      // Atomic claim prevents two overlapping ticks from sending two initial
      // Telegram messages for the same zone.
      const [claimed] = await db.update(zonesTable)
        .set({
          isTriggered: true,
          triggeredAt: now,
          triggeredPrice,
          cooldownUntil,
          reminderCount: 1,
          nextReminderAt,
        })
        .where(and(
          eq(zonesTable.id, zone.id),
          eq(zonesTable.isActive, true),
          eq(zonesTable.isTriggered, false),
        ))
        .returning();

      if (!claimed) {
        logger.debug({ zoneId: zone.id }, "AlertEngine: zone trigger already claimed");
        this.activeZones.delete(zone.id);
        return;
      }

      this.activeZones.delete(zone.id);
      this.scheduleReminder("zone", zone.id, nextReminderAt);

      const zoneLabel = zone.zoneType.replace(/_/g, " ");
      const conditionLabel =
        zone.condition === "enter" ? "Entered Zone" :
        zone.condition === "touch" ? "Touched Zone" :
        zone.condition === "break" ? "Broke Zone" :
        zone.condition === "retest" ? "Retested Zone" :
        zone.condition.replace(/_/g, " ");
      const message =
        `Zone Alert — ${conditionLabel} | ${zone.symbol} | ` +
        `${zoneLabel} ${zone.lowerPrice}–${zone.upperPrice} | ` +
        `Price ${triggeredPrice}`;

      await db.insert(alertEventsTable).values({
        alertId: zone.id, alertType: "zone",
        symbol: zone.symbol, condition: zone.condition,
        priceAtTrigger: triggeredPrice,
        message,
      });

      this.wsManager.broadcast({
        type: "alert_triggered",
        alertType: "zone",
        alertId: zone.id,
        symbol: zone.symbol,
        zoneType: zone.zoneType,
        condition: zone.condition,
        upperPrice: zone.upperPrice,
        lowerPrice: zone.lowerPrice,
        triggeredPrice,
        direction,
        triggeredAt: new Date().toISOString(),
      });

      if (zone.telegramEnabled) {
        const tgResult = await this.telegram.sendZoneAlert({
          symbol: zone.symbol,
          zoneType: zone.zoneType,
          condition: zone.condition,
          upperPrice: zone.upperPrice,
          lowerPrice: zone.lowerPrice,
          triggeredPrice,
          direction,
          notes: zone.notes,
        });
        if (tgResult) {
          logger.info({ zoneId: zone.id, symbol: zone.symbol }, "AlertEngine: fireZoneAlert — ✅ Telegram message sent");
        } else {
          logger.warn({ zoneId: zone.id, symbol: zone.symbol }, "AlertEngine: fireZoneAlert — ⚠️ Telegram send failed or skipped (see TelegramService logs above)");
        }
      } else {
        logger.debug({ zoneId: zone.id }, "AlertEngine: fireZoneAlert — Telegram skipped (telegramEnabled=false on this zone)");
      }

      this.activeZones.delete(zone.id);
    } catch (err) {
      logger.error({ err, zoneId: zone.id }, "AlertEngine: failed to fire zone alert");
    }
  }

  private async fireDrawingAlert(
    tl: TrendlineRow,
    triggeredPrice: number,
    projectedPrice: number,
    side: TrendlineSide,
  ): Promise<void> {
    // In-memory dedup: prevent same drawing alert firing twice within 10 s
    const lastFired = this.recentlyFired.get(tl.id);
    if (lastFired && Date.now() - lastFired < 10_000) return;
    this.recentlyFired.set(tl.id, Date.now());

    const direction = side === "above" ? "crossed above" : "crossed below";
    const condLabel = this.humanCondition(tl.condition, side);
    logger.info({ trendlineId: tl.id, symbol: tl.symbol, drawingType: tl.drawingType, triggeredPrice, direction }, "AlertEngine: drawing alert fired");

    try {
      const now = new Date();
      const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS);
      const nextReminderAt =
        tl.repeatMode === "three_reminders"
          ? new Date(now.getTime() + THREE_REMINDER_INTERVAL_MS)
          : tl.repeatMode === "repeat_until_dismissed"
            ? new Date(now.getTime() + UNTIL_DISMISSED_INTERVAL_MS)
            : null;

      const [claimed] = await db.update(trendlinesTable)
        .set({
          isTriggered:   true,
          triggeredAt:   now,
          triggeredPrice,
          alertStatus:   "triggered",
          cooldownUntil,
          reminderCount: 1,
          nextReminderAt,
        })
        .where(and(
          eq(trendlinesTable.id, tl.id),
          eq(trendlinesTable.isActive, true),
          eq(trendlinesTable.isTriggered, false),
        ))
        .returning();

      if (!claimed) {
        logger.debug({ trendlineId: tl.id }, "AlertEngine: drawing trigger already claimed");
        this.activeTrendlines.delete(tl.id);
        return;
      }

      this.activeTrendlines.delete(tl.id);
      this.scheduleReminder("trendline", tl.id, nextReminderAt);

      const drawingRef = tl.drawingDisplayId ? ` (${tl.drawingDisplayId})` : "";
      await db.insert(alertEventsTable).values({
        alertId: tl.id, alertType: "trendline",
        symbol: tl.symbol, condition: tl.condition,
        priceAtTrigger: triggeredPrice,
        message: `Trendline Alert Triggered${drawingRef} — Price ${direction} ${tl.drawingType} (projected: ${projectedPrice.toFixed(5)})`,
      });

      this.wsManager.broadcast({
        type:             "alert_triggered",
        alertType:        "trendline",
        drawingType:      tl.drawingType,
        drawingDisplayId: tl.drawingDisplayId ?? null,
        alertId:          tl.id,
        symbol:           tl.symbol,
        timeframe:        tl.timeframe,
        condition:        tl.condition,
        conditionLabel:   condLabel,
        triggeredPrice,
        projectedPrice,
        direction,
        triggeredAt:      new Date().toISOString(),
      });

      if (tl.telegramEnabled) {
        await this.telegram.sendDrawingAlert({
          symbol:         tl.symbol,
          timeframe:      tl.timeframe,
          drawingType:    tl.drawingType,
          condition:      tl.condition,
          conditionLabel: condLabel,
          triggeredPrice,
          projectedPrice,
          direction,
          notes:          tl.notes,
        });
      }

      this.activeTrendlines.delete(tl.id);
    } catch (err) {
      logger.error({ err, trendlineId: tl.id }, "AlertEngine: failed to fire drawing alert");
    }
  }

  /** Fires a one-shot proximity notification without permanently triggering the alert. */
  private async fireAtrProximityAlert(
    tl: TrendlineRow,
    triggeredPrice: number,
    projectedPrice: number,
  ): Promise<void> {
    // In-memory dedup: prevent same alert firing twice within 10 s
    const lastFired = this.recentlyFired.get(tl.id);
    if (lastFired && Date.now() - lastFired < 10_000) return;
    this.recentlyFired.set(tl.id, Date.now());

    logger.info(
      { trendlineId: tl.id, symbol: tl.symbol, triggeredPrice, projectedPrice },
      "AlertEngine: ATR proximity alert fired",
    );

    try {
      await db.insert(alertEventsTable).values({
        alertId:       tl.id,
        alertType:     "trendline",
        symbol:        tl.symbol,
        condition:     tl.condition,
        priceAtTrigger: triggeredPrice,
        message: `Price entered ATR proximity zone around trendline (projected: ${projectedPrice.toFixed(5)})`,
      });

      this.wsManager.broadcast({
        type:           "alert_triggered",
        alertType:      "trendline",
        drawingType:    tl.drawingType,
        alertId:        tl.id,
        symbol:         tl.symbol,
        timeframe:      tl.timeframe,
        condition:      tl.condition,
        conditionLabel: "ATR-Based Proximity",
        triggeredPrice,
        projectedPrice,
        title:          "Approaching Trendline",
        message:        "Price has entered the ATR proximity zone for your selected trendline.",
        triggeredAt:    new Date().toISOString(),
      });

      if (tl.telegramEnabled) {
        await this.telegram.sendDrawingAlert({
          symbol:         tl.symbol,
          timeframe:      tl.timeframe,
          drawingType:    tl.drawingType,
          condition:      tl.condition,
          conditionLabel: "ATR-Based Proximity",
          triggeredPrice,
          projectedPrice,
          direction:      "proximity",
          notes:          tl.notes,
        });
      }
    } catch (err) {
      logger.error({ err, trendlineId: tl.id }, "AlertEngine: failed to fire ATR proximity alert");
    }
  }

  private humanCondition(condition: string, side: TrendlineSide): string {
    const map: Record<string, string> = {
      cross_above:   "Cross Above",
      cross_below:   "Cross Below",
      breakout:      side === "above" ? "Breakout Above" : "Breakout Below",
      break:         side === "above" ? "Break Above" : "Break Below",
      touch:         "Touch",
      atr_proximity: "ATR-Based Proximity",
      touch_price: "Touch Price",
      above_price: "Above Price",
      below_price: "Below Price",
      enter_zone:  "Enter Zone",
      exit_zone:   "Exit Zone",
      rejection:   "Rejection",
      retest:      "Retest",
    };
    return map[condition] ?? condition;
  }

  getProjectedPrice(trendlineId: number): number | null {
    const tl = this.activeTrendlines.get(trendlineId);
    if (!tl) return null;
    return this.calcTrendlinePrice(tl, Date.now());
  }
}
