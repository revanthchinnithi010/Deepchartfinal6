import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "../lib/logger.js";
import { isPinConfigured, verifyToken } from "../routes/auth.js";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";
import { requestMarketSubscription } from "../services/marketSubscriptionBus.js";

export type WSMessage = Record<string, unknown> & { type: string };

interface ClientState { candleKey: string | null; }

function getWsAuthToken(req: IncomingMessage): string | null {
  try { return new URL(req.url ?? "", "http://localhost").searchParams.get("token"); }
  catch { return null; }
}

function rejectUpgrade(socket: import("net").Socket, status = 401, message = "Unauthorized"): void {
  try { socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); }
  finally { socket.destroy(); }
}

export class WSManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private clientState: Map<WebSocket, ClientState> = new Map();
  private candlePayloadCache: Map<string, string> = new Map();

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupServer();
  }

  handleUpgrade(req: IncomingMessage, socket: import("net").Socket, head: Buffer): void {
    const pathname = req.url ?? "";
    let url: URL;
    try { url = new URL(pathname, "http://localhost"); }
    catch { socket.destroy(); return; }
    if (url.pathname !== "/ws" && url.pathname !== "/api/ws") { socket.destroy(); return; }
    if (isPinConfigured() && !verifyToken(getWsAuthToken(req))) {
      logger.warn({ ip: req.socket.remoteAddress ?? "unknown" }, "WSManager: rejected unauthenticated WebSocket upgrade");
      rejectUpgrade(socket); return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => { this.wss.emit("connection", ws, req); });
  }

  broadcast(msg: WSMessage): void {
    const payload = JSON.stringify(msg);
    let sent = 0;
    for (const client of this.clients) if (client.readyState === WebSocket.OPEN) { client.send(payload); sent++; }
    if (sent > 0) logger.debug({ type: msg.type, recipients: sent }, "WSManager: broadcast");
  }

  broadcastCandleUpdate(symbol: string, interval: string, bar: object): void {
    if (this.clients.size === 0) return;
    const key = `${symbol}:${interval}`;
    let payload: string | undefined;
    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const candKey = this.clientState.get(client)?.candleKey ?? null;
      if (candKey !== null && candKey !== key) continue;
      if (payload === undefined) {
        payload = this.candlePayloadCache.get(key);
        if (!payload) {
          payload = JSON.stringify({ type: "candle_update", symbol, interval, bar });
          this.candlePayloadCache.set(key, payload);
        }
      }
      client.send(payload);
    }
  }

  clearCandleCache(): void { this.candlePayloadCache.clear(); }
  send(ws: WebSocket, msg: WSMessage): void { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
  getClientCount(): number { return this.clients.size; }

  private setupServer(): void {
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.clients.add(ws);
      this.clientState.set(ws, { candleKey: null });
      const ip = req.socket.remoteAddress ?? "unknown";
      logger.info({ ip, total: this.clients.size }, "WSManager: client connected");
      this.send(ws, { type: "welcome", message: "Connected to TradeVault live feed" });
      this.send(ws, { type: "ctrader_status", ...ctraderTickEngine.getStatus() });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string; symbol?: string; interval?: string };
          logger.debug({ msg }, "WSManager: received client message");
          if (msg.type === "ping") {
            this.send(ws, { type: "pong" });
            this.send(ws, { type: "ctrader_status", ...ctraderTickEngine.getStatus() });
            return;
          }
          if (msg.type === "subscribe_candles") {
            const sym = String(msg.symbol ?? "").toUpperCase().trim();
            const iv = String(msg.interval ?? "").trim();
            if (!sym || !iv) return;

            // A chart selection must also subscribe the symbol to the provider.
            // Previously this message only filtered candle_update broadcasts,
            // leaving arbitrary symbols such as FARTCOINUSD with historical data
            // but no live ticks (0 t/s).
            requestMarketSubscription(sym);
            logger.info({ ip, symbol: sym }, "WSManager: chart symbol live subscription requested");

            const state = this.clientState.get(ws);
            if (state) {
              state.candleKey = `${sym}:${iv}`;
              logger.info({ ip, candleKey: state.candleKey }, "WSManager: client subscribed to candles");
            }
          }
        } catch { logger.warn("WSManager: received non-JSON message"); }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        this.clientState.delete(ws);
        logger.info({ total: this.clients.size }, "WSManager: client disconnected");
      });
      ws.on("error", (err) => {
        logger.error({ err }, "WSManager: client error");
        this.clients.delete(ws);
        this.clientState.delete(ws);
      });
      ws.on("pong", () => logger.debug({ ip }, "WSManager: pong"));
    });

    const pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try { client.ping(); } catch { /* close/error handler will clean it up */ }
        } else {
          this.clients.delete(client);
          this.clientState.delete(client);
        }
      }
    }, 20_000);
    this.wss.on("close", () => clearInterval(pingInterval));
  }
}
