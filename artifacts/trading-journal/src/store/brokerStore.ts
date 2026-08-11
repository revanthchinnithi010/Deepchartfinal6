import { create } from "zustand";
import type {
  BrokerAccount, BrokerBalance, BrokerPosition, BrokerOrder,
  PlaceOrderRequest, ConnectionStatus, BrokerId,
} from "@/types/broker";
import type { WsStatus } from "@/contexts/LiveMarketContext";
import type { BrokerEvent, WsClientState } from "@/lib/broker-ws/types";
import type { BrokerWsOrchestrator } from "@/lib/broker-ws/BrokerWsOrchestrator";
import { getAdapter } from "./brokerAdapters";
import { toArray } from "@/lib/safeArray";

let _orchestrator: BrokerWsOrchestrator | null = null;
export function getBrokerOrchestrator(): BrokerWsOrchestrator | null { return _orchestrator; }

const LS_TOKEN_PREFIX = "tj_broker_token_";

function saveToken(accountId: number, token: string) {
  try { localStorage.setItem(LS_TOKEN_PREFIX + accountId, token); } catch { /* ignore */ }
}
function loadToken(accountId: number): string {
  try { return localStorage.getItem(LS_TOKEN_PREFIX + accountId) ?? ""; } catch { return ""; }
}
function removeToken(accountId: number) {
  try { localStorage.removeItem(LS_TOKEN_PREFIX + accountId); } catch { /* ignore */ }
}
function withToken(account: BrokerAccount): BrokerAccount {
  if (account.api_token) return account;
  return { ...account, api_token: loadToken(account.id) };
}
function brokerHeaders(account: BrokerAccount): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Broker-Account-Id": String(account.id),
    "X-Broker-Token": account.api_token,
  };
}

const POLL_INTERVAL: Record<string, number> = {
  delta:   3_000,
  ctrader: 15_000,
  default: 4_000,
};

function pollIntervalFor(brokerId: string): number {
  return POLL_INTERVAL[brokerId] ?? POLL_INTERVAL["default"]!;
}

type RefreshResult = { ok: true } | { ok: false; error: string };

// ── Per-broker poll/reconnect handles ────────────────────────────────────────
const pollHandles     = new Map<string, ReturnType<typeof setInterval>>();
const reconnectHandles = new Map<string, ReturnType<typeof setTimeout>>();

function clearBrokerPoll(brokerId: string) {
  const h = pollHandles.get(brokerId);
  if (h) { clearInterval(h); pollHandles.delete(brokerId); }
}
function clearBrokerReconnect(brokerId: string) {
  const h = reconnectHandles.get(brokerId);
  if (h) { clearTimeout(h); reconnectHandles.delete(brokerId); }
}
function clearAllPolls() {
  pollHandles.forEach(h => clearInterval(h));
  pollHandles.clear();
}
function clearAllReconnects() {
  reconnectHandles.forEach(h => clearTimeout(h));
  reconnectHandles.clear();
}

