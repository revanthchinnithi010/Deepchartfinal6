import WebSocket from "ws";
import { buildDeltaWsAuthPayload } from "../services/deltaSigner.js";
import type { WSManager } from "./WSManager.js";
import { logger } from "../lib/logger.js";

const DEFAULT_WS_URL          = "wss://socket.delta.exchange";
const MAX_RECONNECT_ATTEMPTS  = 10;
const RECONNECT_BASE_MS       = 1_000;
const HEARTBEAT_INTERVAL_MS   = 15_000;
const HEARTBEAT_TIMEOUT_MS    = 8_000;

interface DeltaSession {
  accountId: number;
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
  ws: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
}

class DeltaSocketManager {
  private sessions  = new Map<number, DeltaSession>();
  private wsManager: WSManager | null = null;

  setWsManager(wsManager: WSManager): void {
    this.wsManager = wsManager;
  }

  /**
   * @param wsUrl  Environment-specific WebSocket URL.
   *               International → "wss://socket.delta.exchange"
   *               India         → "wss://socket.india.delta.exchange"
   *               Falls back to DEFAULT_WS_URL if omitted.
   */
  startSession(
    accountId: number,
    apiKey: string,
    apiSecret: string,
    wsUrl: string = DEFAULT_WS_URL,
  ): void {
    this.stopSession(accountId);
    const session: DeltaSession = {
      accountId,
      apiKey,
      apiSecret,
      wsUrl,
      ws: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      heartbeatTimer: null,
      heartbeatTimeoutTimer: null,
      stopped: false,
    };
    this.sessions.set(accountId, session);
    this.connect(session);
    logger.info({ accountId, wsUrl }, "DeltaSocket: session started");
  }

  stopSession(accountId: number): void {
    const session = this.sessions.get(accountId);
    if (!session) return;
    session.stopped = true;
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    this.stopHeartbeat(session);
    try { session.ws?.terminate(); } catch { /* ignore */ }
    this.sessions.delete(accountId);
    logger.info({ accountId }, "DeltaSocket: session stopped");
  }

  hasSession(accountId: number): boolean {
    return this.sessions.has(accountId);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  private connect(session: DeltaSession): void {
    if (session.stopped) return;

    logger.info({ accountId: session.accountId, wsUrl: session.wsUrl }, "DeltaSocket: connecting");

    const ws = new WebSocket(session.wsUrl, {
      handshakeTimeout: 10_000,
      headers: { "User-Agent": "TradeVault/1.0" },
    });
    session.ws = ws;

    ws.on("open", () => {
      if (session.stopped) { ws.terminate(); return; }
      logger.info({ accountId: session.accountId, wsUrl: session.wsUrl }, "DeltaSocket: connected, authenticating");
      session.reconnectAttempts = 0;

      const authMsg = buildDeltaWsAuthPayload(session.apiKey, session.apiSecret);
      ws.send(JSON.stringify(authMsg));

      this.startHeartbeat(session, ws);

      this.wsManager?.broadcast({
        type: "delta_ws_status",
        accountId: session.accountId,
        status: "connecting",
      });
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        this.handleMessage(session, msg);
      } catch { /* ignore malformed */ }
    });

    ws.on("close", (code) => {
      if (session.stopped) return;
      logger.warn({ accountId: session.accountId, code }, "DeltaSocket: connection closed");
      this.stopHeartbeat(session);
      this.wsManager?.broadcast({
        type: "delta_ws_status",
        accountId: session.accountId,
        status: "reconnecting",
      });
      this.scheduleReconnect(session);
    });

    ws.on("error", (err) => {
      if (session.stopped) return;
      logger.error({ accountId: session.accountId, wsUrl: session.wsUrl, err: String(err) }, "DeltaSocket: error");
    });

    ws.on("pong", () => {
      if (session.heartbeatTimeoutTimer) {
        clearTimeout(session.heartbeatTimeoutTimer);
        session.heartbeatTimeoutTimer = null;
      }
    });
  }

  private handleMessage(session: DeltaSession, msg: Record<string, unknown>): void {
    const type = String(msg["type"] ?? "");

    if (type === "auth_result") {
      const ok = msg["success"] === true;
      if (ok) {
        logger.info({ accountId: session.accountId }, "DeltaSocket: authenticated, subscribing to private channels");
        session.ws?.send(JSON.stringify({
          type: "subscribe",
          payload: {
            channels: [
              { name: "v2/user_balance" },
              { name: "v2/orders" },
              { name: "v2/position_lifecycle" },
            ],
          },
        }));
        this.wsManager?.broadcast({
          type: "delta_ws_status",
          accountId: session.accountId,
          status: "connected",
        });
      } else {
        logger.error({ accountId: session.accountId }, "DeltaSocket: authentication failed — stopping session");
        this.wsManager?.broadcast({
          type: "delta_ws_error",
          accountId: session.accountId,
          error: "Authentication failed — check API key and secret",
        });
        session.stopped = true;
        this.stopSession(session.accountId);
      }
      return;
    }

    if (type === "subscriptions") {
      logger.info({ accountId: session.accountId }, "DeltaSocket: channel subscriptions confirmed");
      return;
    }

    if (type === "heartbeat") return;

    if (type === "v2/user_balance") {
      this.wsManager?.broadcast({ type: "delta_balance",   accountId: session.accountId, payload: msg["data"] ?? msg });
      return;
    }

    if (type === "v2/orders") {
      this.wsManager?.broadcast({ type: "delta_orders",    accountId: session.accountId, payload: msg["data"] ?? msg });
      return;
    }

    if (type === "v2/position_lifecycle") {
      this.wsManager?.broadcast({ type: "delta_positions", accountId: session.accountId, payload: msg["data"] ?? msg });
      return;
    }
  }

  private startHeartbeat(session: DeltaSession, ws: WebSocket): void {
    this.stopHeartbeat(session);
    session.heartbeatTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "heartbeat" }));
      session.heartbeatTimeoutTimer = setTimeout(() => {
        logger.warn({ accountId: session.accountId }, "DeltaSocket: heartbeat timeout, terminating");
        ws.terminate();
      }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(session: DeltaSession): void {
    if (session.heartbeatTimer)        { clearInterval(session.heartbeatTimer);       session.heartbeatTimer = null; }
    if (session.heartbeatTimeoutTimer) { clearTimeout(session.heartbeatTimeoutTimer); session.heartbeatTimeoutTimer = null; }
  }

  private scheduleReconnect(session: DeltaSession): void {
    if (session.stopped) return;
    if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error({ accountId: session.accountId }, "DeltaSocket: max reconnect attempts reached");
      this.wsManager?.broadcast({ type: "delta_ws_status", accountId: session.accountId, status: "failed" });
      this.sessions.delete(session.accountId);
      return;
    }
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.5, session.reconnectAttempts), 30_000);
    session.reconnectAttempts++;
    logger.info(
      { accountId: session.accountId, attempt: session.reconnectAttempts, delayMs: delay },
      "DeltaSocket: scheduling reconnect",
    );
    session.reconnectTimer = setTimeout(() => {
      if (!session.stopped) this.connect(session);
    }, delay);
  }
}

export const deltaSocketManager = new DeltaSocketManager();
