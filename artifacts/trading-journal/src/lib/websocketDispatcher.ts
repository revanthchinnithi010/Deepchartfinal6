/**
 * websocketDispatcher.ts
 *
 * Typed, high-performance WebSocket message router.
 *
 * Problems with the naive approach (if/else chains per handler):
 *  - Every subscriber re-parses the same `msg.type` string
 *  - No priority ordering — chart updates and housekeeping compete equally
 *  - No handler isolation — one throwing handler breaks all subsequent ones
 *  - Hard to add/remove handlers dynamically without prop drilling
 *
 * This module wraps `subscribeToMessages` from LiveMarketContext with:
 *  - A Map<type, Set<handler>> router — O(1) lookup, zero string comparisons in
 *    the hot path beyond the initial dispatch key
 *  - Priority groups: "realtime" → "ui" → "system"
 *    (candle_update and tick handlers run before status / alert handlers)
 *  - Per-handler error isolation: one bad handler cannot kill others
 *  - Clean unsubscribe via returned token — no Set membership equality issues
 */

export type WsMessageType =
  | "tick"
  | "candle_update"
  | "pong"
  | "welcome"
  | "feed_status"
  | "provider_status"
  | "subscription_update"
  | "alert_triggered"
  | (string & Record<never, never>); // allow arbitrary extension types

export type Priority = "realtime" | "ui" | "system";

export interface HandlerOptions {
  priority?: Priority;
}

type Handler<T = unknown> = (msg: T) => void;

/** Token returned by register() — pass to unregister() to clean up */
export type DispatchToken = symbol;

interface HandlerEntry {
  handler: Handler;
  priority: Priority;
}

const PRIORITY_ORDER: Priority[] = ["realtime", "ui", "system"];

function priorityIndex(p: Priority): number {
  return PRIORITY_ORDER.indexOf(p);
}

/**
 * WebSocketDispatcher — instantiate one per component tree that needs WS routing.
 *
 * Typical usage (inside a React component):
 *
 *   const dispatcher = useMemo(() => new WebSocketDispatcher(subscribeToMessages), [subscribeToMessages]);
 *   useEffect(() => dispatcher.destroy.bind(dispatcher), [dispatcher]);
 *
 *   // Register typed handler
 *   dispatcher.on<CandleUpdateMsg>("candle_update", (msg) => { ... }, { priority: "realtime" });
 */
export class WebSocketDispatcher {
  private routes: Map<string, HandlerEntry[]> = new Map();
  private unsubscribe: (() => void) | null = null;
  private tokens: Map<DispatchToken, { type: string; handler: Handler }> = new Map();

  constructor(subscribeToMessages: (handler: (msg: unknown) => void) => () => void) {
    this.unsubscribe = subscribeToMessages(this.dispatch);
  }

  /**
   * Register a handler for a specific message type.
   *
   * @param type     WS message type string (e.g. "candle_update")
   * @param handler  Callback receiving the typed message
   * @param opts     Optional: priority group ("realtime" | "ui" | "system")
   * @returns        Token for later unregistration
   */
  on<T = unknown>(
    type: WsMessageType,
    handler: Handler<T>,
    opts: HandlerOptions = {},
  ): DispatchToken {
    const priority = opts.priority ?? "ui";
    const entry: HandlerEntry = { handler: handler as Handler, priority };

    let list = this.routes.get(type);
    if (!list) { list = []; this.routes.set(type, list); }

    // Insert in priority order (realtime first)
    const insertIdx = list.findIndex(e => priorityIndex(e.priority) > priorityIndex(priority));
    if (insertIdx === -1) list.push(entry);
    else list.splice(insertIdx, 0, entry);

    const token = Symbol("dispatch-token");
    this.tokens.set(token, { type, handler: handler as Handler });
    return token;
  }

  /**
   * Unregister a handler by its token.
   */
  off(token: DispatchToken): void {
    const entry = this.tokens.get(token);
    if (!entry) return;
    this.tokens.delete(token);
    const list = this.routes.get(entry.type);
    if (!list) return;
    const idx = list.findIndex(e => e.handler === entry.handler);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) this.routes.delete(entry.type);
  }

  /**
   * Destroy the dispatcher — remove all handlers and unsubscribe from the WS.
   * Call this on component unmount.
   */
  destroy(): void {
    this.routes.clear();
    this.tokens.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private dispatch = (msg: unknown): void => {
    if (!msg || typeof msg !== "object") return;
    const type = (msg as Record<string, unknown>)["type"];
    if (typeof type !== "string") return;

    const list = this.routes.get(type);
    if (!list || list.length === 0) return;

    // Handlers are already sorted by priority — iterate in order
    for (let i = 0; i < list.length; i++) {
      try {
        list[i].handler(msg);
      } catch (err) {
        console.error(`[WsDispatcher] handler error for type="${type}":`, err);
      }
    }
  };
}

/**
 * createCandleDispatcher — convenience factory that creates a dispatcher
 * pre-wired to route only candle_update for a given symbol:interval pair.
 *
 * Returns an unsubscribe function — call it on component unmount.
 */
export function createCandleDispatcher(
  subscribeToMessages: (handler: (msg: unknown) => void) => () => void,
  symbol: string,
  interval: string,
  onBar: (msg: { symbol: string; interval: string; bar: unknown }) => void,
): () => void {
  const dispatcher = new WebSocketDispatcher(subscribeToMessages);
  dispatcher.on<{ symbol: string; interval: string; bar: unknown }>(
    "candle_update",
    (msg) => {
      if (msg.symbol === symbol && msg.interval === interval) onBar(msg);
    },
    { priority: "realtime" },
  );
  return () => dispatcher.destroy();
}
