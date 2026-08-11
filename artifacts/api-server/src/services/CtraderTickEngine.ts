/**
 * CtraderTickEngine
 *
 * Persistent ProtoOA TLS session for cTrader spot price streaming.
 * Flow: APP_AUTH_REQ → APP_AUTH_RES → ACCT_AUTH_REQ → ACCT_AUTH_RES
 *       → [SUBSCRIBE_SPOTS_REQ for watchlist symbols] → [SPOT_EVENT...]
 *
 * Subscription management:
 *   - Starts with ZERO subscriptions after authentication.
 *   - addSymbol(id, name)    — subscribe one symbol; idempotent (Set-backed).
 *   - removeSymbol(id, name) — unsubscribe one symbol.
 *   - On reconnect: re-subscribes all symbols in the Set automatically.
 *
 * Emits:
 *   "tick"   (CtraderTick)         — one per SPOT_EVENT
 *   "status" (EngineStatusPayload) — on every state transition
 */

import { EventEmitter } from "events";
import * as tls from "tls";
import { logger } from "../lib/logger.js";

// ── ProtoOA payload type IDs (from OpenApiModelMessages.proto) ───────────────
const PT = {
  APP_AUTH_REQ:                 2100,
  APP_AUTH_RES:                 2101,
  ACCT_AUTH_REQ:                2102,
  ACCT_AUTH_RES:                2103,
  SUBSCRIBE_SPOTS_REQ:          2127,
  SUBSCRIBE_SPOTS_RES:          2128,
  UNSUBSCRIBE_SPOTS_REQ:        2129,
  UNSUBSCRIBE_SPOTS_RES:        2130,
  SPOT_EVENT:                   2131,
  ERROR_RES:                    2142,
  HEARTBEAT_EVENT:              51,
  TRENDBARS_REQ:                2137,
  TRENDBARS_RES:                2138,
  DEPTH_EVENT:                  2155,
  SUBSCRIBE_DEPTH_QUOTES_REQ:   2156,
  SUBSCRIBE_DEPTH_QUOTES_RES:   2157,
  UNSUBSCRIBE_DEPTH_QUOTES_REQ: 2158,
  UNSUBSCRIBE_DEPTH_QUOTES_RES: 2159,
} as const;

const PT_NAME: Record<number, string> = {
  2100: "APP_AUTH_REQ",  2101: "APP_AUTH_RES",
  2102: "ACCT_AUTH_REQ", 2103: "ACCT_AUTH_RES",
  2127: "SUBSCRIBE_SPOTS_REQ", 2128: "SUBSCRIBE_SPOTS_RES",
  2129: "UNSUBSCRIBE_SPOTS_REQ", 2130: "UNSUBSCRIBE_SPOTS_RES",
  2131: "SPOT_EVENT", 2142: "ERROR_RES", 51: "HEARTBEAT_EVENT",
  2137: "TRENDBARS_REQ", 2138: "TRENDBARS_RES",
  2155: "DEPTH_EVENT",
  2156: "SUBSCRIBE_DEPTH_QUOTES_REQ", 2157: "SUBSCRIBE_DEPTH_QUOTES_RES",
  2158: "UNSUBSCRIBE_DEPTH_QUOTES_REQ", 2159: "UNSUBSCRIBE_DEPTH_QUOTES_RES",
};

// ProtoOA error code: sent when trying to sub depth for a symbol not spot-subscribed
const OA_ERR_NOT_SUBSCRIBED_TO_SPOTS = 112;

