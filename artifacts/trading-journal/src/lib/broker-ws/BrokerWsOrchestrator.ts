import { DeltaWsClient } from "./DeltaWsClient";
import { SubscriptionManager } from "./SubscriptionManager";
import { LivePnlTracker } from "./LivePnlTracker";
import type {
  BrokerEvent, BrokerEventHandler, IBrokerWsClient,
  WsClientState, SubscriptionTopic,
} from "./types";
import type { BrokerAccount, BrokerId, BrokerPosition } from "@/types/broker";

type RelaySubscribeFn = (handler: (msg: unknown) => void) => () => void;

export interface OrchestratorState {
  delta: WsClientState | null;
}

export class BrokerWsOrchestrator {
  private readonly delta: DeltaWsClient;
  private readonly subs  = new SubscriptionManager();
  private readonly pnl   = new LivePnlTracker();
  private readonly globalHandlers = new Set<BrokerEventHandler>();

  private activeClients = new Map<BrokerId, IBrokerWsClient>();
  private cleanups: (() => void)[] = [];

  constructor(_relaySubscribeFn: RelaySubscribeFn) {
    this.delta = new DeltaWsClient();

    const wire = (client: IBrokerWsClient) => {
      return client.onEvent((event) => {
        if (event.kind === "tick") {
          this.pnl.onTick(event.broker, event.symbol, event.price);
        }
        this.subs.emit(event);
        for (const h of this.globalHandlers) {
          try { h(event); } catch { /* ignore */ }
        }
      });
    };

    this.cleanups.push(wire(this.delta));

    this.cleanups.push(
      this.pnl.onEvent((event) => {
        this.subs.emit(event);
        for (const h of this.globalHandlers) {
          try { h(event); } catch { /* ignore */ }
        }
      })
    );
  }

  get state(): OrchestratorState {
    return {
      delta: this.activeClients.has("delta") ? this.delta.state : null,
    };
  }

  connectBroker(account: BrokerAccount): void {
    const id = account.broker_id as BrokerId;
    if (id === "delta") {
      const resolvedUrl = DeltaWsClient.resolveWsUrl(account.ws_url);
      this.delta.setWsUrl(resolvedUrl);
      this.activeClients.set("delta", this.delta);
      this.delta.connect();
      this.subscribeActiveSymbol(account);
    }
  }

  disconnectBroker(brokerId: BrokerId): void {
    if (brokerId === "delta") {
      this.delta.disconnect();
      this.activeClients.delete("delta");
      this.pnl.clear("delta");
    }
  }

  disconnectAll(): void {
    this.delta.disconnect();
    this.activeClients.clear();
    this.pnl.clear();
  }

  subscribeSymbol(symbol: string): void {
    this.delta.subscribeSymbol(symbol);
  }

  unsubscribeSymbol(symbol: string): void {
    this.delta.unsubscribeSymbol(symbol);
  }

  updatePositions(broker: BrokerId, positions: BrokerPosition[]): void {
    this.pnl.setPositions(broker, positions);
  }

  totalPnl(broker: BrokerId): number {
    return this.pnl.totalPnl(broker);
  }

  subscribe(topic: SubscriptionTopic | "*", handler: BrokerEventHandler): () => void {
    return this.subs.subscribe(topic, handler);
  }

  onEvent(handler: BrokerEventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  destroy(): void {
    this.delta.disconnect();
    this.subs.clear();
    this.globalHandlers.clear();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  private subscribeActiveSymbol(account: BrokerAccount): void {
    const sym = (account as unknown as { activeSymbol?: string }).activeSymbol ?? "BTCUSD";
    this.delta.subscribeSymbol(sym);
  }
}
