/**
 * Direct Bybit V5 public market-data WebSocket.
 *
 * This is intentionally independent from the app API/WebSocket so crypto
 * prices keep flowing even when the Railway/Replit backend socket is down.
 * Public market data needs no API key.
 *
 * Bybit recommends a ping every 20s and reconnecting after disconnects.
 * We use a single linear connection, exponential backoff capped at 30s,
 * infinite retry attempts, visibility/online recovery, and RAF batching so
 * high-frequency trades never cause a React render per exchange message.
 */

export interface BybitTick {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
}

export interface BybitFeedStatus {
  status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  latencyMs: number | null;
  lastMessageAt: number | null;
  reconnectAttempts: number;
}

export type BybitTickHandler = (ticks: BybitTick[]) => void;
export type BybitStatusHandler = (status: BybitFeedStatus) => void;

const ENDPOINT = "wss://stream.bybit.com/v5/public/linear";
const PING_MS = 20_000;
const PONG_TIMEOUT_MS = 8_000;
const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const BACKOFF = 1.5;

// The app uses USD-style internal symbols while Bybit linear uses USDT.
// Keep the symbols shown in the current Markets/Charts screens covered.
const DEFAULT_LINEAR_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "JTOUSDT", "FARTCOINUSDT",
  "XRPUSDT", "BNBUSDT", "AVAXUSDT", "1000PEPEUSDT", "DOGEUSDT",
  "PEPEUSDT", "ADAUSDT", "SUIUSDT", "LINKUSDT", "TONUSDT",
];

function toAppSymbol(bybitSymbol: string): string {
  return bybitSymbol.endsWith("USDT")
    ? `${bybitSymbol.slice(0, -4)}USD`
    : bybitSymbol;
}

class BybitPublicWs {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_MS;
  private reconnectAttempts = 0;
  private pingSentAt = 0;
  private lastMessageAt: number | null = null;
  private latencyMs: number | null = null;
  private readonly handlers = new Set<BybitTickHandler>();
  private readonly statusHandlers = new Set<BybitStatusHandler>();
  private pending = new Map<string, BybitTick>();
  private rafId: number | null = null;
  private symbols = new Set(DEFAULT_LINEAR_SYMBOLS);

  start(): void {
    if (typeof window === "undefined" || this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.connect();
  }

  stop(): void {
    this.destroyed = true;
    this.clearTimers();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    try { this.ws?.close(1000, "client shutdown"); } catch { /* ignore */ }
    this.ws = null;
    this.emitStatus("idle");
  }

  onTick(handler: BybitTickHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: BybitStatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  setSymbols(symbols: string[]): void {
    const next = new Set(
      symbols
        .map(s => s.toUpperCase())
        .map(s => s.endsWith("USDT") ? s : s.endsWith("USD") ? `${s.slice(0, -3)}USDT` : `${s}USDT`)
        .filter(Boolean),
    );
    if (next.size === 0) return;

    const added = [...next].filter(s => !this.symbols.has(s));
    const removed = [...this.symbols].filter(s => !next.has(s));
    this.symbols = next;

    if (this.ws?.readyState === WebSocket.OPEN) {
      if (added.length) this.sendSubscribe(added);
      if (removed.length) this.sendUnsubscribe(removed);
    }
  }

  private connect(): void {
    if (this.destroyed || typeof window === "undefined") return;
    this.clearReconnectTimer();
    this.emitStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(ENDPOINT);
    } catch (error) {
      console.error("[BybitWS] WebSocket construction failed", error);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws || this.destroyed) return;
      this.reconnectAttempts = 0;
      this.reconnectDelay = INITIAL_RECONNECT_MS;
      this.lastMessageAt = Date.now();
      this.emitStatus("connected");
      this.sendSubscribe([...this.symbols]);
      this.startHeartbeat();
      console.info(`[BybitWS] connected — ${this.symbols.size} linear trade topics`);
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = Date.now();

      let msg: any;
      try { msg = JSON.parse(String(event.data)); } catch { return; }

      if (msg?.op === "pong") {
        if (this.pingSentAt) this.latencyMs = Math.max(0, Date.now() - this.pingSentAt);
        if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
        return;
      }

      if (msg?.success === true && msg?.ret_msg === "pong") {
        if (this.pingSentAt) this.latencyMs = Math.max(0, Date.now() - this.pingSentAt);
        if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
        return;
      }

      if (typeof msg?.topic !== "string" || !msg.topic.startsWith("publicTrade.")) return;
      if (!Array.isArray(msg.data)) return;

      for (const trade of msg.data) {
        const price = Number(trade?.p);
        const volume = Number(trade?.v ?? 0);
        const ts = Number(trade?.T ?? msg.ts ?? Date.now());
        const bybitSymbol = String(trade?.s ?? msg.topic.slice("publicTrade.".length));
        if (!Number.isFinite(price) || price <= 0) continue;
        const appSymbol = toAppSymbol(bybitSymbol);
        this.pending.set(appSymbol, {
          symbol: appSymbol,
          price,
          volume: Number.isFinite(volume) ? volume : 0,
          timestamp: Number.isFinite(ts) ? ts : Date.now(),
        });
      }
      this.scheduleFlush();
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
      console.warn("[BybitWS] socket error — reconnecting");
      this.emitStatus("error");
      try { ws.close(); } catch { /* onclose handles retry */ }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearHeartbeat();
      if (this.destroyed) return;
      this.scheduleReconnect();
    };
  }

