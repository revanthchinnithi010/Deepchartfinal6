import {
  createContext, useContext, useEffect, useRef, useState,
  useCallback, type ReactNode, useMemo,
} from "react";
import { useTickStore } from "@/store/tickStore";
import type { TickState, FlashDir } from "@/store/tickStore";
import { useCtraderSpotStore } from "@/store/ctraderSpotStore";
import { useAlertStore } from "@/store/alertStore";
// Re-export for backward compat — all consumers can import from here or tickStore
export type { FlashDir, TickState } from "@/store/tickStore";

export type WsStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

export interface AlertTriggeredMsg {
  type: "alert_triggered";
  alertType: "price" | "zone" | "trendline";
  alertId: number;
  symbol: string;
  condition: string;
  conditionLabel?: string;
  triggeredPrice: number;
  triggeredAt: string;
  message?: string | null;
  targetPrice?: number;
  upperPrice?: number;
  lowerPrice?: number;
  zoneType?: string;
  direction?: string;
  projectedPrice?: number;
  timeframe?: string;
  drawingType?: string;
}

interface LiveMarketContextValue {
  wsStatus: WsStatus;
  latencyMs: number | null;
  alertEvents: AlertTriggeredMsg[];
  subscribeToMessages: (handler: (msg: unknown) => void) => () => void;
  sendMessage: (msg: object) => void;
}

const MAX_HISTORY = 40;
const FLASH_MS = 700;
const MAX_RECONNECT_ATTEMPTS = Infinity;
const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_MS = 15_000;
const PONG_TIMEOUT_MS = 10_000;

export function fmtPrice(price: number, symbol: string): string {
  if (!isFinite(price) || isNaN(price) || price === 0) return "—";
  if (symbol === "NAS100" || symbol === "US30")
    return Math.round(price).toLocaleString("en-US");
  if (price >= 10_000)
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1_000)   return price.toFixed(2);
  if (price >= 100)     return price.toFixed(3);
  if (price >= 10)      return price.toFixed(3);
  if (price >= 1)       return price.toFixed(5);
  if (price >= 0.1)     return price.toFixed(5);
  if (price >= 0.01)    return price.toFixed(6);
  if (price >= 0.001)   return price.toFixed(7);
  if (price >= 0.0001)  return price.toFixed(8);
  if (price >= 0.00001) return price.toFixed(8);
  return price.toFixed(10);
}

