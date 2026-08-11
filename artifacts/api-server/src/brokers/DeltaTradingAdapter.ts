import { createHmac } from "crypto";
import { logger } from "../lib/logger.js";
import { withRetry } from "../services/retryFetch.js";
import {
  BrokerAdapter,
  type AdapterBalance,
  type AdapterPosition,
  type AdapterOrder,
  type AdapterOrderHistory,
  type PlaceOrderParams,
} from "./BrokerAdapter.js";

export type DeltaAuthMode = "api_key" | "oauth";

/**
 * Delta Exchange REST adapter.
 *
 * baseOrigin must be the environment-specific origin with NO trailing slash:
 *   International → "https://api.delta.exchange"
 *   India         → "https://api.india.delta.exchange"
 *
 * All paths passed to request() are relative to /v2 (e.g. "/wallet/balances").
 * The adapter prepends /v2 internally so the HMAC is computed over the full path.
 */
const API_PREFIX = "/v2";
const DEFAULT_ORIGIN = "https://api.delta.exchange";

// ── Delta order-type mapping ──────────────────────────────────────────────────
const ORDER_TYPE_MAP: Record<string, string> = {
  Market:    "market_order",
  Limit:     "limit_order",
  Stop:      "stop_market_order",
  StopLimit: "stop_limit_order",
};

const TIME_IN_FORCE_MAP: Record<string, string> = {
  GTC: "gtc",
  IOC: "ioc",
  FOK: "fok",
};

export class DeltaTradingAdapter extends BrokerAdapter {
  readonly brokerId = "delta";
  private readonly authMode:   DeltaAuthMode;
  private readonly baseOrigin: string;

  constructor(
    private readonly apiKey:    string,
    private readonly apiSecret: string,
    authMode:   DeltaAuthMode = "api_key",
    baseOrigin: string        = DEFAULT_ORIGIN,
  ) {
    super();
    this.authMode   = authMode;
    this.baseOrigin = baseOrigin.replace(/\/$/, "");
  }

  // ── Signing ───────────────────────────────────────────────────────────────

  private sign(
    method:      string,
    fullPath:    string,
    queryString: string,
    body:        string,
    timestamp:   number,
  ): string {
    const payload =
      method.toUpperCase() +
      String(timestamp) +
      fullPath +
      (queryString ? "?" + queryString : "") +
      body;

    logger.debug(
      { method, fullPath, queryString: queryString || "(none)", bodyLen: body.length, timestamp },
      "DeltaAdapter: signing",
    );

    return createHmac("sha256", this.apiSecret).update(payload).digest("hex");
  }

