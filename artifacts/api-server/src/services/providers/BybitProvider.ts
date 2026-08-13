import WebSocket from "ws";
import { BaseProvider } from "./BaseProvider.js";
import { logger } from "../../lib/logger.js";

const BYBIT_PUBLIC_WS = "wss://stream.bybit.com/v5/public/linear";
const PING_INTERVAL_MS = 20_000;
const INTERNAL_SYMBOL = "FARTCOINUSD";
const BYBIT_SYMBOL = "FARTCOINUSDT";

interface BybitTrade {
  T?: number;
  p?: string;
  v?: string;
  S?: string;
  s?: string;
}

interface BybitMessage {
  topic?: string;
  type?: string;
  ts?: number;
  data?: BybitTrade[];
}

export class BybitProvider extends BaseProvider {
  readonly name = "bybit";
  readonly displayName = "Bybit";
  readonly badge = "bybit";
  readonly color = "#F59E0B";
  readonly supportedSymbols = [INTERNAL_SYMBOL];

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.clearPing();
    logger.info({ provider: this.name, url: BYBIT_PUBLIC_WS }, "BybitProvider: connecting");
    this.ws = new WebSocket(BYBIT_PUBLIC_WS, { handshakeTimeout: 10_000 });

    this.ws.on("open", () => {
      this.onConnected();
      this._sendSubscribe();
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: "ping" }));
        }
      }, PING_INTERVAL_MS);
      logger.info({ provider: this.name, symbol: BYBIT_SYMBOL }, "BybitProvider: public trade stream subscribed");
    });

    this.ws.on("message", raw => {
      try {
        const msg = JSON.parse(raw.toString()) as BybitMessage;
        if (msg.type === "COMMAND_RESP" || msg.op === "pong" || msg.ret_msg === undefined && msg.op === "pong") return;
        if (!msg.topic?.startsWith("publicTrade.")) return;
        const trades = Array.isArray(msg.data) ? msg.data : [];
        for (const trade of trades) {
          const price = Number(trade.p);
          if (!Number.isFinite(price) || price <= 0) continue;
          const volume = Number(trade.v ?? 0);
          const timestamp = Number(trade.T ?? msg.ts ?? Date.now());
          this.onTick({
            symbol: INTERNAL_SYMBOL,
            providerSymbol: BYBIT_SYMBOL,
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
    });
    this.ws.on("close", (code, reason) => {
      this.clearPing();
      logger.warn({ provider: this.name, code, reason: reason.toString() }, "BybitProvider: websocket closed");
      this.onDisconnected(code);
    });
  }

  subscribeSymbol(symbol: string): void {
    if (symbol.toUpperCase() === INTERNAL_SYMBOL && this.ws?.readyState === WebSocket.OPEN) this._sendSubscribe();
  }

  unsubscribeSymbol(_symbol: string): void {
    // This diagnostic provider is intentionally scoped to FARTCOINUSD.
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.clearPing();
    this.ws?.close();
    this.ws = null;
  }

  private _sendSubscribe(): void {
    this.ws?.send(JSON.stringify({
      op: "subscribe",
      args: [`publicTrade.${BYBIT_SYMBOL}`],
    }));
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
