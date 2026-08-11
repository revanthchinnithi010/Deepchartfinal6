import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "../lib/logger.js";

export type WSMessage = Record<string, unknown> & { type: string };

interface ClientState {
  /** "SYMBOL:INTERVAL" the client is subscribed to, null = send all (pre-subscription default) */
  candleKey: string | null;
}

export class WSManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private clientState: Map<WebSocket, ClientState> = new Map();

  /** Pre-serialized cache: key → JSON string, invalidated on each new candle event */
  private candlePayloadCache: Map<string, string> = new Map();

  /** Tracks outstanding server-initiated pings: client -> timestamp sent */
  private pendingPongs: Map<WebSocket, number> = new Map();
  private readonly PONG_TIMEOUT_MS = 10_000;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupServer();
  }

  handleUpgrade(req: IncomingMessage, socket: import("net").Socket, head: Buffer): void {
    const pathname = req.url ?? "";
    if (pathname !== "/ws" && pathname !== "/api/ws") {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req);
    });
  }

  /**
   * Broadcast a message to ALL connected clients.
   * JSON is serialized once and reused across all sends.
   */
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
   * Per-client candle broadcast — the key optimization.
   *
   * Instead of broadcasting all 9 intervals to every client (the old behaviour),
   * each client declares the one symbol:interval it cares about via the
   * "subscribe_candles" message. This reduces candle_update traffic by ~89% for
   * a client watching a single timeframe.
   *
   * Clients that have not yet sent a subscription receive all updates (safe
   * backward-compatible default during the initial connect window).
   *
   * Serialisation is done once per unique key using a payload cache that is
   * cleared at the start of each new ingest cycle (see clearCandleCache).
   */
  broadcastCandleUpdate(symbol: string, interval: string, bar: object): void {
    if (this.clients.size === 0) return;

    const key = `${symbol}:${interval}`;

    // Lazy-serialise: only stringify if at least one client needs this key
    let payload: string | undefined;

    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;

      const state   = this.clientState.get(client);
      const candKey = state?.candleKey ?? null;

      // Send if: client hasn't subscribed yet (null) OR subscribed to this key
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

  /** Call once per tick cycle to invalidate the serialisation cache */
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
          } else if (msg.type === "subscribe_candles") {
            const sym = String(msg.symbol ?? "").trim();
            const iv  = String(msg.interval ?? "").trim();
            if (sym && iv) {
              const newKey = `${sym}:${iv}`;
              const state  = this.clientState.get(ws);
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
        this.pendingPongs.delete(ws);
        logger.info({ total: this.clients.size }, "WSManager: client disconnected");
      });

      ws.on("error", (err) => {
        logger.error({ err }, "WSManager: client error");
        this.clients.delete(ws);
        this.clientState.delete(ws);
        this.pendingPongs.delete(ws);
      });

      ws.on("pong", () => {
        logger.debug({ ip }, "WSManager: pong");
        this.pendingPongs.delete(ws);
      });
    });

    const pingInterval = setInterval(() => {
      const now = Date.now();
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          const sentAt = this.pendingPongs.get(client);
          if (sentAt !== undefined && now - sentAt > this.PONG_TIMEOUT_MS) {
            // Previous ping never got a pong back — the socket is half-dead
            // (server still sees OPEN, but the browser/TCP peer is gone).
            // Force-terminate so the client's onclose fires and it reconnects.
            logger.warn("WSManager: pong timeout — terminating dead connection");
            this.clients.delete(client);
            this.clientState.delete(client);
            this.pendingPongs.delete(client);
            client.terminate();
            continue;
          }
          this.pendingPongs.set(client, now);
          client.ping();
        } else {
          this.clients.delete(client);
          this.clientState.delete(client);
          this.pendingPongs.delete(client);
        }
      }
    }, 20_000);

    this.wss.on("close", () => clearInterval(pingInterval));
  }
            }
