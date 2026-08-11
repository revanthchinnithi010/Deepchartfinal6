export type BrokerId = "delta" | "mt5" | "ctrader";
export type BrokerAuthType = "api_key" | "oauth" | "credentials";

export interface BrokerInfo {
  id: BrokerId;
  name: string;
  logo: string;
  image?: string;
  description: string;
  color: string;
  authType: BrokerAuthType;
}

export const BROKERS: BrokerInfo[] = [
  {
    id: "delta",
    name: "Delta Exchange",
    logo: "Δ",
    image: "/broker-delta.png",
    description: "Crypto derivatives exchange — BTC, ETH, SOL perpetuals",
    color: "#F97316",
    authType: "api_key",
  },
  {
    id: "mt5",
    name: "MetaTrader 5",
    logo: "M5",
    image: "/broker-mt5.png",
    description: "Multi-asset platform — Forex, Stocks, Futures & Crypto",
    color: "#22C55E",
    authType: "credentials",
  },
  {
    id: "ctrader",
    name: "cTrader",
    logo: "cT",
    description: "Forex & CFD platform — OAuth 2.0 via Spotware",
    color: "#3B82F6",
    authType: "oauth",
  },
];

export interface BrokerAccount {
  id: number;
  broker_id: BrokerId;
  label: string;
  is_active: boolean;
  api_token: string;
  created_at: string;
  ws_url?: string;
  base_url?: string;
  env_name?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface BrokerBalance {
  coin: string;
  equity: string;
  availableToWithdraw: string;
  unrealisedPnl: string;
  walletBalance: string;
}

export interface BrokerPosition {
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

export interface BrokerOrder {
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

export interface PlaceOrderRequest {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  productId?: number;
  category?: string;
}
