import WebSocket from "ws";
import { BaseProvider, type ProviderTick } from "./BaseProvider.js";
import { logger } from "../../lib/logger.js";

/**
 * Delta Exchange India real-time market-data provider.
 *
 * IMPORTANT: Delta migrated public market-data channels to the public socket
 * endpoint in 2026. The legacy `all_trades` / `v2/ticker` channels are no
 * longer used here. We consume:
 *   - `trades`  -> every executed trade; PRIMARY OHLC tick source
 *   - `ticker`  -> ~5s quote snapshot; live-price metadata only
 *
 * Delta product symbols are USD quoted (e.g. BTCUSD, FARTCOINUSD). Keep the
 * app's internal symbol unchanged; do not convert USD -> USDT.
 */

const DELTA_INDIA_WS = "wss://public-socket.india.delta.exchange";
const PING_INTERVAL_MS = 20_000;

interface DeltaTradeMsg {
  type: "trades";
  p?: string | number; // trade price
  s?: string | number; // trade size
  sy?: string;         // symbol
  t?: number;          // trade timestamp, microseconds
  ts?: number;         // server publish timestamp, microseconds
  r?: string;
}

interface DeltaTickerMsg {
  type: "ticker";
  sy?: string;
  ts?: number;
  sp?: string | number;
  d?: Array<{
    s?: string;
    m?: string | number; // mark price
    m24hc?: string | number;
    ohlc?: Array<string | number>;
    q?: Array<string | number | null>;
    to?: Array<string | number>;
  }>;
}

