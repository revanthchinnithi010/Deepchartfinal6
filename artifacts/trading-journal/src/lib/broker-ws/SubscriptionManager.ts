import type { BrokerEvent, BrokerEventHandler, SubscriptionTopic } from "./types";

type TopicHandlerMap = Map<string, Set<BrokerEventHandler>>;

/**
 * Topic-based pub/sub registry.
 * Topics: "tick:BTCUSD", "positions", "orders", "balance", "pnl", "status", "latency"
 * Wildcard "*" receives every event.
 */
export class SubscriptionManager {
  private readonly handlers: TopicHandlerMap = new Map();

  subscribe(topic: SubscriptionTopic | "*", handler: BrokerEventHandler): () => void {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set());
    this.handlers.get(topic)!.add(handler);
    return () => this.handlers.get(topic)?.delete(handler);
  }

  emit(event: BrokerEvent): void {
    const exactTopic = this.topicOf(event);

    const targets = [
      this.handlers.get(exactTopic),
      this.handlers.get("*"),
    ];

    for (const set of targets) {
      if (!set) continue;
      for (const handler of set) {
        try { handler(event); } catch (e) { console.error("[SubscriptionManager] handler error", e); }
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }

  private topicOf(event: BrokerEvent): string {
    switch (event.kind) {
      case "tick":     return `tick:${event.symbol}`;
      case "positions": return "positions";
      case "orders":   return "orders";
      case "balance":  return "balance";
      case "pnl":      return "pnl";
      case "status":   return "status";
      case "latency":  return "latency";
    }
  }
}
