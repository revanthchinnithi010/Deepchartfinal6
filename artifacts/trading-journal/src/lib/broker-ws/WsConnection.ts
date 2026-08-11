import { HeartbeatManager } from "./HeartbeatManager";
import { ReconnectManager } from "./ReconnectManager";
import type { WsClientStatus } from "./types";

export interface WsConnectionOptions {
  url: string | (() => string);
  name: string;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  reconnectOptions?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    maxAttempts?: number;
  };
  onOpen?: (ws: WebSocket) => void;
  onMessage: (data: unknown) => void;
  onStatusChange: (status: WsClientStatus) => void;
  onLatency: (ms: number) => void;
}

/**
 * Reusable, self-healing WebSocket wrapper.
 * Handles: connection lifecycle, heartbeat ping/pong, exponential backoff
 * reconnect, and latency tracking. Agnostic of message protocol.
 */
export class WsConnection {
  private ws: WebSocket | null = null;
  private _status: WsClientStatus = "idle";
  private _latencyMs: number | null = null;
  private _reconnectAttempts = 0;
  private _lastConnectedAt: number | null = null;
  private _lastPongAt: number | null = null;
  private destroyed = false;

  private readonly heartbeat: HeartbeatManager;
  private readonly reconnect: ReconnectManager;

  constructor(private readonly opts: WsConnectionOptions) {
    this.heartbeat = new HeartbeatManager({
      intervalMs: opts.heartbeatIntervalMs ?? 20_000,
      timeoutMs:  opts.heartbeatTimeoutMs  ?? 8_000,
      onPing:    () => this.sendPing(),
      onTimeout: () => {
        console.warn(`[${opts.name}] heartbeat timeout — forcing reconnect`);
        this.ws?.close(4000, "heartbeat timeout");
      },
    });

    this.reconnect = new ReconnectManager({
      ...opts.reconnectOptions,
      onReconnect: (attempt) => {
        this._reconnectAttempts = attempt;
        console.log(`[${opts.name}] reconnecting (attempt ${attempt})`);
        this.setStatus("reconnecting");
        this.openSocket();
      },
      onMaxAttemptsReached: () => {
        console.error(`[${opts.name}] max reconnect attempts reached`);
        this.setStatus("error");
      },
    });
  }

  get status(): WsClientStatus  { return this._status; }
  get latencyMs(): number | null { return this._latencyMs; }
  get reconnectAttempts(): number { return this._reconnectAttempts; }
  get lastConnectedAt(): number | null { return this._lastConnectedAt; }
  get lastPongAt(): number | null { return this._lastPongAt; }

  connect(): void {
    if (this.destroyed) return;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.setStatus("connecting");
    this.openSocket();
  }

  disconnect(): void {
    this.heartbeat.stop();
    this.reconnect.cancel();
    this.ws?.close(1000, "clean disconnect");
    this.ws = null;
    this.setStatus("disconnected");
  }

  destroy(): void {
    this.destroyed = true;
    this.disconnect();
  }

  /** Send a raw message. Returns false if not connected. */
  send(msg: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      return true;
    } catch (e) {
      console.error(`[${this.opts.name}] send error`, e);
      return false;
    }
  }

  /** Called externally when a pong arrives (e.g. from a containing client). */
  notifyPong(): void { this.receivePong(); }

  /** Called by the subclass when a pong arrives. */
  protected receivePong(): void {
    const latency = this.heartbeat.pong();
    if (latency !== null) {
      this._latencyMs = latency;
      this._lastPongAt = Date.now();
      this.opts.onLatency(latency);
    }
  }

  /** Override in subclass to send a broker-specific ping. */
  protected sendPing(): void {
    this.send({ type: "ping" });
  }

  private openSocket(): void {
    if (this.destroyed) return;
    const url = typeof this.opts.url === "function" ? this.opts.url() : this.opts.url;
    console.log(`[${this.opts.name}] connecting to ${url}`);

    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch (e) {
      console.error(`[${this.opts.name}] WebSocket construction failed`, e);
      this.setStatus("error");
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      console.log(`[${this.opts.name}] connected`);
      this._lastConnectedAt = Date.now();
      this.reconnect.reset();
      this._reconnectAttempts = 0;
      this.setStatus("connected");
      this.heartbeat.start();
      this.opts.onOpen?.(ws);
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        this.opts.onMessage(data);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.heartbeat.stop();
      console.warn(`[${this.opts.name}] disconnected (code=${event.code})`);
      if (event.code === 1000 || this.destroyed) {
        this.setStatus("disconnected");
        return;
      }
      this.reconnect.schedule();
    };

    ws.onerror = () => {
      console.error(`[${this.opts.name}] socket error`);
      this.setStatus("error");
      ws.close();
    };
  }

  private setStatus(s: WsClientStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.opts.onStatusChange(s);
  }
}
