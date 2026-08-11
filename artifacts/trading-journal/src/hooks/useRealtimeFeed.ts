import { useLiveMarketContext } from "@/contexts/LiveMarketContext";
export type { AlertTriggeredMsg } from "@/contexts/LiveMarketContext";
export type { WsStatus as FeedStatus } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";

export function useRealtimeFeed() {
  const { wsStatus, alertEvents } = useLiveMarketContext();
  const ticks = useTickStore(s => s.ticks);

  const prices: Record<string, number> = {};
  for (const [sym, tick] of Object.entries(ticks)) {
    prices[sym] = tick.price;
  }

  return { prices, status: wsStatus, alertEvents };
}
