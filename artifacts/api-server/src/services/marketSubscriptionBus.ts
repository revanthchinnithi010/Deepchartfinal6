import { EventEmitter } from "events";

export const marketSubscriptionBus = new EventEmitter();

export function requestMarketSubscription(symbol: string): void {
  const normalized = symbol.toUpperCase().trim();
  if (normalized) marketSubscriptionBus.emit("subscribe", normalized);
}