// ── REST helpers ─────────────────────────────────────────────────────────────
async function doRefreshBalance(account: BrokerAccount): Promise<RefreshResult & { balance?: BrokerBalance }> {
  const adapter = getAdapter(account.broker_id);
  try {
    const res = await fetch(adapter.balancePath, { headers: brokerHeaders(account) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { ok: boolean; balance: unknown; error?: string };
    if (!data.ok) return { ok: false, error: data.error ?? "No balance data" };
    return { ok: true, balance: adapter.normalizeBalance(data.balance) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function doRefreshPositions(account: BrokerAccount): Promise<RefreshResult & { positions?: BrokerPosition[] }> {
  const adapter = getAdapter(account.broker_id);
  try {
    const res = await fetch(adapter.positionsPath, { headers: brokerHeaders(account) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { ok: boolean; positions: unknown[]; error?: string };
    if (!data.ok) return { ok: false, error: data.error ?? "Error response" };
    return { ok: true, positions: adapter.normalizePositions(toArray(data.positions, `brokerStore.doRefreshPositions:${account.broker_id}`)) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function doRefreshOrders(account: BrokerAccount): Promise<RefreshResult & { orders?: BrokerOrder[] }> {
  const adapter = getAdapter(account.broker_id);
  try {
    const res = await fetch(adapter.ordersPath, { headers: brokerHeaders(account) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { ok: boolean; orders: unknown[]; error?: string };
    if (!data.ok) return { ok: false, error: data.error ?? "Error response" };
    return { ok: true, orders: adapter.normalizeOrders(toArray(data.orders, `brokerStore.doRefreshOrders:${account.broker_id}`)) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ── Delta WS normalizers ─────────────────────────────────────────────────────
function normalizeDeltaWsBalance(payload: Record<string, unknown>): BrokerBalance | null {
  const symbol = String(payload["asset_symbol"] ?? "");
  if (!symbol) return null;
  const walletBal   = parseFloat(String(payload["balance"]         ?? "0"));
  const orderMargin = parseFloat(String(payload["order_margin"]    ?? "0"));
  const posMargin   = parseFloat(String(payload["position_margin"] ?? "0"));
  if (!isFinite(walletBal)) return null;
  const available = Math.max(0, walletBal - orderMargin - posMargin);
  return {
    coin:               symbol,
    walletBalance:      walletBal.toFixed(4),
    equity:             walletBal.toFixed(4),
    availableToWithdraw: available.toFixed(4),
    unrealisedPnl:      "0",
  };
}

function normalizeDeltaWsPosition(payload: Record<string, unknown>): BrokerPosition {
  const side = String(payload["side"] ?? "buy").toLowerCase();
  return {
    id:            String(payload["product_id"] ?? payload["id"] ?? ""),
    symbol:        String(payload["product_symbol"] ?? payload["symbol"] ?? ""),
    side:          side === "buy" ? "Long" : "Short",
    size:          Math.abs(parseFloat(String(payload["size"] ?? "0"))),
    entryPrice:    parseFloat(String(payload["entry_price"]     ?? "0")),
    markPrice:     parseFloat(String(payload["mark_price"]      ?? "0")),
    unrealisedPnl: parseFloat(String(payload["unrealized_pnl"] ?? "0")),
    leverage:      String(payload["leverage"] ?? "1"),
    raw:           payload,
  };
}

function normalizeDeltaWsOrder(payload: Record<string, unknown>): BrokerOrder {
  const side      = String(payload["side"] ?? "buy").toLowerCase();
  const orderType = String(payload["order_type"] ?? "limit_order")
    .replace(/_order$/, "").toLowerCase();
  return {
    id:        String(payload["id"] ?? ""),
    symbol:    String(payload["product_symbol"] ?? payload["symbol"] ?? ""),
    side:      side === "buy" ? "Buy" : "Sell",
    orderType,
    price:     parseFloat(String(payload["limit_price"] ?? payload["price"] ?? "0")),
    qty:       parseFloat(String(payload["size"] ?? payload["quantity"] ?? "0")),
    status:    String(payload["state"] ?? payload["status"] ?? "open"),
    createdAt: String(payload["created_at"] ?? new Date().toISOString()),
    raw:       payload,
  };
}

const DELTA_ORDER_TERMINAL_STATES = new Set(["filled", "cancelled", "closed", "rejected", "expired"]);

// ── Derived-state helper ─────────────────────────────────────────────────────
// Computes legacy single-broker fields from the multi-broker maps so that all
// existing consumers (Portfolio, Charts, PositionsList, etc.) keep working
// without any changes.
export function deriveLegacy(
  connectedAccounts: Record<string, BrokerAccount>,
  brokerStatuses:   Record<string, ConnectionStatus>,
  brokerBalances:   Record<string, BrokerBalance | null>,
  brokerPositions:  Record<string, BrokerPosition[]>,
  brokerOrders:     Record<string, BrokerOrder[]>,
  activeBrokerId:   string,
): Pick<BrokerState,
  "activeAccount" | "connectedBroker" |
  "connectionStatus" | "brokerStatus" |
  "balance" | "accountBalance" |
  "positions" | "orders" | "error"
> {
  const ids = Object.keys(connectedAccounts);

  // Primary = activeBrokerId if connected, else first connected
  const primaryId = (activeBrokerId !== "all" && connectedAccounts[activeBrokerId])
    ? activeBrokerId
    : ids[0] ?? null;
  const primaryAccount = primaryId ? (connectedAccounts[primaryId] ?? null) : null;

  // Connection status = best status across all brokers
  const allStatuses = Object.values(brokerStatuses);
  let connectionStatus: ConnectionStatus = "disconnected";
  if (ids.length > 0) {
    if (allStatuses.some(s => s === "connected"))  connectionStatus = "connected";
    else if (allStatuses.some(s => s === "connecting")) connectionStatus = "connecting";
    else if (allStatuses.some(s => s === "error"))  connectionStatus = "error";
  }

  // Data = from activeBrokerId if set, else merged across all
  let positions: BrokerPosition[];
  let orders:    BrokerOrder[];
  let balance:   BrokerBalance | null;

  const filterId = activeBrokerId !== "all" && connectedAccounts[activeBrokerId]
    ? activeBrokerId : null;

  if (filterId) {
    positions = brokerPositions[filterId] ?? [];
    orders    = brokerOrders[filterId]    ?? [];
    balance   = brokerBalances[filterId]  ?? null;
  } else {
    positions = ids.flatMap(id => brokerPositions[id] ?? []);
    orders    = ids.flatMap(id => brokerOrders[id]    ?? []);
    balance   = ids.map(id => brokerBalances[id]).find(b => b != null) ?? null;
  }

  return {
    activeAccount:   primaryAccount,
    connectedBroker: primaryAccount,
    connectionStatus,
    brokerStatus:    connectionStatus,
    balance,
    accountBalance:  balance,
    positions,
    orders,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export type PrivateWsStatus = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export interface BrokerState {
  accounts: BrokerAccount[];

  // ── Multi-broker maps (new) ──────────────────────────────────────────────
  connectedAccounts: Record<string, BrokerAccount>;
  brokerStatuses:    Record<string, ConnectionStatus>;
  brokerBalances:    Record<string, BrokerBalance | null>;
  brokerPositions:   Record<string, BrokerPosition[]>;
  brokerOrders:      Record<string, BrokerOrder[]>;
  brokerErrors:      Record<string, string | null>;
  activeBrokerId:    string;   // broker_id or "all"
  reconnectAttemptsPer: Record<string, number>;

  // ── Legacy compat (derived from maps above) ──────────────────────────────
  connectedBroker: BrokerAccount | null;
  activeAccount:   BrokerAccount | null;
  brokerStatus:    ConnectionStatus;
  connectionStatus: ConnectionStatus;
  accountBalance:  BrokerBalance | null;
  balance:         BrokerBalance | null;
  positions:       BrokerPosition[];
  orders:          BrokerOrder[];
  error:           string | null;

  websocketStatus:    WsStatus;
  connectionLatency:  number | null;
  reconnectingState:  boolean;
  reconnectAttempts:  number;
  lastSuccessfulPoll: number | null;
  privateWsStatus:    PrivateWsStatus;

  activeSymbol:    string;
  activeTimeframe: string;

  livePnl:        Record<string, number>;
  wsClientStates: { delta: WsClientState | null };

  showSelectModal:  boolean;
  showAuthModal:    boolean;
  authBrokerId:     BrokerId | null;
  showPositions:    boolean;
  showOrders:       boolean;
  showPlaceOrder:   boolean;

  // ── Actions ──────────────────────────────────────────────────────────────
  loadAccounts:  () => Promise<void>;

  connectBroker: (account: BrokerAccount) => Promise<void>;
  connect:       (account: BrokerAccount) => Promise<void>;

  disconnectBroker: (brokerId: string) => void;
  disconnectAll:    () => void;
  disconnect:       () => void;  // backward compat = disconnectAll

  setActiveBrokerId: (id: string) => void;

  updateBalance:    () => Promise<void>;
  refreshBalance:   () => Promise<void>;
  updatePositions:  () => Promise<void>;
  refreshPositions: () => Promise<void>;
  updateOrders:     () => Promise<void>;
  refreshOrders:    () => Promise<void>;
  refreshAll:       () => Promise<void>;

  setLatency: (ms: number) => void;

  placeOrder:    (req: PlaceOrderRequest) => Promise<RefreshResult>;
  closePosition: (pos: BrokerPosition)    => Promise<RefreshResult>;
  cancelOrder:   (ord: BrokerOrder)       => Promise<RefreshResult>;
  deleteAccount: (id: number)             => Promise<void>;

  reconnect: () => Promise<void>;

  setWebsocketStatus: (s: WsStatus)                       => void;
  handleWsMessage:    (msg: unknown)                       => void;
  handleBrokerEvent:  (event: BrokerEvent)                 => void;
  setOrchestratorRef: (orch: BrokerWsOrchestrator | null)  => void;

  setActiveSymbol:    (s: string) => void;
  setActiveTimeframe: (s: string) => void;

  openSelectModal:  () => void;
  closeSelectModal: () => void;
  openAuthModal:    (brokerId: BrokerId) => void;
  closeAuthModal:   () => void;
  setShowPositions:  (v: boolean) => void;
  setShowOrders:     (v: boolean) => void;
  setShowPlaceOrder: (v: boolean) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useBrokerStore = create<BrokerState>((set, get) => ({
  accounts: [],

  // Multi-broker maps
  connectedAccounts:    {},
  brokerStatuses:       {},
  brokerBalances:       {},
  brokerPositions:      {},
  brokerOrders:         {},
  brokerErrors:         {},
  activeBrokerId:       "all",
  reconnectAttemptsPer: {},

  // Legacy derived (start empty)
  connectedBroker: null,
  activeAccount:   null,
  brokerStatus:    "disconnected",
  connectionStatus: "disconnected",
  accountBalance:  null,
  balance:         null,
  positions:       [],
  orders:          [],
  error:           null,

  websocketStatus:    "disconnected",
  connectionLatency:  null,
  reconnectingState:  false,
  reconnectAttempts:  0,
  lastSuccessfulPoll: null,
  privateWsStatus:    "idle",

  activeSymbol:    "BTCUSD",
  activeTimeframe: "60",

  livePnl:        {},
  wsClientStates: { delta: null },

  showSelectModal:  false,
  showAuthModal:    false,
  authBrokerId:     null,
  showPositions:    false,
  showOrders:       false,
  showPlaceOrder:   false,

  // ── Helper to push derived state after any multi-broker mutation ──────────
  // (called internally — not in interface)

  loadAccounts: async () => {
    try {
      const res = await fetch("/api/broker-accounts");
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; accounts: BrokerAccount[] };
      set({ accounts: toArray<BrokerAccount>(data.accounts, "brokerStore.accounts:/api/broker-accounts").map(a => withToken(a)) });
    } catch { /* ignore */ }
  },

  connectBroker: async (account: BrokerAccount) => get().connect(account),

  connect: async (account: BrokerAccount) => {
    const brokerId = account.broker_id;
    clearBrokerPoll(brokerId);
    clearBrokerReconnect(brokerId);

    const full = withToken(account);
    saveToken(full.id, full.api_token);

    // Mark this broker as connecting; keep other brokers untouched
    set(s => {
      const brokerStatuses  = { ...s.brokerStatuses,  [brokerId]: "connecting" as ConnectionStatus };
      const connectedAccounts = { ...s.connectedAccounts, [brokerId]: full };
      const brokerErrors    = { ...s.brokerErrors,    [brokerId]: null };
      return {
        connectedAccounts, brokerStatuses, brokerErrors,
        ...deriveLegacy(connectedAccounts, brokerStatuses, s.brokerBalances, s.brokerPositions, s.brokerOrders, s.activeBrokerId),
        reconnectAttemptsPer: { ...s.reconnectAttemptsPer, [brokerId]: 0 },
        reconnectingState: false,
        privateWsStatus: "idle",
      };
    });

    const [balRes, posRes, ordRes] = await Promise.all([
      doRefreshBalance(full),
      doRefreshPositions(full),
      doRefreshOrders(full),
    ]);

    const allFailed = !balRes.ok && !posRes.ok && !ordRes.ok;

    set(s => {
      const status: ConnectionStatus = allFailed ? "error" : "connected";
      const brokerStatuses  = { ...s.brokerStatuses,  [brokerId]: status };
      const brokerBalances  = { ...s.brokerBalances,  [brokerId]: (balRes.ok && balRes.balance) ? balRes.balance : (s.brokerBalances[brokerId] ?? null) };
      const brokerPositions = { ...s.brokerPositions, [brokerId]: (posRes.ok && posRes.positions) ? posRes.positions : (s.brokerPositions[brokerId] ?? []) };
      const brokerOrders    = { ...s.brokerOrders,    [brokerId]: (ordRes.ok && ordRes.orders)    ? ordRes.orders    : (s.brokerOrders[brokerId] ?? []) };
      const brokerErrors    = { ...s.brokerErrors,    [brokerId]: allFailed ? "All broker API calls failed — check credentials or reconnect" : null };
      return {
        brokerStatuses, brokerBalances, brokerPositions, brokerOrders, brokerErrors,
        ...deriveLegacy(s.connectedAccounts, brokerStatuses, brokerBalances, brokerPositions, brokerOrders, s.activeBrokerId),
        lastSuccessfulPoll: allFailed ? s.lastSuccessfulPoll : Date.now(),
      };
    });

    if (allFailed) return;

    // Start independent poll for this broker
    const handle = setInterval(async () => {
      const { connectedAccounts } = get();
      const acct = connectedAccounts[brokerId];
      if (!acct) return;

      const [br, pr, or2] = await Promise.all([
        doRefreshBalance(acct),
        doRefreshPositions(acct),
        doRefreshOrders(acct),
      ]);

      const nowAllFailed = !br.ok && !pr.ok && !or2.ok;

      set(s => {
        const prevStatus = s.brokerStatuses[brokerId] ?? "disconnected";
        const status: ConnectionStatus = nowAllFailed && prevStatus === "connected"
          ? "error"
          : (!nowAllFailed && prevStatus === "error") ? "connected" : prevStatus;

        const brokerStatuses  = { ...s.brokerStatuses,  [brokerId]: status };
        const brokerBalances  = { ...s.brokerBalances,  [brokerId]: (br.ok && br.balance) ? br.balance : s.brokerBalances[brokerId] ?? null };
        const brokerPositions = { ...s.brokerPositions, [brokerId]: (pr.ok && pr.positions) ? pr.positions : s.brokerPositions[brokerId] ?? [] };
        const brokerOrders    = { ...s.brokerOrders,    [brokerId]: (or2.ok && or2.orders) ? or2.orders : s.brokerOrders[brokerId] ?? [] };
        return {
          brokerStatuses, brokerBalances, brokerPositions, brokerOrders,
          ...deriveLegacy(s.connectedAccounts, brokerStatuses, brokerBalances, brokerPositions, brokerOrders, s.activeBrokerId),
          lastSuccessfulPoll: nowAllFailed ? s.lastSuccessfulPoll : Date.now(),
        };
      });
    }, pollIntervalFor(brokerId));

    pollHandles.set(brokerId, handle);
  },

  disconnectBroker: (brokerId: string) => {
    clearBrokerPoll(brokerId);
    clearBrokerReconnect(brokerId);

    set(s => {
      const connectedAccounts = Object.fromEntries(Object.entries(s.connectedAccounts).filter(([k]) => k !== brokerId));
      const brokerStatuses    = Object.fromEntries(Object.entries(s.brokerStatuses).filter(([k]) => k !== brokerId));
      const brokerBalances    = Object.fromEntries(Object.entries(s.brokerBalances).filter(([k]) => k !== brokerId));
      const brokerPositions   = Object.fromEntries(Object.entries(s.brokerPositions).filter(([k]) => k !== brokerId));
      const brokerOrders      = Object.fromEntries(Object.entries(s.brokerOrders).filter(([k]) => k !== brokerId));
      const brokerErrors      = Object.fromEntries(Object.entries(s.brokerErrors).filter(([k]) => k !== brokerId));
      const activeBrokerId    = s.activeBrokerId === brokerId ? "all" : s.activeBrokerId;
      return {
        connectedAccounts, brokerStatuses, brokerBalances, brokerPositions, brokerOrders, brokerErrors, activeBrokerId,
        ...deriveLegacy(connectedAccounts, brokerStatuses, brokerBalances, brokerPositions, brokerOrders, activeBrokerId),
      };
    });
  },

  disconnectAll: () => {
    clearAllPolls();
    clearAllReconnects();
    set({
      connectedAccounts: {},
      brokerStatuses:    {},
      brokerBalances:    {},
      brokerPositions:   {},
      brokerOrders:      {},
      brokerErrors:      {},
      activeBrokerId:    "all",
      connectedBroker:   null,
      activeAccount:     null,
      connectionStatus:  "disconnected",
      brokerStatus:      "disconnected",
      balance:           null,
      accountBalance:    null,
      positions:         [],
      orders:            [],
      error:             null,
      reconnectingState: false,
      reconnectAttempts: 0,
      privateWsStatus:   "idle",
      showPositions:     false,
      showOrders:        false,
      showPlaceOrder:    false,
    });
  },

  disconnect: () => get().disconnectAll(),

  setActiveBrokerId: (id: string) => {
    set(s => ({
      activeBrokerId: id,
      ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, s.brokerBalances, s.brokerPositions, s.brokerOrders, id),
    }));
  },

  updateBalance:    async () => get().refreshBalance(),
  refreshBalance:   async () => {
    const { connectedBroker } = get();
    if (!connectedBroker) return;
    const brokerId = connectedBroker.broker_id;
    const r = await doRefreshBalance(connectedBroker);
    if (r.ok && r.balance) {
      set(s => {
        const brokerBalances = { ...s.brokerBalances, [brokerId]: r.balance! };
        return {
          brokerBalances,
          ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, brokerBalances, s.brokerPositions, s.brokerOrders, s.activeBrokerId),
          lastSuccessfulPoll: Date.now(),
        };
      });
    }
  },

  updatePositions:  async () => get().refreshPositions(),
  refreshPositions: async () => {
    const { connectedBroker } = get();
    if (!connectedBroker) return;
    const brokerId = connectedBroker.broker_id;
    const r = await doRefreshPositions(connectedBroker);
    if (r.ok && r.positions) {
      set(s => {
        const brokerPositions = { ...s.brokerPositions, [brokerId]: r.positions! };
        return {
          brokerPositions,
          ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, s.brokerBalances, brokerPositions, s.brokerOrders, s.activeBrokerId),
          lastSuccessfulPoll: Date.now(),
        };
      });
    }
  },

  updateOrders:  async () => get().refreshOrders(),
  refreshOrders: async () => {
    const { connectedBroker } = get();
    if (!connectedBroker) return;
    const brokerId = connectedBroker.broker_id;
    const r = await doRefreshOrders(connectedBroker);
    if (r.ok && r.orders) {
      set(s => {
        const brokerOrders = { ...s.brokerOrders, [brokerId]: r.orders! };
        return {
          brokerOrders,
          ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, s.brokerBalances, s.brokerPositions, brokerOrders, s.activeBrokerId),
          lastSuccessfulPoll: Date.now(),
        };
      });
    }
  },

  refreshAll: async () => {
    const { connectedAccounts } = get();
    const brokerIds = Object.keys(connectedAccounts);
    if (brokerIds.length === 0) return;

    await Promise.all(brokerIds.map(async brokerId => {
      const acct = connectedAccounts[brokerId];
      if (!acct) return;
      const [br, pr, or2] = await Promise.all([
        doRefreshBalance(acct),
        doRefreshPositions(acct),
        doRefreshOrders(acct),
      ]);
      set(s => {
        const brokerBalances  = { ...s.brokerBalances,  [brokerId]: (br.ok && br.balance)       ? br.balance!   : s.brokerBalances[brokerId] ?? null };
        const brokerPositions = { ...s.brokerPositions, [brokerId]: (pr.ok && pr.positions)     ? pr.positions! : s.brokerPositions[brokerId] ?? [] };
        const brokerOrders    = { ...s.brokerOrders,    [brokerId]: (or2.ok && or2.orders)      ? or2.orders!   : s.brokerOrders[brokerId] ?? [] };
        return {
          brokerBalances, brokerPositions, brokerOrders,
          ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, brokerBalances, brokerPositions, brokerOrders, s.activeBrokerId),
          lastSuccessfulPoll: Date.now(),
        };
      });
    }));
  },

  setLatency: (ms: number) => set({ connectionLatency: ms }),

  placeOrder: async (req: PlaceOrderRequest): Promise<RefreshResult> => {
    const { connectedBroker } = get();
    if (!connectedBroker) return { ok: false, error: "No broker connected" };
    const adapter = getAdapter(connectedBroker.broker_id);
    try {
      const body = adapter.buildOrderBody(req);
      const res = await fetch(`/api/broker/${connectedBroker.broker_id}/order`, {
        method: "POST",
        headers: brokerHeaders(connectedBroker),
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { ok: false, error: data.error ?? "Order failed" };
      setTimeout(() => get().refreshAll(), 800);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  },

  closePosition: async (pos: BrokerPosition): Promise<RefreshResult> => {
    const { connectedBroker } = get();
    if (!connectedBroker) return { ok: false, error: "No broker connected" };
    const adapter = getAdapter(connectedBroker.broker_id);
    try {
      const { path, method, body } = adapter.closePositionConfig(pos);
      const res = await fetch(path, { method, headers: brokerHeaders(connectedBroker), body: JSON.stringify(body) });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { ok: false, error: data.error ?? "Close failed" };
      setTimeout(() => get().refreshAll(), 800);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  },

  cancelOrder: async (ord: BrokerOrder): Promise<RefreshResult> => {
    const { connectedBroker } = get();
    if (!connectedBroker) return { ok: false, error: "No broker connected" };
    const adapter = getAdapter(connectedBroker.broker_id);
    try {
      const { path, method, body } = adapter.cancelOrderConfig(ord);
      const res = await fetch(path, {
        method,
        headers: brokerHeaders(connectedBroker),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { ok: false, error: data.error ?? "Cancel failed" };
      setTimeout(() => get().refreshAll(), 800);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  },

  deleteAccount: async (id: number) => {
    await fetch(`/api/broker-accounts/${id}`, { method: "DELETE" });
    removeToken(id);
    // Find if this account is currently connected
    const { connectedAccounts } = get();
    const brokerId = Object.entries(connectedAccounts)
      .find(([, acct]) => acct.id === id)?.[0];
    if (brokerId) get().disconnectBroker(brokerId);
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }));
  },

  reconnect: async () => {
    const { connectedBroker, reconnectAttemptsPer } = get();
    if (!connectedBroker) return;
    const brokerId = connectedBroker.broker_id;
    clearBrokerPoll(brokerId);
    clearBrokerReconnect(brokerId);

    const attempt = (reconnectAttemptsPer[brokerId] ?? 0) + 1;
    const delayMs = Math.min(1000 * Math.pow(1.5, attempt - 1), 30_000);

    set(s => {
      const brokerStatuses = { ...s.brokerStatuses, [brokerId]: "connecting" as ConnectionStatus };
      return {
        brokerStatuses, reconnectingState: true,
        reconnectAttemptsPer: { ...s.reconnectAttemptsPer, [brokerId]: attempt },
        ...deriveLegacy(s.connectedAccounts, brokerStatuses, s.brokerBalances, s.brokerPositions, s.brokerOrders, s.activeBrokerId),
      };
    });

    const handle = setTimeout(async () => {
      const { connectedAccounts } = get();
      const current = connectedAccounts[brokerId];
      if (!current) return;
      await get().connect(current);
      set({ reconnectingState: false });
    }, attempt > 1 ? delayMs : 0);
    reconnectHandles.set(brokerId, handle);
  },

  setWebsocketStatus: (s: WsStatus) => set({ websocketStatus: s }),

  handleWsMessage: (msg: unknown) => {
    const m = msg as Record<string, unknown>;
    if (!m || typeof m.type !== "string") return;

    if (m.type === "pong" && typeof m.latencyMs === "number") {
      set({ connectionLatency: m.latencyMs as number });
      return;
    }

    if (m.type === "delta_ws_status") {
      const { connectedAccounts } = get();
      if (!connectedAccounts["delta"]) return;
      const status = String(m.status ?? "");
      const statusMap: Record<string, PrivateWsStatus> = {
        connecting: "connecting", connected: "connected",
        reconnecting: "reconnecting", failed: "failed",
      };
      set({ privateWsStatus: statusMap[status] ?? "idle" });
      return;
    }

    if (m.type === "delta_ws_error") {
      if (!get().connectedAccounts["delta"]) return;
      set({ privateWsStatus: "failed", error: String(m.error ?? "Delta WebSocket authentication failed") });
      return;
    }

    if (m.type === "delta_balance") {
      if (!get().connectedAccounts["delta"]) return;
      const payload = (m.payload ?? m) as Record<string, unknown>;
      const normalized = normalizeDeltaWsBalance(payload);
      if (!normalized) return;
      set(s => {
        const existing = s.brokerBalances["delta"];
        if (existing && normalized.coin !== existing.coin && normalized.coin !== "USDT") return {};
        const brokerBalances = { ...s.brokerBalances, delta: normalized };
        return { brokerBalances, ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, brokerBalances, s.brokerPositions, s.brokerOrders, s.activeBrokerId), lastSuccessfulPoll: Date.now() };
      });
      return;
    }

    if (m.type === "delta_orders") {
      if (!get().connectedAccounts["delta"]) return;
      const payload = (m.payload ?? m) as Record<string, unknown>;
      if (!payload["id"]) return;
      const orderId    = String(payload["id"]);
      const orderState = String(payload["state"] ?? payload["status"] ?? "open").toLowerCase();
      const isTerminal = DELTA_ORDER_TERMINAL_STATES.has(orderState);
      set(s => {
        const existing    = (s.brokerOrders["delta"] ?? []).filter(o => o.id !== orderId);
        const orders      = isTerminal ? existing : [...existing, normalizeDeltaWsOrder(payload)];
        const brokerOrders = { ...s.brokerOrders, delta: orders };
        return { brokerOrders, ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, s.brokerBalances, s.brokerPositions, brokerOrders, s.activeBrokerId), lastSuccessfulPoll: Date.now() };
      });
      return;
    }

    if (m.type === "delta_positions") {
      if (!get().connectedAccounts["delta"]) return;
      const payload   = (m.payload ?? m) as Record<string, unknown>;
      const productId = String(payload["product_id"] ?? payload["id"] ?? "");
      if (!productId) return;
      const size     = parseFloat(String(payload["size"] ?? "0"));
      const isClosed = !isFinite(size) || size === 0;
      set(s => {
        const existing      = (s.brokerPositions["delta"] ?? []).filter(p => p.id !== productId);
        const positions      = isClosed ? existing : [...existing, normalizeDeltaWsPosition(payload)];
        const brokerPositions = { ...s.brokerPositions, delta: positions };
        return { brokerPositions, ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, s.brokerBalances, brokerPositions, s.brokerOrders, s.activeBrokerId), lastSuccessfulPoll: Date.now() };
      });
      const updated = get().positions;
      _orchestrator?.updatePositions("delta", updated);
      return;
    }
  },

  handleBrokerEvent: (event: BrokerEvent) => {
    switch (event.kind) {
      case "tick": break;
      case "positions": {
        const brokerId = event.broker as string;
        if (!get().connectedAccounts[brokerId]) break;
        set(s => {
          const brokerPositions = { ...s.brokerPositions, [brokerId]: event.positions };
          return { brokerPositions, ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, s.brokerBalances, brokerPositions, s.brokerOrders, s.activeBrokerId), lastSuccessfulPoll: event.ts };
        });
        _orchestrator?.updatePositions(event.broker as "delta", event.positions);
        break;
      }
      case "orders": {
        const brokerId = event.broker as string;
        if (!get().connectedAccounts[brokerId]) break;
        set(s => {
          const brokerOrders = { ...s.brokerOrders, [brokerId]: event.orders };
          return { brokerOrders, ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, s.brokerBalances, s.brokerPositions, brokerOrders, s.activeBrokerId), lastSuccessfulPoll: event.ts };
        });
        break;
      }
      case "balance": {
        const brokerId = event.broker as string;
        if (!get().connectedAccounts[brokerId]) break;
        set(s => {
          const brokerBalances = { ...s.brokerBalances, [brokerId]: event.balance };
          return { brokerBalances, ...deriveLegacy(s.connectedAccounts, s.brokerStatuses, brokerBalances, s.brokerPositions, s.brokerOrders, s.activeBrokerId), lastSuccessfulPoll: event.ts };
        });
        break;
      }
      case "pnl": {
        set(s => ({ livePnl: { ...s.livePnl, [event.symbol]: event.unrealisedPnl } }));
        break;
      }
      case "status": {
        const brokerId = event.broker as string;
        if (!get().connectedAccounts[brokerId]) break;
        const statusMap: Record<string, ConnectionStatus> = {
          connected: "connected", connecting: "connecting", reconnecting: "connecting",
          disconnected: "disconnected", error: "error", idle: "disconnected",
        };
        const mapped = statusMap[event.status] ?? "error";
        set(s => {
          const brokerStatuses = { ...s.brokerStatuses, [brokerId]: mapped };
          return { brokerStatuses, ...deriveLegacy(s.connectedAccounts, brokerStatuses, s.brokerBalances, s.brokerPositions, s.brokerOrders, s.activeBrokerId) };
        });
        if (event.status === "error" || event.status === "disconnected") get().reconnect();
        break;
      }
      case "latency": {
        set({ connectionLatency: event.latencyMs });
        break;
      }
    }
  },

  setOrchestratorRef: (orch: BrokerWsOrchestrator | null) => {
    _orchestrator = orch;
    set({ wsClientStates: orch?.state ?? { delta: null } });
  },

  setActiveSymbol:    (s: string) => set({ activeSymbol: s }),
  setActiveTimeframe: (s: string) => set({ activeTimeframe: s }),

  openSelectModal:  () => set({ showSelectModal: true }),
  closeSelectModal: () => set({ showSelectModal: false }),
  openAuthModal:    (brokerId: BrokerId) => set({ showAuthModal: true, authBrokerId: brokerId, showSelectModal: false }),
  closeAuthModal:   () => set({ showAuthModal: false, authBrokerId: null }),
  setShowPositions:  (v) => set({ showPositions: v }),
  setShowOrders:     (v) => set({ showOrders: v }),
  setShowPlaceOrder: (v) => set({ showPlaceOrder: v }),
}));
