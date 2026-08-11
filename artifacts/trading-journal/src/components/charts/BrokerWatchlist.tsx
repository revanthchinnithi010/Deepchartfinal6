import {
  memo, useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { X, Search, Star, Zap, WifiOff, Loader2 } from "lucide-react";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";
import { useMarketStore, type BrokerName, type SymbolInfo } from "@/store/marketStore";
import {
  useCtraderSpotStore, useCtraderSpot,
  type CtraderConnStatus,
} from "@/store/ctraderSpotStore";

const FAV_KEY = "bwl_favs_v1";

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
function saveFavs(s: Set<string>) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

// ── cTrader connection status helpers ─────────────────────────────────────────
function ctraderStatusColor(s: CtraderConnStatus): string {
  if (s === "streaming")   return "#22C55E";
  if (s === "reconnecting" || s === "connecting" || s === "app_auth" || s === "acct_auth" || s === "subscribing") return "#F59E0B";
  if (s === "error")       return "#EF4444";
  return "rgba(167,184,169,0.35)";
}

function ctraderStatusLabel(s: CtraderConnStatus): string {
  if (s === "streaming")    return "Live";
  if (s === "connecting")   return "Connecting…";
  if (s === "app_auth")     return "Authenticating…";
  if (s === "acct_auth")    return "Auth account…";
  if (s === "subscribing")  return "Subscribing…";
  if (s === "reconnecting") return "Reconnecting…";
  if (s === "error")        return "Error";
  if (s === "stopped")      return "Stopped";
  return "Disconnected";
}

function ctraderStatusSpinning(s: CtraderConnStatus): boolean {
  return ["connecting", "app_auth", "acct_auth", "subscribing", "reconnecting"].includes(s);
}

const BROKER_CONFIG: Record<BrokerName, { label: string; shortLabel: string; color: string; badgeBg: string }> = {
  delta: {
    label:      "Delta Exchange",
    shortLabel: "Delta",
    color:      "#00BFFF",
    badgeBg:    "rgba(0,191,255,0.12)",
  },
  ctrader: {
    label:      "cTrader",
    shortLabel: "cTrader",
    color:      "#F59E0B",
    badgeBg:    "rgba(245,158,11,0.12)",
  },
};

function getBadge(sym: SymbolInfo): string {
  if (sym.underlying && sym.underlying.length > 0) return sym.underlying.slice(0, 5);
  return sym.symbol.slice(0, 5);
}

function getLabel(sym: SymbolInfo): string {
  if (sym.underlying && sym.quoteAsset) return `${sym.underlying}/${sym.quoteAsset}`;
  return sym.name || sym.symbol;
}

function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const toggle = useCallback((symbol: string) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      saveFavs(next);
      return next;
    });
  }, []);
  return { favs, toggle };
}

interface SymbolRowProps {
  sym:      SymbolInfo;
  active:   boolean;
  isFav:    boolean;
  broker:   BrokerName;
  onSelect: () => void;
  onFav:    () => void;
}

/**
 * Each row subscribes to its OWN symbol's tick — zero re-renders from
 * ticks of other symbols.  The parent list never needs to touch tick state.
 */
