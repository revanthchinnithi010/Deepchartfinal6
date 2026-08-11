import {
  BrokerAdapter,
  type AdapterBalance,
  type AdapterPosition,
  type AdapterOrder,
  type PlaceOrderParams,
} from "./BrokerAdapter.js";

export class MT5TradingAdapter extends BrokerAdapter {
  readonly brokerId = "mt5";
  private server: string;
  private login: string;
  private gatewayUrl: string;

  constructor(serverAndLogin: string, private password: string) {
    super();
    const parts = serverAndLogin.split("||");
    this.server = parts[0] ?? "";
    this.login = parts[1] ?? "";
    this.gatewayUrl = (process.env["MT5_GATEWAY_URL"] ?? "").replace(/\/$/, "");
  }

  private async request<T>(method: string, path: string, body?: object): Promise<T> {
    if (!this.gatewayUrl) {
      throw new Error(
        "MT5_GATEWAY_URL environment variable is not set. " +
          "Configure it with your MT5 bridge URL (e.g. MetaAPI, pymt5, or a custom gateway).",
      );
    }
    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-MT5-Server": this.server,
        "X-MT5-Login": this.login,
        "X-MT5-Password": this.password,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`MT5 gateway ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async connect(): Promise<void> {
    const ok = await this.testConnection();
    if (!ok) throw new Error("MT5 gateway connection failed");
    this.emitEvent({ type: "statusChange", status: "connected" });
  }

  disconnect(): void {
    this.emitEvent({ type: "statusChange", status: "disconnected" });
    this.removeAllListeners();
  }

  async testConnection(): Promise<boolean> {
    if (!this.gatewayUrl) return false;
    try {
      await this.request("GET", "/account/info");
      return true;
    } catch {
      return false;
    }
  }

  async getBalance(): Promise<AdapterBalance[]> {
    try {
      const data = await this.request<Record<string, unknown>>("GET", "/account/info");
      return [
        {
          coin: String(data["currency"] ?? "USD"),
          equity: String(data["equity"] ?? "0"),
          walletBalance: String(data["balance"] ?? "0"),
          availableToWithdraw: String(data["freeMargin"] ?? "0"),
          unrealisedPnl: String(data["profit"] ?? "0"),
        },
      ];
    } catch {
      return [];
    }
  }

  async getPositions(): Promise<AdapterPosition[]> {
    try {
      const data = await this.request<unknown[]>("GET", "/positions");
      return data.map((p) => {
        const pos = p as Record<string, unknown>;
        const type = String(pos["type"] ?? "").toLowerCase();
        return {
          id: String(pos["ticket"] ?? pos["id"] ?? ""),
          symbol: String(pos["symbol"] ?? ""),
          side: type.includes("sell") ? "Short" : ("Long" as "Long" | "Short"),
          size: Number(pos["volume"] ?? 0),
          entryPrice: Number(pos["openPrice"] ?? 0),
          markPrice: Number(pos["currentPrice"] ?? 0),
          unrealisedPnl: Number(pos["profit"] ?? 0),
          leverage: "",
          raw: pos,
        };
      });
    } catch {
      return [];
    }
  }

  async getOrders(): Promise<AdapterOrder[]> {
    try {
      const data = await this.request<unknown[]>("GET", "/orders");
      return data.map((o) => {
        const ord = o as Record<string, unknown>;
        const type = String(ord["type"] ?? "").toLowerCase();
        return {
          id: String(ord["ticket"] ?? ord["id"] ?? ""),
          symbol: String(ord["symbol"] ?? ""),
          side: type.includes("sell") ? "Sell" : ("Buy" as "Buy" | "Sell"),
          orderType: type.includes("limit") ? "Limit" : "Market",
          price: Number(ord["openPrice"] ?? ord["price"] ?? 0),
          qty: Number(ord["volume"] ?? 0),
          status: String(ord["state"] ?? ord["status"] ?? ""),
          createdAt: String(ord["setupTime"] ?? ord["createdAt"] ?? ""),
          raw: ord,
        };
      });
    } catch {
      return [];
    }
  }

  async placeOrder(params: PlaceOrderParams): Promise<{ orderId: string }> {
    const data = await this.request<{ ticket?: number; orderId?: string }>(
      "POST",
      "/orders",
      {
        symbol: params.symbol,
        type: `${params.side.toUpperCase()}_${params.orderType.toUpperCase()}`,
        volume: parseFloat(params.qty),
        ...(params.price ? { price: parseFloat(params.price) } : {}),
        ...(params.stopLossPrice ? { stopLoss: parseFloat(params.stopLossPrice) } : {}),
        ...(params.takeProfitPrice ? { takeProfit: parseFloat(params.takeProfitPrice) } : {}),
      },
    );
    return { orderId: String(data.ticket ?? data.orderId ?? "") };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request("DELETE", `/orders/${orderId}`);
  }

  async closePosition(position: AdapterPosition): Promise<void> {
    await this.request("POST", `/positions/${position.id}/close`, {
      volume: position.size,
    });
  }
}