  private buildHeaders(
    method:      string,
    fullPath:    string,
    queryString: string,
    body:        string,
  ): Record<string, string> {
    if (this.authMode === "oauth") {
      return {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        "User-Agent":    "TradeVault/1.0",
      };
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign(method.toUpperCase(), fullPath, queryString, body, timestamp);

    logger.debug(
      { method: method.toUpperCase(), fullPath, timestamp, envOrigin: this.baseOrigin, sigHead: signature.slice(0, 12) },
      "DeltaAdapter: headers",
    );

    return {
      "api-key":      this.apiKey,
      "timestamp":    String(timestamp),
      "signature":    signature,
      "Content-Type": "application/json",
      "Accept":       "application/json",
      "User-Agent":   "TradeVault/1.0",
    };
  }

  // ── Core request with retry ───────────────────────────────────────────────

  private async request<T>(
    method:  string,
    path:    string,
    params?: Record<string, string>,
    body?:   object,
  ): Promise<T> {
    const fullPath    = API_PREFIX + path;
    const queryString = params ? new URLSearchParams(params).toString() : "";
    const bodyStr     = body ? JSON.stringify(body) : "";
    const headers     = this.buildHeaders(method.toUpperCase(), fullPath, queryString, bodyStr);
    const url         = this.baseOrigin + fullPath + (queryString ? "?" + queryString : "");

    logger.debug({ method: method.toUpperCase(), url }, "DeltaAdapter: request");

    return withRetry(async () => {
      const res = await fetch(url, { method, headers, body: bodyStr || undefined });

      const data = await res.json() as {
        success?: boolean;
        result?:  T;
        error?:   { code: string; message?: string };
        message?: string;
      };

      logger.debug({ status: res.status, success: data.success, errorCode: data.error?.code }, "DeltaAdapter: response");

      // Never retry auth errors — they indicate wrong credentials
      if (res.status === 401) {
        const code = data.error?.code ?? "unknown";
        const msg  = data.error?.message ?? data.message ?? "Unauthorized";
        logger.error({ code, msg, fullPath, envOrigin: this.baseOrigin }, "DeltaAdapter: 401");
        throw new Error(`Delta 401 ${code}: ${msg}`);
      }

      // 400 validation errors — do not retry
      if (res.status === 400) {
        const msg = data.error?.message ?? data.message ?? "Bad request";
        throw new Error(`Delta 400: ${msg}`);
      }

      if (!res.ok || data.success === false) {
        const msg = data.error?.message ?? data.message ?? `HTTP ${res.status}`;
        throw new Error(`Delta API error: ${msg}`);
      }

      return data.result as T;
    }, {
      // Retry only on 429 / 5xx — auth + validation errors are re-thrown before retry
      retryOn: (err) => {
        const msg = String(err).toLowerCase();
        return msg.includes("429") || msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("fetch failed") || msg.includes("etimedout") || msg.includes("econnreset");
      },
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const ok = await this.testConnection();
    if (!ok) throw new Error("Delta connection test failed — check API key and secret");
    this.emitEvent({ type: "statusChange", status: "connected" });
  }

  disconnect(): void {
    this.emitEvent({ type: "statusChange", status: "disconnected" });
    this.removeAllListeners();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", "/wallet/balances");
      logger.info({ envOrigin: this.baseOrigin }, "DeltaAdapter: connection test passed");
      return true;
    } catch (err) {
      logger.error({ err: String(err), envOrigin: this.baseOrigin }, "DeltaAdapter: connection test failed");
      return false;
    }
  }

  // ── Data fetching ─────────────────────────────────────────────────────────

  async getBalance(): Promise<AdapterBalance[]> {
    const raw = await this.request<Array<Record<string, string>>>("GET", "/wallet/balances");
    return raw.map(r => ({
      coin:                r["asset_symbol"] ?? "USDT",
      equity:              r["balance"]           ?? "0",
      walletBalance:       r["balance"]           ?? "0",
      availableToWithdraw: r["available_balance"] ?? "0",
      unrealisedPnl:       "0",
    }));
  }

  async getPositions(): Promise<AdapterPosition[]> {
    const result = await this.request<{ positions: Array<Record<string, unknown>> }>(
      "GET", "/positions/margined",
    );
    return (result.positions ?? [])
      .filter(p => Number(p["size"]) !== 0)
      .map(p => ({
        id:           String(p["product_id"]),
        symbol:       String(p["product_symbol"] ?? ""),
        side:         p["side"] === "sell" ? "Short" : "Long",
        size:         Number(p["size"] ?? 0),
        entryPrice:   parseFloat(String(p["entry_price"]    ?? 0)),
        markPrice:    parseFloat(String(p["mark_price"]     ?? 0)),
        unrealisedPnl: parseFloat(String(p["unrealized_pnl"] ?? 0)),
        leverage:     String(p["leverage"] ?? ""),
        raw:          p,
      } satisfies AdapterPosition));
  }

  async getOrders(): Promise<AdapterOrder[]> {
    const raw = await this.request<Array<Record<string, unknown>>>(
      "GET", "/orders", { state: "open" },
    );
    return raw.map(o => this.normalizeOrder(o));
  }

  async getOrderHistory(limit = 100): Promise<AdapterOrderHistory[]> {
    // Fetch filled + cancelled orders together
    const [filled, cancelled] = await Promise.allSettled([
      this.request<Array<Record<string, unknown>>>("GET", "/orders", {
        state:     "closed",
        page_size: String(Math.min(limit, 200)),
      }),
      this.request<Array<Record<string, unknown>>>("GET", "/orders", {
        state:     "cancelled",
        page_size: String(Math.min(limit, 200)),
      }),
    ]);

    const filledRows    = filled.status    === "fulfilled" ? filled.value    : [];
    const cancelledRows = cancelled.status === "fulfilled" ? cancelled.value : [];

    const all = [...filledRows, ...cancelledRows]
      .sort((a, b) => new Date(String(b["updated_at"] ?? b["created_at"] ?? 0)).getTime() -
                      new Date(String(a["updated_at"] ?? a["created_at"] ?? 0)).getTime())
      .slice(0, limit);

    return all.map(o => this.normalizeOrderHistory(o));
  }

  // ── Order placement ───────────────────────────────────────────────────────

  async placeOrder(params: PlaceOrderParams): Promise<{ orderId: string }> {
    const deltaOrderType = ORDER_TYPE_MAP[params.orderType] ?? "market_order";
    const qty   = parseFloat(params.qty);
    const side  = params.side.toLowerCase();

    const body: Record<string, unknown> = {
      product_symbol: params.symbol,
      size:           qty,
      side,
      order_type:     deltaOrderType,
    };

    // Limit / StopLimit price
    if (params.price && (params.orderType === "Limit" || params.orderType === "StopLimit")) {
      body["limit_price"] = params.price;
    }

    // Stop trigger price
    if (params.stopPrice && (params.orderType === "Stop" || params.orderType === "StopLimit")) {
      body["stop_price"] = params.stopPrice;
    }

    // Bracket TP
    if (params.takeProfitPrice) {
      body["bracket_take_profit_price"]          = params.takeProfitPrice;
      body["bracket_take_profit_price_type"]     = "fixed";
      body["bracket_take_profit_limit_price"]    = params.takeProfitPrice;
      body["bracket_take_profit_order_type"]     = "limit_order";
    }

    // Bracket SL
    if (params.stopLossPrice) {
      body["bracket_stop_loss_price"]            = params.stopLossPrice;
      body["bracket_stop_loss_price_type"]       = "fixed";
      body["bracket_stop_loss_limit_price"]      = params.stopLossPrice;
      body["bracket_stop_loss_order_type"]       = "market_order";
    }

    // Time in force
    if (params.timeInForce) {
      body["time_in_force"] = TIME_IN_FORCE_MAP[params.timeInForce] ?? "gtc";
    }

    if (params.reduceOnly)    body["reduce_only"]    = true;
    if (params.postOnly)      body["post_only"]      = true;
    if (params.clientOrderId) body["client_order_id"] = params.clientOrderId;

    // Merge any extra fields from the caller
    if (params.extra) Object.assign(body, params.extra);

    logger.info({ symbol: params.symbol, side, type: deltaOrderType, qty }, "DeltaAdapter: placeOrder");

    const result = await this.request<{ id: number }>("POST", "/orders", undefined, body);
    return { orderId: String(result.id) };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request("DELETE", `/orders/${orderId}`);
    logger.info({ orderId }, "DeltaAdapter: cancelOrder");
  }

  async closePosition(position: AdapterPosition): Promise<void> {
    const raw       = position.raw as Record<string, unknown>;
    const closeSide = position.side === "Long" ? "sell" : "buy";
    logger.info({ id: position.id, symbol: position.symbol, size: position.size, closeSide }, "DeltaAdapter: closePosition");
    await this.request("POST", "/orders", undefined, {
      product_id:  Number(raw["product_id"]),
      size:        position.size,
      side:        closeSide,
      order_type:  "market_order",
      reduce_only: true,
    });
  }

  async modifyOrder(
    orderId: string,
    params: Partial<Pick<PlaceOrderParams, "price" | "stopPrice" | "takeProfitPrice" | "stopLossPrice" | "qty">>,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.qty)             body["size"]                        = parseFloat(params.qty);
    if (params.price)           body["limit_price"]                 = params.price;
    if (params.stopPrice)       body["stop_price"]                  = params.stopPrice;
    if (params.takeProfitPrice) body["bracket_take_profit_price"]   = params.takeProfitPrice;
    if (params.stopLossPrice)   body["bracket_stop_loss_price"]     = params.stopLossPrice;

    logger.info({ orderId, ...body }, "DeltaAdapter: modifyOrder");
    await this.request("PUT", `/orders/${orderId}`, undefined, body);
  }

  // ── Normalizers ───────────────────────────────────────────────────────────

  private normalizeOrder(o: Record<string, unknown>): AdapterOrder {
    const rawType = String(o["order_type"] ?? "").replace(/_order$/, "").toLowerCase();
    const typeMap: Record<string, string> = {
      market: "Market", limit: "Limit",
      stop_market: "Stop", stop_limit: "StopLimit",
    };
    return {
      id:        String(o["id"]),
      symbol:    String(o["product_symbol"] ?? ""),
      side:      o["side"] === "buy" ? "Buy" : "Sell",
      orderType: typeMap[rawType] ?? rawType,
      price:     parseFloat(String(o["limit_price"] ?? o["stop_price"] ?? 0)),
      qty:       Number(o["size"] ?? 0),
      status:    String(o["state"] ?? ""),
      createdAt: String(o["created_at"] ?? ""),
      raw:       o,
    };
  }

  private normalizeOrderHistory(o: Record<string, unknown>): AdapterOrderHistory {
    const base = this.normalizeOrder(o);
    return {
      ...base,
      filledQty:    Number(o["paid_commission"] !== undefined ? o["size"] : o["unfilled_size"] !== undefined ? Number(o["size"]) - Number(o["unfilled_size"]) : 0),
      avgFillPrice: parseFloat(String(o["average_fill_price"] ?? o["limit_price"] ?? 0)),
      closedAt:     String(o["updated_at"] ?? o["closed_at"] ?? ""),
    };
  }
}
