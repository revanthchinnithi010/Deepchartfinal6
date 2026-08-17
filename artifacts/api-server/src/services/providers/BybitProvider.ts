import WebSocket from "ws";
import { BaseProvider } from "./BaseProvider.js";
import { logger } from "../../lib/logger.js";

const BYBIT_PUBLIC_WS = "wss://stream.bybit.com/v5/public/linear";
const PING_INTERVAL_MS = 20_000;
const PONG_TIMEOUT_MS = 8_000;
const STALE_FEED_TIMEOUT_MS = 45_000;

interface BybitTrade { T?: number; p?: string; v?: string; S?: string; s?: string; }
interface BybitMessage {
  topic?: string;
  type?: string;
  op?: string;
  ret_msg?: string;
  retCode?: number;
  retMsg?: string;
  ts?: number;
  data?: BybitTrade[];
}

function normalizeBybitSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  if (s.endsWith("USDT")) return s;
  if (s.endsWith("USD")) return `${s.slice(0, -3)}USDT`;
  return `${s}USDT`;
}

function normalizeInternalSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  return s.endsWith("USDT") ? `${s.slice(0, -4)}USD` : s;
}

export class BybitProvider extends BaseProvider {
  readonly name = "bybit";
  readonly displayName = "Bybit";
  readonly badge = "bybit";
  readonly color = "#F59E0B";

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private internalToBybit = new Map<string, string>();
  private bybitToInternal = new Map<string, string>();
  private subscribedBybit = new Set<string>();

  get supportedSymbols(): string[] { return [...this.internalToBybit.keys()]; }

  constructor(symbols: string[] = []) {
    super();
    this.refreshSymbols(symbols);
  }

  refreshSymbols(symbols: string[]): void {
    for (const symbol of symbols) {
      const internal = normalizeInternalSymbol(symbol);
      const bybit = normalizeBybitSymbol(symbol);
      if (!internal || !bybit) continue;
      this.internalToBybit.set(internal, bybit);
      this.bybitToInternal.set(bybit, internal);
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      for (const symbol of this.subscriptions) this.subscribeSymbol(symbol);
    }
  }

  connect(): void {
    if (
      this.destroyed ||
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) return;

    this.clearReconnectTimer();
    this.clearHeartbeat();
    logger.info({ provider: this.name, url: BYBIT_PUBLIC_WS }, "BybitProvider: connecting");
    this.ws = new WebSocket(BYBIT_PUBLIC_WS, { handshakeTimeout: 10_000 });

    this.ws.on("open", () => {
      this.onConnected();
      this.lastMessageAt = Date.now();
      this.startHeartbeat();
      logger.info({ provider: this.name, subscriptions: [...this.subscriptions] }, "BybitProvider: websocket ready — 24x7 watchdog active");
    });

    this.ws.on("message", raw => {
      try {
        const msg = JSON.parse(raw.toString()) as BybitMessage;
        this.lastMessageAt = Date.now();

        if (msg.type === "COMMAND_RESP") return;
        if (msg.op === "pong") {
          this.clearPongTimeout();
          return;
        }
        if (msg.success === true && msg.ret_msg === "pong") {
          this.clearPongTimeout();
          return;
        }
        if (msg.op === "subscribe") {
          if (msg.ret_msg || (typeof msg.retCode === "number" && msg.retCode !== 0)) {
            logger.warn({ provider: this.name, ret_msg: msg.ret_msg ?? msg.retMsg }, "BybitProvider: subscription rejected");
          }
          return;
        }
        if (!msg.topic?.startsWith("publicTrade.")) return;

        const bybitSymbol = msg.topic.slice("publicTrade.".length).toUpperCase();
        const internalSymbol = this.bybitToInternal.get(bybitSymbol);
        if (!internalSymbol) return;

        const trades = Array.isArray(msg.data) ? msg.data : [];
        for (const trade of trades) {
          const price = Number(trade.p);
          if (!Number.isFinite(price) || price <= 0) continue;
          const volume = Number(trade.v ?? 0);
          const timestamp = Number(trade.T ?? msg.ts ?? Date.now());
          this.onTick({
            symbol: internalSymbol,
            providerSymbol: bybitSymbol,
            provider: this.name,
            price,
            volume: Number.isFinite(volume) ? volume : 0,
            timestamp: timestamp > 1e12 ? timestamp : timestamp * 1000,
            receivedAt: Date.now(),
            tickType: "trade",
          });
        }
      } catch (err) {
        logger.warn({ err, provider: this.name }, "BybitProvider: message parse error");
      }
    });

    this.ws.on("error", (err: Error) => {
      logger.warn({ provider: this.name, err: err.message }, "BybitProvider: websocket error");
      this.onError(err);
      try { this.ws?.close(); } catch { /* close handler schedules retry */ }
    });

    this.ws.on("close", (code, reason) => {
      this.clearHeartbeat();
      this.subscribedBybit.clear();
      logger.warn({ provider: this.name, code, reason: reason.toString() }, "BybitProvider: websocket closed — automatic reconnect enabled");
      this.onDisconnected(code);
    });
  }

