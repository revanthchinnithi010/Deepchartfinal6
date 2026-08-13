import WebSocket from "ws";
import { BaseProvider, type ProviderTick } from "./BaseProvider.js";
import { logger } from "../../lib/logger.js";

/**
 * Delta Exchange India — perpetual futures market data provider.
 *
 * WS endpoint: wss://socket.india.delta.exchange
 * Channels:
 *   - all_trades  → fires on EVERY executed trade (sub-second during active markets)
 *   - v2/ticker   → full ticker snapshot every ~5s (volume, spread, mark price, bid/ask)
 *
 * `all_trades` is the primary real-time tick source for OHLC candles.
 * `v2/ticker` is a quote/mark snapshot used as a live-price fallback only;
 * it is deliberately excluded from OHLC candle formation.
 *
 * Timestamp normalization:
 *   Delta India sends microsecond timestamps (1.78e15 for 2026).
 *   > 1e15 → microseconds → divide by 1000 → milliseconds (for CandleAggregator)
 *   > 1e12 → already milliseconds → use as-is
 *   Fallback → Date.now() (milliseconds)
 */

const DELTA_INDIA_WS   = "wss://socket.india.delta.exchange";
const PING_INTERVAL_MS = 20_000;

interface DeltaFlatMsg {
  type:              string;
  symbol?:           string;
  price?:            string | number;
  mark_price?:       string | number;
  close?:            string | number;
  spot_price?:       string | number;
  best_bid?:         string | number;
  best_ask?:         string | number;
  size?:             number | string;
  volume?:           string | number;
  turnover_usd?:     string | number;
  timestamp?:        number;
  buyer_role?:       string;
  high?:             string | number;
  low?:              string | number;
  open?:             string | number;
  mark_change_24h?:  string | number;
}

function parsePrice(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return NaN;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) || n <= 0 ? NaN : n;
}

/**
 * Normalize Delta India timestamp to milliseconds.
 * Delta India uses microseconds (16-digit numbers in 2026).
 */
function normToMs(ts: number | undefined): number {
  if (!ts) return Date.now();
  if (ts > 1e15) return Math.floor(ts / 1_000);   // microseconds → ms
  if (ts > 1e12) return ts;                         // already ms
  return ts * 1_000;                                // seconds → ms
}

export interface DeltaSymbolEntry {
  internalSymbol: string;
  deltaSymbol:    string;
}

export class DeltaExchangeProvider extends BaseProvider {
  readonly name        = "delta";
  readonly displayName = "Delta Exchange India";
  readonly badge       = "delta";
  readonly color       = "#8B5CF6";

  private internalToDelta: Map<string, string> = new Map();
  private deltaToInternal: Map<string, string> = new Map();

  get supportedSymbols(): string[] {
    return [...this.internalToDelta.keys()];
  }

  private ws:              WebSocket | null = null;
  private pingTimer:       ReturnType<typeof setInterval> | null = null;
  private subscribedDelta: Set<string> = new Set();

  constructor(entries: DeltaSymbolEntry[]) {
    super();
    this._loadSymbols(entries);
  }

  private _loadSymbols(entries: DeltaSymbolEntry[]): void {
    this.internalToDelta.clear();
    this.deltaToInternal.clear();
    for (const { internalSymbol, deltaSymbol } of entries) {
      this.internalToDelta.set(internalSymbol, deltaSymbol);
      this.deltaToInternal.set(deltaSymbol, internalSymbol);
    }
    logger.info(
      { count: entries.length, provider: this.name },
      "DeltaExchangeProvider: symbol map loaded",
    );
  }