export function fmtTickAge(lastTick: number): string {
  const secs = Math.floor((Date.now() - lastTick) / 1000);
  if (secs < 2)  return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export const SYMBOL_PROVIDERS: Record<string, string> = {
  BTCUSD: "Binance",  ETHUSD: "Binance",  SOLUSD: "Binance",
  DOGEUSD: "Binance", PEPEUSD: "Binance",
  NAS100: "OANDA",    US30: "OANDA",      XAUUSD: "OANDA",
  EURUSD: "OANDA",    GBPJPY: "OANDA",    USOIL: "OANDA",  UKOIL: "OANDA",
};

const LiveMarketContext = createContext<LiveMarketContextValue>({
  wsStatus: "disconnected", latencyMs: null, alertEvents: [],
  subscribeToMessages: () => () => {},
  sendMessage: () => {},
});

export function LiveMarketProvider({ children }: { children: ReactNode }) {
  const [wsStatus,    setWsStatus]    = useState<WsStatus>("disconnected");
  const [latencyMs,   setLatencyMs]   = useState<number | null>(null);
  const [alertEvents, setAlertEvents] = useState<AlertTriggeredMsg[]>([]);

  const msgSubscribersRef = useRef<Set<(msg: unknown) => void>>(new Set());

  const subscribeToMessages = useCallback((handler: (msg: unknown) => void) => {
    msgSubscribersRef.current.add(handler);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { handler({ type: "welcome" }); } catch { /* ignore */ }
    }
    return () => { msgSubscribersRef.current.delete(handler); };
  }, []);

  const sendMessage = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
    }
  }, []);

  // ── Tick state is RAF-throttled into Zustand tickStore ───────────────────
  // Raw ticks are buffered in pendingTicksRef and flushed as one _setMany()
  // call per animation frame — capping React re-renders at 60fps instead of
  // firing on every raw WS message (which can arrive 16+/sec across symbols).
  const flashTimers     = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const wsRef           = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay  = useRef(1000);
  const reconnectAttempts = useRef(0);
  const mountedRef      = useRef(true);
  const heartbeatRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimeRef     = useRef<number | null>(null);
  const connectTimeRef  = useRef<number>(0);
  const lastSeenPrices  = useRef<Record<string, number>>({});

  // RAF-throttle state
  const pendingTicksRef = useRef<Record<string, TickState>>({});
  const rafIdRef        = useRef<number | null>(null);

  const flushTicks = useCallback(() => {
    rafIdRef.current = null;
    const batch = pendingTicksRef.current;
    pendingTicksRef.current = {};
    if (Object.keys(batch).length === 0) return;

    useTickStore.getState()._setMany(batch);

    // Schedule flash-clear timeouts AFTER the batch lands in the store
    for (const [sym, tick] of Object.entries(batch)) {
      if (tick.flashDir !== null) {
        if (flashTimers.current[sym]) clearTimeout(flashTimers.current[sym]);
        flashTimers.current[sym] = setTimeout(() => {
          if (!mountedRef.current) return;
          const s = useTickStore.getState();
          const t = s.ticks[sym];
          if (!t) return;
          s._setTick(sym, { ...t, flashDir: null });
        }, FLASH_MS);
      }
    }
  }, []);

  const handleTick = useCallback((
    symbol: string,
    price: number,
    bid?: number,
    ask?: number,
    extra?: { volume?: number; high?: number; low?: number; markPrice?: number },
  ) => {
    if (lastSeenPrices.current[symbol] === price) return;
    lastSeenPrices.current[symbol] = price;

    // Read previous state: prefer in-flight pending tick (intra-frame accuracy)
    // over the committed store state so rapid same-symbol ticks compute correct deltas.
    const prev    = pendingTicksRef.current[symbol] ?? useTickStore.getState().ticks[symbol];
    const prevPrice  = prev?.price ?? null;
    const openPrice  = prev?.openPrice ?? price;
    const history: number[] = prev
      ? (prev.history.length >= MAX_HISTORY
          ? [...prev.history.slice(1), price]
          : [...prev.history, price])
      : [price];
    const change    = price - openPrice;
    const changePct = openPrice !== 0 ? (change / openPrice) * 100 : 0;
    const flashDir: FlashDir =
      prevPrice !== null
        ? price > prevPrice ? "up" : price < prevPrice ? "down" : null
        : null;
    const flashKey  = (prev?.flashKey  ?? 0) + (flashDir ? 1 : 0);
    const tickCount = (prev?.tickCount ?? 0) + 1;

    // Preserve existing bid/ask if not supplied (all_trades doesn't carry them)
    const resolvedBid    = bid    ?? prev?.bid;
    const resolvedAsk    = ask    ?? prev?.ask;
    const resolvedSpread = (resolvedBid && resolvedAsk && resolvedAsk > resolvedBid)
      ? resolvedAsk - resolvedBid
      : prev?.spread;

    // Preserve existing 24h stats when a given message doesn't carry them
    // (e.g. all_trades ticks never carry volume/high/low/markPrice).
    const resolvedVolume    = extra?.volume    ?? prev?.volume;
    const resolvedHigh      = extra?.high      ?? prev?.high;
    const resolvedLow       = extra?.low       ?? prev?.low;
    const resolvedMarkPrice = extra?.markPrice ?? prev?.markPrice;

    pendingTicksRef.current[symbol] = {
      price, prevPrice, openPrice, change, changePct,
      history, lastTick: Date.now(), flashDir, flashKey, tickCount,
      bid: resolvedBid, ask: resolvedAsk, spread: resolvedSpread,
      volume: resolvedVolume, high: resolvedHigh, low: resolvedLow, markPrice: resolvedMarkPrice,
    };

    // Schedule one RAF flush for this frame (idempotent — noop if already scheduled)
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushTicks);
    }
  }, [flushTicks]);

  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      pingTimeRef.current = Date.now();

      // Arm a watchdog: if no "pong" arrives within PONG_TIMEOUT_MS, the socket
      // is half-dead (server thinks OPEN, but nothing is actually flowing —
      // common after mobile wifi/cellular handoff or a proxy idle-drop that
      // never delivers a close frame). Force-close so onclose fires and the
      // normal reconnect loop below kicks in.
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = setTimeout(() => {
        pongTimeoutRef.current = null;
        console.warn("[LiveMarket] pong timeout — connection appears dead, forcing reconnect");
        wsRef.current?.close();
      }, PONG_TIMEOUT_MS);

      try { wsRef.current.send(JSON.stringify({ type: "ping" })); } catch { /* ignore */ }
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("[LiveMarket] max reconnect attempts reached — stopping");
      setWsStatus("error");
      return;
    }
    // If the frontend and backend are deployed as two separate services (e.g.
    // two Railway services on two different *.up.railway.app domains),
    // VITE_API_BASE_URL points REST fetch() calls at the backend's origin
    // (see installApiBaseUrl.ts). That interceptor only patches window.fetch,
    // not the WebSocket constructor — so without this, the socket always
    // dials window.location.host (the frontend's own static server, which
    // has no /api/ws route) and every "tick"/"candle_update" broadcast the
    // backend sends is delivered to a connection the browser never actually
    // has. Ticks still show up fine in backend logs because that pipeline
    // (provider → AlertEngine → wsManager.broadcast) runs independently of
    // whether any client is connected.
    const rawApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
    const apiBase = rawApiBase?.trim().replace(/\/+$/, "");
    let wsOrigin: string;
    if (apiBase) {
      const withScheme = /^https?:\/\//i.test(apiBase) ? apiBase : `https://${apiBase}`;
      const parsed = new URL(withScheme);
      wsOrigin = `${parsed.protocol === "https:" ? "wss:" : "ws:"}//${parsed.host}`;
    } else {
      // Same-origin deployment (single service, or local dev) — unchanged.
      wsOrigin = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    }
    const url = `${wsOrigin}/api/ws`;
    console.log(`[LiveMarket] connecting to ${url} (attempt ${reconnectAttempts.current + 1})`);
    setWsStatus("connecting");

    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch (e) {
      console.error("[LiveMarket] WebSocket construction failed:", e);
      setWsStatus("error");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      console.log("[LiveMarket] websocket connected");
      setWsStatus("connected");
      reconnectDelay.current    = 1000;
      reconnectAttempts.current = 0;
      connectTimeRef.current    = Date.now();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);
      sendHeartbeat();
      for (const handler of msgSubscribersRef.current) {
        try { handler({ type: "welcome" }); } catch { /* ignore */ }
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        for (const handler of msgSubscribersRef.current) { handler(msg); }
        if (msg.type === "tick" && typeof msg.symbol === "string" && typeof msg.price === "number") {
          handleTick(
            msg.symbol,
            msg.price,
            typeof msg.bid === "number" ? msg.bid : undefined,
            typeof msg.ask === "number" ? msg.ask : undefined,
            {
              volume:    typeof msg.volume    === "number" ? msg.volume    : undefined,
              high:      typeof msg.high      === "number" ? msg.high      : undefined,
              low:       typeof msg.low       === "number" ? msg.low       : undefined,
              markPrice: typeof msg.markPrice === "number" ? msg.markPrice : undefined,
            },
          );
          if (connectTimeRef.current > 0) {
            setLatencyMs(Date.now() - connectTimeRef.current);
            connectTimeRef.current = 0;
          }
        } else if (msg.type === "ctrader_tick" && typeof msg.symbol === "string" && typeof msg.price === "number") {
          handleTick(
            msg.symbol as string,
            msg.price as number,
            typeof msg.bid === "number" ? msg.bid as number : undefined,
            typeof msg.ask === "number" ? msg.ask as number : undefined,
          );
          useCtraderSpotStore.getState().setSpotTick({
            symbol:     msg.symbol    as string,
            symbolId:   (msg.symbolId as number) ?? 0,
            bid:        (msg.bid      as number) ?? 0,
            ask:        (msg.ask      as number) ?? 0,
            spread:     (msg.spread   as number) ?? 0,
            mid:        (msg.mid      as number) ?? msg.price as number,
            timestamp:  (msg.timestamp as number) ?? Date.now(),
            receivedAt: Date.now(),
          });
        } else if (msg.type === "ctrader_status") {
          useCtraderSpotStore.getState().setStatus({
            connStatus:      msg.status         as string,
            accountId:       (msg.accountId     as number) ?? 0,
            isLive:          (msg.isLive        as boolean) ?? false,
            subscribedCount: (msg.subscribedCount as number) ?? 0,
            reconnectCount:  (msg.reconnectCount as number) ?? 0,
            connectedAt:     (msg.connectedAt   as number | null) ?? null,
            lastTickAt:      (msg.lastTickAt    as number | null) ?? null,
            tickCounts:      (msg.tickCounts    as Record<string, number>) ?? {},
            error:           msg.error          as string | undefined,
          });
        } else if (msg.type === "pong") {
          if (pongTimeoutRef.current) {
            clearTimeout(pongTimeoutRef.current);
            pongTimeoutRef.current = null;
          }
          if (pingTimeRef.current !== null) {
            setLatencyMs(Date.now() - pingTimeRef.current);
            pingTimeRef.current = null;
          }
        } else if (msg.type === "alert_triggered") {
          const ev = msg as AlertTriggeredMsg;
          console.log("[LiveMarket] alert triggered:", ev.symbol, ev.condition);
          setAlertEvents(prev => [ev, ...prev].slice(0, 100));

          // Keep the global alert UI in sync with the DB/AlertEngine immediately.
          // This makes Charts, the bell and Alerts page reflect a trigger without
          // requiring a refresh.
          const prefix =
            ev.alertType === "price" ? "p_" :
            ev.alertType === "zone" ? "z_" : "t_";
          const id = `${prefix}${ev.alertId}`;
          useAlertStore.getState().updateAlert(id, {
            status: "triggered",
            triggeredAt: ev.triggeredAt,
          });
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      reconnectAttempts.current += 1;
      console.warn(`[LiveMarket] websocket disconnected (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`);
      wsRef.current = null;
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (pongTimeoutRef.current) { clearTimeout(pongTimeoutRef.current); pongTimeoutRef.current = null; }
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        setWsStatus("error"); return;
      }
      setWsStatus("reconnecting");
      console.log(`[LiveMarket] reconnecting in ${reconnectDelay.current}ms...`);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, MAX_RECONNECT_DELAY_MS);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      console.error("[LiveMarket] websocket error");
      setWsStatus("error");
      ws.close();
    };
  }, [handleTick, sendHeartbeat]);

  // Force a fresh connection attempt right now, bypassing backoff — used when
  // the tab regains focus or the network comes back online, since a socket
  // can go half-dead in the background (mobile tab suspension, wifi<->cellular
  // handoff) without ever firing onclose/onerror.
  const forceReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return; // already fine
    console.log("[LiveMarket] forcing reconnect (visibility/online)");
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    reconnectAttempts.current = 0;
    reconnectDelay.current = 1000;
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    fetch("/api/market/ticks", { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, { symbol: string; price: number; timestamp: number }> | null) => {
        if (!data || !mountedRef.current) return;
        console.log("[LiveMarket] initial ticks snapshot:", Object.keys(data).length, "symbols");
        const initial: Record<string, TickState> = {};
        Object.values(data).forEach(t => {
          initial[t.symbol] = {
            price: t.price, prevPrice: null, openPrice: t.price,
            change: 0, changePct: 0, history: [t.price],
            lastTick: t.timestamp ?? Date.now(),
            flashDir: null, flashKey: 0, tickCount: 0,
          };
          lastSeenPrices.current[t.symbol] = t.price;
        });
        useTickStore.getState()._setMany(initial);
      })
      .catch(() => {});

    reconnectAttempts.current = 0;
    reconnectDelay.current    = 1000;
    connect();

    // Mobile browsers frequently suspend background tabs and don't reliably
    // fire WebSocket close/error events on resume, or when hopping between
    // wifi and cellular. Re-check the connection whenever the tab becomes
    // visible again or the browser reports it's back online.
    const handleVisibilityChange = () => {
      if (!document.hidden) forceReconnect();
    };
    const handleOnline = () => forceReconnect();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pageshow", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      controller.abort();
      Object.values(flashTimers.current).forEach(clearTimeout);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pageshow", handleVisibilityChange);
      wsRef.current?.close();
    };
  }, [connect, forceReconnect]);

  const value = useMemo(
    () => ({ wsStatus, latencyMs, alertEvents, subscribeToMessages, sendMessage }),
    [wsStatus, latencyMs, alertEvents, subscribeToMessages, sendMessage],
  );

  return (
    <LiveMarketContext.Provider value={value}>
      {children}
    </LiveMarketContext.Provider>
  );
}

export function useLiveMarketContext() {
  return useContext(LiveMarketContext);
}

/** Read tick for a single symbol — hook form, per-symbol re-render isolation. */
export function useLivePrice(symbol: string): TickState | null {
  return useTickStore(s => s.ticks[symbol] ?? null);
      }