// ── OHLC bar type (returned by fetchTrendbarsOnSession) ──────────────────────
export interface CtraderOHLCBar {
  time:   number; // unix seconds (UTC)
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/** TrendbarPeriod enum values for supported intervals */
const INTERVAL_TO_OA_PERIOD: Partial<Record<string, number>> = {
  "1": 1, "3": 3, "5": 5, "15": 7, "30": 8, "60": 9, "240": 10, "D": 12, "W": 13,
};

// ── Protobuf encoding helpers ─────────────────────────────────────────────────
function varint(n: number): number[] {
  const out: number[] = [];
  let r = n >>> 0;
  do {
    const b = r & 0x7F;
    r >>>= 7;
    out.push(r > 0 ? b | 0x80 : b);
  } while (r > 0);
  return out;
}

/** 64-bit-safe varint — works for any safe JS integer (e.g. unix ms timestamps). */
function varint64(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7F) {
    out.push((n & 0x7F) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n & 0x7F);
  return out;
}

/** Field encoder using 64-bit-safe varint — use for timestamps and large IDs. */
function u64f(fn: number, v: number): number[] {
  return [...varint64((fn << 3) | 0), ...varint64(v)];
}

function u32f(fn: number, v: number): number[] { return [...varint((fn << 3) | 0), ...varint(v)]; }
function strf(fn: number, s: string): number[] {
  const b = Buffer.from(s, "utf8");
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}
function bytesf(fn: number, b: Buffer): number[] {
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}
function boolField(fn: number, v: boolean): number[] {
  return [...varint((fn << 3) | 0), v ? 1 : 0];
}

function buildFrame(payloadType: number, inner: number[]): Buffer {
  const innerBuf = Buffer.from(inner);
  const outer    = Buffer.from([...u32f(1, payloadType), ...bytesf(2, innerBuf)]);
  const out      = Buffer.alloc(4 + outer.length);
  out.writeUInt32BE(outer.length, 0);
  outer.copy(out, 4);
  return out;
}

// ── Protobuf decoding — int64-safe (multiply, not bit-shift) ─────────────────
interface PbField { fn: number; wt: number; v: number | Buffer }

function readVarint(buf: Buffer, off: number): [number, number] {
  let v = 0, mul = 1;
  while (off < buf.length) {
    const b = buf[off++];
    v += (b & 0x7F) * mul;
    mul *= 128;
    if (!(b & 0x80)) break;
  }
  return [v, off];
}

function parseMsg(buf: Buffer): PbField[] {
  const out: PbField[] = [];
  let o = 0;
  while (o < buf.length) {
    let tag: number;
    [tag, o] = readVarint(buf, o);
    const fn = Math.floor(tag / 8);
    const wt = tag & 7;
    if (wt === 0) {
      let v: number; [v, o] = readVarint(buf, o); out.push({ fn, wt, v });
    } else if (wt === 2) {
      let len: number; [len, o] = readVarint(buf, o);
      out.push({ fn, wt, v: buf.slice(o, o + len) });
      o += len;
    } else if (wt === 1) { o += 8; }
    else if (wt === 5)   { o += 4; }
    else break;
  }
  return out;
}

function decodeFrame(raw: Buffer): { payloadType: number; payload: Buffer } | null {
  try {
    const fields  = parseMsg(raw);
    const ptField = fields.find(f => f.fn === 1 && f.wt === 0);
    const plField = fields.find(f => f.fn === 2 && f.wt === 2);
    if (!ptField) return null;
    return {
      payloadType: ptField.v as number,
      payload:     plField ? (plField.v as Buffer) : Buffer.alloc(0),
    };
  } catch { return null; }
}

// ── TLS connection helper ─────────────────────────────────────────────────────
type Conn = {
  write:      (buf: Buffer) => void;
  destroy:    () => void;
  onFrame:    ((pt: number, payload: Buffer) => void) | null;
  onConnect:  (() => void) | null;
  onError:    ((e: Error) => void) | null;
  onClose:    (() => void) | null;
};

function makeTlsConn(host: string, port: number): Conn {
  let recvBuf = Buffer.alloc(0);
  const conn: Conn = { write: () => {}, destroy: () => {}, onFrame: null, onConnect: null, onError: null, onClose: null };

  const sock = tls.connect({ host, port, rejectUnauthorized: false }, () => {
    conn.onConnect?.();
  });

  sock.on("data", (chunk: Buffer) => {
    recvBuf = Buffer.concat([recvBuf, chunk]);
    while (recvBuf.length >= 4) {
      const msgLen = recvBuf.readUInt32BE(0);
      if (msgLen === 0 || msgLen > 4_000_000) { recvBuf = Buffer.alloc(0); break; }
      if (recvBuf.length < 4 + msgLen) break;
      const raw = recvBuf.slice(4, 4 + msgLen);
      recvBuf   = recvBuf.slice(4 + msgLen);
      const msg = decodeFrame(raw);
      if (msg) conn.onFrame?.(msg.payloadType, msg.payload);
    }
  });

  sock.on("error", (e: Error) => conn.onError?.(e));
  sock.on("close", () => conn.onClose?.());

  conn.write   = (buf) => { try { sock.write(buf); } catch { /* ignore */ } };
  conn.destroy = ()    => { try { sock.destroy(); } catch { /* ignore */ } };

  return conn;
}

// ── DOM (Depth of Market) types ───────────────────────────────────────────────
export interface DomQuote { price: number; size: number; }

export interface DomBook {
  bids:       DomQuote[];  // sorted descending by price
  asks:       DomQuote[];  // sorted ascending  by price
  available:  boolean;     // false = broker confirmed DOM unavailable for this symbol
  pending:    boolean;     // true = subscribed but no data received yet
  updatedAt:  number | null;
}

// ── Public types ──────────────────────────────────────────────────────────────
export type EngineStatus =
  | "idle" | "connecting" | "app_auth" | "acct_auth"
  | "subscribing" | "streaming" | "reconnecting" | "error" | "stopped";

export interface CtraderTick {
  symbol:    string;
  symbolId:  number;
  bid:       number;
  ask:       number;
  spread:    number;
  mid:       number;
  price:     number;   // alias of mid — for handleTick() compat
  timestamp: number;
  provider:  "ctrader";
}

export interface EngineStatusPayload {
  status:          EngineStatus;
  accountId:       number;
  isLive:          boolean;
  subscribedCount: number;
  subscribedSymbols: string[];
  tickCounts:      Record<string, number>;
  connectedAt:     number | null;
  lastTickAt:      number | null;
  reconnectCount:  number;
  error?:          string;
}

export interface EngineOptions {
  clientId:            string;
  clientSecret:        string;
  ctidTraderAccountId: number;
  accessToken:         string;
  isLive:              boolean;
  /** Full symbol catalog for decoding SPOT_EVENT payloads (symbolId → name). */
  symbolMap:           Map<number, string>;
}

// ── Pending trendbars request (FIFO — one outstanding request per connection) ─
interface PendingTrendbars {
  symbolId: number;
  interval: string;
  resolve:  (bars: CtraderOHLCBar[]) => void;
  reject:   (err: Error) => void;
  timer:    NodeJS.Timeout;
}

// ── CtraderTickEngine ─────────────────────────────────────────────────────────
export class CtraderTickEngine extends EventEmitter {
  private _status: EngineStatus = "idle";
  private conn:    Conn | null  = null;
  private timer:   NodeJS.Timeout | null = null;
  private step:    "app_auth" | "acct_auth" | "subscribing" | "streaming" = "app_auth";
  private opts:    EngineOptions | null = null;

  /**
   * The canonical set of symbol IDs we want subscribed.
   * Persists across reconnects. NOT reset by configure().
   */
  private subscribedIds  = new Set<number>();

  private tickCounts  = new Map<string, number>();
  private lastTickMap = new Map<number, CtraderTick>();
  private connectedAt:   number | null = null;
  private lastTickAt:    number | null = null;
  private reconnectDelay = 2_000;
  private reconnectCount = 0;
  private stopped = false;

  /** FIFO queue for outstanding GET_TRENDBARS requests on the live session. */
  private pendingTrendbarsQueue: PendingTrendbars[] = [];

