import { EventEmitter } from "events";
import { logger } from "../../lib/logger.js";

export interface ProviderTick {
  symbol:         string;
  providerSymbol: string;
  provider:       string;
  price:          number;
  bid?:           number;
  ask?:           number;
  volume:         number;
  timestamp:      number;
  receivedAt:     number;
  /** 24h high — from Delta's v2/ticker snapshot, when available. */
  high?:          number;
  /** 24h low — from Delta's v2/ticker snapshot, when available. */
  low?:           number;
  /** Mark price (distinct from last-trade price) — from v2/ticker. */
  markPrice?:     number;
  /** 24h percentage change of mark price, as reported by Delta (mark_change_24h). */
  changePct24h?:  number;
}

export type ProviderStatus = "connected" | "reconnecting" | "disconnected" | "error";

export interface ProviderStats {
  name: string;
  displayName: string;
  badge: string;
  color: string;
  status: ProviderStatus;
  tickCount: number;
  reconnectCount: number;
  lastTickAt: number | null;
  latencyMs: number | null;
  subscriptions: string[];
  connectedAt: number | null;
}

const BASE_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 60_000;

export abstract class BaseProvider extends EventEmitter {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly badge: string;
  abstract readonly color: string;

  protected status: ProviderStatus = "disconnected";
  protected tickCount = 0;
  protected reconnectCount = 0;
  protected lastTickAt: number | null = null;
  protected connectedAt: number | null = null;
  protected latencies: number[] = [];
  protected subscriptions: Set<string> = new Set();

  protected destroyed = false;
  protected reconnectDelay = BASE_RECONNECT_DELAY;
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  abstract connect(): void;
  abstract destroy(): void;
  abstract subscribeSymbol(symbol: string): void;
  abstract unsubscribeSymbol(symbol: string): void;
  abstract readonly supportedSymbols: string[];

  subscribe(symbol: string): boolean {
    if (!this.supportedSymbols.includes(symbol)) return false;
    this.subscriptions.add(symbol);
    if (this.status === "connected") this.subscribeSymbol(symbol);
    return true;
  }

  unsubscribe(symbol: string): boolean {
    if (!this.subscriptions.has(symbol)) return false;
    this.subscriptions.delete(symbol);
    if (this.status === "connected") this.unsubscribeSymbol(symbol);
    return true;
  }

  isConnected(): boolean {
    return this.status === "connected";
  }

  getStats(): ProviderStats {
    const avgLatency =
      this.latencies.length > 0
        ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
        : null;
    return {
      name: this.name,
      displayName: this.displayName,
      badge: this.badge,
      color: this.color,
      status: this.status,
      tickCount: this.tickCount,
      reconnectCount: this.reconnectCount,
      lastTickAt: this.lastTickAt,
      latencyMs: avgLatency,
      subscriptions: [...this.subscriptions],
      connectedAt: this.connectedAt,
    };
  }

  protected onTick(tick: ProviderTick): void {
    const now = Date.now();
    this.tickCount++;
    this.lastTickAt = now;
    const latency = now - tick.timestamp;
    if (latency > 0 && latency < 60_000) {
      this.latencies.push(latency);
      if (this.latencies.length > 100) this.latencies.shift();
    }
    this.emit("tick", tick);
  }

  protected onConnected(): void {
    this.status = "connected";
    this.connectedAt = Date.now();
    this.reconnectDelay = BASE_RECONNECT_DELAY;
    logger.info({ provider: this.name }, "Provider: connected");
    this.emit("connected");
    for (const sym of this.subscriptions) {
      this.subscribeSymbol(sym);
    }
  }

  protected onDisconnected(code?: number): void {
    this.status = "disconnected";
    this.connectedAt = null;
    logger.warn({ provider: this.name, code }, "Provider: disconnected");
    this.emit("disconnected", { code });
    if (!this.destroyed) this.scheduleReconnect();
  }

  protected onError(err: Error): void {
    this.status = "error";
    logger.error({ provider: this.name, err }, "Provider: error");
    this.emit("error", err);
  }

  protected scheduleReconnect(): void {
    if (this.destroyed) return;
    this.status = "reconnecting";
    this.reconnectCount++;
    logger.info({ provider: this.name, delay: this.reconnectDelay }, "Provider: scheduling reconnect");
    this.emit("reconnecting", { delay: this.reconnectDelay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
      this.connect();
    }, this.reconnectDelay);
  }

  protected clearReconnectTimer(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
