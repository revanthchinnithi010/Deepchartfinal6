import { createHmac } from "crypto";
import { BrokerAdapter, type AdapterBalance, type AdapterPosition, type AdapterOrder, type PlaceOrderParams } from "./BrokerAdapter.js";

const BASE = "https://api.bybit.com";
const RECV_WINDOW = 5000;

export class BybitTradingAdapter extends BrokerAdapter {
  readonly brokerId = "bybit";

  constructor(private apiKey: string, private apiSecret: string) {
    super();
  }

  private sign(timestamp: number, payload: string): string {
    const msg = String(timestamp) + this.apiKey + String(RECV_WINDOW) + payload;
    return createHmac("sha256", this.apiSecret).update(msg).digest("hex");
  }

  private async request<T>(method: string, path: string, params?: Record<string, string>, body?: object): Promise<T> {
    const timestamp = Date.now();
    let queryString = "";
    let bodyStr = "";
    let signPayload = "";
    if (method === "GET" && params) {
      queryString = new URLSearchParams(params).toString();
      signPayload = queryString;
    } else if (body) {
      bodyStr = JSON.stringify(body);
      signPayload = bodyStr;
    }
    const sig = this.sign(timestamp, signPayload);
    const url = BASE + path + (queryString ? "?" + queryString : "");
    const res = await fetch(url, {
      method,
      headers: {
        "X-BAPI-API-KEY": this.apiKey,
        "X-BAPI-TIMESTAMP": String(timestamp),
        "X-BAPI-SIGN": sig,
        "X-BAPI-RECV-WINDOW": String(RECV_WINDOW),
        "Content-Type": "application/json",
        "User-Agent": "TradeVault/1.0",
      },
      body: bodyStr || undefined,
    });
    const data = await res.json() as { retCode: number; retMsg: string; result?: T };
    if (!res.ok || data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg} (code ${data.retCode})`);
    }
    return data.result as T;
  }

  async connect(): Promise<void> {
    const ok = await this.testConnection();
    if (!ok) throw new Error("Bybit connection test failed");
    this.emitEvent({ type: "statusChange", status: "connected" });
  }

  disconnect(): void {
    this.emitEvent({ type: "statusChange", status: "disconnected" });
    this.removeAllListeners();
  }

  async testConnection(): Promise<boolean> {
    try { await this.getBalance(); return true; } catch { return false; }
  }

  async getBalance(): Promise<AdapterBalance[]> {
    type WalletResult = { list: Array<{ totalEquity: string; totalUnrealisedPnl: string; totalWalletBalance: string; totalAvailableBalance: string; coin: Array<{ coin: string; equity: string; availableToWithdraw: string; unrealisedPnl: string; walletBalance: string }> }> };
    const result = await this.request<WalletResult>("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" });
    const account = result.list?.[0];
    if (!account) return [];
    if (account.coin?.length > 0) return account.coin;
    return [{
      coin: "USDT",
      equity: account.totalEquity,
      walletBalance: account.totalWalletBalance,
      availableToWithdraw: account.totalAvailableBalance,
      unrealisedPnl: account.totalUnrealisedPnl,
    }];
  }

  async getPositions(category = "linear"): Promise<AdapterPosition[]> {
    type PosResult = { list: Array<Record<string, unknown>> };
    const result = await this.request<PosResult>("GET", "/v5/position/list", { category, settleCoin: "USDT" });
    return (result.list ?? [])
      .filter(p => p["side"] !== "None" && parseFloat(String(p["size"] ?? 0)) > 0)
      .map(p => ({
        id: String(p["symbol"]) + "_" + String(p["positionIdx"] ?? 0),
        symbol: String(p["symbol"] ?? ""),
        side: p["side"] === "Sell" ? "Short" : "Long",
        size: parseFloat(String(p["size"] ?? 0)),
        entryPrice: parseFloat(String(p["avgPrice"] ?? 0)),
        markPrice: parseFloat(String(p["markPrice"] ?? 0)),
        unrealisedPnl: parseFloat(String(p["unrealisedPnl"] ?? 0)),
        leverage: String(p["leverage"] ?? ""),
        raw: p,
      } satisfies AdapterPosition));
  }

  async getOrders(category = "linear"): Promise<AdapterOrder[]> {
    type OrdResult = { list: Array<Record<string, unknown>> };
    const result = await this.request<OrdResult>("GET", "/v5/order/realtime", { category });
    return (result.list ?? []).map(o => ({
      id: String(o["orderId"] ?? ""),
      symbol: String(o["symbol"] ?? ""),
      side: o["side"] === "Buy" ? "Buy" : "Sell",
      orderType: String(o["orderType"] ?? ""),
      price: parseFloat(String(o["price"] ?? 0)),
      qty: parseFloat(String(o["qty"] ?? 0)),
      status: String(o["orderStatus"] ?? ""),
      createdAt: String(o["createdTime"] ?? ""),
      raw: o,
    } satisfies AdapterOrder));
  }

  async placeOrder(params: PlaceOrderParams): Promise<{ orderId: string }> {
    const result = await this.request<{ orderId: string }>("POST", "/v5/order/create", undefined, {
      category: "linear",
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      qty: params.qty,
      ...(params.orderType === "Limit" && params.price ? { price: params.price } : {}),
      ...(params.stopLossPrice ? { stopLoss: params.stopLossPrice } : {}),
      ...(params.takeProfitPrice ? { takeProfit: params.takeProfitPrice } : {}),
    });
    return { orderId: result.orderId };
  }

  async cancelOrder(orderId: string, extra?: Record<string, string>): Promise<void> {
    const category = extra?.["category"] ?? "linear";
    const symbol = extra?.["symbol"] ?? "";
    await this.request("POST", "/v5/order/cancel", undefined, { category, symbol, orderId });
  }

  async closePosition(position: AdapterPosition): Promise<void> {
    const closeSide = position.side === "Long" ? "Sell" : "Buy";
    await this.request("POST", "/v5/order/create", undefined, {
      category: "linear",
      symbol: position.symbol,
      side: closeSide,
      orderType: "Market",
      qty: String(position.size),
      reduceOnly: true,
    });
  }
}