  private sendSubscribe(symbols: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN || symbols.length === 0) return;
    // Linear public streams do not impose the spot 10-arg/request limit.
    // Keep messages comfortably below the documented 21k-character args cap.
    for (let i = 0; i < symbols.length; i += 100) {
      const args = symbols.slice(i, i + 100).map(s => `publicTrade.${s}`);
      try { this.ws.send(JSON.stringify({ op: "subscribe", args })); } catch { /* retry via reconnect */ }
    }
  }

  private sendUnsubscribe(symbols: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN || symbols.length === 0) return;
    const args = symbols.map(s => `publicTrade.${s}`);
    try { this.ws.send(JSON.stringify({ op: "unsubscribe", args })); } catch { /* ignore */ }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      this.pingSentAt = Date.now();
      try { ws.send(JSON.stringify({ op: "ping" })); } catch { return; }

      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        console.warn("[BybitWS] heartbeat timeout — forcing reconnect");
        try { ws.close(4000, "heartbeat timeout"); } catch { /* ignore */ }
      }, PONG_TIMEOUT_MS);
    }, PING_MS);

    // Do not wait 20s for the first heartbeat.
    this.pingSentAt = Date.now();
    try { this.ws.send(JSON.stringify({ op: "ping" })); } catch { /* reconnect path */ }
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.close(4000, "initial heartbeat timeout"); } catch { /* ignore */ }
      }
    }, PONG_TIMEOUT_MS);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * BACKOFF, MAX_RECONNECT_MS);
    this.emitStatus("reconnecting");
    console.warn(`[BybitWS] reconnect #${this.reconnectAttempts} in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private scheduleFlush(): void {
    if (this.rafId !== null || typeof window === "undefined") return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.pending.size === 0) return;
      const batch = [...this.pending.values()];
      this.pending.clear();
      for (const handler of this.handlers) {
        try { handler(batch); } catch (error) { console.error("[BybitWS] tick handler failed", error); }
      }
    });
  }

  private emitStatus(status: BybitFeedStatus["status"]): void {
    const snapshot: BybitFeedStatus = {
      status,
      latencyMs: this.latencyMs,
      lastMessageAt: this.lastMessageAt,
      reconnectAttempts: this.reconnectAttempts,
    };
    for (const handler of this.statusHandlers) {
      try { handler(snapshot); } catch { /* ignore */ }
    }
  }

  private clearHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    this.clearReconnectTimer();
  }
}

export const bybitPublicWs = new BybitPublicWs();

// One global browser instance only. React remounts must never create multiple
// Bybit connections because Bybit explicitly asks clients not to reconnect
// excessively and limits connection creation per IP.
if (typeof window !== "undefined") {
  bybitPublicWs.start();

  const recover = () => bybitPublicWs.start();
  window.addEventListener("online", recover);
  window.addEventListener("pageshow", recover);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recover();
  });
}
