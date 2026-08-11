import {
  createContext, useContext, useEffect, useRef, useState,
  useCallback, useMemo, type ReactNode,
} from "react";
import { useLiveMarketContext, type WsStatus } from "./LiveMarketContext";

export type NotifSeverity = "success" | "warning" | "error" | "info";

export type NotifType =
  | "price_alert"
  | "zone_alert"
  | "trendline_alert"
  | "ws_reconnect"
  | "ws_error"
  | "broker"
  | "telegram"
  | "feed"
  | "system";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  severity: NotifSeverity;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const MAX_NOTIFICATIONS = 60;

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const { alertEvents, wsStatus } = useLiveMarketContext();
  const prevAlertCountRef = useRef(0);
  const prevWsStatusRef   = useRef<WsStatus>("connecting");

  const addNotification = useCallback((n: Omit<AppNotification, "id" | "timestamp" | "read">) => {
    setNotifications(prev => [
      {
        ...n,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(),
        read: false,
      },
      ...prev,
    ].slice(0, MAX_NOTIFICATIONS));
  }, []);

  useEffect(() => {
    const newCount = alertEvents.length;
    if (newCount <= prevAlertCountRef.current) {
      prevAlertCountRef.current = newCount;
      return;
    }
    const newEvents = alertEvents.slice(prevAlertCountRef.current);
    prevAlertCountRef.current = newCount;

    for (const evt of newEvents) {
      if (evt.alertType === "price") {
        addNotification({
          type: "price_alert",
          severity: "info",
          title: `Price Alert — ${evt.symbol}`,
          description: `${evt.condition.replace(/_/g, " ")} triggered at $${evt.triggeredPrice.toFixed(5)}${evt.targetPrice ? ` · target $${evt.targetPrice.toFixed(5)}` : ""}`,
        });
      } else if (evt.alertType === "zone") {
        addNotification({
          type: "zone_alert",
          severity: "warning",
          title: `Zone Alert — ${evt.symbol}`,
          description: `${(evt.zoneType ?? "zone").replace(/_/g, " ")} ${evt.condition} at $${evt.triggeredPrice.toFixed(5)}${evt.upperPrice ? ` · zone $${(evt.lowerPrice ?? 0).toFixed(2)}–$${evt.upperPrice.toFixed(2)}` : ""}`,
        });
      } else {
        addNotification({
          type: "trendline_alert",
          severity: "warning",
          title: `Trendline Alert — ${evt.symbol}`,
          description: `${evt.condition} triggered at $${evt.triggeredPrice.toFixed(5)}${evt.timeframe ? ` (${evt.timeframe})` : ""}`,
        });
      }
    }
  }, [alertEvents, addNotification]);

  useEffect(() => {
    const prev = prevWsStatusRef.current;
    prevWsStatusRef.current = wsStatus;
    if (prev === wsStatus) return;

    if (wsStatus === "reconnecting") {
      addNotification({
        type: "ws_reconnect",
        severity: "warning",
        title: "Feed Reconnecting",
        description: "Live market data feed lost connection. Reconnecting automatically…",
      });
    } else if (wsStatus === "error") {
      addNotification({
        type: "ws_error",
        severity: "error",
        title: "Feed Connection Error",
        description: "Unable to connect to live market feed. Prices may be stale.",
      });
    } else if (wsStatus === "connected" && (prev === "reconnecting" || prev === "error" || prev === "disconnected")) {
      addNotification({
        type: "ws_reconnect",
        severity: "success",
        title: "Feed Reconnected",
        description: "Live market data feed is back online.",
      });
    }
  }, [wsStatus, addNotification]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
