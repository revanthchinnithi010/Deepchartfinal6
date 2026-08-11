/**
 * useRepeatEngine — mounts the repeat scheduler in the React tree.
 *
 * Place this hook in a component that is always mounted (e.g. the Router
 * wrapper in App.tsx) so it stays active regardless of which page is open.
 *
 * Responsibilities:
 *  1. Resume any persisted schedules from a previous session.
 *  2. Watch alertEvents from LiveMarketContext; for each new event find the
 *     matching alert and call scheduleRepeat().
 *  3. Watch the alertStore; call cancelRepeat() when an alert is deleted,
 *     disabled, or edited (status change away from active/triggered).
 */

import { useEffect, useRef } from "react";
import { useLiveMarketContext } from "@/contexts/LiveMarketContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useAlertStore } from "@/store/alertStore";
import {
  scheduleRepeat,
  cancelRepeat,
  resumeSchedules,
  type RepeatMode,
} from "@/lib/repeatEngine";
import type { AnyAlert } from "@/data/alertsData";

// Build a human-readable description from an alert for use in notifications.
function buildDescription(alert: AnyAlert): string {
  if (alert.type === "price") {
    return `${alert.condition} $${alert.targetPrice} · ${alert.timeframe}`;
  }
  if (alert.type === "zone") {
    return `${alert.condition} zone $${alert.lowerPrice}–$${alert.upperPrice} · ${alert.timeframe}`;
  }
  // trendline
  const cLabel =
    alert.condition === "atr_proximity" ? "ATR Proximity" :
    alert.condition === "touch"         ? "Exact Touch"   :
    alert.condition === "break"         ? "Break"         : alert.condition;
  return `${cLabel} · ${alert.timeframe}`;
}

export function useRepeatEngine() {
  const { alertEvents, subscribeToMessages } = useLiveMarketContext();
  const { addNotification } = useNotifications();

  // Track how many alertEvents we've already processed.
  const prevCountRef = useRef(0);

  // ── 1. Resume persisted schedules on first mount ───────────────────────────
  useEffect(() => {
    const activeIds = new Set(
      useAlertStore.getState().alerts.map(a => a.id),
    );
    resumeSchedules(
      addNotification,
      (id) => useAlertStore.getState().deleteAlert(id),
      activeIds,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once

  // ── 2. Backend reminder events ─────────────────────────────────────────────
  // AlertEngine is the single source of truth for reminder timing. Mirror each
  // claimed reminder into the in-app notification center without scheduling a
  // second browser timer.
  useEffect(() => {
    return subscribeToMessages((raw) => {
      const msg = raw as {
        type?: string;
        alertType?: "price" | "zone" | "trendline";
        alertId?: number;
        symbol?: string;
        condition?: string;
        reminderNumber?: number;
        totalReminders?: number | null;
        triggeredPrice?: number;
      };

      if (msg.type === "alert_reminder" && msg.alertType && msg.symbol) {
        const label =
          msg.alertType === "price" ? "Price Alert" :
          msg.alertType === "zone" ? "Zone Alert" : "Trendline Alert";
        const count = msg.totalReminders
          ? ` ${msg.reminderNumber}/${msg.totalReminders}`
          : ` ${msg.reminderNumber}`;

        addNotification({
          type: msg.alertType === "price" ? "price_alert" :
            msg.alertType === "zone" ? "zone_alert" : "trendline_alert",
          severity: "warning",
          title: `Reminder${count} — ${msg.symbol}`,
          description: `${label} · ${msg.condition ?? "triggered"}${msg.triggeredPrice !== undefined ? ` · $${msg.triggeredPrice}` : ""}`,
        });
      }

      if (msg.type === "alert_deleted_after_reminders" && msg.alertType && msg.alertId) {
        const prefix = msg.alertType === "price" ? "p_" : msg.alertType === "zone" ? "z_" : "t_";
        const id = `${prefix}${msg.alertId}`;
        const store = useAlertStore.getState();
        store.setAlerts(store.alerts.filter(a => a.id !== id));
      }
    });
  }, [subscribeToMessages, addNotification]);

  // ── 3. React to newly triggered alerts ────────────────────────────────────
  useEffect(() => {
    const newCount = alertEvents.length;
    if (newCount <= prevCountRef.current) {
      prevCountRef.current = newCount;
      return;
    }

    const newEvents = alertEvents.slice(prevCountRef.current);
    prevCountRef.current = newCount;

    const storeAlerts = useAlertStore.getState().alerts;

    for (const evt of newEvents) {
      // Find the best-matching active alert in the store.
      // Match: same type + same symbol (+ condition for price alerts).
      const candidates = storeAlerts.filter(a => {
        if (a.type !== evt.alertType) return false;
        if (a.symbol !== evt.symbol)  return false;
        if (a.status !== "active" && a.status !== "triggered") return false;
        if (a.type === "price" && a.condition !== evt.condition) return false;
        return true;
      });

      // Prefer the most recently created alert if there are multiple matches.
      const alert = candidates.reduce<AnyAlert | null>((best, cur) => {
        if (!best) return cur;
        return cur.createdAt > best.createdAt ? cur : best;
      }, null);

      if (!alert) {
        // No matching stored alert — nothing to schedule.
        continue;
      }

      const mode: RepeatMode =
        ((alert as AnyAlert & { repeatMode?: RepeatMode }).repeatMode) ??
        "three_reminders";

      scheduleRepeat(
        alert.id,
        mode,
        {
          symbol:    alert.symbol,
          alertType: alert.type,
          description: buildDescription(alert),
        },
        addNotification,
        (id) => useAlertStore.getState().deleteAlert(id),
      );
    }
  }, [alertEvents, addNotification]);

  // ── 3. Cancel schedules when alerts are deleted, disabled, or edited ───────
  useEffect(() => {
    // Track the previous alert state so we can detect changes.
    let prevAlerts = useAlertStore.getState().alerts;

    const unsub = useAlertStore.subscribe((state) => {
      const currAlerts = state.alerts;
      const currIds    = new Set(currAlerts.map(a => a.id));

      for (const prev of prevAlerts) {
        if (!currIds.has(prev.id)) {
          // Alert was deleted
          cancelRepeat(prev.id);
          continue;
        }
        const curr = currAlerts.find(a => a.id === prev.id)!;
        // Alert was disabled or edited (status changed to paused/expired)
        if (curr.status !== prev.status && curr.status !== "triggered") {
          cancelRepeat(prev.id);
        }
      }

      prevAlerts = currAlerts;
    });

    return unsub;
  }, []);
}