  // ── DOM (Depth of Market) state ────────────────────────────────────────────
  /** In-memory bid books keyed by symbolId → (quoteId → quote). */
  private domBids = new Map<number, Map<number, DomQuote>>();
  /** In-memory ask books keyed by symbolId → (quoteId → quote). */
  private domAsks = new Map<number, Map<number, DomQuote>>();
  /** symbolIds for which we've sent SUBSCRIBE_DEPTH_QUOTES_REQ. */
  private domSubscribedIds = new Set<number>();
  /** symbolIds where broker confirmed DOM is not available (never show as pending again). */
  private domUnavailableIds = new Set<number>();
  /** symbolId → timestamp of last DEPTH_EVENT received. */
  private domLastUpdateAt = new Map<number, number>();
  /** symbolId → timestamp when DOM subscription was sent (to detect stale pending). */
  private domSubSentAt    = new Map<number, number>();

  configure(opts: EngineOptions): void { this.opts = opts; }

  /**
   * Subscribe to a single symbol by ProtoOA symbolId + name.
   * - Idempotent: duplicate calls for the same id are ignored.
   * - Updates the symbolMap so SPOT_EVENTs can be decoded.
   * - If already streaming, immediately sends SUBSCRIBE_SPOTS_REQ for this id.
   * - If in auth / reconnect phase, the id will be included in the next subscribe round.
   */
  addSymbol(symbolId: number, symbolName: string): void {
    if (!this.opts) {
      logger.warn({ symbolId, symbolName }, "CtraderTickEngine.addSymbol: engine not configured");
      return;
    }
    if (this.subscribedIds.has(symbolId)) {
      logger.debug({ symbolId, symbolName }, "CtraderTickEngine.addSymbol: already subscribed (noop)");
      return;
    }
    this.subscribedIds.add(symbolId);
    this.opts.symbolMap.set(symbolId, symbolName);
    logger.info({ symbolId, symbolName, engineStatus: this._status, total: this.subscribedIds.size },
      "CtraderTickEngine.addSymbol: symbol added");

    if (this._status === "streaming" && this.conn) {
      this.conn.write(this._buildSubscribeSpotsReq([symbolId]));
    }
  }

  /**
   * Unsubscribe from a single symbol.
   * - Idempotent: no-op if not subscribed.
   * - If streaming, immediately sends UNSUBSCRIBE_SPOTS_REQ.
   */
  removeSymbol(symbolId: number, symbolName: string): void {
    if (!this.subscribedIds.has(symbolId)) {
      logger.debug({ symbolId, symbolName }, "CtraderTickEngine.removeSymbol: not subscribed (noop)");
      return;
    }
    this.subscribedIds.delete(symbolId);
    logger.info({ symbolId, symbolName, engineStatus: this._status, remaining: this.subscribedIds.size },
      "CtraderTickEngine.removeSymbol: symbol removed");

    if (this._status === "streaming" && this.conn) {
      this.conn.write(this._buildUnsubscribeSpotsReq([symbolId]));
    }
  }

  getSubscribedSymbols(): string[] {
    if (!this.opts) return [];
    return [...this.subscribedIds].map(id => this.opts!.symbolMap.get(id) ?? String(id));
  }

  start(): void {
    if (!this.opts) throw new Error("CtraderTickEngine: call configure() before start()");
    this.stopped = false;
    this._setStatus("connecting");
    this._connect();
  }

  stop(): void {
    this.stopped = true;
    this._clearTimer();
    this.conn?.destroy();
    this.conn = null;
    this._setStatus("stopped");
  }

  getStatus(): EngineStatusPayload {
    return {
      status:            this._status,
      accountId:         this.opts?.ctidTraderAccountId ?? 0,
      isLive:            this.opts?.isLive ?? false,
      subscribedCount:   this.subscribedIds.size,
      subscribedSymbols: this.getSubscribedSymbols(),
      tickCounts:        Object.fromEntries(this.tickCounts),
      connectedAt:       this.connectedAt,
      lastTickAt:        this.lastTickAt,
      reconnectCount:    this.reconnectCount,
    };
  }

  getLastTick(symbolId: number): CtraderTick | null { return this.lastTickMap.get(symbolId) ?? null; }
  getAllLastTicks(): CtraderTick[]                   { return [...this.lastTickMap.values()]; }

  // ── DOM public API ─────────────────────────────────────────────────────────

  /**
   * Subscribe to DOM for a symbol. Idempotent.
   * Requires: the symbol must already be spot-subscribed (in subscribedIds).
   * Sends SUBSCRIBE_DEPTH_QUOTES_REQ immediately if streaming, else queues for next connect.
   */
  subscribeDom(symbolId: number): void {
    if (this.domUnavailableIds.has(symbolId)) return; // don't retry confirmed-unavailable
    if (this.domSubscribedIds.has(symbolId)) return;  // idempotent
    if (!this.subscribedIds.has(symbolId)) {
      logger.warn({ symbolId }, "CtraderTickEngine.subscribeDom: spot sub required first — symbol not in subscribedIds");
      return;
    }
    this.domSubscribedIds.add(symbolId);
    if (this._status === "streaming" && this.conn) {
      this.domSubSentAt.set(symbolId, Date.now());
      this.conn.write(this._buildSubscribeDepthQuotesReq([symbolId]));
      logger.info({ symbolId }, "CtraderTickEngine.subscribeDom: SUBSCRIBE_DEPTH_QUOTES_REQ sent");
    }
  }

  /** Unsubscribe from DOM for a symbol. */
  unsubscribeDom(symbolId: number): void {
    if (!this.domSubscribedIds.has(symbolId)) return;
    this.domSubscribedIds.delete(symbolId);
    this.domBids.delete(symbolId);
    this.domAsks.delete(symbolId);
    this.domLastUpdateAt.delete(symbolId);
    this.domSubSentAt.delete(symbolId);
    if (this._status === "streaming" && this.conn) {
      this.conn.write(this._buildUnsubscribeDepthQuotesReq([symbolId]));
    }
  }

