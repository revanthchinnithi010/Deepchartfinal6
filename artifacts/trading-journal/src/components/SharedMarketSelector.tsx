/**
 * SharedMarketSelector — single source of truth for browsing and selecting symbols.
 *
 * Mode "page"  → renders as an inline fill-height layout (used by markets.tsx).
 * Mode "sheet" → renders as a portal bottom sheet with backdrop (used by Charts picker).
 *
 * Data sources (identical in both modes):
 *   • brokerWatchlistStore  — watchlist / favorites
 *   • /api/symbols?broker=delta  — Delta Exchange catalog
 *   • /api/symbols?broker=ctrader — cTrader catalog (gated: only when connStatus === "streaming")
 *
 * Symbol selection always calls props.onSelect(symbol).
 * In sheet mode it also calls props.onClose() automatically.
 *
 * Performance architecture:
 *   • PriceCell component isolates tick re-renders — SymbolRow layout never re-renders on price ticks
 *   • content-visibility:auto on every row — browser skips layout/paint for off-screen items
 *   • useDeferredValue + 150ms debounce on search — input stays 60fps while filter defers
 *   • useTransition for category expand and tab change — non-blocking DOM mounting
 *   • Lazy content mount in sheet mode — sheet slides in as lightweight shell (2-frame delay)
 *   • CSS tween replaces Framer spring — GPU compositor thread animation
 *   • overscroll-behavior:contain + -webkit-overflow-scrolling:touch — smooth mobile scroll
 *   • All static style objects hoisted to module level — zero GC pressure per render
 */

import {
  memo, useState, useCallback, useEffect, useMemo, useRef,
  useDeferredValue, useTransition, startTransition,
} from "react";
import { createPortal } from "react-dom";
import { sheetDragState } from "@/lib/sheetDragState";
import { toArray } from "@/lib/safeArray";
import {
  Star, TrendingUp, Search, X,
  ChevronDown, ChevronRight, RefreshCw,
  ArrowUp, ArrowDown,
} from "lucide-react";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useSymbolTick } from "@/store/tickStore";
import { useCtraderSpot, useCtraderConnStatus } from "@/store/ctraderSpotStore";
import { tapStart, recordUi } from "@/lib/starDiag";
import {
  AnimatedList,
  AnimatedListItem,
  AnimatedPresenceList,
  AnimatedCard,
  FadeIn
} from "@/components/animations";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

import { COMPOSITOR_EASE, COMPOSITOR_EASE_CLOSE } from "@/animations/motion";
import { AppHeader } from "@/components/AppHeader";

// Spring easing for sheet snap transitions — matches BottomSheet in MobileChartLayout
const SMS_SNAP_SPRING = `transform 0.22s ${COMPOSITOR_EASE}`;

// ── Types ──────────────────────────────────────────────────────────────────

type DeltaCategory   = "perpetual" | "future" | "forex" | "index" | "commodity" | "other";
type CtraderCategory = "forex" | "index" | "commodity" | "stock" | "crypto" | "other";
type Category        = DeltaCategory | CtraderCategory;
type Tab             = "Watchlist" | "Markets";
type Broker          = "delta" | "ctrader";

// Hoisted to module level — never re-created on render
const TABS: Tab[] = ["Watchlist", "Markets"];

const UNIFIED_CATEGORY_ORDER: Category[] = [
  "forex", "index", "commodity", "perpetual", "future", "crypto", "stock", "other",
];

interface SymbolInfo {
  symbol:    string;
  name:      string;
  category:  Category;
  broker:    Broker;
  // Pre-computed uppercase strings — eliminates per-search allocations
  symUpper:  string;
  nameUpper: string;
}

const CATEGORY_META: Record<Category, { label: string; badge: string; color: string }> = {
  perpetual: { label: "Perpetuals",   badge: "PERP",  color: "#f59e0b" },
  future:    { label: "Futures",      badge: "FUT",   color: "#a78bfa" },
  forex:     { label: "Forex",        badge: "FX",    color: "#60a5fa" },
  index:     { label: "Indices",      badge: "IDX",   color: "#34d399" },
  commodity: { label: "Commodities",  badge: "CMDTY", color: "#fb923c" },
  stock:     { label: "Stocks",       badge: "STK",   color: "#38bdf8" },
  crypto:    { label: "Crypto",       badge: "DeFi",  color: "#818cf8" },
  other:     { label: "Other",        badge: "OTH",   color: "#94a3b8" },
};

const MARKET_TO_DELTA_CAT: Record<string, DeltaCategory> = {
  Crypto:      "perpetual",
  Forex:       "forex",
  Indices:     "index",
  Commodities: "commodity",
};

// ── Hoisted static styles ─────────────────────────────────────────────────
// Created once at module load — React never needs to diff these objects.

const SCROLL_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  // Smooth momentum scrolling on iOS
  WebkitOverflowScrolling: "touch",
  // Pre-promote to compositor so rubber-band overscroll runs at full 60 fps.
  // overscroll-behavior:contain is intentionally omitted — the fixed overlay
  // parent already has overflow:hidden + body scroll-lock, so containment is
  // guaranteed at the DOM level without the non-compositor overhead.
  willChange: "scroll-position",
};

const HEADER_STYLE: React.CSSProperties = {
  flexShrink: 0,
  background: "#000000",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const SHEET_CONTAINER_STYLE: React.CSSProperties = {
  display: "flex", flexDirection: "column", height: "100%",
  background: "#000000", color: "#e2e8f0",
  overflow: "hidden",
};

const BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 220,
  background: "rgba(0,0,0,0.65)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const STAR_BTN_STYLE: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  padding: "8px 8px 8px 10px", flexShrink: 0, lineHeight: 0,
  touchAction: "manipulation",
};

const ROW_NAME_STYLE: React.CSSProperties = {
  color: "rgba(148,163,184,0.38)", fontSize: 10.5, lineHeight: 1,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  maxWidth: "calc(100% - 8px)",
};

const ROW_SYMBOL_STYLE: React.CSSProperties = {
  color: "#e8f0ed", fontWeight: 700, fontSize: 13.5,
  letterSpacing: "0.025em", lineHeight: 1,
};

const PRICE_COL_STYLE: React.CSSProperties = {
  flexShrink: 0, display: "flex", flexDirection: "column",
  alignItems: "flex-end", gap: 3,
  paddingRight: 12,
};

// ── Price helpers ──────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (!isFinite(price) || price <= 0) return "—";
  if (price >= 10_000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 100)    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)      return price.toFixed(4);
  if (price >= 0.001)  return price.toFixed(6);
  return price.toFixed(8);
}

function formatSpread(spread: number, price: number): string {
  if (!spread || !price) return "";
  const pct = (spread / price) * 100;
  return pct < 0.01 ? `${spread.toFixed(6)}` : `${pct.toFixed(3)}%`;
}

