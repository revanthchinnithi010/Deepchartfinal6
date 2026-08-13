import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "../lib/logger.js";
import { isPinConfigured, verifyToken } from "../routes/auth.js";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";

export type WSMessage = Record<string, unknown> & { type: string };

interface ClientState {
  /** "SYMBOL:INTERVAL" the client is subscribed to, null = send all (pre-subscription default) */
  candleKey: string | null;
}

function getWsAuthToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    return url.searchParams.get("token");
  } catch {
    return null;
  }
}

function rejectUpgrade(socket: import("net").Socket, status = 401, message = "Unauthorized"): void {
  try {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } finally {
    socket.destroy();
  }
}

export class WSManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private clientState: Map<WebSocket, ClientState> = new Map();

  /** Pre-serialized cache: key → JSON string, invalidated on each new candle event */
  private candlePayloadCache: Map<string, string> = new Map();

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupServer();
  }

  handleUpgrade(req: IncomingMessage, socket: import("net").Socket, head: Buffer): void {
    const pathname = req.url ?? "";
    let url: URL;
    try {
      url = new URL(pathname, "http://localhost");
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== "/ws" && url.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }

    // The browser WebSocket API cannot attach an Authorization header. The
    // frontend therefore sends the signed PIN token as a short-lived query
    // parameter during the upgrade. Never log the URL/token.
    if (isPinConfigured() && !verifyToken(getWsAuthToken(req))) {
      logger.warn({ ip: req.socket.remoteAddress ?? "unknown" }, "WSManager: rejected unauthenticated WebSocket upgrade");
      rejectUpgrade(socket);
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req);
    });
  }

  /** Broadcast a message to ALL connected clients. */
  broadcast(msg: WSMessage): void {
    const payload = JSON.stringify(msg);
    let sent = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
        sent++;
      }
    }
    if (sent > 0) {
      logger.debug({ type: msg.type, recipients: sent }, "WSManager: broadcast");
    }
  }

  /**
   * Per-client candle broadcast. Each client declares the one symbol:interval
   * it cares about via "subscribe_candles".
   */
  broadcastCandleUpdate(symbol: string, interval: string, bar: object): void {
    if (this.clients.size === 0) return;

    const key = `${symbol}:${interval}`;
    let payload: string | undefined;

    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;

      const state = this.clientState.get(client);
      const candKey = state?.candleKey ?? null;
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

  clearCandleCache(): void {
    this.candlePayloadCache.clear();
  }

  send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private setupServer(): void {
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.clients.add(ws);
      this.clientState.set(ws, { candleKey: null });

      const ip = req.socket.remoteAddress ?? "unknown";
      logger.info({ ip, total: this.clients.size }, "WSManager: client connected");

      this.send(ws, { type: "welcome", message: "Connected to TradeVault live feed" });

      // cTrader status is normally broadcast only when the engine changes state.
      // A browser can connect after the engine is already streaming, which left
      // ctraderSpotStore at its initial "unknown" state. Replay the current
      // engine snapshot immediately so new clients always know the real state.
      const ctraderStatus = ctraderTickEngine.getStatus();
      this.send(ws, { type: "ctrader_status", ...ctraderStatus });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            symbol?: string;
            interval?: string;
          };
          logger.debug({ msg }, "WSManager: received client message");

          if (msg.type === "ping") {
            this.send(ws, { type: "pong" });
            // Also refresh cTrader state on heartbeat so a reconnect that lands
            // between engine transitions cannot remain stale in the UI.
            const currentCtraderStatus = ctraderTickEngine.getStatus();
            this.send(ws, { type: "ctrader_status", ...currentCtraderStatus });
          } else if (msg.type === "subscribe_candles") {
            const sym = String(msg.symbol ?? "").trim();
            const iv = String(msg.interval ?? "").trim();
            if (sym && iv) {
              const newKey = `${sym}:${iv}`;
              const state = this.clientState.get(ws);
              if (state) {
                state.candleKey = newKey;
                logger.info({ ip, candleKey: newKey }, "WSManager: client subscribed to candles");
              }
            }
          }
        } catch {
          logger.warn("WSManager: received non-JSON message");
        }
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

      // The browser's WebSocket implementation automatically answers protocol
      // ping frames with pong frames. Do not use those protocol pongs as the
      // application's connection watchdog: Railway/mobile proxies can delay or
      // consume control frames even while normal WebSocket data is flowing.
      // The frontend already has an application-level ping/pong watchdog.
      ws.on("pong", () => {
        logger.debug({ ip }, "WSManager: pong");
      });
    });

    // Keep the TCP/WebSocket connection active with protocol-level pings, but
    // NEVER terminate a client solely because a protocol pong was delayed.
    // The previous pendingPongs timeout was causing healthy mobile clients to
    // appear as "Feed Offline" after ~20–30 seconds on Railway/cellular networks.
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