  /**
   * Return the current DOM snapshot for a symbol.
   * bids/asks are sorted (bids desc, asks asc), limited to `depth` levels.
   */
  getDomBook(symbolId: number, depth = 20): DomBook {
    if (this.domUnavailableIds.has(symbolId)) {
      return { bids: [], asks: [], available: false, pending: false, updatedAt: null };
    }
    const bidsMap = this.domBids.get(symbolId);
    const asksMap = this.domAsks.get(symbolId);
    const updatedAt = this.domLastUpdateAt.get(symbolId) ?? null;
    const sentAt    = this.domSubSentAt.get(symbolId);
    // pending = subscribed but no data within 20s
    const pending   = this.domSubscribedIds.has(symbolId) && updatedAt === null
      && (sentAt === undefined || Date.now() - sentAt < 20_000);

    const bids: DomQuote[] = bidsMap
      ? [...bidsMap.values()].sort((a, b) => b.price - a.price).slice(0, depth)
      : [];
    const asks: DomQuote[] = asksMap
      ? [...asksMap.values()].sort((a, b) => a.price - b.price).slice(0, depth)
      : [];

    return { bids, asks, available: true, pending, updatedAt };
  }

  isDomSubscribed(symbolId: number): boolean { return this.domSubscribedIds.has(symbolId); }
  isDomUnavailable(symbolId: number): boolean { return this.domUnavailableIds.has(symbolId); }

  /**
   * Expose the engine's stored credentials so callers can open a standalone
   * ProtoOA connection even when the engine is not currently streaming.
   * Returns null when the engine has never been configured.
   */
  getEngineCredentials(): {
    clientId:            string;
    clientSecret:        string;
    ctidTraderAccountId: number;
    accessToken:         string;
    isLive:              boolean;
  } | null {
    if (!this.opts) return null;
    return {
      clientId:            this.opts.clientId,
      clientSecret:        this.opts.clientSecret,
      ctidTraderAccountId: this.opts.ctidTraderAccountId,
      accessToken:         this.opts.accessToken,
      isLive:              this.opts.isLive,
    };
  }

  /**
   * Fetch historical OHLC bars for a symbol by sending GET_TRENDBARS_REQ on the
   * existing authenticated streaming session. Avoids the cost of opening a new
   * TLS connection + re-authenticating (which standalone fetchTrendbars does).
   *
   * Returns a Promise that resolves once GET_TRENDBARS_RES arrives.
   * Rejects if the engine is not streaming, or if the response times out.
   *
   * Callers should cache the result — each call sends a new request.
   */
  fetchTrendbarsOnSession(
    symbolId: number,
    interval: string,
    count      = 500,
    timeoutMs  = 15_000,
    toTimestampMs?: number,   // optional cursor — omit for "latest 500 bars"
  ): Promise<CtraderOHLCBar[]> {
    if (this._status !== "streaming" || !this.conn) {
      return Promise.reject(
        new Error(`CtraderTickEngine.fetchTrendbarsOnSession: engine is "${this._status}" — not streaming`),
      );
    }

    const period = INTERVAL_TO_OA_PERIOD[interval];
    if (period === undefined) {
      return Promise.reject(new Error(`fetchTrendbarsOnSession: unsupported interval "${interval}"`));
    }

    return new Promise<CtraderOHLCBar[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingTrendbarsQueue.findIndex(p => p.resolve === resolve);
        if (idx >= 0) this.pendingTrendbarsQueue.splice(idx, 1);
        reject(new Error(
          `fetchTrendbarsOnSession timeout (${timeoutMs}ms) for symbolId=${symbolId} interval=${interval}`,
        ));
      }, timeoutMs);

      this.pendingTrendbarsQueue.push({ symbolId, interval, resolve, reject, timer });

      try {
        this.conn!.write(this._buildTrendbarsReq(symbolId, period, count, toTimestampMs));
        logger.info(
          { symbolId, interval, period, count, toTimestampMs, queueLen: this.pendingTrendbarsQueue.length },
          "CtraderTickEngine: GET_TRENDBARS_REQ sent on live session",
        );
      } catch (e) {
        const idx = this.pendingTrendbarsQueue.findIndex(p => p.resolve === resolve);
        if (idx >= 0) this.pendingTrendbarsQueue.splice(idx, 1);
        clearTimeout(timer);
        reject(new Error(`fetchTrendbarsOnSession send error: ${String(e)}`));
      }
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────
  private _setStatus(s: EngineStatus, extra: Partial<EngineStatusPayload> = {}): void {
    this._status = s;
    this.emit("status", { ...this.getStatus(), ...extra });
  }

  private _clearTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /** Reject all pending trendbars promises — called when the connection drops. */
  private _flushPendingTrendbars(reason: string): void {
    if (this.pendingTrendbarsQueue.length === 0) return;
    logger.warn(
      { count: this.pendingTrendbarsQueue.length, reason },
      "CtraderTickEngine: flushing pending trendbars queue (connection lost)",
    );
    for (const p of this.pendingTrendbarsQueue) {
      clearTimeout(p.timer);
      p.reject(new Error(`fetchTrendbarsOnSession: connection lost (${reason})`));
    }
    this.pendingTrendbarsQueue = [];
  }

