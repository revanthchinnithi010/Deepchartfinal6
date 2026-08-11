import { create } from "zustand";
import type {
  AnyAlert,
  PriceAlert,
  ZoneAlert,
  TrendlineAlert,
  AlertStatus,
} from "@/data/alertsData";

const LS_KEY = "tj_global_alerts_v1";

function loadLocal(): AnyAlert[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AnyAlert[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore corrupt local state.
  }
  return [];
}

function saveLocal(alerts: AnyAlert[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(alerts));
  } catch {
    // Ignore storage quota/private-mode errors.
  }
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function apiAlertToPriceAlert(a: Record<string, unknown>): PriceAlert {
  return {
    id: `p_${a.id}`,
    type: "price",
    symbol: String(a.symbol ?? ""),
    timeframe: String(a.timeframe ?? "1H"),
    condition:
      a.condition === "price_below" ? "below" :
      a.condition === "touch_price" ? "touch" :
      a.condition === "percent_change_up" ? "percent_up" :
      a.condition === "percent_change_down" ? "percent_down" :
      "above",
    targetPrice: Number(a.targetPrice ?? 0),
    currentPrice: Number(a.triggeredPrice ?? 0),
    notes: String(a.message ?? ""),
    status: a.isTriggered ? "triggered" : a.isActive ? "active" : "paused",
    expiry: (a.expiry as string | null) ?? null,
    createdAt: String(a.createdAt ?? new Date().toISOString()),
    triggeredAt: (a.triggeredAt as string | null) ?? null,
    repeatMode: (a.repeatMode as PriceAlert["repeatMode"]) ?? "three_reminders",
  };
}

function apiZoneToZoneAlert(z: Record<string, unknown>): ZoneAlert {
  return {
    id: `z_${z.id}`,
    type: "zone",
    symbol: String(z.symbol ?? ""),
    zoneType: (z.zoneType as ZoneAlert["zoneType"]) ?? "support_resistance",
    upperPrice: Number(z.upperPrice ?? 0),
    lowerPrice: Number(z.lowerPrice ?? 0),
    timeframe: String(z.timeframe ?? "1H"),
    condition: (z.condition as ZoneAlert["condition"]) ?? "touch",
    notes: String(z.notes ?? ""),
    status: z.isTriggered ? "triggered" : z.isActive ? "active" : "paused",
    createdAt: String(z.createdAt ?? new Date().toISOString()),
    triggeredAt: (z.triggeredAt as string | null) ?? null,
    repeatMode: (z.repeatMode as ZoneAlert["repeatMode"]) ?? "three_reminders",
  };
}

function apiTrendlineToTrendlineAlert(t: Record<string, unknown>): TrendlineAlert {
  return {
    id: `t_${t.id}`,
    type: "trendline",
    symbol: String(t.symbol ?? ""),
    timeframe: String(t.timeframe ?? "1H"),
    point1Price: Number(t.point1Price ?? 0),
    point1Time: String(t.point1Time ?? new Date().toISOString()),
    point2Price: Number(t.point2Price ?? 0),
    point2Time: String(t.point2Time ?? new Date().toISOString()),
    condition: (t.condition as TrendlineAlert["condition"]) ?? "break",
    atrPeriod: Number(t.atrPeriod ?? 14),
    atrMultiplier: Number(t.atrMultiplier ?? 0.15),
    notes: String(t.notes ?? ""),
    status: t.isTriggered ? "triggered" : t.isActive ? "active" : "paused",
    createdAt: String(t.createdAt ?? new Date().toISOString()),
    triggeredAt: (t.triggeredAt as string | null) ?? null,
    repeatMode: (t.repeatMode as TrendlineAlert["repeatMode"]) ?? "three_reminders",
  };
}

