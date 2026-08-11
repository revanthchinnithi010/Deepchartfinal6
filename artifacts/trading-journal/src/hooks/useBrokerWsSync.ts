import { useEffect } from "react";
import { useLiveMarketContext } from "@/contexts/LiveMarketContext";
import { useBrokerStore } from "@/store/brokerStore";

/**
 * Mounts once at the app root (inside LiveMarketProvider).
 * Bridges LiveMarketContext → brokerStore for:
 *  - websocketStatus  (mirrors the global WS state)
 *  - connectionLatency (from pong messages)
 *  - broker-specific WS messages (delta_oauth_result, etc.)
 */
export function useBrokerWsSync() {
  const { wsStatus, latencyMs, subscribeToMessages } = useLiveMarketContext();
  const { setWebsocketStatus, setLatency, handleWsMessage } = useBrokerStore();

  useEffect(() => {
    setWebsocketStatus(wsStatus);
  }, [wsStatus, setWebsocketStatus]);

  useEffect(() => {
    if (latencyMs !== null) setLatency(latencyMs);
  }, [latencyMs, setLatency]);

  useEffect(() => {
    return subscribeToMessages(handleWsMessage);
  }, [subscribeToMessages, handleWsMessage]);
}
