import type { BrokerAccount, BrokerBalance, BrokerPosition, BrokerOrder } from "@/types/broker";

// ── Broker accounts (as returned by GET /api/broker-accounts) ───────────────
export const MOCK_BROKER_ACCOUNTS: BrokerAccount[] = [
  {
    id: 9001,
    broker_id: "delta",
    label: "Delta Exchange (Mock)",
    is_active: true,
    api_token: "mock-delta-token",
    created_at: "2026-01-04T09:00:00Z",
  },
  {
    id: 9002,
    broker_id: "ctrader",
    label: "cTrader (Mock)",
    is_active: true,
    api_token: "mock-ctrader-token",
    created_at: "2026-01-04T09:00:00Z",
  },
];

// ── Balances ──────────────────────────────────────────────────────────────
// Delta Exchange: Equity $8,668.85 · Avail $5,420.00 · Used $3,248.85
// (walletBalance is set to Avail+Used so the derived "Margin Used" metric on
// the Portfolio account card comes out exact; equity is what's shown as the
// headline Account Value figure and combines with cTrader's to $12,845.62.)
export const MOCK_DELTA_BALANCE: BrokerBalance = {
  coin: "USD",
  equity: "8668.85",
  availableToWithdraw: "5420.00",
  unrealisedPnl: "150.35",
  walletBalance: "8668.85",
};

// cTrader: Equity $4,176.77 · Avail $3,520.00 · Used $656.77
export const MOCK_CTRADER_BALANCE: BrokerBalance = {
  coin: "USD",
  equity: "4176.77",
  availableToWithdraw: "3520.00",
  unrealisedPnl: "98.00",
  walletBalance: "4176.77",
};

// ── Open positions ───────────────────────────────────────────────────────
export const MOCK_DELTA_POSITIONS: BrokerPosition[] = [
  {
    id: "pos-btc-1",
    symbol: "BTCUSDT",
    side: "Long",
    size: 0.25,
    entryPrice: 64180.5,
    markPrice: 64842.1,
    unrealisedPnl: 165.4,
    leverage: "10",
    raw: {
      product_id: "pos-btc-1",
      liquidation_price: "57762.45",
      margin: "1604.51",
      created_at: "2026-07-10T08:12:00Z",
    },
  },
  {
    id: "pos-eth-1",
    symbol: "ETHUSDT",
    side: "Short",
    size: 1.5,
    entryPrice: 3412.8,
    markPrice: 3378.2,
    unrealisedPnl: 51.9,
    leverage: "8",
    raw: {
      product_id: "pos-eth-1",
      liquidation_price: "3754.08",
      margin: "639.90",
      created_at: "2026-07-11T14:35:00Z",
    },
  },
  {
    id: "pos-sol-1",
    symbol: "SOLUSDT",
    side: "Long",
    size: 12,
    entryPrice: 148.2,
    markPrice: 145.65,
    unrealisedPnl: -30.6,
    leverage: "5",
    raw: {
      product_id: "pos-sol-1",
      liquidation_price: "118.56",
      margin: "355.68",
      created_at: "2026-07-12T05:50:00Z",
    },
  },
];

export const MOCK_CTRADER_POSITIONS: BrokerPosition[] = [
  {
    id: "pos-nas-1",
    symbol: "NAS100",
    side: "Long",
    size: 2,
    entryPrice: 18420.4,
    markPrice: 18451.65,
    unrealisedPnl: 62.65,
    leverage: "20",
    raw: {
      positionId: "pos-nas-1",
      usedMargin: 1842.04,
      openTimestamp: new Date("2026-07-13T10:05:00Z").getTime(),
    },
  },
];

// ── Open orders ───────────────────────────────────────────────────────────
export const MOCK_DELTA_ORDERS: BrokerOrder[] = [
  { id: "ord-1", symbol: "BTCUSDT", side: "Buy",  orderType: "limit",  price: 62500,   qty: 0.15, status: "open", createdAt: "2026-07-09T14:20:00Z", raw: null },
  { id: "ord-2", symbol: "ETHUSDT", side: "Sell", orderType: "stop",   price: 3520,    qty: 1.0,  status: "open", createdAt: "2026-07-09T15:05:00Z", raw: null },
  { id: "ord-3", symbol: "SOLUSDT", side: "Buy",  orderType: "limit",  price: 140,     qty: 8,    status: "open", createdAt: "2026-07-10T02:40:00Z", raw: null },
];

export const MOCK_CTRADER_ORDERS: BrokerOrder[] = [
  { id: "ord-4", symbol: "XAUUSD",  side: "Buy",  orderType: "limit",     price: 2338.5, qty: 1,  status: "open", createdAt: "2026-07-09T11:10:00Z", raw: null },
  { id: "ord-5", symbol: "EURUSD",  side: "Sell", orderType: "limit",     price: 1.0965, qty: 2,  status: "open", createdAt: "2026-07-09T13:35:00Z", raw: null },
  { id: "ord-6", symbol: "US30",    side: "Buy",  orderType: "stop",      price: 39820,  qty: 1,  status: "open", createdAt: "2026-07-10T04:15:00Z", raw: null },
  { id: "ord-7", symbol: "NAS100",  side: "Buy",  orderType: "stop",      price: 18620,  qty: 1,  status: "open", createdAt: "2026-07-10T05:05:00Z", raw: null },
];

export const MOCK_PENDING_ORDER_LABELS = [
  "BTC Buy Limit", "ETH Sell Stop", "XAUUSD Buy Limit", "EURUSD Sell Limit", "US30 Buy Stop",
];