  override subscribe(symbol: string): boolean {
    const internal = normalizeInternalSymbol(symbol);
    const bybit = normalizeBybitSymbol(symbol);
    this.internalToBybit.set(internal, bybit);
    this.bybitToInternal.set(bybit, internal);
    return super.subscribe(internal);
  }

  subscribeSymbol(symbol: string): void {
    const internal = normalizeInternalSymbol(symbol);
    const bybit = this.internalToBybit.get(internal) ?? normalizeBybitSymbol(internal);
    this.internalToBybit.set(internal, bybit);
    this.bybitToInternal.set(bybit, internal);
    if (this.ws?.readyState === WebSocket.OPEN && !this.subscribedBybit.has(bybit)) {
      this.subscribedBybit.add(bybit);
      this.ws.send(JSON.stringify({ op: "subscribe", args: [`publicTrade.${bybit}`] }));
      logger.info({ provider: this.name, symbol: internal, providerSymbol: bybit }, "BybitProvider: subscribed public trade stream");
    }
  }

  unsubscribeSymbol(symbol: string): void {
    const internal = normalizeInternalSymbol(symbol);
    const bybit = this.internalToBybit.get(internal);
    if (!bybit) return;
    this.subscribedBybit.delete(bybit);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: "unsubscribe", args: [`publicTrade.${bybit}`] }));
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.subscribedBybit.clear();
    try { this.ws?.close(1000, "server shutdown"); } catch { /* ignore */ }
    this.ws = null;
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();

    const ping = () => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ op: "ping" }));
      } catch {
        try { ws.close(); } catch { /* reconnect on close */ }
        return;
      }

      this.clearPongTimeout();
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        logger.warn({ provider: this.name }, "BybitProvider: pong timeout — forcing reconnect");
        try { ws.close(4000, "pong timeout"); } catch { /* reconnect on close */ }
      }, PONG_TIMEOUT_MS);
    };

    ping();
    this.pingTimer = setInterval(ping, PING_INTERVAL_MS);

    // A silent/stalled socket is unhealthy even if TCP still reports OPEN.
    this.staleTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (this.subscriptions.size === 0) return;
      if (Date.now() - this.lastMessageAt > STALE_FEED_TIMEOUT_MS) {
        logger.warn({ provider: this.name, lastMessageAt: this.lastMessageAt }, "BybitProvider: stale feed — forcing reconnect");
        try { this.ws.close(4001, "stale feed"); } catch { /* reconnect on close */ }
      }
    }, 10_000);
  }

  private clearPongTimeout(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private clearHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.pingTimer = null;
    this.pongTimer = null;
    this.staleTimer = null;
  }
}