function parsePrice(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return NaN;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/** Delta publishes timestamps in microseconds. Normalize everything to ms. */
function normToMs(ts: number | undefined): number {
  if (!Number.isFinite(ts) || !ts) return Date.now();
  if (ts > 1e15) return Math.floor(ts / 1_000);
  if (ts > 1e12) return Math.floor(ts);
  return Math.floor(ts * 1_000);
}

export interface DeltaSymbolEntry {
  internalSymbol: string;
  deltaSymbol: string;
}

export class DeltaExchangeProvider extends BaseProvider {
  readonly name = "delta";
  readonly displayName = "Delta Exchange India";
  readonly badge = "delta";
  readonly color = "#8B5CF6";

  private internalToDelta = new Map<string, string>();
  private deltaToInternal = new Map<string, string>();
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subscribedDelta = new Set<string>();

  get supportedSymbols(): string[] {
    return [...this.internalToDelta.keys()];
  }

  constructor(entries: DeltaSymbolEntry[]) {
    super();
    this._loadSymbols(entries);
  }

  private _loadSymbols(entries: DeltaSymbolEntry[]): void {
    this.internalToDelta.clear();
    this.deltaToInternal.clear();

    for (const entry of entries) {
      const internal = entry.internalSymbol.toUpperCase();
      const delta = entry.deltaSymbol.toUpperCase();
      if (!internal || !delta) continue;
      this.internalToDelta.set(internal, delta);
      this.deltaToInternal.set(delta, internal);
    }

    logger.info(
      { count: entries.length, provider: this.name },
      "DeltaExchangeProvider: symbol map loaded",
    );
  }

  refreshSymbols(entries: DeltaSymbolEntry[]): void {
    const previousSubscriptions = new Set(this.subscriptions);
    this._loadSymbols(entries);

    if (this.ws?.readyState !== WebSocket.OPEN) return;

    // Re-subscribe using the refreshed exchange symbol map. This is important
    // because the catalog can be loaded after the socket was already opened.
    for (const internal of previousSubscriptions) {
      if (this.internalToDelta.has(internal)) {
        this.subscribeSymbol(internal);
      }
    }
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.clearPing();
    this.subscribedDelta.clear();

    logger.info(
      { provider: this.name, url: DELTA_INDIA_WS },
      "DeltaExchangeProvider: connecting to public market-data socket",
    );

    this.ws = new WebSocket(DELTA_INDIA_WS, { handshakeTimeout: 10_000 });

    this.ws.on("open", () => {
      logger.info({ provider: this.name }, "DeltaExchangeProvider: public WS open");
      this.onConnected();

      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
      }, PING_INTERVAL_MS);
    });

    this.ws.on("pong", () => {
      logger.debug({ provider: this.name }, "DeltaExchangeProvider: pong");
    });

    this.ws.on("message", raw => {
      const str = raw.toString();
      try {
        const msg = JSON.parse(str) as Record<string, unknown>;

        if (msg.type === "subscriptions") {
          logger.info(
            { provider: this.name, raw: str.slice(0, 500) },
            "DeltaExchangeProvider: subscription acknowledged",
          );
          return;
        }

        if (msg.type === "heartbeat" || msg.type === "pong") return;

        if (msg.type === "error") {
          logger.warn(
            { provider: this.name, raw: str.slice(0, 500) },
            "DeltaExchangeProvider: server error",
          );
          return;
        }

        // ── New public `trades` channel: every executed trade ───────────────
        if (msg.type === "trades") {
          const trade = msg as unknown as DeltaTradeMsg;
          const deltaSym = trade.sy?.toUpperCase();
          if (!deltaSym) return;

          const internalSym = this.deltaToInternal.get(deltaSym);
          if (!internalSym) {
            logger.debug(
              { provider: this.name, deltaSym },
              "DeltaExchangeProvider: trade for unmapped symbol",
            );
            return;
          }

          const price = parsePrice(trade.p);
          if (isNaN(price)) return;

          const rawSize = typeof trade.s === "string" ? parseFloat(trade.s) : (trade.s ?? 0);
          const volume = Number.isFinite(rawSize) ? rawSize : 0;
          const tsMs = normToMs(trade.t ?? trade.ts);

          logger.debug(
            { provider: this.name, symbol: internalSym, price, deltaSym, tsMs },
            "DeltaExchangeProvider: trade tick",
          );

          this._emitTick(
            internalSym,
            deltaSym,
            price,
            volume,
            tsMs,
            undefined,
            undefined,
            undefined,
            "trade",
          );
          return;
        }

        // ── New public `ticker` channel: ~5s metadata/live-price snapshot ───
        if (msg.type === "ticker") {
          const ticker = msg as unknown as DeltaTickerMsg;
          const deltaSym = ticker.sy?.toUpperCase();
          const row = ticker.d?.find(x => x.s?.toUpperCase() === deltaSym) ?? ticker.d?.[0];
          const rowSym = row?.s?.toUpperCase() ?? deltaSym;
          if (!rowSym) return;

          const internalSym = this.deltaToInternal.get(rowSym);
          if (!internalSym) return;

          const ohlc = row?.ohlc ?? [];
          const price =
            parsePrice(ohlc[3]) ||
            parsePrice(row?.m) ||
            parsePrice(ticker.sp);
          if (isNaN(price)) return;

          const bid = parsePrice(row?.q?.[2]);
          const ask = parsePrice(row?.q?.[0]);
          const high = parsePrice(ohlc[1]);
          const low = parsePrice(ohlc[2]);
          const markPrice = parsePrice(row?.m);
          const rawChange = typeof row?.m24hc === "string" ? parseFloat(row.m24hc) : row?.m24hc;
          const changePct24h = typeof rawChange === "number" && Number.isFinite(rawChange)
            ? rawChange
            : undefined;
          const rawTurnover = row?.to?.[1] ?? row?.to?.[0];
          const volume = typeof rawTurnover === "string" ? parseFloat(rawTurnover) : (rawTurnover ?? 0);
          const tsMs = normToMs(ticker.ts);

          // Quote snapshots are intentionally NOT used by CandleAggregator.
          this._emitTick(
            internalSym,
            rowSym,
            price,
            Number.isFinite(volume) ? volume : 0,
            tsMs,
            !isNaN(bid) ? bid : undefined,
            !isNaN(ask) ? ask : undefined,
            {
              high: !isNaN(high) ? high : undefined,
              low: !isNaN(low) ? low : undefined,
              markPrice: !isNaN(markPrice) ? markPrice : undefined,
              changePct24h,
            },
            "quote",
          );
        }
      } catch (err) {
        logger.warn(
          { err, provider: this.name, raw: str.slice(0, 300) },
          "DeltaExchangeProvider: message parse error",
        );
      }
    });

    this.ws.on("error", (err: Error) => {
      logger.warn({ provider: this.name, err: err.message }, "DeltaExchangeProvider: WS error");
      this.onError(err);
    });

    this.ws.on("close", (code, reason) => {
      logger.info(
        { provider: this.name, code, reason: reason.toString() },
        "DeltaExchangeProvider: public WS closed",
      );
      this.clearPing();
      this.onDisconnected(code);
    });
  }

  override subscribe(symbol: string): boolean {
    const s = symbol.toUpperCase();
    if (!this.internalToDelta.has(s) && /^[A-Z0-9]+(?:USD|USDT)$/.test(s)) {
      // Keep explicit app symbols usable even before the product catalog loads.
      // Delta India market symbols are normally USD-quoted.
      const deltaSym = s.endsWith("USDT") ? s.slice(0, -1) : s;
      this.internalToDelta.set(s, deltaSym);
      this.deltaToInternal.set(deltaSym, s);
      logger.info({ provider: this.name, symbol: s, deltaSym }, "DeltaExchangeProvider: dynamically registered symbol");
    }
    return super.subscribe(s);
  }

  subscribeSymbol(symbol: string): void {
    const deltaSym = this.internalToDelta.get(symbol.toUpperCase());
    if (!deltaSym) {
      logger.warn({ provider: this.name, symbol }, "DeltaExchangeProvider: subscribeSymbol — no mapping");
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN && !this.subscribedDelta.has(deltaSym)) {
      this._sendSubscribe(deltaSym);
    }
  }

  unsubscribeSymbol(symbol: string): void {
    const deltaSym = this.internalToDelta.get(symbol.toUpperCase());
    if (!deltaSym) return;
    this.subscribedDelta.delete(deltaSym);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "unsubscribe",
        payload: {
          channels: [
            { name: "trades", symbols: [deltaSym] },
            { name: "ticker", symbols: [deltaSym] },
          ],
        },
      }));
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
      symbol: internalSym,
      providerSymbol: deltaSym,
      provider: this.name,
      price,
      volume,
      timestamp: tsMs,
      receivedAt: Date.now(),
      ...(bid !== undefined && Number.isFinite(bid) ? { bid } : {}),
      ...(ask !== undefined && Number.isFinite(ask) ? { ask } : {}),
      ...(extra?.high !== undefined && Number.isFinite(extra.high) ? { high: extra.high } : {}),
      ...(extra?.low !== undefined && Number.isFinite(extra.low) ? { low: extra.low } : {}),
      ...(extra?.markPrice !== undefined && Number.isFinite(extra.markPrice) ? { markPrice: extra.markPrice } : {}),
      ...(extra?.changePct24h !== undefined && Number.isFinite(extra.changePct24h) ? { changePct24h: extra.changePct24h } : {}),
      tickType,
    };
    this.onTick(tick);
  }

  private _sendSubscribe(deltaSym: string): void {
    if (this.subscribedDelta.has(deltaSym)) return;
    this.subscribedDelta.add(deltaSym);

    this.ws!.send(JSON.stringify({
      type: "subscribe",
      payload: {
        channels: [
          { name: "trades", symbols: [deltaSym] },
          { name: "ticker", symbols: [deltaSym] },
        ],
      },
    }));

    logger.info(
      { provider: this.name, deltaSym, channels: ["trades", "ticker"] },
      "DeltaExchangeProvider: public market-data subscription sent",
    );
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
