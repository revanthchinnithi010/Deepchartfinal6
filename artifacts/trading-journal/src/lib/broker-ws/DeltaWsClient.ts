import { WsConnection } from "./WsConnection";
import type {
  IBrokerWsClient, WsClientState, BrokerEventHandler,
  TickEvent, StatusEvent,
} from "./types";

// Delta's legacy public feed (socket.india.delta.exchange + v2/ticker) was
// deprecated on 31 Jul 2026. Market data now comes from the public socket.
const DELTA_WS_INDIA = "wss://socket.india.delta.exchange";
const DELTA_WS_INTL  = "wss://socket.delta.exchange";
const DELTA_PUBLIC_WS = "wss://public-socket.india.delta.exchange";

interface DeltaTickerLegacy {
  type: "v2/ticker";
  symbol: string;
  close?: number;
  mark_price?: string | number;
  spot_price?: string | number;
  best_bid_price?: string | number;
  best_ask_price?: string | number;
}

interface DeltaTickerPublic {
  type: "ticker";
  sy?: string;
  sp?: string | number;
  d?: Array<{
    s?: string;
    m?: string | number;
    ohlc?: Array<string | number>;
    q?: Array<string | number | null>;
  }>;
}

interface DeltaTrade {
  type: "trades";
  sy?: string;
  p?: string | number;
  ts?: number;
  t?: number;
}

interface DeltaObL1 {
  type: "ob_l1";
  sy?: string;
  bp?: string | number;
  ap?: string | number;
}

type DeltaMsg =
  | { type: "heartbeat" | "pong" | "ping" | "subscriptions" | "auth" | string; [key: string]: unknown }
  | DeltaTickerLegacy
  | DeltaTickerPublic
  | DeltaTrade
  | DeltaObL1;

