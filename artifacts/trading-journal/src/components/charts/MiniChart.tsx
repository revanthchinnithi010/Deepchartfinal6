import { useEffect, useRef, useState, memo } from "react";
import { ChevronDown, Search, Link2 } from "lucide-react";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";
import { useWatchlist, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";
import CustomChart from "./CustomChart";
import type { ChartSettings } from "./chartSettingsTypes";

const TIMEFRAMES = [
  { label: "1m", value: "1" }, { label: "5m", value: "5" },
  { label: "15m", value: "15" }, { label: "1H", value: "60" },
  { label: "4H", value: "240" }, { label: "1D", value: "D" },
];

// ── Symbol picker ─────────────────────────────────────────────────────────────
function MiniSymbolPicker({ onSelect, onClose }: { onSelect: (s: string) => void; onClose: () => void }) {
  const { items } = useWatchlist();
  const ticks = useTickStore(s => s.ticks);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 20);
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const id = setTimeout(() => document.addEventListener("pointerdown", h), 80);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", h); };
  }, [onClose]);

  const allSymbols = items.length > 0 ? items : Object.keys(SYMBOL_CATALOG).map(sym => ({
    symbol: sym, badge: SYMBOL_CATALOG[sym]?.badge ?? sym, market: SYMBOL_CATALOG[sym]?.market ?? "",
    label: sym, position: 0, isFavorite: false, id: 0,
  }));

  const filtered = query.trim()
    ? allSymbols.filter(i => i.symbol.toLowerCase().includes(query.toLowerCase()) || i.badge.toLowerCase().includes(query.toLowerCase()))
    : allSymbols;

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 120,
      width: 220, maxHeight: 280, background: "rgba(7,11,9,0.99)",
      backdropFilter: "blur(24px)", border: "1px solid rgba(57,91,67,0.4)",
      borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "8px 8px 6px" }}>
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: 6, top: 7, width: 11, height: 11, color: "rgba(167,184,169,0.4)" }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            style={{ width: "100%", height: 26, paddingLeft: 22, paddingRight: 6, borderRadius: 6, background: "rgba(13,28,22,0.8)", border: "1px solid rgba(57,91,67,0.3)", color: "#F3FFF3", fontSize: 11, outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, scrollbarWidth: "none" }}>
        {filtered.map(entry => {
          const tick = ticks[entry.symbol];
          const isPos = (tick?.changePct ?? 0) >= 0;
          return (
            <button key={entry.symbol} onClick={() => { onSelect(entry.symbol); onClose(); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", transition: "background 0.08s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(13,28,22,0.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#A7B8A9", flexShrink: 0 }}>
                {entry.badge.slice(0, 4)}
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#F3FFF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.badge}</p>
                <p style={{ margin: 0, fontSize: 8.5, color: "rgba(167,184,169,0.45)" }}>{entry.market}</p>
              </div>
              {tick && tick.price > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: isPos ? "#B7FF5A" : "#ef4444", flexShrink: 0 }}>
                  {isPos ? "+" : ""}{tick.changePct.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 12, textAlign: "center", fontSize: 10, color: "rgba(167,184,169,0.35)" }}>No results</div>
        )}
      </div>
    </div>
  );
}

// ── MiniChart ─────────────────────────────────────────────────────────────────
export interface MiniChartProps {
  defaultSymbol:       string;
  defaultInterval:     string;
  /** When provided, overrides internal interval (timeframe sync mode) */
  syncedInterval?:     string;
  /** When true, hides the symbol/TF header — parent controls symbol via controlledSymbol */
  headerless?:         boolean;
  /** When provided, parent controls the displayed symbol (e.g. from the shared mini control bar) */
  controlledSymbol?:   string;
  /** When provided, parent controls the displayed interval (active-slot TF routing) */
  controlledInterval?: string;
  /** DrawingOverlay, IndicatorRenderer, etc. — passed through to CustomChart's children */
  children?:           React.ReactNode;
  /** Called whenever symbol changes (via header picker, controlledSymbol, etc.) */
  onSymbolChange?:     (sym: string) => void;
  /** Called whenever interval changes (via header pills, controlledInterval, etc.) */
  onIntervalChange?:   (iv: string) => void;
  /** Theme settings — must match the main chart so all panes look identical */
  settings?:           ChartSettings;
}

/**
 * MiniChart — a layout-slot shell.
 *
 * Architecture: this component owns ONLY symbol/interval state and the compact
 * header UI (symbol picker + timeframe pills + live price).  All chart rendering
 * is delegated to <CustomChart symbol={…} interval={…}> so every slot is
 * pixel-identical to the main chart — same LWC config, same plugins, same
 * price-scale engine, same RAF tick path.
 */
const MiniChart = memo(function MiniChart({
  defaultSymbol, defaultInterval, syncedInterval, headerless,
  controlledSymbol, controlledInterval, children,
  onSymbolChange, onIntervalChange, settings,
}: MiniChartProps) {
  const [symbol,     setSymbol]     = useState(defaultSymbol);
  const [interval,   setInterval]   = useState(syncedInterval ?? defaultInterval);
  const [showPicker, setShowPicker] = useState(false);

  const symRef = useRef(symbol);
  const ivRef  = useRef(interval);
  symRef.current = symbol;
  ivRef.current  = interval;

  const ticks      = useTickStore(s => s.ticks);
  const { items }  = useWatchlist();

  // ── Controlled prop syncing ───────────────────────────────────────────────
  useEffect(() => {
    if (syncedInterval && syncedInterval !== ivRef.current) setInterval(syncedInterval);
  }, [syncedInterval]); // eslint-disable-line

  useEffect(() => {
    if (controlledSymbol && controlledSymbol !== symRef.current) setSymbol(controlledSymbol);
  }, [controlledSymbol]); // eslint-disable-line

  useEffect(() => {
    if (controlledInterval && controlledInterval !== ivRef.current) setInterval(controlledInterval);
  }, [controlledInterval]); // eslint-disable-line

  // Notify parent of changes
  useEffect(() => { onSymbolChange?.(symbol); }, [symbol]); // eslint-disable-line
  useEffect(() => { onIntervalChange?.(interval); }, [interval]); // eslint-disable-line

  // ── Derived values for header ─────────────────────────────────────────────
  const entry = items.find(i => i.symbol === symbol) ?? {
    badge:  SYMBOL_CATALOG[symbol]?.badge  ?? symbol.slice(0, 6),
    market: SYMBOL_CATALOG[symbol]?.market ?? "",
  };
  const tick  = ticks[symbol];
  const isPos = (tick?.changePct ?? 0) >= 0;
  const price = tick?.price ?? null;
  const isSynced = !!syncedInterval;

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#07110D", overflow: "hidden" }}>

      {/* ── Compact header — hidden in headerless (mobile) mode ── */}
      {!headerless && (
        <div style={{
          height: 34, display: "flex", alignItems: "center", gap: 5, padding: "0 8px",
          background: "rgba(9,15,11,0.96)", borderBottom: "1px solid rgba(57,91,67,0.2)",
          flexShrink: 0, position: "relative",
        }}>
          {/* Symbol button */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowPicker(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 5, height: 24, padding: "0 7px",
                borderRadius: 7, cursor: "pointer", border: "none",
                background: showPicker ? "rgba(183,255,90,0.1)" : "rgba(13,22,17,0.85)",
                boxShadow: `0 0 0 1px ${showPicker ? "rgba(183,255,90,0.3)" : "rgba(57,91,67,0.3)"}`,
                transition: "all 0.1s",
              }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: "rgba(183,255,90,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, fontWeight: 900, color: "#B7FF5A" }}>
                {entry.badge.slice(0, 4)}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#F3FFF3" }}>{entry.badge}</span>
              <ChevronDown style={{ width: 9, height: 9, color: "rgba(167,184,169,0.4)" }} />
            </button>
            {showPicker && <MiniSymbolPicker onSelect={s => { setSymbol(s); setShowPicker(false); }} onClose={() => setShowPicker(false)} />}
          </div>

          {/* Timeframe pills */}
          <div style={{ display: "flex", gap: 1 }}>
            {TIMEFRAMES.map(tf => {
              const active = tf.value === interval;
              return (
                <button key={tf.value}
                  onClick={() => { if (!isSynced) setInterval(tf.value); }}
                  style={{
                    padding: "0 5px", height: 20, borderRadius: 5, border: "none",
                    cursor: isSynced ? "default" : "pointer",
                    fontSize: 9.5, fontWeight: active ? 800 : 600,
                    background: active ? (isSynced ? "rgba(183,255,90,0.08)" : "rgba(183,255,90,0.12)") : "transparent",
                    color: active ? "#B7FF5A" : "rgba(167,184,169,0.45)",
                    opacity: isSynced && !active ? 0.4 : 1,
                    transition: "all 0.1s",
                  }}
                >{tf.label}</button>
              );
            })}
          </div>

          {/* Live price + sync indicator */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
            {isSynced && (
              <div style={{ width: 18, height: 18, borderRadius: 5, background: "rgba(183,255,90,0.1)", boxShadow: "0 0 0 1px rgba(183,255,90,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Link2 style={{ width: 10, height: 10, color: "#B7FF5A" }} />
              </div>
            )}
            {price !== null && price > 0 && (
              <>
                <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: "monospace", color: "#F3FFF3" }}>
                  {fmtPrice(price, symbol)}
                </span>
                {tick && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: isPos ? "#B7FF5A" : "#ef4444" }}>
                    {isPos ? "+" : ""}{tick.changePct.toFixed(2)}%
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Chart body — identical to the main chart: same CustomChart instance ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <CustomChart symbol={symbol} interval={interval} settings={settings}>
          {children}
        </CustomChart>
      </div>
    </div>
  );
});

export default MiniChart;