async function fetchDbAlerts(): Promise<AnyAlert[]> {
  const responses = await Promise.all([
    fetch("/api/alerts"),
    fetch("/api/zones"),
    fetch("/api/trendlines"),
  ]);

  if (responses.some(r => !r.ok)) {
    throw new Error("Failed to load alerts from database");
  }

  const [priceRaw, zoneRaw, trendlineRaw] = await Promise.all(
    responses.map(r => r.json())
  );

  return [
    ...toArray<Record<string, unknown>>(priceRaw).map(apiAlertToPriceAlert),
    ...toArray<Record<string, unknown>>(zoneRaw).map(apiZoneToZoneAlert),
    ...toArray<Record<string, unknown>>(trendlineRaw).map(apiTrendlineToTrendlineAlert),
  ];
}

function endpointForId(id: string): string {
  if (id.startsWith("z_")) return "/api/zones";
  if (id.startsWith("t_") || id.startsWith("tl_")) return "/api/trendlines";
  if (id.startsWith("p_")) return "/api/alerts";
  // Legacy IDs created by the old DrawingAlertModal.
  if (id.startsWith("tl-")) return "/api/trendlines";
  // Old mock-only IDs have no DB row; do not send a bogus DELETE.
  return "";
}

function numericId(id: string): string {
  if (id.startsWith("p_") || id.startsWith("z_") || id.startsWith("t_") || id.startsWith("tl_")) {
    return id.slice(id.indexOf("_") + 1);
  }
  if (id.startsWith("tl-")) return id.slice(3);
  return id;
}

interface AlertStore {
  alerts: AnyAlert[];
  isHydrating: boolean;
  addAlert: (alert: AnyAlert) => void;
  updateAlert: (id: string, patch: Partial<AnyAlert> & { status?: AlertStatus }) => void;
  deleteAlert: (id: string) => Promise<void>;
  setAlerts: (alerts: AnyAlert[]) => void;
  hydrateFromApi: () => Promise<void>;
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  // Local data is only a temporary paint. hydrateFromApi() immediately replaces
  // it with the real DB state, so Charts and Alerts never depend on mock data.
  alerts: typeof window !== "undefined" ? loadLocal() : [],
  isHydrating: false,

  addAlert: (alert) => set((state) => {
    const next = [alert, ...state.alerts.filter(a => a.id !== alert.id)];
    saveLocal(next);
    return { alerts: next };
  }),

  updateAlert: (id, patch) => set((state) => {
    const next = state.alerts.map(a =>
      a.id === id ? ({ ...a, ...patch } as AnyAlert) : a
    );
    saveLocal(next);
    return { alerts: next };
  }),

  deleteAlert: async (id) => {
    const endpoint = endpointForId(id);
    const previous = get().alerts;

    // Optimistic removal keeps the UI instant, but the DB remains authoritative.
    set((state) => {
      const next = state.alerts.filter(a => a.id !== id);
      saveLocal(next);
      return { alerts: next };
    });

    if (!endpoint) return;

    try {
      const response = await fetch(`${endpoint}/${numericId(id)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) throw new Error(`DELETE failed (${response.status})`);
    } catch {
      // Never leave the UI claiming an alert was deleted when the DB delete failed.
      saveLocal(previous);
      set({ alerts: previous });
    }
  },

  setAlerts: (alerts) => {
    saveLocal(alerts);
    set({ alerts });
  },

  hydrateFromApi: async () => {
    set({ isHydrating: true });
    try {
      const alerts = await fetchDbAlerts();
      // IMPORTANT: even an empty DB result is valid and must clear stale localStorage.
      saveLocal(alerts);
      set({ alerts });
    } catch {
      // Keep the last local snapshot if the API is temporarily unavailable.
    } finally {
      set({ isHydrating: false });
    }
  },
}));

// Hydrate once globally. This fixes the Charts/Alert Center path, which used to
// open with stale localStorage while the Alerts page separately fetched the DB.
if (typeof window !== "undefined") {
  queueMicrotask(() => {
    void useAlertStore.getState().hydrateFromApi();
  });
}
