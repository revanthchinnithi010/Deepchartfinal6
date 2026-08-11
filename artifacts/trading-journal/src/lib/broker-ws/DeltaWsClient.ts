import { WsConnection } from "./WsConnection";
import type {
  IBrokerWsClient, WsClientState, BrokerEventHandler,
  TickEvent, StatusEvent,
} from "./types";

const DELTA_WS_INDIA = "wss://socket.india.delta.exchange";
const DELTA_WS_INTL  = "wss://socket.delta.exchange";

interface DeltaTicker {
  type: "v2/ticker";
  symbol: string;
  close?: number;
  mark_price?: string | number;
  spot_price?: string | number;
  best_bid_price?: string | number;
  best_ask_price?: string | number;
}

type DeltaMsg =
  | { type: "heartbeat" | "pong" | "subscriptions" | "auth" | string }
  | DeltaTicker;

/**
 * Direct browser → Delta Exchange WebSocket client.
 *
 * Handles the PUBLIC channel side only (v2/ticker for live price ticks).
 * Private channels (balance, orders, positions) are handled by the backend
 * deltaSocket.ts which relays them via the app's WSManager.
 *
 * The WS URL is configurable at runtime so India vs International accounts
 * both work without re-creating the client:
 *   India:         wss://socket.india.delta.exchange
 *   International: wss://socket.delta.exchange
 *
 * Call setWsUrl() before connect() when the account's ws_url is known.
 */
export class DeltaWsClient implements IBrokerWsClient {
  readonly brokerId = "delta" as const;

  private readonly conn: WsConnection;
  private readonly handlers = new Set<BrokerEventHandler>();
  private _state: WsClientState = {
    status: "idle",
    latencyMs: null,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastPongAt: null,
  };

  private _wsUrl: string = DELTA_WS_INDIA;
  private subscribedSymbols = new Set<string>();

  constructor(wsUrl?: string) {
    if (wsUrl) this._wsUrl = wsUrl;

    this.conn = new WsConnection({
      url: () => this._wsUrl,
      name: "Delta Ticker WS",
      heartbeatIntervalMs: 25_000,
      heartbeatTimeoutMs:  20_000, // Delta's own heartbeat cycle can exceed 10 s; 20 s avoids false timeouts
      reconnectOptions: {
        initialDelayMs: 1_000,
        maxDelayMs:    30_000,
        backoffFactor:  1.5,
      },
      onOpen: () => this.resubscribeAll(),
      onMessage: (data) => this.handleMessage(data as DeltaMsg),
      onStatusChange: (status) => {
        this._state = { ...this._state, status };
        this.emit({ kind: "status", broker: "delta", status, ts: Date.now() } as StatusEvent);
      },
      onLatency: (ms) => {
        this._state = { ...this._state, latencyMs: ms };
        this.emit({ kind: "latency", broker: "delta", latencyMs: ms, ts: Date.now() });
      },
    });
  }

  /** Update the WS URL before calling connect(). Safe to call multiple times. */
  setWsUrl(url: string): void {
    if (url && url !== this._wsUrl) {
      this._wsUrl = url;
    }
  }

  /** Resolve the best WS URL: prefer the stored URL, fall back to India endpoint. */
  static resolveWsUrl(wsUrlFromAccount?: string): string {
    if (wsUrlFromAccount && wsUrlFromAccount.startsWith("wss://")) {
      return wsUrlFromAccount;
    }
    return DELTA_WS_INDIA;
  }

  get wsUrl(): string { return this._wsUrl; }

  get state(): WsClientState {
    return {
      ...this._state,
      latencyMs: this.conn.latencyMs,
      reconnectAttempts: this.conn.reconnectAttempts,
      lastConnectedAt: this.conn.lastConnectedAt,
      lastPongAt: this.conn.lastPongAt,
    };
  }

  connect(): void { this.conn.connect(); }
  disconnect(): void { this.conn.disconnect(); }
  send(msg: unknown): boolean { return this.conn.send(msg); }

  onEvent(handler: BrokerEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeSymbol(symbol: string): void {
    this.subscribedSymbols.add(symbol);
    this.conn.send({
      type: "subscribe",
      payload: { channels: [{ name: "v2/ticker", symbols: [symbol] }] },
    });
  }

  unsubscribeSymbol(symbol: string): void {
    this.subscribedSymbols.delete(symbol);
    this.conn.send({
      type: "unsubscribe",
      payload: { channels: [{ name: "v2/ticker", symbols: [symbol] }] },
    });
  }

  private resubscribeAll(): void {
    if (this.subscribedSymbols.size === 0) return;
    this.conn.send({
      type: "subscribe",
      payload: { channels: [{ name: "v2/ticker", symbols: [...this.subscribedSymbols] }] },
    });
  }

  private handleMessage(msg: DeltaMsg): void {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "heartbeat" || msg.type === "pong") {
      this.conn.notifyPong();
      return;
    }

    if (msg.type === "v2/ticker") {
      const t = msg as DeltaTicker;
      const rawPrice = t.close ?? t.mark_price ?? t.spot_price;
      const price = typeof rawPrice === "string" ? parseFloat(rawPrice) : (rawPrice ?? 0);
      if (!isFinite(price) || price === 0) return;

      const bid = t.best_bid_price ? parseFloat(String(t.best_bid_price)) : undefined;
      const ask = t.best_ask_price ? parseFloat(String(t.best_ask_price)) : undefined;

      this.emit({
        kind: "tick", broker: "delta",
        symbol: t.symbol, price, bid, ask,
        ts: Date.now(),
      } as TickEvent);
    }
  }

  private emit(event: Parameters<BrokerEventHandler>[0]): void {
    for (const h of this.handlers) {
      try { h(event); } catch (e) { console.error("[DeltaWsClient] handler error", e); }
    }
  }
}

export { DELTA_WS_INDIA, DELTA_WS_INTL };
