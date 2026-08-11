import { create } from "zustand";
import { toArray } from "@/lib/safeArray";

export type BrokerName = "delta" | "ctrader";
export type WsStatus   = "connected" | "reconnecting" | "disconnected" | "error";

export interface LiveTick {
  symbol:     string;
  price:      number;
  volume:     number;
  timestamp:  number;
  receivedAt: number;
  provider:   string;
}

export interface OHLCBar {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface SymbolInfo {
  symbol:       string;
  name:         string;
  contractType: string;
  broker:       string;
  underlying:   string;
  quoteAsset:   string;
  active:       boolean;
}

export interface ProviderStatus {
  name:          string;
  displayName:   string;
  status:        WsStatus;
  tickCount:     number;
  reconnectCount: number;
  lastTickAt:    number | null;
  latencyMs:     number | null;
  subscriptions: string[];
}

interface MarketStoreState {
  activeBroker:    BrokerName | null;
  activeSymbol:    string;
  activeTimeframe: string;

  wsStatus:     Record<string, WsStatus>;
  latency:      Record<string, number | null>;
  reconnecting: Record<string, boolean>;

  ticks:   Record<string, LiveTick>;
  candles: OHLCBar[];

  symbolCatalog: Record<string, SymbolInfo[]>;
  catalogLoaded: Record<string, boolean>;

  providers: ProviderStatus[];

  setActiveBroker:    (broker: BrokerName | null) => void;
  setActiveSymbol:    (symbol: string) => void;
  setActiveTimeframe: (tf: string) => void;

  updateProviderStatus: (name: string, status: WsStatus) => void;
  updateLatency:        (name: string, ms: number | null) => void;
  setReconnecting:      (name: string, val: boolean) => void;

  updateTick:    (tick: LiveTick) => void;
  clearTicks:    () => void;
  setCandles:    (bars: OHLCBar[]) => void;
  appendCandle:  (bar: OHLCBar) => void;
  updateLastCandle: (bar: OHLCBar) => void;

  setSymbolCatalog: (broker: string, symbols: SymbolInfo[]) => void;
  setProviders:     (providers: ProviderStatus[]) => void;

  fetchSymbolCatalog: (broker?: string) => Promise<void>;
}

const LS_BROKER    = "mkt_activeBroker";
const LS_SYMBOL    = "mkt_activeSymbol";
const LS_TIMEFRAME = "mkt_activeTimeframe";

function loadLS(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveLS(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

export const useMarketStore = create<MarketStoreState>((set, get) => ({
  activeBroker:    (loadLS(LS_BROKER, "") as BrokerName) || null,
  activeSymbol:    loadLS(LS_SYMBOL, "BTCUSD"),
  activeTimeframe: loadLS(LS_TIMEFRAME, "60"),

  wsStatus:     {},
  latency:      {},
  reconnecting: {},

  ticks:   {},
  candles: [],

  symbolCatalog: {},
  catalogLoaded: {},

  providers: [],

  setActiveBroker: (broker) => {
    saveLS(LS_BROKER, broker ?? "");
    set({ activeBroker: broker });
  },

  setActiveSymbol: (symbol) => {
    saveLS(LS_SYMBOL, symbol);
    set({ activeSymbol: symbol, candles: [] });
  },

  setActiveTimeframe: (tf) => {
    saveLS(LS_TIMEFRAME, tf);
    set({ activeTimeframe: tf, candles: [] });
  },

  updateProviderStatus: (name, status) => {
    set(state => ({
      wsStatus: { ...state.wsStatus, [name]: status },
      reconnecting: {
        ...state.reconnecting,
        [name]: status === "reconnecting",
      },
    }));
  },

  updateLatency: (name, ms) => {
    set(state => ({ latency: { ...state.latency, [name]: ms } }));
  },

  setReconnecting: (name, val) => {
    set(state => ({ reconnecting: { ...state.reconnecting, [name]: val } }));
  },

  updateTick: (tick) => {
    set(state => ({
      ticks: {
        ...state.ticks,
        [tick.symbol]: tick,
      },
    }));
  },

  clearTicks: () => set({ ticks: {} }),

  setCandles: (bars) => set({ candles: bars }),

  appendCandle: (bar) => {
    set(state => {
      const prev = state.candles;
      if (prev.length === 0) return { candles: [bar] };
      const last = prev[prev.length - 1];
      if (last.time === bar.time) {
        return { candles: [...prev.slice(0, -1), bar] };
      }
      return { candles: [...prev, bar] };
    });
  },

  updateLastCandle: (bar) => {
    set(state => {
      const prev = state.candles;
      if (prev.length === 0) return { candles: [bar] };
      const last = prev[prev.length - 1];
      if (last.time === bar.time) {
        return { candles: [...prev.slice(0, -1), bar] };
      }
      return state;
    });
  },

  setSymbolCatalog: (broker, symbols) => {
    set(state => ({
      symbolCatalog: { ...state.symbolCatalog, [broker]: symbols },
      catalogLoaded: { ...state.catalogLoaded, [broker]: true },
    }));
  },

  setProviders: (providers) => set({ providers }),

  fetchSymbolCatalog: async (broker) => {
    const url = broker ? `/api/symbols?broker=${broker}` : "/api/symbols";
    try {
      const res  = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as Record<string, unknown>;

      if (broker) {
        const symbols = toArray<SymbolInfo>(data["symbols"], `marketStore.fetchSymbolCatalog:${broker}`);
        get().setSymbolCatalog(broker, symbols);
      } else {
        if (data["delta"]) {
          const d = data["delta"] as { symbols?: SymbolInfo[] };
          get().setSymbolCatalog("delta", toArray<SymbolInfo>(d.symbols, "marketStore.fetchSymbolCatalog:delta"));
        }
      }
    } catch { /* non-fatal — catalog is a convenience feature */ }
  },
}));

/**
 * Hook: subscribe to live provider status events from the backend WS.
 * Call once at the app root (e.g. in Layout or App.tsx).
 *
 * Usage:
 *   import { useSyncMarketStore } from "@/store/marketStore";
 *   function Layout() { useSyncMarketStore(); ... }
 */
export function useSyncMarketStore() {
  const store = useMarketStore.getState();

  const handleWsMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;

      if (msg["type"] === "provider_status" || msg["type"] === "feed_status") {
        const name   = String(msg["provider"] ?? "");
        const status = String(msg["status"]   ?? "disconnected") as WsStatus;
        const latency = typeof msg["latencyMs"] === "number" ? msg["latencyMs"] : null;
        if (name) {
          store.updateProviderStatus(name, status);
          if (latency !== null) store.updateLatency(name, latency);
        }
      }

      if (msg["type"] === "tick") {
        const tick: LiveTick = {
          symbol:     String(msg["symbol"]   ?? ""),
          price:      Number(msg["price"]    ?? 0),
          volume:     Number(msg["volume"]   ?? 0),
          timestamp:  Number(msg["timestamp"] ?? Date.now()),
          receivedAt: Number(msg["receivedAt"] ?? Date.now()),
          provider:   String(msg["provider"] ?? ""),
        };
        if (tick.symbol && tick.price > 0) store.updateTick(tick);
      }

      if (msg["type"] === "candle_update") {
        const { symbol, interval, bar } = msg as {
          symbol: string; interval: string; bar: OHLCBar;
        };
        const { activeSymbol, activeTimeframe } = useMarketStore.getState();
        if (symbol === activeSymbol && interval === activeTimeframe && bar) {
          store.updateLastCandle(bar);
        }
      }
    } catch { /* ignore malformed messages */ }
  };

  return handleWsMessage;
}
