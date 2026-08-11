import type { BrokerPosition, BrokerId } from "@/types/broker";
import type { PnlEvent, BrokerEventHandler } from "./types";

interface PnlRecord {
  entryPrice: number;
  qty: number;
  side: "buy" | "sell";
  unrealisedPnl: number;
}

/**
 * Tick-driven unrealised PnL calculator.
 * Zero React renders — computes at tick speed.
 *
 * Usage:
 *   tracker.setPositions("delta", positions);
 *   tracker.onTick("delta", "BTCUSD", 105_000);  // called on each tick
 */
export class LivePnlTracker {
  private readonly handlers = new Set<BrokerEventHandler>();
  private readonly records = new Map<string, Map<string, PnlRecord>>();

  setPositions(broker: BrokerId, positions: BrokerPosition[]): void {
    const map = new Map<string, PnlRecord>();
    for (const pos of positions) {
      const entry = parseFloat(String(pos.entryPrice ?? "0"));
      const qty   = parseFloat(String(pos.size ?? "0"));
      const side  = (pos.side?.toLowerCase() ?? "buy") as "buy" | "sell";
      if (!isFinite(entry) || !isFinite(qty)) continue;
      map.set(pos.symbol, { entryPrice: entry, qty, side, unrealisedPnl: 0 });
    }
    this.records.set(broker, map);
  }

  onTick(broker: BrokerId, symbol: string, price: number): void {
    const bMap = this.records.get(broker);
    const rec  = bMap?.get(symbol);
    if (!rec) return;

    const direction = rec.side === "buy" ? 1 : -1;
    const pnl       = (price - rec.entryPrice) * rec.qty * direction;

    if (Math.abs(pnl - rec.unrealisedPnl) < 0.000_001) return;
    rec.unrealisedPnl = pnl;

    const event: PnlEvent = {
      kind: "pnl",
      broker,
      symbol,
      unrealisedPnl: pnl,
      ts: Date.now(),
    };

    for (const h of this.handlers) {
      try { h(event); } catch (e) { console.error("[LivePnlTracker] handler error", e); }
    }
  }

  totalPnl(broker: BrokerId): number {
    const bMap = this.records.get(broker);
    if (!bMap) return 0;
    let total = 0;
    for (const rec of bMap.values()) total += rec.unrealisedPnl;
    return total;
  }

  onEvent(handler: BrokerEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  clear(broker?: BrokerId): void {
    if (broker) this.records.delete(broker);
    else this.records.clear();
  }
}