  /**
   * Hot-reload symbol catalog without dropping the WS connection.
   * New symbols will be subscribed immediately if the socket is open.
   */
  refreshSymbols(entries: DeltaSymbolEntry[]): void {
    const prevInternal = new Set(this.internalToDelta.keys());
    this._loadSymbols(entries);

    if (this.ws?.readyState !== WebSocket.OPEN) return;

    for (const { internalSymbol, deltaSymbol } of entries) {
      if (!prevInternal.has(internalSymbol) && this.subscriptions.has(internalSymbol)) {
        this._sendSubscribe(deltaSymbol);
      }
    }
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.clearPing();
    this.subscribedDelta.clear();

    logger.info({ provider: this.name, url: DELTA_INDIA_WS }, "DeltaExchangeProvider: connecting");
    this.ws = new WebSocket(DELTA_INDIA_WS, { handshakeTimeout: 10_000 });

    this.ws.on("open", () => {
      logger.info({ provider: this.name }, "DeltaExchangeProvider: WS open — subscribing all pending");
      this.onConnected();

      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
      }, PING_INTERVAL_MS);
    });

    this.ws.on("pong", () => {
      logger.debug({ provider: this.name }, "DeltaExchangeProvider: pong");
    });

    this.ws.on("message", (raw) => {
      const str = raw.toString();
      try {
        const msg = JSON.parse(str) as DeltaFlatMsg;

        if (msg.type === "subscriptions") {
          logger.info({ provider: this.name, raw: str.slice(0, 300) }, "DeltaExchangeProvider: subscriptions ack");
          return;
        }
        if (msg.type === "heartbeat") return;
        if (msg.type === "error") {
          logger.warn({ provider: this.name, raw: str.slice(0, 400) }, "DeltaExchangeProvider: server error msg");
          return;
        }

        // ── all_trades: fires on EVERY executed trade — primary candle source ──
        if (msg.type === "all_trades" && msg.symbol) {
          const internalSym = this.deltaToInternal.get(msg.symbol);
          if (!internalSym) return;

          const price = parsePrice(msg.price);
          if (isNaN(price)) return;

          const rawSize = typeof msg.size === "string" ? parseFloat(msg.size) : (msg.size ?? 0);
          const volume  = isNaN(rawSize as number) ? 0 : (rawSize as number);

          // Delta India sends microsecond timestamps — normalize to ms
          const tsMs = normToMs(msg.timestamp);

          logger.debug(
            { provider: this.name, symbol: internalSym, price, deltaSym: msg.symbol },
            "DeltaExchangeProvider: all_trades tick",
          );
          this._emitTick(internalSym, msg.symbol, price, volume, tsMs, undefined, undefined, undefined, "trade");
          return;
        }

        // ── v2/ticker: quote snapshot every ~5s — live price fallback only ─────
        if ((msg.type === "v2/ticker" || msg.type === "ticker") && msg.symbol) {
          const internalSym = this.deltaToInternal.get(msg.symbol);
          if (!internalSym) {
            logger.debug({ provider: this.name, symbol: msg.symbol }, "DeltaExchangeProvider: unmapped symbol — skip");
            return;
          }

          // Prefer the last traded close for the live-price fallback. Mark price
          // is a valuation price and must never be treated as an OHLC sample.
          const price =
            parsePrice(msg.close)      ||
            parsePrice(msg.spot_price) ||
            parsePrice(msg.mark_price) ||
            parsePrice(msg.best_bid);

          if (isNaN(price)) {
            logger.warn({ provider: this.name, symbol: msg.symbol }, "DeltaExchangeProvider: no parseable price");
            return;
          }

          const rawVol = typeof msg.size === "number" ? msg.size
            : typeof msg.size === "string" ? parseFloat(msg.size)
            : parsePrice(msg.volume) || parsePrice(msg.turnover_usd) || 0;
          const volume = isNaN(rawVol as number) ? 0 : rawVol as number;

          const bid = parsePrice(msg.best_bid);
          const ask = parsePrice(msg.best_ask);

          const high         = parsePrice(msg.high);
          const low          = parsePrice(msg.low);
          const markPrice    = parsePrice(msg.mark_price);
          const rawChangePct = typeof msg.mark_change_24h === "string"
            ? parseFloat(msg.mark_change_24h)
            : msg.mark_change_24h;
          const changePct24h = typeof rawChangePct === "number" && !isNaN(rawChangePct) ? rawChangePct : undefined;

          const tsMs = normToMs(msg.timestamp);

          logger.info(
            { provider: this.name, symbol: internalSym, price, deltaSym: msg.symbol },
            "DeltaExchangeProvider: tick",
          );
          this._emitTick(internalSym, msg.symbol, price, volume, tsMs, bid, ask, {
            high:  !isNaN(high) ? high : undefined,
            low:   !isNaN(low) ? low : undefined,
            markPrice: !isNaN(markPrice) ? markPrice : undefined,
            changePct24h,
          }, "quote");
        }
      } catch (err) {
        logger.warn({ err, provider: this.name, raw: str.slice(0, 200) }, "DeltaExchangeProvider: parse error");
      }
    });

    this.ws.on("error", (err) => {
      logger.warn({ provider: this.name, err: err.message }, "DeltaExchangeProvider: WS error");
      this.onError(err);
    });

    this.ws.on("close", (code, reason) => {
      logger.info({ provider: this.name, code, reason: reason.toString() }, "DeltaExchangeProvider: WS closed");
      this.clearPing();
      this.onDisconnected(code);
    });
  }

  override subscribe(symbol: string): boolean {
    if (!this.internalToDelta.has(symbol) && /^[A-Z0-9]+USDT?$/.test(symbol)) {
      this.internalToDelta.set(symbol, symbol);
      this.deltaToInternal.set(symbol, symbol);
      logger.info({ provider: this.name, symbol }, "DeltaExchangeProvider: dynamically registered new symbol");
    }
    return super.subscribe(symbol);
  }

  subscribeSymbol(symbol: string): void {
    const deltaSym = this.internalToDelta.get(symbol);
    if (!deltaSym) {
      logger.warn({ provider: this.name, symbol }, "DeltaExchangeProvider: subscribeSymbol — no delta mapping");
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN && !this.subscribedDelta.has(deltaSym)) {
      this._sendSubscribe(deltaSym);
    }
  }

  unsubscribeSymbol(symbol: string): void {
    const deltaSym = this.internalToDelta.get(symbol);
    if (!deltaSym) return;
    this.subscribedDelta.delete(deltaSym);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "unsubscribe",
        payload: { channels: [
          { name: "all_trades", symbols: [deltaSym] },
          { name: "v2/ticker", symbols: [deltaSym] },
        ]},
      }));
      logger.info({ provider: this.name, deltaSym }, "DeltaExchangeProvider: unsubscribed");
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearPing();
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
    logger.info({ provider: this.name }, "DeltaExchangeProvider: destroyed");
  }

  private _emitTick(
    internalSym: string,
    deltaSym: string,
    price: number,
    volume: number,
    tsMs: number,
    bid?: number,
    ask?: number,
    extra?: { high?: number; low?: number; markPrice?: number; changePct24h?: number },
    tickType: "trade" | "quote" = "trade",
  ): void {
    const tick: ProviderTick = {
      symbol:          internalSym,
      providerSymbol:  deltaSym,
      provider:        this.name,
      price,
      volume,
      timestamp:       tsMs,
      receivedAt:      Date.now(),
      ...(bid && !isNaN(bid) ? { bid } : {}),
      ...(ask && !isNaN(ask) ? { ask } : {}),
      ...(extra?.high !== undefined && !isNaN(extra.high) ? { high: extra.high } : {}),
      ...(extra?.low !== undefined && !isNaN(extra.low) ? { low: extra.low } : {}),
      ...(extra?.markPrice !== undefined && !isNaN(extra.markPrice) ? { markPrice: extra.markPrice } : {}),
      ...(extra?.changePct24h !== undefined && !isNaN(extra.changePct24h) ? { changePct24h: extra.changePct24h } : {}),
      tickType,
    };
    this.onTick(tick);
  }

  private _sendSubscribe(deltaSym: string): void {
    if (this.subscribedDelta.has(deltaSym)) return;
    this.subscribedDelta.add(deltaSym);
    this.ws!.send(JSON.stringify({
      type: "subscribe",
      payload: { channels: [
        { name: "all_trades", symbols: [deltaSym] },
        { name: "v2/ticker", symbols: [deltaSym] },
      ]},
    }));
    logger.info({ provider: this.name, deltaSym }, "DeltaExchangeProvider: subscribe sent (all_trades + v2/ticker)");
  }

  private clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }
}