  private _scheduleReconnect(reason: string): void {
    if (this.stopped) return;
    this._flushPendingTrendbars(reason);
    this._clearTimer();
    this.reconnectCount++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, Math.min(this.reconnectCount - 1, 8)),
      60_000,
    );
    logger.info({ delay, reconnectCount: this.reconnectCount, reason }, "CtraderTickEngine: reconnecting");
    this._setStatus("reconnecting");
    this.timer = setTimeout(() => { if (!this.stopped) this._connect(); }, delay);
  }

  private _connect(): void {
    if (this.stopped || !this.opts) return;
    const { isLive } = this.opts;
    const host = isLive ? "live.ctraderapi.com" : "demo.ctraderapi.com";

    this.step = "app_auth";
    this.connectedAt = null;
    logger.info({ host, port: 5035 }, "CtraderTickEngine: opening TLS connection");
    this._setStatus("connecting");

    const conn = makeTlsConn(host, 5035);
    this.conn = conn;

    conn.onConnect = () => {
      logger.info("CtraderTickEngine: TLS connected → APP_AUTH_REQ");
      this._setStatus("app_auth");
      conn.write(this._buildAppAuthReq());
    };

    conn.onFrame = (pt, payload) => this._handleFrame(pt, payload);

    conn.onError = (e) => {
      logger.error({ err: String(e) }, "CtraderTickEngine: socket error");
      this.conn = null;
      this._scheduleReconnect(`socket_error: ${e.message}`);
    };

    conn.onClose = () => {
      if (this.stopped) return;
      logger.warn("CtraderTickEngine: connection closed unexpectedly");
      this.conn = null;
      this._scheduleReconnect("remote_close");
    };
  }

  private _handleFrame(pt: number, payload: Buffer): void {
    const name = PT_NAME[pt] ?? `UNKNOWN(${pt})`;

    if (pt === PT.HEARTBEAT_EVENT) return;

    if (pt === PT.ERROR_RES) {
      const { errorCode, description } = this._parseErrorRes(payload);
      logger.warn({ errorCode, description, step: this.step }, "CtraderTickEngine: ERROR_RES");

      // Code 112 = NOT_SUBSCRIBED_TO_SPOTS — the depth subscribe request was rejected because
      // the symbol does not have an active spot subscription yet. This is a transient, per-request
      // error, NOT a broker-level ban. Clear the pending DOM set so callers can retry via
      // subscribeDom() once spots are confirmed; do NOT mark any symbol permanently unavailable.
      if (errorCode === OA_ERR_NOT_SUBSCRIBED_TO_SPOTS && this.step === "streaming") {
        logger.warn({ domPending: [...this.domSubscribedIds] },
          "CtraderTickEngine: DOM error 112 — clearing DOM subs (transient: spot sub not confirmed yet)");
        this.domSubscribedIds.clear();
        // Do not add to domUnavailableIds — caller may retry once spots are active
        return;
      }
      this._setStatus("error", { error: `ProtoOA ${errorCode}: ${description}` });
      this._scheduleReconnect(`error_res: ${errorCode}`);
      return;
    }

    switch (this.step) {
      case "app_auth": {
        if (pt !== PT.APP_AUTH_RES) { logger.warn({ got: name }, "CtraderTickEngine: unexpected frame in app_auth"); return; }
        logger.info("CtraderTickEngine: ✓ APP_AUTH_RES → ACCT_AUTH_REQ");
        this.step = "acct_auth";
        this._setStatus("acct_auth");
        this.conn!.write(this._buildAcctAuthReq());
        break;
      }
      case "acct_auth": {
        if (pt !== PT.ACCT_AUTH_RES) { logger.warn({ got: name }, "CtraderTickEngine: unexpected frame in acct_auth"); return; }
        this.connectedAt   = Date.now();
        this.reconnectDelay = 2_000;
        this.reconnectCount = 0;

        const ids = [...this.subscribedIds];
        if (ids.length > 0) {
          // Re-subscribe all watchlist symbols
          logger.info({ count: ids.length }, "CtraderTickEngine: ✓ ACCT_AUTH_RES → SUBSCRIBE_SPOTS_REQ");
          this.step = "subscribing";
          this._setStatus("subscribing");
          this.conn!.write(this._buildSubscribeSpotsReq(ids));
        } else {
          // No watchlist symbols yet — go straight to streaming; addSymbol() will subscribe later
          logger.info("CtraderTickEngine: ✓ ACCT_AUTH_RES — no watchlist symbols yet, standing by");
          this.step = "streaming";
          this._setStatus("streaming");
        }
        // Clear DOM books on reconnect; re-subscribe after reconnect
        this.domBids.clear();
        this.domAsks.clear();
        this.domLastUpdateAt.clear();
        this.domSubSentAt.clear();
        // Don't clear domSubscribedIds or domUnavailableIds — those persist across reconnects
        break;
      }
      case "subscribing": {
        if (pt === PT.SUBSCRIBE_SPOTS_RES) {
          logger.info("CtraderTickEngine: ✓ SUBSCRIBE_SPOTS_RES — streaming");
          this.step = "streaming";
          this._setStatus("streaming");
          this._resubscribeDomAfterConnect();
        } else if (pt === PT.SPOT_EVENT) {
          // First spot can arrive before SUBSCRIBE_SPOTS_RES — transition immediately
          this.step = "streaming";
          this._setStatus("streaming");
          this._resubscribeDomAfterConnect(); // must happen even on this path
          this._handleSpotEvent(payload);
        } else {
          logger.debug({ got: name }, "CtraderTickEngine: unexpected frame in subscribing");
        }
        break;
      }
      case "streaming": {
        if (pt === PT.SPOT_EVENT) {
          this._handleSpotEvent(payload);
        } else if (pt === PT.TRENDBARS_RES) {
          this._handleTrendbarsRes(payload);
        } else if (pt === PT.DEPTH_EVENT) {
          this._handleDepthEvent(payload);
        } else if (pt === PT.SUBSCRIBE_SPOTS_RES) {
          logger.debug("CtraderTickEngine: SUBSCRIBE_SPOTS_RES ack (dynamic add)");
        } else if (pt === PT.UNSUBSCRIBE_SPOTS_RES) {
          logger.debug("CtraderTickEngine: UNSUBSCRIBE_SPOTS_RES ack");
        } else if (pt === PT.SUBSCRIBE_DEPTH_QUOTES_RES) {
          logger.debug("CtraderTickEngine: SUBSCRIBE_DEPTH_QUOTES_RES ack");
        } else if (pt === PT.UNSUBSCRIBE_DEPTH_QUOTES_RES) {
          logger.debug("CtraderTickEngine: UNSUBSCRIBE_DEPTH_QUOTES_RES ack");
        } else {
          logger.debug({ got: name }, "CtraderTickEngine: unhandled frame in streaming");
        }
        break;
      }
    }
  }

  private _handleSpotEvent(payload: Buffer): void {
    const fields = parseMsg(payload);
    const symbolIdF = fields.find(f => f.fn === 3 && f.wt === 0);
    const bidF      = fields.find(f => f.fn === 4 && f.wt === 0);
    const askF      = fields.find(f => f.fn === 5 && f.wt === 0);
    const tsF       = fields.find(f => f.fn === 8 && f.wt === 0);

    const symbolId = symbolIdF ? (symbolIdF.v as number) : 0;
    if (!symbolId) return;

    const symbolName = this.opts?.symbolMap.get(symbolId);
    if (!symbolName) return;

    const bid       = bidF ? (bidF.v as number) / 100000 : 0;
    const ask       = askF ? (askF.v as number) / 100000 : 0;
    const mid       = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask;
    const spread    = bid > 0 && ask > 0 ? ask - bid : 0;
    const timestamp = tsF ? (tsF.v as number) : Date.now();

    const tick: CtraderTick = {
      symbol: symbolName, symbolId,
      bid, ask, spread, mid, price: mid,
      timestamp, provider: "ctrader",
    };

    this.lastTickMap.set(symbolId, tick);
    this.lastTickAt = Date.now();
    const prev = this.tickCounts.get(symbolName) ?? 0;
    this.tickCounts.set(symbolName, prev + 1);

    const total = prev + 1;
    if (total <= 5 || total % 500 === 0) {
      logger.info({
        symbol: symbolName, bid: bid.toFixed(6), ask: ask.toFixed(6),
        spread: spread.toFixed(6), tickCount: total,
      }, "CtraderTickEngine: SPOT_EVENT");
    }

    this.emit("tick", tick);
  }

  // ── Trendbars helpers ────────────────────────────────────────────────────────

  /** Build a GET_TRENDBARS_REQ frame using 64-bit-safe varint for the timestamp. */
  private _buildTrendbarsReq(symbolId: number, period: number, count: number, toTimestampMs?: number): Buffer {
    const { ctidTraderAccountId } = this.opts!;
    const toMs = toTimestampMs ?? (Date.now() + 60_000); // explicit cursor or 1-min future margin
    return buildFrame(PT.TRENDBARS_REQ, [
      ...u64f(1, PT.TRENDBARS_REQ),    // self-describing payloadType
      ...u64f(2, ctidTraderAccountId), // field 2 = ctidTraderAccountId
      ...u64f(4, toMs),               // field 4 = toTimestamp (ms) — no fromTimestamp (mutually exclusive with count)
      ...u64f(5, period),             // field 5 = TrendbarPeriod enum
      ...u64f(6, symbolId),           // field 6 = symbolId
      ...u64f(7, count),              // field 7 = count (max 4000)
    ]);
  }

  /**
   * Full-precision protobuf parser (int64-safe: uses multiply, not bit-shift).
   * Required for sint64 fields in ProtoOATrendbar (prices, timestamps).
   */
  private _parseMsgFull(buf: Buffer): Array<{ fn: number; wt: number; v: number | Buffer }> {
    const out: Array<{ fn: number; wt: number; v: number | Buffer }> = [];
    let o = 0;
    while (o < buf.length) {
      let tag = 0, mul = 1;
      while (o < buf.length) {
        const b = buf[o++];
        tag += (b & 0x7F) * mul;
        mul *= 128;
        if (!(b & 0x80)) break;
      }
      const fn = Math.floor(tag / 8), wt = tag & 7;
      if (fn === 0) break;
      if (wt === 0) {
        let v = 0, vm = 1;
        while (o < buf.length) {
          const b = buf[o++];
          v += (b & 0x7F) * vm;
          vm *= 128;
          if (!(b & 0x80)) break;
        }
        out.push({ fn, wt, v });
      } else if (wt === 2) {
        let len = 0, lm = 1;
        while (o < buf.length) {
          const b = buf[o++];
          len += (b & 0x7F) * lm;
          lm *= 128;
          if (!(b & 0x80)) break;
        }
        if (o + len > buf.length) break;
        out.push({ fn, wt, v: buf.slice(o, o + len) });
        o += len;
      } else if (wt === 1) { o += 8; }
      else if (wt === 5) { o += 4; }
      else break;
    }
    return out;
  }

  /** ZigZag64 decode: converts unsigned varint to signed sint64. */
  private _zigzag64(n: number): number {
    return (n & 1) ? -(Math.floor(n / 2) + 1) : Math.floor(n / 2);
  }

  /**
   * Decode a GET_TRENDBARS_RES payload into OHLCBar[].
   * ProtoOATrendbar fields:
   *   1=volume (uint64), 3=low (sint64), 4=deltaOpen (sint64),
   *   5=deltaClose (sint64), 6=deltaHigh (sint64), 7=utcTimestampInMinutes (sint64)
   * Prices are in 1/100000 units. Timestamp is in minutes (multiply by 60 → unix seconds).
   */
  private _decodeTrendbars(payload: Buffer, symbolId?: number, interval?: string): CtraderOHLCBar[] {
    const outerFields = this._parseMsgFull(payload);
    const trendbarBufs = outerFields
      .filter(f => f.fn === 5 && f.wt === 2)
      .map(f => f.v as Buffer);

    // ── Diagnostic: log outer response fields ──────────────────────────────
    const outerPeriod  = (outerFields.find(f => f.fn === 3 && f.wt === 0)?.v as number) ?? null;
    const outerAcctId  = (outerFields.find(f => f.fn === 2 && f.wt === 0)?.v as number) ?? null;
    const hasMore      = (outerFields.find(f => f.fn === 6 && f.wt === 0)?.v as number) ?? 0;
    logger.info({
      symbolId, interval,
      payloadBytes:    payload.length,
      outerFieldCount: outerFields.length,
      trendbarCount:   trendbarBufs.length,
      outerPeriod, outerAcctId, hasMore,
    }, "CtraderTickEngine: _decodeTrendbars — outer RES fields");

    if (trendbarBufs.length === 0) {
      logger.warn({
        symbolId, interval,
        outerFields: outerFields.map(f => ({ fn: f.fn, wt: f.wt, isBuffer: Buffer.isBuffer(f.v) })),
      }, "CtraderTickEngine: _decodeTrendbars — ZERO trendbar buffers in RES (empty response)");
    }

    const bars: CtraderOHLCBar[] = [];
    let filtered = 0;
    for (let i = 0; i < trendbarBufs.length; i++) {
      const tb = trendbarBufs[i];
      const f       = this._parseMsgFull(tb);
      const getRaw  = (fn: number): number =>
        (f.find(x => x.fn === fn && x.wt === 0)?.v as number) ?? 0;

      const volume = getRaw(3);
      // ProtoOATrendbar actual wire layout (confirmed via hex dump):
      //   field 5 = low              (uint64, NO ZigZag — absolute price × 100000)
      //   field 6 = deltaOpen        (sint64, ZigZag — open relative to low)
      //   field 7 = deltaClose       (sint64, ZigZag — close relative to low)
      //   field 8 = deltaHigh        (sint64, ZigZag — high relative to low)
      //   field 9 = utcTimestampInMinutes (uint64, NO ZigZag — minutes since Unix epoch)
      const rawLow       = getRaw(5);
      const rawDeltaOpen = getRaw(6);
      const rawDeltaClose= getRaw(7);
      const rawDeltaHigh = getRaw(8);
      const rawTsMin     = getRaw(9);

      const low          = rawLow;       // uint64, no ZigZag — absolute price × 100000
      const deltaOpen    = rawDeltaOpen; // uint64, no ZigZag — non-negative offset from low
      const deltaClose   = rawDeltaClose;// uint64, no ZigZag — non-negative offset from low
      const deltaHigh    = rawDeltaHigh; // uint64, no ZigZag — non-negative offset from low
      const tsMinutes    = rawTsMin;     // uint64, no ZigZag — minutes since Unix epoch

      const lowPrice   = low                  / 100_000;
      const openPrice  = (low + deltaOpen)    / 100_000;
      const closePrice = (low + deltaClose)   / 100_000;
      const highPrice  = (low + deltaHigh)    / 100_000;
      const timeSec    = tsMinutes * 60;

      // Log the first 3 and last bar for diagnostics
      if (i < 3 || i === trendbarBufs.length - 1) {
        logger.info({
          barIdx: i, symbolId, interval,
          rawFields: { rawLow, rawDeltaOpen, rawDeltaClose, rawDeltaHigh, rawTsMin },
          decoded:   { low, deltaOpen, deltaClose, deltaHigh, tsMinutes },
          prices:    { open: openPrice, high: highPrice, low: lowPrice, close: closePrice },
          timeSec,   volume,
          timeISO: timeSec > 0 ? new Date(timeSec * 1000).toISOString() : "(invalid)",
        }, "CtraderTickEngine: trendbar sample");
      }

      if (timeSec <= 0 || !Number.isFinite(lowPrice) || lowPrice <= 0) {
        filtered++;
        if (filtered <= 3) {
          logger.warn({
            barIdx: i, timeSec, lowPrice, rawLow, rawTsMin,
            reason: timeSec <= 0 ? "timeSec<=0" : !Number.isFinite(lowPrice) ? "non-finite" : "lowPrice<=0",
          }, "CtraderTickEngine: trendbar FILTERED");
        }
        continue;
      }

      bars.push({ time: timeSec, open: openPrice, high: highPrice, low: lowPrice, close: closePrice, volume });
    }

    bars.sort((a, b) => a.time - b.time);

    logger.info({
      symbolId, interval,
      trendbarBufsTotal: trendbarBufs.length,
      barsDecoded:       bars.length,
      barsFiltered:      filtered,
      firstBar: bars[0]     ? { time: bars[0].time, iso: new Date(bars[0].time * 1000).toISOString(), open: bars[0].open }     : null,
      lastBar:  bars.at(-1) ? { time: bars.at(-1)!.time, iso: new Date(bars.at(-1)!.time * 1000).toISOString(), close: bars.at(-1)!.close } : null,
    }, "CtraderTickEngine: _decodeTrendbars complete");

    return bars;
  }

  /** Handle an incoming GET_TRENDBARS_RES by shifting the FIFO queue. */
  private _handleTrendbarsRes(payload: Buffer): void {
    const pending = this.pendingTrendbarsQueue.shift();
    if (!pending) {
      logger.warn("CtraderTickEngine: unexpected GET_TRENDBARS_RES — no pending request in queue");
      return;
    }
    clearTimeout(pending.timer);
    try {
      const bars = this._decodeTrendbars(payload, pending.symbolId, pending.interval);
      logger.info(
        {
          symbolId: pending.symbolId,
          interval: pending.interval,
          bars: bars.length,
          firstTime: bars[0]     ? new Date(bars[0].time     * 1000).toISOString() : null,
          lastTime:  bars.at(-1) ? new Date(bars.at(-1)!.time * 1000).toISOString() : null,
        },
        bars.length > 0
          ? "CtraderTickEngine: fetchTrendbarsOnSession ✓"
          : "CtraderTickEngine: fetchTrendbarsOnSession — 0 bars decoded (check symbolId/period/logs above)",
      );
      pending.resolve(bars);
    } catch (e) {
      logger.error({ symbolId: pending.symbolId, interval: pending.interval, err: String(e) },
        "CtraderTickEngine: fetchTrendbarsOnSession decode error");
      pending.reject(new Error(`fetchTrendbarsOnSession decode error: ${String(e)}`));
    }
  }

  // ── DOM reconnect helper ──────────────────────────────────────────────────
  /**
   * Re-subscribe all active DOM symbols after a spot subscription is confirmed.
   * Must be called from BOTH the SUBSCRIBE_SPOTS_RES path and the early-SPOT_EVENT
   * path to guarantee DOM re-sub regardless of frame arrival order.
   * Idempotent: guarded by domSubSentAt timestamp check.
   */
  private _resubscribeDomAfterConnect(): void {
    const domIds = [...this.domSubscribedIds].filter(id => !this.domUnavailableIds.has(id));
    if (domIds.length === 0 || !this.conn) return;
    for (const id of domIds) this.domSubSentAt.set(id, Date.now());
    this.conn.write(this._buildSubscribeDepthQuotesReq(domIds));
    logger.info({ count: domIds.length }, "CtraderTickEngine: re-subscribed DOM after spots confirmed");
  }

  // ── DOM event handler ─────────────────────────────────────────────────────
  private _handleDepthEvent(payload: Buffer): void {
    const fields   = parseMsg(payload);
    // field 3 = symbolId (uint64)
    const symField = fields.find(f => f.fn === 3 && f.wt === 0);
    if (!symField) return;
    const symbolId = symField.v as number;

    if (!this.domBids.has(symbolId)) this.domBids.set(symbolId, new Map());
    if (!this.domAsks.has(symbolId)) this.domAsks.set(symbolId, new Map());
    const bids = this.domBids.get(symbolId)!;
    const asks = this.domAsks.get(symbolId)!;

    // field 4 = repeated ProtoOADepthQuote (newQuotes)
    // ProtoOADepthQuote: field1=id(uint64), field3=size(uint64), field4=bid(uint64), field5=ask(uint64)
    for (const f of fields.filter(x => x.fn === 4 && x.wt === 2)) {
      const qf   = parseMsg(f.v as Buffer);
      const id   = (qf.find(x => x.fn === 1 && x.wt === 0)?.v as number) ?? 0;
      const size = (qf.find(x => x.fn === 3 && x.wt === 0)?.v as number) ?? 0;
      const bid  =  qf.find(x => x.fn === 4 && x.wt === 0)?.v as number | undefined;
      const ask  =  qf.find(x => x.fn === 5 && x.wt === 0)?.v as number | undefined;
      if (bid !== undefined) {
        bids.set(id, { price: bid / 100_000, size: size / 100 });
      } else if (ask !== undefined) {
        asks.set(id, { price: ask / 100_000, size: size / 100 });
      }
    }

    // field 5 = repeated/packed deletedQuote ids (uint64)
    for (const f of fields.filter(x => x.fn === 5)) {
      if (f.wt === 0) {
        // non-packed varint
        const id = f.v as number;
        bids.delete(id);
        asks.delete(id);
      } else if (f.wt === 2) {
        // packed varints
        const buf = f.v as Buffer;
        let o = 0;
        while (o < buf.length) {
          let id = 0, mul = 1;
          while (o < buf.length) {
            const b = buf[o++];
            id += (b & 0x7F) * mul;
            mul *= 128;
            if (!(b & 0x80)) break;
          }
          bids.delete(id);
          asks.delete(id);
        }
      }
    }

    this.domLastUpdateAt.set(symbolId, Date.now());
  }

  // ── DOM message builders ───────────────────────────────────────────────────
  private _buildSubscribeDepthQuotesReq(symbolIds: number[]): Buffer {
    const { ctidTraderAccountId } = this.opts!;
    return buildFrame(PT.SUBSCRIBE_DEPTH_QUOTES_REQ, [
      ...u32f(1, PT.SUBSCRIBE_DEPTH_QUOTES_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...symbolIds.flatMap(id => u32f(3, id)),
    ]);
  }

  private _buildUnsubscribeDepthQuotesReq(symbolIds: number[]): Buffer {
    const { ctidTraderAccountId } = this.opts!;
    return buildFrame(PT.UNSUBSCRIBE_DEPTH_QUOTES_REQ, [
      ...u32f(1, PT.UNSUBSCRIBE_DEPTH_QUOTES_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...symbolIds.flatMap(id => u32f(3, id)),
    ]);
  }

  // ── Message builders ─────────────────────────────────────────────────────────
  private _buildAppAuthReq(): Buffer {
    const { clientId, clientSecret } = this.opts!;
    return buildFrame(PT.APP_AUTH_REQ, [
      ...u32f(1, PT.APP_AUTH_REQ),
      ...strf(2, clientId),
      ...strf(3, clientSecret),
    ]);
  }

  private _buildAcctAuthReq(): Buffer {
    const { ctidTraderAccountId, accessToken } = this.opts!;
    return buildFrame(PT.ACCT_AUTH_REQ, [
      ...u32f(1, PT.ACCT_AUTH_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...strf(3, accessToken),
    ]);
  }

  private _buildSubscribeSpotsReq(symbolIds: number[]): Buffer {
    const { ctidTraderAccountId } = this.opts!;
    return buildFrame(PT.SUBSCRIBE_SPOTS_REQ, [
      ...u32f(1, PT.SUBSCRIBE_SPOTS_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...symbolIds.flatMap(id => u32f(3, id)),
      ...boolField(4, true), // subscribeToSpotTimestamp = true
    ]);
  }

  private _buildUnsubscribeSpotsReq(symbolIds: number[]): Buffer {
    const { ctidTraderAccountId } = this.opts!;
    return buildFrame(PT.UNSUBSCRIBE_SPOTS_REQ, [
      ...u32f(1, PT.UNSUBSCRIBE_SPOTS_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...symbolIds.flatMap(id => u32f(3, id)),
    ]);
  }

  private _parseErrorRes(payload: Buffer): { errorCode: number | string; description: string } {
    const fields = parseMsg(payload);
    const code   = fields.find(f => f.fn === 2 && f.wt === 0)?.v ?? "?";
    const descF  = fields.find(f => f.fn === 3 && f.wt === 2);
    return {
      errorCode:   code as number,
      description: descF ? (descF.v as Buffer).toString("utf8") : "",
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const ctraderTickEngine = new CtraderTickEngine();