// ── PriceCell ──────────────────────────────────────────────────────────────
// Isolated component: only this subtree re-renders on price ticks.
// SymbolRow's layout (symbol name, badge, star) is completely unaffected.

const PriceCell = memo(function PriceCell({
  symbol,
  broker,
}: {
  symbol: string;
  broker: Broker;
}) {
  const tick  = useSymbolTick(symbol);
  const cSpot = useCtraderSpot(symbol);

  const price     = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;
  const isLive    = !!tick;

  const bid    = tick?.bid    ?? (broker === "ctrader" ? cSpot?.bid    : undefined);
  const ask    = tick?.ask    ?? (broker === "ctrader" ? cSpot?.ask    : undefined);
  const spread = tick?.spread ?? (broker === "ctrader" ? cSpot?.spread : undefined);

  const hasBidAsk = !!bid && !!ask;
  const changeColor = isLive ? (isUp ? "#10b981" : "#ef4444") : "rgba(148,163,184,0.22)";

  return (
    <div style={PRICE_COL_STYLE}>
      {/* Price row with live dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {isLive && (
          <div style={{
            width: 4, height: 4, borderRadius: "50%",
            background: "#10b981", boxShadow: "0 0 4px #10b981", flexShrink: 0,
            animation: "mktPulse 2.4s ease-in-out infinite",
          }} />
        )}
        <span style={{
          color: price ? "#ddeedd" : "rgba(148,163,184,0.2)",
          fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em", minWidth: 60, textAlign: "right",
        }}>
          {price ? formatPrice(price) : "—"}
        </span>
      </div>

      {/* % change pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "2px 5px", borderRadius: 5,
        background: isLive
          ? (isUp ? "rgba(16,185,129,0.11)" : "rgba(239,68,68,0.11)")
          : "rgba(148,163,184,0.05)",
        border: `1px solid ${isLive
          ? (isUp ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)")
          : "rgba(148,163,184,0.08)"}`,
        minWidth: 52, justifyContent: "center",
      }}>
        {isLive && (
          isUp
            ? <ArrowUp size={8} color="#10b981" strokeWidth={2.5} />
            : <ArrowDown size={8} color="#ef4444" strokeWidth={2.5} />
        )}
        <span style={{
          fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
          color: changeColor, letterSpacing: "0.01em",
        }}>
          {isLive ? `${Math.abs(changePct).toFixed(2)}%` : "—"}
        </span>
      </div>
    </div>
  );
});

// ── SymbolRow ──────────────────────────────────────────────────────────────
// Pure layout component — NO tick subscriptions here.
// content-visibility:auto lets the browser skip paint for off-screen rows.

export const SymbolRow = memo(function SymbolRow({
  symbol, name, category, broker, isFavorite, inWatchlist, isActive, onStarPress, onTap,
}: {
  symbol:      string;
  name:        string;
  category:    Category;
  broker:      Broker;
  isFavorite:  boolean;
  inWatchlist: boolean;
  isActive?:   boolean;
  onStarPress: (tapAt: number) => void;
  onTap?:      () => void;
}) {
  const meta = CATEGORY_META[category];

  // Optimistic star state — only local toggle, syncs via isFavorite prop
  const [visualFav, setVisualFav] = useState(isFavorite);

  // Sync only when prop changes from outside (after server confirm)
  const prevFavRef = useRef(isFavorite);
  if (prevFavRef.current !== isFavorite) {
    prevFavRef.current = isFavorite;
    // Direct mutation during render is safe here (no useEffect needed)
    // because we're simply syncing derived state
    setVisualFav(isFavorite);
  }

  const handleStarDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tapAt = tapStart(symbol);
    setVisualFav(v => !v);
    requestAnimationFrame(() => recordUi(tapAt));
    onStarPress(tapAt);
  }, [symbol, onStarPress]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onTap?.();
  }, [onTap]);

  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        padding: "8px 0 8px 0",
        borderBottom: "1px solid rgba(255,255,255,0.035)",
        minHeight: 52,
        cursor: onTap ? "pointer" : "default",
        borderLeft: isActive ? "2.5px solid #f59e0b" : "2.5px solid transparent",
        background: isActive
          ? "linear-gradient(90deg, rgba(245,158,11,0.06) 0%, transparent 60%)"
          : undefined,
        position: "relative",
        // Browser skips layout + paint for rows scrolled off-screen
        contentVisibility: "auto",
        containIntrinsicSize: "0 52px",
      }}
      onClick={onTap ? handleClick : undefined}
    >
      {/* Star button — kept wide enough for 44px touch target */}
      <button onPointerDown={handleStarDown} style={STAR_BTN_STYLE}>
        <Star
          size={14}
          fill={visualFav ? "#f59e0b" : inWatchlist ? "rgba(148,163,184,0.15)" : "none"}
          color={visualFav ? "#f59e0b" : "rgba(148,163,184,0.28)"}
          strokeWidth={1.8}
          style={{ transition: "fill 0.08s, color 0.08s" }}
        />
      </button>

      {/* Left: symbol name + subtitle — takes remaining width */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
          <span style={ROW_SYMBOL_STYLE}>{symbol}</span>
          <span style={{
            fontSize: 8, fontWeight: 700, color: meta.color,
            background: `${meta.color}16`, border: `1px solid ${meta.color}28`,
            borderRadius: 3, padding: "1px 3px",
            letterSpacing: "0.06em", flexShrink: 0, lineHeight: 1.4,
          }}>
            {meta.badge}
          </span>
        </div>
        <div style={ROW_NAME_STYLE}>{name}</div>
      </div>

      {/* Right: price + % change — tick-isolated subtree */}
      <PriceCell symbol={symbol} broker={broker} />
    </div>
  );
});

// ── CategorySection ────────────────────────────────────────────────────────

const INITIAL_SHOW = 50;

const CategorySection = memo(function CategorySection({
  category, symbols, watchMap, getStarCb, getTapCb,
  defaultOpen, searchActive, activeSymbol,
}: {
  category:     Category;
  symbols:      SymbolInfo[];
  watchMap:     Map<string, { isFavorite: boolean; id: number }>;
  getStarCb:    (s: string) => (tapAt: number) => void;
  getTapCb:     (s: string) => () => void;
  defaultOpen:  boolean;
  searchActive: boolean;
  activeSymbol?: string;
}) {
  const [open,    setOpen]    = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const [, transition]        = useTransition();

  // Force-open when searching; use transition so it doesn't block input
  useEffect(() => {
    if (searchActive) {
      transition(() => setOpen(true));
    }
  }, [searchActive]); // eslint-disable-line

  const meta = CATEGORY_META[category];
  if (symbols.length === 0) return null;

  const visible = showAll ? symbols : symbols.slice(0, INITIAL_SHOW);

  const handleToggle = () => {
    // startTransition: expanding a category is non-urgent — defer child mounting
    startTransition(() => setOpen(v => !v));
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          padding: "6px 12px 6px 12px", gap: 8,
          background: "rgba(255,255,255,0.015)",
          borderLeft: `2.5px solid ${meta.color}`,
          border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          cursor: "pointer", touchAction: "manipulation",
        }}
      >
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: meta.color, boxShadow: `0 0 6px ${meta.color}88`,
        }} />
        <span style={{
          flex: 1, fontSize: 11, fontWeight: 700,
          color: "rgba(255,255,255,0.68)", textAlign: "left",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          {meta.label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, color: meta.color,
          background: `${meta.color}18`, borderRadius: 99, padding: "1.5px 7px",
          letterSpacing: "0.02em",
        }}>
          {symbols.length}
        </span>
        {open
          ? <ChevronDown size={12} color="rgba(148,163,184,0.35)" strokeWidth={2.5} />
          : <ChevronRight size={12} color="rgba(148,163,184,0.35)" strokeWidth={2.5} />
        }
      </button>

      {open && (
        <>
          {visible.map(s => {
            const wItem = watchMap.get(s.symbol);
            return (
              <SymbolRow
                key={s.symbol}
                symbol={s.symbol}
                name={s.name}
                category={s.category}
                broker={s.broker}
                inWatchlist={!!wItem}
                isFavorite={wItem?.isFavorite ?? false}
                isActive={activeSymbol === s.symbol}
                onStarPress={getStarCb(s.symbol)}
                onTap={getTapCb(s.symbol)}
              />
            );
          })}
          {!showAll && symbols.length > INITIAL_SHOW && (
            <button
              onClick={() => startTransition(() => setShowAll(true))}
              style={{
                width: "100%", padding: "10px 16px", border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(255,255,255,0.02)", cursor: "pointer",
                touchAction: "manipulation", color: meta.color,
                fontSize: 12, fontWeight: 600,
              }}
            >
              Show {symbols.length - INITIAL_SHOW} more {meta.label.toLowerCase()}…
            </button>
          )}
        </>
      )}
    </div>
  );
});

