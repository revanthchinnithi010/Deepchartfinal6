import type { BrokerPosition, BrokerOrder, BrokerBalance, BrokerId } from "@/types/broker";

export type WsClientStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface WsClientState {
  status: WsClientStatus;
  latencyMs: number | null;
  reconnectAttempts: number;
  lastConnectedAt: number | null;
  lastPongAt: number | null;
}

export type SubscriptionTopic =
  | `tick:${string}`
  | "positions"
  | "orders"
  | "balance"
  | "pnl"
  | "status";

export type BrokerEventKind =
  | "tick"
  | "positions"
  | "orders"
  | "balance"
  | "pnl"
  | "status"
  | "latency";

export interface TickEvent {
  kind: "tick";
  broker: BrokerId;
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  ts: number;
}

export interface PositionsEvent {
  kind: "positions";
  broker: BrokerId;
  positions: BrokerPosition[];
  ts: number;
}

export interface OrdersEvent {
  kind: "orders";
  broker: BrokerId;
  orders: BrokerOrder[];
  ts: number;
}

export interface BalanceEvent {
  kind: "balance";
  broker: BrokerId;
  balance: BrokerBalance;
  ts: number;
}

export interface PnlEvent {
  kind: "pnl";
  broker: BrokerId;
  symbol: string;
  unrealisedPnl: number;
  ts: number;
}

export interface StatusEvent {
  kind: "status";
  broker: BrokerId;
  status: WsClientStatus;
  error?: string;
  ts: number;
}

export interface LatencyEvent {
  kind: "latency";
  broker: BrokerId;
  latencyMs: number;
  ts: number;
}

export type BrokerEvent =
  | TickEvent
  | PositionsEvent
  | OrdersEvent
  | BalanceEvent
  | PnlEvent
  | StatusEvent
  | LatencyEvent;

export type BrokerEventHandler = (event: BrokerEvent) => void;

export interface IBrokerWsClient {
  readonly brokerId: BrokerId;
  readonly state: WsClientState;
  connect(meta?: Record<string, unknown>): void;
  disconnect(): void;
  send(msg: unknown): boolean;
  onEvent(handler: BrokerEventHandler): () => void;
}
