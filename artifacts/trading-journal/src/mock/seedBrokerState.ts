// Directly seeds `brokerStore` and `brokerWatchlistStore` with deterministic
// mock data in DEV_MODE, skipping the real connect()/WS flow entirely (no
// broker auth, no live sockets). This is what makes the Dashboard's Account
// Value widget and the Portfolio account cards show data without requiring
// a user to manually "connect" a broker first.
//
// To remove: delete this file and its call site in `main.tsx`.
import { DEV_MODE } from "./config";
import { useBrokerStore, deriveLegacy } from "@/store/brokerStore";
import {
  MOCK_BROKER_ACCOUNTS,
  MOCK_DELTA_BALANCE, MOCK_CTRADER_BALANCE,
  MOCK_DELTA_POSITIONS, MOCK_CTRADER_POSITIONS,
  MOCK_DELTA_ORDERS, MOCK_CTRADER_ORDERS,
} from "./data/portfolio";
// Watchlist data flows purely through the /api/watchlist fetch mock (see
// mockApi.ts) — brokerWatchlistStore.refresh() derives display metadata
// (label/badge/market) itself via deriveMeta(), so no direct seeding needed.

export function installMockBrokerState(): void {
  if (!DEV_MODE) return;

  const deltaAccount   = MOCK_BROKER_ACCOUNTS.find(a => a.broker_id === "delta")!;
  const ctraderAccount = MOCK_BROKER_ACCOUNTS.find(a => a.broker_id === "ctrader")!;

  const connectedAccounts = { delta: deltaAccount, ctrader: ctraderAccount };
  const brokerStatuses    = { delta: "connected" as const, ctrader: "connected" as const };
  const brokerBalances    = { delta: MOCK_DELTA_BALANCE, ctrader: MOCK_CTRADER_BALANCE };
  const brokerPositions   = { delta: MOCK_DELTA_POSITIONS, ctrader: MOCK_CTRADER_POSITIONS };
  const brokerOrders      = { delta: MOCK_DELTA_ORDERS, ctrader: MOCK_CTRADER_ORDERS };
  const activeBrokerId    = "all";

  const legacy = deriveLegacy(
    connectedAccounts, brokerStatuses, brokerBalances, brokerPositions, brokerOrders, activeBrokerId,
  );

  useBrokerStore.setState({
    accounts: MOCK_BROKER_ACCOUNTS,
    connectedAccounts,
    brokerStatuses,
    brokerBalances,
    brokerPositions,
    brokerOrders,
    activeBrokerId,
    ...legacy,
  });
}