// ── CtraderStatusBar ───────────────────────────────────────────────────────
// memo() prevents re-renders when parent re-renders for unrelated reasons
// (search input, tab change, etc.) — this only cares about connStatus.

const CtraderStatusBar = memo(function CtraderStatusBar() {
  const connStatus  = useCtraderConnStatus();
  const isStreaming = connStatus === "streaming";
  const color = isStreaming ? "#10b981"
    : ["connecting", "app_auth", "acct_auth"].includes(connStatus) ? "#f59e0b"
    : "rgba(148,163,184,0.28)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 14px 5px" }}>
      <div style={{
        width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0,
        boxShadow: isStreaming ? `0 0 5px ${color}` : "none",
        animation: isStreaming ? "mktPulse 2.4s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontSize: 10, color: "rgba(148,163,184,0.38)", fontWeight: 500 }}>
        cTrader:&nbsp;
        {connStatus === "streaming"                                   ? "live"
          : connStatus === "connecting"                               ? "connecting…"
          : connStatus === "app_auth" || connStatus === "acct_auth"  ? "authenticating…"
          : connStatus === "reconnecting"                             ? "reconnecting…"
          : connStatus}
      </span>
    </div>
  );
});

// ── EmptyState ─────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon, title, subtitle,
}: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "64px 32px", gap: 12,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
      }}>
        <Icon size={22} color="rgba(148,163,184,0.30)" strokeWidth={1.5} />
      </div>
      <p style={{
        fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.40)", margin: 0, textAlign: "center",
      }}>
        {title}
      </p>
      {subtitle && (
        <p style={{
          fontSize: 12, color: "rgba(148,163,184,0.25)", margin: 0,
          textAlign: "center", lineHeight: 1.5, maxWidth: 220,
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ── SharedMarketSelector ───────────────────────────────────────────────────

export interface SharedMarketSelectorProps {
  /** "page" = inline fill-height content; "sheet" = portal bottom sheet */
  mode:          "page" | "sheet";
  /** For sheet mode — controls visibility */
  visible?:      boolean;
  /** Currently charted symbol (highlighted amber) */
  activeSymbol:  string;
  /** Called when user selects a symbol (always fires, both tabs) */
  onSelect:      (symbol: string) => void;
  /**
   * Optional: called only when a symbol row in the WATCHLIST tab is tapped.
   * Falls back to onSelect if not provided.
   * Markets tab row taps always use onSelect regardless.
   * Allows Markets page to open a picker sheet only on Watchlist taps.
   */
  onWatchlistTap?: (symbol: string) => void;
  /** Called to close (sheet mode: required; page mode: ignored) */
  onClose?:      () => void;
  /**
   * Extra ReactNode rendered in the header action area.
   * Markets page uses this for the diagnostics toggle button.
   */
  headerActions?: React.ReactNode;
  /**
   * When provided, renders a back-arrow button on the left of the header and
   * adds safe-area-inset-top padding. Used when the Markets page is pushed as
   * an overlay (e.g. from Dashboard) without changing the bottom nav tab.
   */
  backAction?: () => void;
  /**
   * When provided (Alerts flow only), renders a ✕ Close button in the Markets
   * header that exits the entire Alerts flow and returns to Dashboard.
   */
  closeAllAction?: () => void;
}

export const SharedMarketSelector = memo(function SharedMarketSelector({
  mode,
  visible = true,
  activeSymbol,
  onSelect,
  onWatchlistTap,
  onClose,
  headerActions,
  backAction,
  closeAllAction,
}: SharedMarketSelectorProps) {

  const [activeTab, setActiveTab] = useState<Tab>("Watchlist");

  // ── Search: two-stage debounce → defer ─────────────────────────────────
  // rawSearch: immediate input value (always reflects keystrokes)
  // search:    debounced 150ms (avoids filtering on every keystroke)
  // deferredSearch: further deferred by React for non-urgent renders
  const [rawSearch, setRawSearch] = useState("");
  const [search,    setSearch]    = useState("");
  const searchRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRawSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(() => setSearch(val));
    }, 150);
  }, []);

  const deferredSearch = useDeferredValue(search);
  const searchActive   = deferredSearch.trim().length > 0;
  const searchUpper    = deferredSearch.trim().toUpperCase();

  useEffect(() => {
    if (mode === "sheet" && visible) {
      setRawSearch("");
      setSearch("");
      setActiveTab("Watchlist");
      // No auto-focus — search bar is hidden in sheet mode
    }
  }, [mode, visible]);

  // ── Lazy content mount (sheet mode only) ───────────────────────────────
  // The sheet CSS transition plays immediately on a lightweight shell.
  // After 2 animation frames (~34ms) the full content mounts.
  // This eliminates the "lag before animation" caused by mounting 500+ nodes.
  const [contentReady, setContentReady] = useState(mode === "page");

  useEffect(() => {
    if (mode !== "sheet") return undefined;
    if (visible && !contentReady) {
      let raf1: number;
      let raf2: number;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setContentReady(true));
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    return undefined;
  }, [visible, mode]); // eslint-disable-line

  // ── Sheet mount gate — portal exists only while sheetMounted=true ──────────
  const [sheetMounted, setSheetMounted] = useState(false);

  useEffect(() => {
    if (mode !== "sheet") return;
    if (visible) {
      setSheetMounted(true);  // mount → opening animation fires in separate effect
    } else {
      // Parent force-closed without drag (e.g. navigated away): instant unmount
      setSheetMounted(false);
    }
  }, [visible, mode]);

  // ── RAF drag refs ─────────────────────────────────────────────────────────
  const sheetRef    = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const onCloseRef  = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // useLatest for onSelect — keeps handleSymbolTap stable regardless of parent re-renders.
  // Without this, any parent re-render passing a new onSelect reference clears the entire
  // per-symbol callback cache, triggering a full re-render of all SymbolRow components.
  const onSelectRef      = useRef(onSelect);
  const onWatchlistTapRef = useRef(onWatchlistTap);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onWatchlistTapRef.current = onWatchlistTap; }, [onWatchlistTap]);

  const isTouchRef = useRef(typeof window !== "undefined" && navigator.maxTouchPoints > 0);

  // Snap Y offsets: FULL=5% from top (95% visible), HALF=50% visible
  const snapYRef = useRef({
    full: typeof window !== "undefined" ? Math.round(0.05 * window.innerHeight) : 40,
    half: typeof window !== "undefined" ? Math.round(0.50 * window.innerHeight) : 400,
  });
  const computeSnaps = useCallback(() => {
    snapYRef.current.full = Math.round(0.05 * window.innerHeight);
    snapYRef.current.half = Math.round(0.50 * window.innerHeight);
  }, []);
  useEffect(() => {
    computeSnaps();
    window.addEventListener("resize", computeSnaps);
    return () => window.removeEventListener("resize", computeSnaps);
  }, [computeSnaps]);

  const ds = useRef({
    active:     false,
    closing:    false,
    snap:       "half" as "half" | "full",
    baseY:      0,
    startPY:    0,
    latestPY:   0,
    rafId:      0,
    rafPending: false,
  });

  // Control scroll area overflow via DOM ref (no React re-render)
  const applySnapDom = useCallback((snap: "half" | "full") => {
    const sc = scrollRef.current;
    if (!sc) return;
    if (snap === "full") {
      sc.style.overflowY = "auto";
      (sc.style as CSSStyleDeclaration & { touchAction: string }).touchAction = "pan-y";
    } else {
      sc.style.overflowY = "hidden";
      (sc.style as CSSStyleDeclaration & { touchAction: string }).touchAction = "none";
    }
  }, []);

  // Backdrop fades out as sheet drags below HALF
  const syncBackdrop = useCallback((y: number) => {
    const bd = backdropRef.current;
    if (!bd) return;
    const hY = snapYRef.current.half;
    if (y <= hY) { bd.style.opacity = "1"; return; }
    const ratio = Math.min(1, (y - hY) / Math.max(1, hY * 0.75));
    bd.style.opacity = String(Math.max(0.05, 1 - ratio * 0.90));
  }, []);

  // RAF write — only mutates transform, nothing else
  const applyDrag = useCallback(() => {
    ds.current.rafPending = false;
    const sheet = sheetRef.current;
    if (!sheet || ds.current.closing) return;
    const raw = ds.current.baseY + (ds.current.latestPY - ds.current.startPY);
    const y = Math.max(-14, raw);
    sheet.style.transform = `translateY(${y}px)`;
    syncBackdrop(y);
  }, [syncBackdrop]);

  const animateTo = useCallback((targetY: number, easing = SMS_SNAP_SPRING) => {
    const sheet = sheetRef.current;
    const bd    = backdropRef.current;
    if (!sheet) return;
    sheet.style.transition = easing;
    sheet.style.transform  = `translateY(${targetY}px)`;
    if (bd) { bd.style.transition = "opacity 0.22s ease"; syncBackdrop(targetY); }
  }, [syncBackdrop]); // eslint-disable-line

  // Animate off-screen then fire onClose
  const doClose = useCallback(() => {
    if (ds.current.closing) return;
    ds.current.closing = true;
    sheetDragState.active = false;
    sheetDragState.flush?.();
    document.body.classList.remove("tj-sheet-drag");
    cancelAnimationFrame(ds.current.rafId);
    ds.current.rafPending = false;
    const sheet = sheetRef.current;
    const bd    = backdropRef.current;
    if (!sheet) { onCloseRef.current?.(); return; }
    const offY = window.innerHeight + 20;
    sheet.style.transition = `transform 0.16s ${COMPOSITOR_EASE_CLOSE}`;
    sheet.style.transform  = `translateY(${offY}px)`;
    if (bd) { bd.style.transition = "opacity 0.16s ease"; bd.style.opacity = "0"; }
    setTimeout(() => onCloseRef.current?.(), 165);
  }, []);

  // Decide snap target on drag release
  const commitSnap = useCallback((currentY: number) => {
    sheetDragState.active = false;
    sheetDragState.flush?.();
    const { half, full } = snapYRef.current;
    const delta = currentY - ds.current.baseY;

    if (ds.current.snap === "half") {
      if (delta < -60) {
        // Drag up → expand to FULL
        ds.current.snap = "full";
        animateTo(full, SMS_SNAP_SPRING);
        // Enable scroll after animation completes (avoids layout during animation)
        setTimeout(() => applySnapDom("full"), 240);
      } else if (delta > 110) {
        // Drag down far enough → close
        doClose();
      } else {
        // Spring back to HALF
        animateTo(half, SMS_SNAP_SPRING);
        if (!isTouchRef.current) document.body.classList.remove("tj-sheet-drag");
      }
    } else {
      // From FULL: collapse to HALF on downward drag
      if (delta > 90) {
        ds.current.snap = "half";
        // Lock scroll immediately so content stops during animation
        const sc = scrollRef.current;
        if (sc) {
          sc.style.overflowY = "hidden";
          (sc.style as CSSStyleDeclaration & { touchAction: string }).touchAction = "none";
        }
        animateTo(half, SMS_SNAP_SPRING);
        if (!isTouchRef.current) document.body.classList.remove("tj-sheet-drag");
      } else {
        // Spring back to FULL
        animateTo(full, SMS_SNAP_SPRING);
        if (!isTouchRef.current) document.body.classList.remove("tj-sheet-drag");
      }
    }
  }, [animateTo, doClose, applySnapDom]);

  // ── Touch drag on entire sheet ─────────────────────────────────────────────
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !sheetMounted) return;

    let phase: "idle" | "pending" | "dragging" = "idle";
    let startTouchY = 0;

    const beginDrag = (touchY: number) => {
      ds.current.active   = true;
      ds.current.baseY    = snapYRef.current[ds.current.snap];
      ds.current.startPY  = touchY;
      ds.current.latestPY = touchY;
      sheet.style.transition = "none";
      sheetDragState.active = true;
      document.body.classList.add("tj-sheet-drag");
    };

    const onTS = (e: TouchEvent) => {
      if (ds.current.closing) return;
      phase = "pending";
      startTouchY = e.touches[0].clientY;
    };

    const onTM = (e: TouchEvent) => {
      if (phase === "idle") return;
      const dy = e.touches[0].clientY - startTouchY;

      if (phase === "pending") {
        if (Math.abs(dy) < 10) return;

        if (ds.current.snap === "half") {
          phase = "dragging";
          beginDrag(startTouchY);
        } else {
          // FULL: only drag sheet when at scroll top AND pulling down
          const scrollTop = scrollRef.current ? scrollRef.current.scrollTop : 0;
          if (dy > 0 && scrollTop <= 1) {
            phase = "dragging";
            beginDrag(startTouchY);
          } else {
            phase = "idle"; // let list scroll normally
            return;
          }
        }
      }

      if (phase === "dragging") {
        e.preventDefault();
        ds.current.latestPY = e.touches[0].clientY;
        if (!ds.current.rafPending) {
          ds.current.rafPending = true;
          ds.current.rafId = requestAnimationFrame(applyDrag);
        }
      }
    };

    const onTE = () => {
      if (phase !== "dragging") { phase = "idle"; return; }
      phase = "idle";
      if (!ds.current.active) return;
      ds.current.active = false;
      cancelAnimationFrame(ds.current.rafId);
      ds.current.rafPending = false;
      const raw = ds.current.baseY + (ds.current.latestPY - ds.current.startPY);
      commitSnap(Math.max(-14, raw));
    };

    sheet.addEventListener("touchstart",  onTS, { passive: true });
    sheet.addEventListener("touchmove",   onTM, { passive: false });
    sheet.addEventListener("touchend",    onTE, { passive: true });
    sheet.addEventListener("touchcancel", onTE, { passive: true });
    return () => {
      sheet.removeEventListener("touchstart",  onTS);
      sheet.removeEventListener("touchmove",   onTM);
      sheet.removeEventListener("touchend",    onTE);
      sheet.removeEventListener("touchcancel", onTE);
      cancelAnimationFrame(ds.current.rafId);
    };
  }, [sheetMounted, applyDrag, commitSnap]);

  // ── Pointer/mouse drag (desktop preview & stylus) ─────────────────────────
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !sheetMounted) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || ds.current.closing) return;
      ds.current.active   = true;
      ds.current.baseY    = snapYRef.current[ds.current.snap];
      ds.current.startPY  = e.clientY;
      ds.current.latestPY = e.clientY;
      sheet.style.transition = "none";
      sheetDragState.active = true;
      document.body.classList.add("tj-sheet-drag");
      try { sheet.setPointerCapture(e.pointerId); } catch {}
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !ds.current.active) return;
      ds.current.latestPY = e.clientY;
      if (!ds.current.rafPending) {
        ds.current.rafPending = true;
        ds.current.rafId = requestAnimationFrame(applyDrag);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !ds.current.active) return;
      ds.current.active = false;
      cancelAnimationFrame(ds.current.rafId);
      ds.current.rafPending = false;
      const raw = ds.current.baseY + (ds.current.latestPY - ds.current.startPY);
      commitSnap(Math.max(-14, raw));
    };

    sheet.addEventListener("pointerdown",   onDown);
    sheet.addEventListener("pointermove",   onMove);
    sheet.addEventListener("pointerup",     onUp);
    sheet.addEventListener("pointercancel", onUp);
    return () => {
      sheet.removeEventListener("pointerdown",   onDown);
      sheet.removeEventListener("pointermove",   onMove);
      sheet.removeEventListener("pointerup",     onUp);
      sheet.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(ds.current.rafId);
    };
  }, [sheetMounted, applyDrag, commitSnap]);

  // ── Opening animation: CLOSED → FULL ─────────────────────────────────────
  // Opens at full snap (95% vh) so the maximum number of watchlist items are
  // immediately visible — no search bar means more vertical real-estate.
  useEffect(() => {
    if (!sheetMounted) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    ds.current.closing = false;
    ds.current.snap    = "full";
    const offY = window.innerHeight + 20;
    sheet.style.transition = "none";
    sheet.style.transform  = `translateY(${offY}px)`;
    applySnapDom("half"); // keep scroll locked during the spring animation
    let r1 = 0, r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        computeSnaps();
        animateTo(snapYRef.current.full, `transform 0.28s ${COMPOSITOR_EASE}`);
        // Unlock scroll once animation has settled
        setTimeout(() => applySnapDom("full"), 280);
      });
    });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [sheetMounted]); // eslint-disable-line

  // Suppress backdrop-filter on touch devices while sheet is open (performance)
  useEffect(() => {
    if (!sheetMounted || !isTouchRef.current) return;
    document.body.classList.add("tj-sheet-drag");
    return () => { document.body.classList.remove("tj-sheet-drag"); };
  }, [sheetMounted]);

  // ── Delta symbols ──────────────────────────────────────────────────────

  const [deltaSymbols, setDeltaSymbols] = useState<SymbolInfo[]>([]);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [deltaError,   setDeltaError]   = useState<string | null>(null);
  const [deltaFetchAt, setDeltaFetchAt] = useState(0);
  const deltaLoadingRef = useRef(false);

  const fetchDeltaSymbols = useCallback(async (force = false) => {
    if (deltaLoadingRef.current) return;
    deltaLoadingRef.current = true;
    setDeltaLoading(true);
    setDeltaError(null);
    try {
      const res  = await fetch(`${BASE}/api/symbols?broker=delta${force ? "&refresh=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { symbols?: Array<{ symbol: string; name: string; category?: string }> };
      const symbolsList = toArray<{ symbol: string; name: string; category?: string }>(data.symbols, "SharedMarketSelector.deltaSymbols");
      setDeltaSymbols(symbolsList.map(s => ({
        symbol:    s.symbol,
        name:      s.name,
        category:  (s.category === "future" ? "future" : "perpetual") as DeltaCategory,
        broker:    "delta" as Broker,
        symUpper:  s.symbol.toUpperCase(),
        nameUpper: s.name.toUpperCase(),
      })));
      setDeltaFetchAt(Date.now());
    } catch (e) {
      setDeltaError(String(e));
    } finally {
      setDeltaLoading(false);
      deltaLoadingRef.current = false;
    }
  }, []);

  useEffect(() => { fetchDeltaSymbols(); }, []); // eslint-disable-line

  // ── cTrader symbols (gated on live streaming) ──────────────────────────

  const connStatus         = useCtraderConnStatus();
  const ctraderIsStreaming = connStatus === "streaming";
  const ctraderIsConnected = !["idle", "stopped", "error", "unknown"].includes(connStatus);

  const [ctraderSymbols, setCtraderSymbols] = useState<SymbolInfo[]>([]);
  const [ctraderLoading, setCtraderLoading] = useState(false);
  const [ctraderFetchAt, setCtraderFetchAt] = useState(0);
  const ctraderFetchingRef = useRef(false);

  const fetchCtraderSymbolsInternal = useCallback(async () => {
    if (ctraderFetchingRef.current) return;
    ctraderFetchingRef.current = true;
    setCtraderLoading(true);
    try {
      const res  = await fetch(`${BASE}/api/symbols?broker=ctrader`);
      if (!res.ok) return;
      const data = await res.json() as { symbols?: Array<{ symbol: string; name: string; category?: string }> };
      const ctraderSymbolsList = toArray<{ symbol: string; name: string; category?: string }>(data.symbols, "SharedMarketSelector.ctraderSymbols");
      if (ctraderSymbolsList.length > 0) {
        setCtraderSymbols(ctraderSymbolsList.map(s => ({
          symbol:    s.symbol,
          name:      s.name,
          category:  (s.category ?? "other") as CtraderCategory,
          broker:    "ctrader" as Broker,
          symUpper:  s.symbol.toUpperCase(),
          nameUpper: s.name.toUpperCase(),
        })));
        setCtraderFetchAt(Date.now());
      }
    } catch { /* non-fatal */ }
    finally { setCtraderLoading(false); ctraderFetchingRef.current = false; }
  }, []);

  useEffect(() => {
    if (ctraderIsStreaming) {
      fetchCtraderSymbolsInternal();
    } else if (!ctraderIsConnected) {
      setCtraderSymbols([]);
      setCtraderFetchAt(0);
    }
  }, [ctraderIsStreaming, ctraderIsConnected, fetchCtraderSymbolsInternal]);

  // ── Watchlist ──────────────────────────────────────────────────────────

  const { items, addSymbol, toggleFavorite } = useWatchlist();

  // ── Unified watchMap — single pass, no effect, ref sync during render ──
  // Eliminates the previous redundant double-build (effect + useMemo).
  // Render-time ref sync is safe: the ref is only read inside event callbacks
  // which always fire after the current render has committed.
  const watchMap = useMemo(() => {
    const m = new Map<string, { isFavorite: boolean; id: number }>();
    items.forEach(i => m.set(i.symbol, { isFavorite: i.isFavorite, id: i.id }));
    return m;
  }, [items]);
  const watchMapRef = useRef(watchMap);
  watchMapRef.current = watchMap; // sync during render — no effect needed

  // ── Stable addSymbol / toggleFavorite refs (Zustand actions are stable,
  //    but guard defensively with useLatest so future refactors stay safe) ──
  const addSymbolRef      = useRef(addSymbol);
  const toggleFavoriteRef = useRef(toggleFavorite);
  useEffect(() => {
    addSymbolRef.current      = addSymbol;
    toggleFavoriteRef.current = toggleFavorite;
  }, [addSymbol, toggleFavorite]);

  // ── Callbacks ──────────────────────────────────────────────────────────

  // Fully stable — no deps that change. Reads refs at call-time.
  // This means starCbCache never needs to be cleared when watchlist updates.
  const handleStarPress = useCallback(async (symbol: string, tapAt: number) => {
    const item = watchMapRef.current.get(symbol);
    if (item) {
      await toggleFavoriteRef.current(item.id, item.isFavorite, tapAt);
    } else {
      await addSymbolRef.current(symbol, true, tapAt);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable — uses onSelectRef so the cache never invalidates on parent re-renders.
  // Before this fix: any parent re-render with a new onSelect reference cleared
  // ALL per-symbol callback caches, triggering a full re-render of 500+ rows.
  const handleSymbolTap = useCallback((symbol: string) => {
    onSelectRef.current(symbol);
    if (mode === "sheet") doClose();
  }, [doClose, mode]); // onSelect deliberately excluded — read via ref

  const starCbCache = useRef(new Map<string, (tapAt: number) => void>());
  const tapCbCache  = useRef(new Map<string, () => void>());
  const prevStar    = useRef(handleStarPress);
  const prevTap     = useRef(handleSymbolTap);

  if (prevStar.current !== handleStarPress || prevTap.current !== handleSymbolTap) {
    prevStar.current = handleStarPress;
    prevTap.current  = handleSymbolTap;
    starCbCache.current.clear();
    tapCbCache.current.clear();
  }

  const getStarCb = useCallback((symbol: string) => {
    if (!starCbCache.current.has(symbol)) {
      starCbCache.current.set(symbol, (tapAt: number) => handleStarPress(symbol, tapAt));
    }
    return starCbCache.current.get(symbol)!;
  }, [handleStarPress]);

  const getTapCb = useCallback((symbol: string) => {
    if (!tapCbCache.current.has(symbol)) {
      tapCbCache.current.set(symbol, () => handleSymbolTap(symbol));
    }
    return tapCbCache.current.get(symbol)!;
  }, [handleSymbolTap]);

  // ── Watchlist-specific tap handler ─────────────────────────────────────
  // Routes Watchlist row taps through onWatchlistTap (if provided) or falls
  // back to onSelect. Markets tab row taps always use handleSymbolTap/onSelect.
  // Separate callback cache prevents invalidating getTapCb on prop changes.

  const handleWatchlistSymbolTap = useCallback((symbol: string) => {
    (onWatchlistTapRef.current ?? onSelectRef.current)(symbol);
    if (mode === "sheet") doClose();
  }, [doClose, mode]); // refs deliberately excluded — stable reads

  const watchlistTapCbCache = useRef(new Map<string, () => void>());
  const prevWatchlistTap    = useRef(handleWatchlistSymbolTap);

  if (prevWatchlistTap.current !== handleWatchlistSymbolTap) {
    prevWatchlistTap.current = handleWatchlistSymbolTap;
    watchlistTapCbCache.current.clear();
  }

  const getWatchlistTapCb = useCallback((symbol: string) => {
    if (!watchlistTapCbCache.current.has(symbol)) {
      watchlistTapCbCache.current.set(symbol, () => handleWatchlistSymbolTap(symbol));
    }
    return watchlistTapCbCache.current.get(symbol)!;
  }, [handleWatchlistSymbolTap]);

  // ── Per-broker lookup Maps — O(1) symbol resolution ────────────────────
  // Replaces O(n) .find() calls in watchlistRows (previously O(watchlist×symbols)).
  const ctraderSymbolMap = useMemo(() => {
    const m = new Map<string, SymbolInfo>();
    ctraderSymbols.forEach(s => m.set(s.symbol, s));
    return m;
  }, [ctraderSymbols]);

  const deltaSymbolMap = useMemo(() => {
    const m = new Map<string, SymbolInfo>();
    deltaSymbols.forEach(s => m.set(s.symbol, s));
    return m;
  }, [deltaSymbols]);

  // ── Merged symbol list ─────────────────────────────────────────────────
  //
  // Markets tab shows ONLY symbols returned by broker API endpoints:
  //   • ctraderSymbols  — populated only when connStatus === "streaming"
  //   • deltaSymbols    — perpetuals / futures from Delta Exchange
  //
  // Watchlist items (items[]) are intentionally excluded here; they belong
  // exclusively to the Watchlist tab (watchlistRows below).

  const allMergedSymbols = useMemo<SymbolInfo[]>(() => {
    const seen   = new Set<string>();
    const result: SymbolInfo[] = [];
    for (const s of ctraderSymbols) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); result.push(s); }
    }
    for (const s of deltaSymbols) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); result.push(s); }
    }
    return result;
  }, [ctraderSymbols, deltaSymbols]);

  const grouped = useMemo(() => {
    const map = new Map<Category, SymbolInfo[]>();
    UNIFIED_CATEGORY_ORDER.forEach(c => map.set(c, []));
    for (const s of allMergedSymbols) {
      const arr = map.get(s.category as Category);
      if (arr) arr.push(s);
      else map.set(s.category as Category, [s]);
    }
    return map;
  }, [allMergedSymbols]);

  // ── Console diagnostics (dev-only) ─────────────────────────────────────

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("[Markets] diagnostics", {
      connectionStatus: connStatus,
      symbolsLoaded:    ctraderFetchAt > 0,
      symbolSource:     ctraderSymbols.length > 0
        ? "ctrader"
        : deltaSymbols.length > 0 ? "delta" : "none",
      forexCount:       grouped.get("forex")?.length      ?? 0,
      indicesCount:     grouped.get("index")?.length      ?? 0,
      commoditiesCount: grouped.get("commodity")?.length  ?? 0,
      deltaTotal:       deltaSymbols.length,
      ctraderTotal:     ctraderSymbols.length,
    });
  }, [grouped, connStatus, ctraderFetchAt, ctraderSymbols.length, deltaSymbols.length]);

  // ── Search results — uses pre-uppercase fields (zero toUpperCase allocs) ──

  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    return allMergedSymbols.filter(s =>
      s.symUpper.includes(searchUpper) || s.nameUpper.includes(searchUpper)
    );
  }, [allMergedSymbols, searchActive, searchUpper]);

  // watchlistRows uses O(1) Map lookups instead of O(n) .find() per item
  const watchlistRows = useMemo(() => {
    return items
      .filter(i => i.isFavorite)
      .map(i => {
        const cSym           = ctraderSymbolMap.get(i.symbol);
        const dSym           = deltaSymbolMap.get(i.symbol);
        const detectedBroker: Broker = cSym ? "ctrader" : "delta";
        const name = i.label;
        return {
          symbol:    i.symbol,
          name,
          category:  (cSym?.category ?? dSym?.category ?? (MARKET_TO_DELTA_CAT[i.market] ?? "other")) as Category,
          broker:    detectedBroker,
          symUpper:  i.symbol.toUpperCase(),
          nameUpper: name.toUpperCase(),
        } satisfies SymbolInfo;
      });
  }, [items, ctraderSymbolMap, deltaSymbolMap]);

  const filteredWatchlist = useMemo(() => {
    if (!searchActive) return watchlistRows;
    return watchlistRows.filter(r =>
      r.symUpper.includes(searchUpper) || r.nameUpper.includes(searchUpper)
    );
  }, [watchlistRows, searchActive, searchUpper]);

  const totalMarkets = allMergedSymbols.length;
  const isLoading    = deltaLoading || ctraderLoading;

  // ── Render helpers ─────────────────────────────────────────────────────

  const handleTabChange = useCallback((tab: Tab) => {
    startTransition(() => {
      setActiveTab(tab);
      setRawSearch("");
      setSearch("");
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setRawSearch("");
    setSearch("");
    searchRef.current?.focus();
  }, []);

  const body = (
    <div style={SHEET_CONTAINER_STYLE}>
      {/* Sticky header */}
      <div style={HEADER_STYLE}>
        {/* Sheet-mode drag handle */}
        {mode === "sheet" && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
          </div>
        )}

        {/* Back button row — only when backAction is present (overlay/push mode). */}
        {backAction && <AppHeader title="Markets" onBack={backAction} onCloseAll={closeAllAction} />}

        {/* Tab row + action buttons */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: mode === "sheet" ? "4px 12px 0" : backAction ? "4px 12px 0" : "10px 12px 0",
          gap: 8,
        }}>
          <div
            className="dash-segment-bar"
            style={{
              display: "flex", flex: 1,
              borderRadius: 10,
              padding: 4,
            }}
          >
            {TABS.map(tab => {
              const active = tab === activeTab;
              return (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`relative z-10 ${active ? "dash-segment-btn-active" : "dash-segment-btn-idle"}`}
                  style={{
                    flex: 1, padding: "7px 10px",
                    borderRadius: 7,
                    cursor: "pointer", touchAction: "manipulation",
                    fontSize: 12.5, fontWeight: active ? 700 : 500,
                    color: active ? "#FFFFFF" : "#6E7578",
                    background: active ? "#2A2D31" : "transparent",
                    border: active ? "1px solid rgba(255,255,255,0.10)" : "1px solid transparent",
                    boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 20px rgba(0,0,0,0.35)" : "none",
                    transition: "color 0.15s, background 0.15s, box-shadow 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab}
                  {tab === "Markets" && totalMarkets > 0 && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 600,
                      color: active ? "rgba(245,158,11,0.8)" : "rgba(148,163,184,0.30)",
                      background: active ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.06)",
                      borderRadius: 99, padding: "1px 5px",
                    }}>
                      {totalMarkets}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {headerActions}
            {mode === "sheet" && onClose && (
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, cursor: "pointer", padding: "7px 9px",
                  color: "rgba(148,163,184,0.5)", touchAction: "manipulation", lineHeight: 0,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Search bar — only shown in page mode on the Markets tab.
            Hidden in sheet mode (Charts picker) so items sit directly below
            the segmented control with no gap. Also hidden on Watchlist tab
            in page mode (Markets page requirement). */}
        {mode === "page" && activeTab !== "Watchlist" && (
        <div style={{ padding: "8px 12px 6px" }}>
          <div
            className="dash-segment-bar"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              borderRadius: 10, padding: "9px 12px",
            }}
          >
            <Search size={13} color="rgba(148,163,184,0.38)" style={{ flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={rawSearch}
              onChange={handleSearchChange}
              placeholder="Search all markets…"
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#e2e8f0", fontSize: 13.5, caretColor: "#f59e0b", minWidth: 0,
              }}
            />
            {rawSearch && (
              <button
                onClick={handleClearSearch}
                style={{
                  background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer",
                  padding: 0, lineHeight: 0, color: "rgba(148,163,184,0.5)",
                  width: 18, height: 18, borderRadius: 50,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        )}

        <CtraderStatusBar />
      </div>

      {/* Scrollable content — only rendered once contentReady (lazy mount in sheet) */}
      <div
        ref={scrollRef}
        style={{
          ...SCROLL_STYLE,
          // Sheet mode: start locked (hidden); applySnapDom() unlocks on FULL snap.
          // Page mode: always scrollable.
          overflowY: mode === "page" ? "auto" : "hidden",
          // Page mode: add bottom clearance so the last row clears the fixed
          // bottom nav bar (~72 px) + safe-area inset on notched devices.
          paddingBottom: mode === "page"
            ? "calc(80px + env(safe-area-inset-bottom, 0px))"
            : undefined,
        }}
      >
        {!contentReady ? null : (
          <>
            {/* ── Watchlist tab ── */}
            {activeTab === "Watchlist" && (
              <AnimatedPresenceList>
                {filteredWatchlist.length === 0 ? (
                  <div key="empty-wl">
                    <EmptyState
                      icon={TrendingUp}
                      title={searchActive ? "No results" : "No favorite markets yet"}
                      subtitle={!searchActive ? "Tap the ⭐ icon in Markets to add your favorite symbols." : undefined}
                    />
                  </div>
                ) : (
                  filteredWatchlist.map(row => {
                    const wItem = watchMap.get(row.symbol);
                    return (
                      <div key={row.symbol}>
                        <SymbolRow
                          symbol={row.symbol}
                          name={row.name}
                          category={row.category}
                          broker={row.broker}
                          inWatchlist={!!wItem}
                          isFavorite={wItem?.isFavorite ?? false}
                          isActive={activeSymbol === row.symbol}
                          onStarPress={getStarCb(row.symbol)}
                          onTap={getWatchlistTapCb(row.symbol)}
                        />
                      </div>
                    );
                  })
                )}
              </AnimatedPresenceList>
            )}

            {/* ── Markets tab ── */}
            {activeTab === "Markets" && (
              <>
                {isLoading && allMergedSymbols.length === 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "56px 0", gap: 8, color: "rgba(148,163,184,0.35)",
                  }}>
                    <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 12.5 }}>Loading markets…</span>
                  </div>
                )}

                {!isLoading && deltaError && allMergedSymbols.length === 0 && (
                  <div style={{ padding: "40px 20px", textAlign: "center" }}>
                    <p style={{ margin: "0 0 6px", color: "rgba(239,68,68,0.55)", fontSize: 13 }}>
                      Failed to load market catalog
                    </p>
                    <p style={{ margin: "0 0 16px", fontSize: 11, color: "rgba(148,163,184,0.30)" }}>
                      {deltaError}
                    </p>
                    <button
                      onClick={() => { fetchDeltaSymbols(true); if (ctraderIsStreaming) fetchCtraderSymbolsInternal(); }}
                      style={{
                        padding: "9px 18px", borderRadius: 9,
                        border: "1px solid rgba(245,158,11,0.22)",
                        background: "rgba(245,158,11,0.14)", color: "#f59e0b",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {searchActive && (
                  <>
                    {searchResults.length === 0 && (
                      <EmptyState icon={Search} title={`No symbols match "${deferredSearch}"`} />
                    )}
                    {searchResults.map(s => {
                      const wItem = watchMap.get(s.symbol);
                      return (
                        <SymbolRow
                          key={s.symbol}
                          symbol={s.symbol}
                          name={s.name}
                          category={s.category}
                          broker={s.broker}
                          inWatchlist={!!wItem}
                          isFavorite={wItem?.isFavorite ?? false}
                          isActive={activeSymbol === s.symbol}
                          onStarPress={getStarCb(s.symbol)}
                          onTap={getTapCb(s.symbol)}
                        />
                      );
                    })}
                  </>
                )}

                {!searchActive && allMergedSymbols.length > 0 && UNIFIED_CATEGORY_ORDER.map((cat, idx) => (
                  <CategorySection
                    key={cat}
                    category={cat}
                    symbols={grouped.get(cat) ?? []}
                    watchMap={watchMap}
                    getStarCb={getStarCb}
                    getTapCb={getTapCb}
                    defaultOpen={idx === 0}
                    searchActive={searchActive}
                    activeSymbol={activeSymbol}
                  />
                ))}

                {(deltaFetchAt > 0 || ctraderFetchAt > 0) && !isLoading && (
                  <div style={{ padding: "14px 14px 8px", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: "rgba(148,163,184,0.18)", fontWeight: 500 }}>
                      {allMergedSymbols.length} symbols
                      {deltaSymbols.length > 0 && ` · Delta ${deltaSymbols.length}`}
                      {ctraderSymbols.length > 0 && ` · cTrader ${ctraderSymbols.length}`}
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  // ── Page mode: render inline ───────────────────────────────────────────
  if (mode === "page") return body;

  // ── Sheet mode: 3-snap RAF-driven bottom sheet ─────────────────────────
  // Snap points: CLOSED (off-screen) → HALF (50% viewport) → FULL (95% viewport)
  // Transform runs on the GPU compositor thread; all DOM writes skip React renders.
  if (!sheetMounted) return null;

  return createPortal(
    <>
      {/* Backdrop — opacity driven by syncBackdrop() via ref, not React state */}
      <div
        ref={backdropRef}
        onClick={doClose}
        style={{
          position: "fixed", inset: 0, zIndex: 220,
          background: "rgba(0,0,0,0.72)",
          willChange: "opacity",
          animation: "sheet-fade-in 0.20s ease both",
        }}
      />

      {/* Sheet — 100vh tall; translateY controls how much is visible:
           translateY(5vh)  = 95% visible  = FULL snap
           translateY(50vh) = 50% visible  = HALF snap
           Opening useEffect sets initial off-screen position, then animates to HALF */}
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 221,
          height: "100vh",
          borderRadius: "18px 18px 0 0",
          background: "#090b0e",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 -8px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.07)",
          willChange: "transform",
          contain: "layout style",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          cursor: "grab",
          userSelect: "none",
          WebkitUserSelect: "none",
          // Opening useEffect immediately overrides this initial position
          transform: `translateY(${typeof window !== "undefined" ? window.innerHeight + 20 : 900}px)`,
        } as React.CSSProperties}
      >
        {body}
      </div>
    </>,
    document.body,
  );
});
