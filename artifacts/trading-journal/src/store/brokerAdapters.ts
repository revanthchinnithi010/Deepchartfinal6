import type {
  BrokerId, BrokerBalance, BrokerPosition, BrokerOrder, PlaceOrderRequest,
} from "@/types/broker";

export interface IBrokerAdapter {
  readonly id: BrokerId;
  readonly balancePath: string;
  readonly positionsPath: string;
  readonly ordersPath: string;
  normalizeBalance(raw: unknown): BrokerBalance;
  normalizePositions(list: unknown[]): BrokerPosition[];
  normalizeOrders(list: unknown[]): BrokerOrder[];
  buildOrderBody(req: PlaceOrderRequest): PlaceOrderParams;
  closePositionConfig(pos: BrokerPosition): { path: string; method: "DELETE" | "POST"; body: unknown };
  cancelOrderConfig(ord: BrokerOrder): { path: string; method: "DELETE"; body?: unknown };
}

export interface PlaceOrderParams {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  category?: string;
}

function passBalance(raw: unknown): BrokerBalance {
  return raw as BrokerBalance;
}

function passPositions(list: unknown[]): BrokerPosition[] {
  return list as BrokerPosition[];
}

function passOrders(list: unknown[]): BrokerOrder[] {
  return list as BrokerOrder[];
}

export class DeltaAdapter implements IBrokerAdapter {
  readonly id: BrokerId = "delta";
  readonly balancePath = "/api/broker/delta/balance";
  readonly positionsPath = "/api/broker/delta/positions";
  readonly ordersPath = "/api/broker/delta/orders";

  normalizeBalance = passBalance;
  normalizePositions = passPositions;
  normalizeOrders = passOrders;

  buildOrderBody(req: PlaceOrderRequest): PlaceOrderParams {
    return {
      symbol: req.symbol,
      side: req.side,
      orderType: req.orderType,
      qty: req.qty,
      ...(req.orderType === "Limit" && req.price ? { price: req.price } : {}),
      ...(req.stopLoss ? { stopLoss: req.stopLoss } : {}),
    };
  }

  closePositionConfig(pos: BrokerPosition): { path: string; method: "DELETE"; body: unknown } {
    return {
      path: `/api/broker/delta/position/${pos.id}`,
      method: "DELETE",
      body: { size: pos.size, side: pos.side },
    };
  }

  cancelOrderConfig(ord: BrokerOrder): { path: string; method: "DELETE"; body?: unknown } {
    return { path: `/api/broker/delta/order/${ord.id}`, method: "DELETE" };
  }
}

export class MT5Adapter implements IBrokerAdapter {
  readonly id: BrokerId = "mt5";
  readonly balancePath = "/api/broker/mt5/balance";
  readonly positionsPath = "/api/broker/mt5/positions";
  readonly ordersPath = "/api/broker/mt5/orders";

  normalizeBalance = passBalance;
  normalizePositions = passPositions;
  normalizeOrders = passOrders;

  buildOrderBody(req: PlaceOrderRequest): PlaceOrderParams {
    return {
      symbol: req.symbol,
      side: req.side,
      orderType: req.orderType,
      qty: req.qty,
      ...(req.orderType === "Limit" && req.price ? { price: req.price } : {}),
      ...(req.stopLoss ? { stopLoss: req.stopLoss } : {}),
      ...(req.takeProfit ? { takeProfit: req.takeProfit } : {}),
    };
  }

  closePositionConfig(pos: BrokerPosition): { path: string; method: "DELETE"; body: unknown } {
    return {
      path: `/api/broker/mt5/position/${pos.id}`,
      method: "DELETE",
      body: { symbol: pos.symbol, side: pos.side, qty: String(pos.size) },
    };
  }

  cancelOrderConfig(ord: BrokerOrder): { path: string; method: "DELETE"; body?: unknown } {
    return { path: `/api/broker/mt5/order/${ord.id}`, method: "DELETE" };
  }
}

export class CtraderAdapter implements IBrokerAdapter {
  readonly id: BrokerId = "ctrader";
  readonly balancePath   = "/api/ctrader/balance";
  readonly positionsPath = "/api/ctrader/positions";
  readonly ordersPath    = "/api/ctrader/orders";

  normalizeBalance   = passBalance;
  normalizePositions = passPositions;
  normalizeOrders    = passOrders;

  buildOrderBody(req: PlaceOrderRequest): PlaceOrderParams {
    return {
      symbol: req.symbol,
      side: req.side,
      orderType: req.orderType,
      qty: req.qty,
      ...(req.orderType === "Limit" && req.price ? { price: req.price } : {}),
      ...(req.stopLoss   ? { stopLoss:   req.stopLoss   } : {}),
      ...(req.takeProfit ? { takeProfit: req.takeProfit } : {}),
    };
  }

  closePositionConfig(pos: BrokerPosition): { path: string; method: "DELETE"; body: unknown } {
    return {
      path:   `/api/ctrader/position/${pos.id}`,
      method: "DELETE",
      body:   { symbol: pos.symbol, side: pos.side, qty: String(pos.size) },
    };
  }

  cancelOrderConfig(ord: BrokerOrder): { path: string; method: "DELETE"; body?: unknown } {
    return { path: `/api/ctrader/order/${ord.id}`, method: "DELETE" };
  }
}

const ADAPTERS: Map<BrokerId, IBrokerAdapter> = new Map<BrokerId, IBrokerAdapter>([
  ["delta",   new DeltaAdapter()],
  ["mt5",     new MT5Adapter()],
  ["ctrader", new CtraderAdapter()],
]);

export function getAdapter(brokerId: BrokerId): IBrokerAdapter {
  const adapter = ADAPTERS.get(brokerId);
  if (!adapter) throw new Error(`No adapter for broker: ${brokerId}`);
  return adapter;
}
