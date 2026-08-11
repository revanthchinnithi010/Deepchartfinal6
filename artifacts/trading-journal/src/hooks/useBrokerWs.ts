import { useEffect, useRef } from "react";
import { useLiveMarketContext } from "@/contexts/LiveMarketContext";
import { useBrokerStore } from "@/store/brokerStore";
import { BrokerWsOrchestrator } from "@/lib/broker-ws";
import type { BrokerEvent } from "@/lib/broker-ws";
import type { BrokerBalance, BrokerPosition, BrokerOrder } from "@/types/broker";

/**
 * Mounts once inside LiveMarketProvider.
 * Creates and manages a BrokerWsOrchestrator for the lifetime of the app.
 *
 * Bridges: LiveMarketContext (relay WS) + Delta direct WS → brokerStore
 *
 * On every broker event:
 *   tick      → live PnL tracking
 *   positions → store.positions
 *   orders    → store.orders
 *   balance   → store.accountBalance
 *   pnl       → store.livePnl
 *   status    → store.brokerStatus
 *   latency   → store.connectionLatency
 */
export function useBrokerWs() {
  const { subscribeToMessages } = useLiveMarketContext();
  const orchestratorRef = useRef<BrokerWsOrchestrator | null>(null);

  const {
    connectedBroker,
    activeSymbol,
    handleBrokerEvent,
    setOrchestratorRef,
  } = useBrokerStore();

  useEffect(() => {
    const orch = new BrokerWsOrchestrator(subscribeToMessages);
    orchestratorRef.current = orch;
    setOrchestratorRef(orch);

    const unsub = orch.onEvent((event: BrokerEvent) => handleBrokerEvent(event));

    return () => {
      unsub();
      orch.destroy();
      orchestratorRef.current = null;
      setOrchestratorRef(null);
    };
  }, [subscribeToMessages]);

  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch || !connectedBroker) return;
    orch.connectBroker(connectedBroker);
    return () => {
      orch.disconnectBroker(connectedBroker.broker_id as "delta");
    };
  }, [connectedBroker?.id]);

  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch || !connectedBroker) return;
    if (connectedBroker.broker_id !== "delta") return;
    orch.subscribeSymbol(activeSymbol);
    return () => { orch.unsubscribeSymbol(activeSymbol); };
  }, [activeSymbol, connectedBroker?.id]);
}
