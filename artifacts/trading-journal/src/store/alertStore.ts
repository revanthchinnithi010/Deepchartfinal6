import { create } from "zustand";
import type {
  AnyAlert,
  PriceAlert,
  ZoneAlert,
  TrendlineAlert,
  AlertStatus,
} from "@/data/alertsData";
import { useDrawingStore } from "@/store/drawingStore";

const LS_KEY = "tj_global_alerts_v1";
const TRIGGERED_DRAWING_IDS_KEY = "tj_triggered_drawing_ids_v1";
const TRIGGERED_DRAWING_COLOR = "#ef4444";
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

function isPersistedAlertId(id: string): boolean {
  return /^(p_|z_|t_|tl_)/.test(id);
}

function loadLocal(): AnyAlert[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AnyAlert[];
      if (Array.isArray(parsed)) return parsed.filter(a => isPersistedAlertId(String(a?.id ?? "")));
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

function loadTriggeredDrawingIds(): Set<number> {
  try {
    const raw = localStorage.getItem(TRIGGERED_DRAWING_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(Number).filter(Number.isFinite));
  } catch {
    return new Set();
  }
}

function saveTriggeredDrawingIds(ids: Set<number>) {
  try {
    localStorage.setItem(TRIGGERED_DRAWING_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors.
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
  const alert = {
    id: `z_${z.id}`,
    type: "zone" as const,
    symbol: String(z.symbol ?? ""),
    zoneType: (z.zoneType as ZoneAlert["zoneType"]) ?? "support_resistance",
    upperPrice: Number(z.upperPrice ?? 0),
    lowerPrice: Number(z.lowerPrice ?? 0),
    timeframe: String(z.timeframe ?? "1H"),
    condition: (z.condition as ZoneAlert["condition"]) ?? "touch",
    notes: String(z.notes ?? ""),
    status: z.isTriggered ? "triggered" as const : z.isActive ? "active" as const : "paused" as const,
    createdAt: String(z.createdAt ?? new Date().toISOString()),
    triggeredAt: (z.triggeredAt as string | null) ?? null,
    repeatMode: (z.repeatMode as ZoneAlert["repeatMode"]) ?? "three_reminders",
  };
  if (typeof z.drawingDisplayId === "string") {
    return { ...alert, drawingDisplayId: z.drawingDisplayId } as ZoneAlert;
  }
  return alert;
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
    drawingDisplayId: typeof t.drawingDisplayId === "string" ? t.drawingDisplayId : undefined,
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
  if (id.startsWith("tl-")) return "/api/trendlines";
  return "";
}

function numericId(id: string): string {
  if (id.startsWith("p_") || id.startsWith("z_") || id.startsWith("t_") || id.startsWith("tl_")) {
    return id.slice(id.indexOf("_") + 1);
  }
  if (id.startsWith("tl-")) return id.slice(3);
  return id;
}

function sameSymbol(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return true;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function closePrice(a: unknown, b: unknown): boolean {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const tolerance = Math.max(1e-10, Math.max(Math.abs(x), Math.abs(y)) * 1e-6);
  return Math.abs(x - y) <= tolerance;
}

function timeToSec(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value / 1000 : value;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? n / 1000 : n;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

function closeTime(a: unknown, b: unknown): boolean {
  const x = timeToSec(a), y = timeToSec(b);
  if (x === null || y === null) return false;
  return Math.abs(x - y) <= 120;
}

function drawingMatchesTriggeredAlert(drawing: any, alert: AnyAlert): boolean {
  if (!drawing || !drawing.isVisible) return false;
  const displayId = String(drawing.displayId ?? "");
  const alertDisplayId = String((alert as any).drawingDisplayId ?? "");
  if (displayId && alertDisplayId && displayId === alertDisplayId) return true;
  if (!sameSymbol(drawing.symbol, alert.symbol) || !Array.isArray(drawing.points) || drawing.points.length < 2) return false;

  if (alert.type === "trendline") {
    if (!["trendline", "ray", "extended"].includes(String(drawing.toolType))) return false;
    const p0 = drawing.points[0], p1 = drawing.points[1];
    const direct = closePrice(p0?.price, alert.point1Price) && closePrice(p1?.price, alert.point2Price)
      && closeTime(p0?.time, alert.point1Time) && closeTime(p1?.time, alert.point2Time);
    const reverse = closePrice(p0?.price, alert.point2Price) && closePrice(p1?.price, alert.point1Price)
      && closeTime(p0?.time, alert.point2Time) && closeTime(p1?.time, alert.point1Time);
    return direct || reverse;
  }

  if (alert.type === "zone") {
    if (String(drawing.toolType) !== "rect") return false;
    const p0 = Number(drawing.points[0]?.price), p1 = Number(drawing.points[1]?.price);
    if (!Number.isFinite(p0) || !Number.isFinite(p1)) return false;
    const upper = Math.max(p0, p1), lower = Math.min(p0, p1);
    return closePrice(upper, alert.upperPrice) && closePrice(lower, alert.lowerPrice);
  }

  return false;
}

function markTriggeredDrawingsRed(alerts: AnyAlert[]) {
  const triggered = alerts.filter(a =>
    (a.type === "trendline" || a.type === "zone") && a.status === "triggered"
  );
  const persistedIds = loadTriggeredDrawingIds();
  const drawings = useDrawingStore.getState().drawings;

  // Previously triggered drawings remain red even if their alert is later deleted.
  for (const drawing of drawings) {
    if (persistedIds.has(drawing.id) && drawing.style.color !== TRIGGERED_DRAWING_COLOR) {
      useDrawingStore.getState().updateDrawing(drawing.id, {
        style: { ...drawing.style, color: TRIGGERED_DRAWING_COLOR },
      });
    }
  }

  if (triggered.length === 0) return;

  const store = useDrawingStore.getState();
  for (const drawing of store.drawings) {
    if (triggered.some(alert => drawingMatchesTriggeredAlert(drawing, alert))) {
      persistedIds.add(drawing.id);
      if (drawing.style.color !== TRIGGERED_DRAWING_COLOR) {
        store.updateDrawing(drawing.id, {
          style: { ...drawing.style, color: TRIGGERED_DRAWING_COLOR },
        });
      }
    }
  }
  saveTriggeredDrawingIds(persistedIds);
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
  alerts: typeof window !== "undefined" ? loadLocal() : [],
  isHydrating: false,

  addAlert: (alert) => set((state) => {
    if (!isPersistedAlertId(alert.id)) return state;
    const next = [alert, ...state.alerts.filter(a => a.id !== alert.id)];
    saveLocal(next);
    markTriggeredDrawingsRed(next);
    return { alerts: next };
  }),

  updateAlert: (id, patch) => {
    set((state) => {
      const next = state.alerts.map(a =>
        a.id === id ? ({ ...a, ...patch } as AnyAlert) : a
      );
      saveLocal(next);
      markTriggeredDrawingsRed(next);
      return { alerts: next };
    });

    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => {
      void useAlertStore.getState().hydrateFromApi();
      reconcileTimer = null;
    }, 700);
  },

  deleteAlert: async (id) => {
    const endpoint = endpointForId(id);
    const previous = get().alerts;

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
      saveLocal(previous);
      set({ alerts: previous });
    }
  },

  setAlerts: (alerts) => {
    const persisted = alerts.filter(a => isPersistedAlertId(a.id));
    saveLocal(persisted);
    markTriggeredDrawingsRed(persisted);
    set({ alerts: persisted });
  },

  hydrateFromApi: async () => {
    set({ isHydrating: true });
    try {
      const alerts = await fetchDbAlerts();
      saveLocal(alerts);
      markTriggeredDrawingsRed(alerts);
      set({ alerts });
    } catch {
      markTriggeredDrawingsRed(get().alerts);
    } finally {
      set({ isHydrating: false });
    }
  },
}));

if (typeof window !== "undefined") {
  queueMicrotask(() => {
    markTriggeredDrawingsRed(loadLocal());
    void useAlertStore.getState().hydrateFromApi();
  });
}