const SymbolRow = memo(function SymbolRow({
  sym, active, isFav, broker, onSelect, onFav,
}: SymbolRowProps) {
  const cfg = BROKER_CONFIG[broker];

  // ── Per-row tick subscription (only this row re-renders on its own tick) ──
  const tick = useTickStore(useCallback(
    (s) => s.ticks[sym.symbol],
    [sym.symbol],
  ));

  // ── cTrader bid/ask subscription (only for ctrader rows) ─────────────────
  const ctraderSpot = useCtraderSpot(sym.symbol);
  const isCtrader   = broker === "ctrader";

  const price     = tick?.price     ?? null;
  const changePct = tick?.changePct ?? null;
  const flashDir  = tick?.flashDir  ?? null;
  const flashKey  = tick?.flashKey  ?? 0;

  const badge    = getBadge(sym);
  const label    = getLabel(sym);
  const isPos    = (changePct ?? 0) >= 0;

  // For cTrader rows prefer bid/ask display; others use mid price
  const bidStr  = isCtrader && ctraderSpot ? fmtPrice(ctraderSpot.bid, sym.symbol) : null;
  const askStr  = isCtrader && ctraderSpot ? fmtPrice(ctraderSpot.ask, sym.symbol) : null;
  const priceStr = isCtrader
    ? (ctraderSpot ? fmtPrice(ctraderSpot.mid, sym.symbol) : (price !== null ? fmtPrice(price, sym.symbol) : "—"))
    : (price !== null ? fmtPrice(price, sym.symbol) : "—");
  const pctStr   = changePct !== null ? `${isPos ? "+" : ""}${changePct.toFixed(2)}%` : "";

  // cTrader spread in pips
  const spreadStr = isCtrader && ctraderSpot && ctraderSpot.spread > 0
    ? `${(ctraderSpot.spread / Math.pow(10, -(sym.symbol.includes("JPY") ? 3 : 5))).toFixed(1)}p`
    : null;

  // ── Flash animation (DOM mutation — no setState) ──────────────────────────
  const rowRef      = useRef<HTMLDivElement>(null);
  const prevKey     = useRef(flashKey);
  const rafRef      = useRef<number>(0);

  useEffect(() => {
    if (flashKey === prevKey.current || !flashDir || !rowRef.current) return;
    prevKey.current = flashKey;
    const el  = rowRef.current;
    const clr = flashDir === "up" ? "rgba(183,255,90,0.14)" : "rgba(239,68,68,0.14)";
    cancelAnimationFrame(rafRef.current);
    el.style.background = clr;
    el.style.transition = "none";
    rafRef.current = requestAnimationFrame(() => {
      el.style.transition = "background 0.6s ease";
      el.style.background = active ? "rgba(183,255,90,0.06)" : "transparent";
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [flashKey, flashDir, active]);

  // ── Optimistic star visual (fills instantly on pointer-down) ─────────────
  const [visualFav, setVisualFav] = useState(isFav);
  // Keep in sync when parent favs set changes (e.g. hydration, tab switch)
  useEffect(() => { setVisualFav(isFav); }, [isFav]);

  const handleStarDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Flip visual immediately — zero latency
    setVisualFav(v => !v);
    // Tell parent — will confirm or revert on next render cycle
    onFav();
  }, [onFav]);

  return (
    <div
      ref={rowRef}
      onClick={onSelect}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        8,
        padding:    "6px 10px 6px 12px",
        cursor:     "pointer",
        background: active ? "rgba(183,255,90,0.06)" : "transparent",
        borderLeft: active ? `2px solid ${cfg.color}` : "2px solid transparent",
        transition: "background 0.12s",
        minHeight:  44,
        userSelect: "none",
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Badge */}
      <div style={{
        width:         34, height: 34, borderRadius: 9, flexShrink: 0,
        background:    cfg.badgeBg,
        border:        `1px solid ${cfg.color}22`,
        display:       "flex", alignItems: "center", justifyContent: "center",
        fontSize:      9, fontWeight: 900, color: cfg.color,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}>
        {badge.slice(0, 4)}
      </div>

      {/* Name column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin:       0, fontSize: 12, fontWeight: 700,
          color:        "#F3FFF3",
          overflow:     "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight:   1.2,
        }}>
          {label}
        </p>
        <p style={{
          margin:             0, fontSize: 9.5,
          color:              "rgba(167,184,169,0.45)",
          lineHeight:         1.3, marginTop: 1,
          overflow:           "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}>
          {sym.symbol}
        </p>
      </div>

      {/* Price + % column (or bid/ask for cTrader) */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {isCtrader && bidStr && askStr ? (
          <>
            <div style={{
              display: "flex", gap: 4, justifyContent: "flex-end",
              fontVariantNumeric: "tabular-nums", lineHeight: 1.2,
            }}>
              <span style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#EF4444" }}>{bidStr}</span>
              <span style={{ margin: 0, fontSize: 9, color: "rgba(167,184,169,0.3)", alignSelf: "center" }}>|</span>
              <span style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#22C55E" }}>{askStr}</span>
            </div>
            {spreadStr && (
              <p style={{ margin: 0, fontSize: 9, color: "rgba(167,184,169,0.4)", lineHeight: 1.3, marginTop: 1 }}>
                {spreadStr}
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{
              margin:             0, fontSize: 11.5, fontWeight: 700,
              color:              price !== null ? "#F3FFF3" : "rgba(167,184,169,0.3)",
              fontVariantNumeric: "tabular-nums",
              lineHeight:         1.2,
            }}>
              {priceStr}
            </p>
            {pctStr && (
              <p style={{
                margin:             0, fontSize: 9.5, fontWeight: 600,
                color:              isPos ? "#B7FF5A" : "#EF4444",
                lineHeight:         1.3, marginTop: 1,
                fontVariantNumeric: "tabular-nums",
              }}>
                {pctStr}
              </p>
            )}
          </>
        )}
      </div>

      {/* Favorite star — fires on pointerDown for zero tap-delay */}
      <button
        onPointerDown={handleStarDown}
        title={visualFav ? "Remove from favorites" : "Add to favorites"}
        style={{
          width:       28, height: 28, border: "none", background: "transparent",
          cursor:      "pointer", flexShrink: 0,
          display:     "flex", alignItems: "center", justifyContent: "center",
          padding:     0, marginLeft: 2,
          // Eliminates 300ms tap-delay on touch without needing JS tricks
          touchAction: "manipulation",
        }}
      >
        <Star
          style={{
            width:      12, height: 12,
            color:      visualFav ? "#F59E0B" : "rgba(167,184,169,0.2)",
            fill:       visualFav ? "#F59E0B" : "none",
            transition: "color 0.1s, fill 0.1s",
          }}
        />
      </button>
    </div>
  );
});

interface BrokerWatchlistProps {
  activeSymbol: string;
  onSelect:     (symbol: string) => void;
  onClose:      () => void;
}

export const BrokerWatchlist = memo(function BrokerWatchlist({
  activeSymbol,
  onSelect,
  onClose,
}: BrokerWatchlistProps) {
  // ── No tick subscription here — rows handle their own ticks ──────────────
  const {
    activeBroker, setActiveBroker,
    symbolCatalog, catalogLoaded,
    fetchSymbolCatalog,
    setActiveSymbol,
  } = useMarketStore();

  const VALID_BROKERS: BrokerName[] = ["delta", "ctrader"];
  const broker: BrokerName = (activeBroker && VALID_BROKERS.includes(activeBroker)) ? activeBroker : "delta";
  const cfg                = BROKER_CONFIG[broker];

  const [search, setSearch] = useState("");
  const { favs, toggle: toggleFav } = useFavorites();
  const searchRef = useRef<HTMLInputElement>(null);

  // ── cTrader connection status ─────────────────────────────────────────────
  const ctraderStatus = useCtraderSpotStore(s => s.connStatus);
  const ctraderSubCount = useCtraderSpotStore(s => s.subscribedCount);
  const [connecting, setConnecting] = useState(false);

  const handleCtraderConnect = useCallback(async () => {
    setConnecting(true);
    try {
      await fetch("/api/ctrader/spots/start", { method: "POST", headers: { "Content-Type": "application/json" } });
    } catch { /* ignore */ } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (!catalogLoaded[broker]) {
      fetchSymbolCatalog(broker).catch(() => {});
    }
  }, [broker, catalogLoaded, fetchSymbolCatalog]);

  const symbols: SymbolInfo[] = symbolCatalog[broker] ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return symbols;
    return symbols.filter(s =>
      s.symbol.toLowerCase().includes(q) ||
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.underlying && s.underlying.toLowerCase().includes(q)),
    );
  }, [symbols, search]);

  const favorited   = useMemo(() => filtered.filter(s =>  favs.has(s.symbol)), [filtered, favs]);
  const unfavorited = useMemo(() => filtered.filter(s => !favs.has(s.symbol)), [filtered, favs]);

  const handleSelect = useCallback((symbol: string) => {
    setActiveBroker(broker);
    setActiveSymbol(symbol);
    onSelect(symbol);
  }, [broker, setActiveBroker, setActiveSymbol, onSelect]);

  // ── Stable per-symbol callbacks — never recreated for the same symbol ─────
  // These refs are keyed by symbol so SymbolRow memo sees the same function
  // reference across renders (as long as broker/handleSelect don't change).
  const selectCbCache = useRef<Map<string, () => void>>(new Map());
  const favCbCache    = useRef<Map<string, () => void>>(new Map());

  // When broker or handleSelect changes, clear both caches so callbacks
  // pointing to the old broker/handler are rebuilt.
  const prevBrokerRef        = useRef(broker);
  const prevHandleSelectRef  = useRef(handleSelect);
  if (prevBrokerRef.current !== broker || prevHandleSelectRef.current !== handleSelect) {
    prevBrokerRef.current       = broker;
    prevHandleSelectRef.current = handleSelect;
    selectCbCache.current.clear();
    favCbCache.current.clear();
  }

  const getSelectCb = useCallback((symbol: string) => {
    if (!selectCbCache.current.has(symbol)) {
      selectCbCache.current.set(symbol, () => handleSelect(symbol));
    }
    return selectCbCache.current.get(symbol)!;
  }, [handleSelect]);

  const getFavCb = useCallback((symbol: string) => {
    if (!favCbCache.current.has(symbol)) {
      favCbCache.current.set(symbol, () => toggleFav(symbol));
    }
    return favCbCache.current.get(symbol)!;
  }, [toggleFav]);

  const switchBroker = useCallback((b: BrokerName) => {
    setActiveBroker(b);
    setSearch("");
    if (!catalogLoaded[b]) {
      fetchSymbolCatalog(b).catch(() => {});
    }
  }, [setActiveBroker, catalogLoaded, fetchSymbolCatalog]);

  const isLoading = symbols.length === 0 && !catalogLoaded[broker];

  return (
    <div style={{
      display:       "flex", flexDirection: "column",
      height:        "100%",
      background:    "#0a0a0a",
      overflow:      "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        display:      "flex", alignItems: "center",
        padding:      "10px 12px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink:   0, gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#F3FFF3", flex: 1 }}>
          Watchlist
        </span>
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, border: "none", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, color: "rgba(167,184,169,0.45)",
          }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* ── Broker tabs ── */}
      <div style={{ display: "flex", gap: 3, padding: "8px 10px 0", flexShrink: 0 }}>
        {(["delta", "ctrader"] as BrokerName[]).map(b => {
          const bc  = BROKER_CONFIG[b];
          const act = b === broker;
          return (
            <button
              key={b}
              onClick={() => switchBroker(b)}
              style={{
                flex:       1, height: 28, borderRadius: 8, border: "none",
                background: act ? `${bc.color}1A` : "rgba(255,255,255,0.04)",
                cursor:     "pointer", fontSize: 11, fontWeight: act ? 800 : 500,
                color:      act ? bc.color : "rgba(167,184,169,0.5)",
                transition: "all 0.15s",
                boxShadow:  act ? `0 0 0 1px ${bc.color}44` : "0 0 0 1px rgba(255,255,255,0.06)",
              }}
            >
              {bc.label}
            </button>
          );
        })}
      </div>

      {/* ── cTrader connection status bar ── */}
      {broker === "ctrader" && (
        <div style={{
          display:      "flex", alignItems: "center",
          padding:      "6px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          flexShrink:   0, gap: 6,
        }}>
          {ctraderStatusSpinning(ctraderStatus) ? (
            <Loader2 style={{
              width: 8, height: 8, color: ctraderStatusColor(ctraderStatus),
              animation: "spin 0.8s linear infinite", flexShrink: 0,
            }} />
          ) : ctraderStatus === "streaming" ? (
            <Zap style={{ width: 8, height: 8, color: "#22C55E", flexShrink: 0 }} />
          ) : (
            <WifiOff style={{ width: 8, height: 8, color: ctraderStatusColor(ctraderStatus), flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: ctraderStatusColor(ctraderStatus), flex: 1,
          }}>
            {ctraderStatusLabel(ctraderStatus)}
            {ctraderStatus === "streaming" && ctraderSubCount > 0 && ` · ${ctraderSubCount} symbols`}
          </span>
          {(ctraderStatus === "unknown" || ctraderStatus === "idle" || ctraderStatus === "stopped" || ctraderStatus === "error") && (
            <button
              onClick={handleCtraderConnect}
              disabled={connecting}
              style={{
                height: 20, padding: "0 8px", borderRadius: 6,
                border: "1px solid rgba(245,158,11,0.4)",
                background: connecting ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.12)",
                color: "#F59E0B", fontSize: 9.5, fontWeight: 700,
                cursor: connecting ? "default" : "pointer", flexShrink: 0,
              }}
            >
              {connecting ? "Starting…" : "Connect"}
            </button>
          )}
        </div>
      )}

      {/* ── Search ── */}
      <div style={{ padding: "8px 10px 4px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            width: 12, height: 12, color: "rgba(167,184,169,0.35)",
            pointerEvents: "none",
          }} />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${cfg.label}…`}
            style={{
              width:        "100%", height: 32,
              paddingLeft:  28, paddingRight: search ? 28 : 10,
              borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
              background:   "rgba(255,255,255,0.04)",
              color:        "#F3FFF3", fontSize: 11.5,
              outline:      "none",
              fontFamily:   "inherit",
              boxSizing:    "border-box",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
                width: 16, height: 16, border: "none", background: "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0,
              }}
            >
              <X style={{ width: 10, height: 10, color: "rgba(167,184,169,0.4)" }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "2px 12px 6px", flexShrink: 0,
      }}>
        <span style={{ fontSize: 9.5, color: "rgba(167,184,169,0.35)", fontWeight: 600 }}>
          {filtered.length} symbol{filtered.length !== 1 ? "s" : ""}
          {search && ` matching "${search}"`}
        </span>
      </div>

      {/* ── Symbol list ── */}
      <div style={{
        flex:           1,
        overflowY:      "auto",
        overflowX:      "hidden",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.08) transparent",
      }}>
        {isLoading ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              border: `2px solid ${cfg.color}44`,
              borderTopColor: cfg.color,
              animation: "spin 0.7s linear infinite",
              margin: "0 auto 10px",
            }} />
            <p style={{ fontSize: 11, color: "rgba(167,184,169,0.45)", margin: 0 }}>
              Loading {cfg.label} symbols…
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(167,184,169,0.4)", margin: 0 }}>
              {search ? "No symbols match your search" : `No ${cfg.label} symbols loaded`}
            </p>
          </div>
        ) : (
          <>
            {favorited.length > 0 && (
              <>
                <div style={{
                  padding:       "5px 12px 2px",
                  fontSize:      9, fontWeight: 700, color: "#F59E0B",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  display:       "flex", alignItems: "center", gap: 4,
                }}>
                  <Star style={{ width: 9, height: 9, fill: "#F59E0B" }} />
                  Favorites
                </div>
                {favorited.map(sym => (
                  <SymbolRow
                    key={`fav-${sym.symbol}`}
                    sym={sym}
                    active={sym.symbol === activeSymbol}
                    isFav={true}
                    broker={broker}
                    onSelect={getSelectCb(sym.symbol)}
                    onFav={getFavCb(sym.symbol)}
                  />
                ))}
                {unfavorited.length > 0 && (
                  <div style={{ height: 1, margin: "4px 12px", background: "rgba(255,255,255,0.06)" }} />
                )}
              </>
            )}

            {unfavorited.map(sym => (
              <SymbolRow
                key={sym.symbol}
                sym={sym}
                active={sym.symbol === activeSymbol}
                isFav={false}
                broker={broker}
                onSelect={getSelectCb(sym.symbol)}
                onFav={getFavCb(sym.symbol)}
              />
            ))}
          </>
        )}

        <div style={{ height: 12 }} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
});

export default BrokerWatchlist;
