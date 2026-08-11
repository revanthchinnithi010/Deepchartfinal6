import { EventEmitter } from "events";

export interface AdapterBalance {
  coin: string;
  equity: string;
  walletBalance: string;
  availableToWithdraw: string;
  unrealisedPnl: string;
}

export interface AdapterPosition {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealisedPnl: number;
  leverage: string;
  raw: unknown;
}

export interface AdapterOrder {
  id: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: string;
  price: number;
  qty: number;
  status: string;
  createdAt: string;
  raw: unknown;
}

export interface AdapterOrderHistory extends AdapterOrder {
  filledQty:    number;
  avgFillPrice: number;
  closedAt?:    string;
}

export type OrderType = "Market" | "Limit" | "Stop" | "StopLimit";
export type OrderSide = "Buy" | "Sell";
export type TimeInForce = "GTC" | "IOC" | "FOK";

export interface PlaceOrderParams {
  symbol:          string;
  side:            OrderSide;
  orderType:       OrderType;
  qty:             string;
  /** Required for Limit and StopLimit orders */
  price?:          string;
  /** Trigger price for Stop and StopLimit orders */
  stopPrice?:      string;
  /** Attach a take-profit bracket to this order */
  takeProfitPrice?: string;
  /** Attach a stop-loss bracket to this order */
  stopLossPrice?:  string;
  timeInForce?:    TimeInForce;
  reduceOnly?:     boolean;
  postOnly?:       boolean;
  clientOrderId?:  string;
  /** Broker-specific extra fields (passed through as-is) */
  extra?:          Record<string, unknown>;
}

export type BrokerAdapterEvent =
  | { type: "positionUpdate"; positions: AdapterPosition[] }
  | { type: "orderUpdate"; orders: AdapterOrder[] }
  | { type: "statusChange"; status: "connected" | "error" | "disconnected"; error?: string };

export abstract class BrokerAdapter extends EventEmitter {
  abstract readonly brokerId: string;

  protected emitEvent(event: BrokerAdapterEvent): void {
    this.emit(event.type, event);
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract testConnection(): Promise<boolean>;
  abstract getBalance(): Promise<AdapterBalance[]>;
  abstract getPositions(): Promise<AdapterPosition[]>;
  abstract getOrders(): Promise<AdapterOrder[]>;

  /**
   * Fetch filled/cancelled order history.
   * Brokers that don't support this may return an empty array.
   */
  async getOrderHistory(_limit?: number): Promise<AdapterOrderHistory[]> {
    return [];
  }

  abstract placeOrder(params: PlaceOrderParams): Promise<{ orderId: string }>;

  abstract cancelOrder(orderId: string, extra?: Record<string, string>): Promise<void>;

  abstract closePosition(position: AdapterPosition): Promise<void>;

  /**
   * Amend TP/SL or price on an existing order.
   * Default no-op; override in adapters that support it.
   */
  async modifyOrder(
    _orderId: string,
    _params: Partial<Pick<PlaceOrderParams, "price" | "stopPrice" | "takeProfitPrice" | "stopLossPrice" | "qty">>,
  ): Promise<void> {
    throw new Error(`modifyOrder is not supported by ${this.brokerId}`);
  }
}