/**
 * Direct browser → Delta Exchange WebSocket client.
 *
 * Public market data is connected to Delta's current public websocket endpoint.
 * We subscribe to:
 *   - trades  → real-time last-trade price
 *   - ticker  → 5-second ticker snapshot/fallback
 *   - ob_l1   → best bid/ask
 *
 * The legacy v2/ticker parser is retained for compatibility with older endpoints,
 * but new connections always use the public endpoint.
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

  private _wsUrl: string = DELTA_PUBLIC_WS;
  private subscribedSymbols = new Set<string>();
  private lastBid = new Map<string, number>();
  private lastAsk = new Map<string, number>();

  constructor(wsUrl?: string) {
    // Account-specific/private socket URLs must not be used for this public
    // market-data client. Keep an explicit custom public wss:// URL supported.
    if (wsUrl && wsUrl.includes("public-socket")) this._wsUrl = wsUrl;

    this.conn = new WsConnection({
      url: () => this._wsUrl,
      name: "Delta Public Market WS",
      heartbeatIntervalMs: 25_000,
      heartbeatTimeoutMs:  10_000,
      reconnectOptions: {
        initialDelayMs: 1_000,
        maxDelayMs:    30_000,
        backoffFactor:  1.5,
      },
      onOpen: () => {
        // Delta recommends enabling its heartbeat on every successful socket.
        this.conn.send({ type: "enable_heartbeat" });
        this.resubscribeAll();
      },
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

  /** Update the WS URL before calling connect(). Only public-socket URLs are accepted. */
  setWsUrl(url: string): void {
    if (url && url.includes("public-socket")) this._wsUrl = url;
  }

  /** Resolve the public market-data URL. Private account URLs are intentionally ignored. */
  static resolveWsUrl(wsUrlFromAccount?: string): string {
    if (wsUrlFromAccount && wsUrlFromAccount.includes("public-socket") && wsUrlFromAccount.startsWith("wss://")) {
      return wsUrlFromAccount;
    }
    return DELTA_PUBLIC_WS;
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
    const normalized = String(symbol || "").trim().toUpperCase();
    if (!normalized) return;
    this.subscribedSymbols.add(normalized);

    // Real-time last trade + current ticker snapshot + L1 bid/ask.
    this.conn.send({
      type: "subscribe",
      payload: {
        channels: [
          { name: "trades", symbols: [normalized] },
          { name: "ticker", symbols: [normalized] },
          { name: "ob_l1", symbols: [normalized] },
        ],
      },
    });
  }

  unsubscribeSymbol(symbol: string): void {
    const normalized = String(symbol || "").trim().toUpperCase();
    if (!normalized) return;
    this.subscribedSymbols.delete(normalized);

    this.conn.send({
      type: "unsubscribe",
      payload: {
        channels: [
          { name: "trades", symbols: [normalized] },
          { name: "ticker", symbols: [normalized] },
          { name: "ob_l1", symbols: [normalized] },
        ],
      },
    });
  }

  private resubscribeAll(): void {
    if (this.subscribedSymbols.size === 0) return;
    const symbols = [...this.subscribedSymbols];
    this.conn.send({
      type: "subscribe",
      payload: {
        channels: [
          { name: "trades", symbols },
          { name: "ticker", symbols },
          { name: "ob_l1", symbols },
        ],
      },
    });
  }

  private emitTick(symbol: string, price: number, ts?: number): void {
    if (!symbol || !Number.isFinite(price) || price <= 0) return;
    const bid = this.lastBid.get(symbol);
    const ask = this.lastAsk.get(symbol);
    const rawTs = Number(ts);
    const eventTs = Number.isFinite(rawTs) && rawTs > 0
      ? (rawTs > 1e12 ? rawTs / 1000 : rawTs)
      : Date.now();
    this.emit({
      kind: "tick", broker: "delta",
      symbol, price, bid, ask,
      ts: eventTs,
    } as TickEvent);
  }

  private handleMessage(msg: DeltaMsg): void {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "ping") {
      // Delta expects a pong message when the server pings the client.
      this.conn.send({ type: "pong" });
      return;
    }

    if (msg.type === "heartbeat" || msg.type === "pong") {
      this.conn.notifyPong();
      return;
    }

    // Current public ticker channel: compact payload under d[].
    if (msg.type === "ticker") {
      const t = msg as DeltaTickerPublic;
      const rows = Array.isArray(t.d) ? t.d : [];
      for (const row of rows) {
        const symbol = String(row.s ?? t.sy ?? "");
        const close = Array.isArray(row.ohlc) ? Number(row.ohlc[3]) : NaN;
        const mark = Number(row.m);
        const q = Array.isArray(row.q) ? row.q : [];
        const ask = Number(q[0]);
        const bid = Number(q[2]);
        if (Number.isFinite(ask) && ask > 0) this.lastAsk.set(symbol, ask);
        if (Number.isFinite(bid) && bid > 0) this.lastBid.set(symbol, bid);
        const price = Number.isFinite(close) && close > 0 ? close : mark;
        this.emitTick(symbol, price, Number(t.ts));
      }
      return;
    }

    // Current public real-time trades channel.
    if (msg.type === "trades") {
      const t = msg as DeltaTrade;
      const symbol = String(t.sy ?? "");
      const price = Number(t.p);
      this.emitTick(symbol, price, t.ts ?? t.t);
      return;
    }

    // Current public L1 channel.
    if (msg.type === "ob_l1") {
      const q = msg as DeltaObL1;
      const symbol = String(q.sy ?? "");
      const bid = Number(q.bp);
      const ask = Number(q.ap);
      if (Number.isFinite(bid) && bid > 0) this.lastBid.set(symbol, bid);
      if (Number.isFinite(ask) && ask > 0) this.lastAsk.set(symbol, ask);
      return;
    }

    // Legacy v2/ticker compatibility.
    if (msg.type === "v2/ticker") {
      const t = msg as DeltaTickerLegacy;
      const rawPrice = t.close ?? t.mark_price ?? t.spot_price;
      const price = typeof rawPrice === "string" ? parseFloat(rawPrice) : (rawPrice ?? 0);
      if (!isFinite(price) || price === 0) return;
      const bid = t.best_bid_price ? parseFloat(String(t.best_bid_price)) : undefined;
      const ask = t.best_ask_price ? parseFloat(String(t.best_ask_price)) : undefined;
      if (bid && bid > 0) this.lastBid.set(t.symbol, bid);
      if (ask && ask > 0) this.lastAsk.set(t.symbol, ask);
      this.emitTick(t.symbol, price);
    }
  }

  private emit(event: Parameters<BrokerEventHandler>[0]): void {
    for (const h of this.handlers) {
      try { h(event); } catch (e) { console.error("[DeltaWsClient] handler error", e); }
    }
  }
}

export { DELTA_WS_INDIA, DELTA_WS_INTL, DELTA_PUBLIC_WS };
