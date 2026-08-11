import { memo, useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Menu, TrendingUp } from "lucide-react";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";
import { useWatchlist, SYMBOL_CATALOG, type WatchlistEntry } from "@/contexts/WatchlistContext";

// ── Symbol icon colors by market ───────────────────────────────────────────
const MARKET_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  Crypto:      { bg: "linear-gradient(135deg,#f7931a,#f4a022)", text: "#fff",   glow: "rgba(247,147,26,0.45)" },
  Forex:       { bg: "linear-gradient(135deg,#3b82f6,#06b6d4)", text: "#fff",   glow: "rgba(59,130,246,0.4)"  },
  Indices:     { bg: "linear-gradient(135deg,#8b5cf6,#a78bfa)", text: "#fff",   glow: "rgba(139,92,246,0.4)"  },
  Commodities: { bg: "linear-gradient(135deg,#eab308,#f59e0b)", text: "#1a1000",glow: "rgba(234,179,8,0.4)"   },
  Other:       { bg: "linear-gradient(135deg,#6b7280,#9ca3af)", text: "#fff",   glow: "rgba(107,114,128,0.3)" },
};

// Special overrides for known symbols
const SYMBOL_OVERRIDES: Record<string, { bg: string; text: string; glow: string }> = {
  BTCUSD:  { bg: "linear-gradient(135deg,#f7931a,#e67e00)", text:"#fff", glow:"rgba(247,147,26,0.55)" },
  ETHUSD:  { bg: "linear-gradient(135deg,#627eea,#8fa0f4)", text:"#fff", glow:"rgba(98,126,234,0.5)"  },
  SOLUSD:  { bg: "linear-gradient(135deg,#9945ff,#14f195)", text:"#fff", glow:"rgba(153,69,255,0.45)" },
  DOGEUSD: { bg: "linear-gradient(135deg,#ba9f33,#e3c44b)", text:"#111", glow:"rgba(186,159,51,0.4)"  },
  PEPEUSD: { bg: "linear-gradient(135deg,#5cb85c,#3aaf3a)", text:"#fff", glow:"rgba(92,184,92,0.4)"   },
  EURUSD:  { bg: "linear-gradient(135deg,#003399,#0052cc)", text:"#fff", glow:"rgba(0,82,204,0.45)"   },
  GBPUSD:  { bg: "linear-gradient(135deg,#cf142b,#0044aa)", text:"#fff", glow:"rgba(207,20,43,0.4)"   },
  GBPJPY:  { bg: "linear-gradient(135deg,#cf142b,#bc002d)", text:"#fff", glow:"rgba(207,20,43,0.4)"   },
  USDJPY:  { bg: "linear-gradient(135deg,#bc002d,#e0002a)", text:"#fff", glow:"rgba(188,0,45,0.4)"    },
  XAUUSD:  { bg: "linear-gradient(135deg,#d4af37,#f5cc5a)", text:"#111", glow:"rgba(212,175,55,0.55)" },
  XAGUSD:  { bg: "linear-gradient(135deg,#aaaaaa,#cccccc)", text:"#111", glow:"rgba(200,200,200,0.4)" },
  NAS100:  { bg: "linear-gradient(135deg,#6366f1,#818cf8)", text:"#fff", glow:"rgba(99,102,241,0.5)"  },
  US30:    { bg: "linear-gradient(135deg,#2563eb,#3b82f6)", text:"#fff", glow:"rgba(37,99,235,0.5)"   },
  SPX500:  { bg: "linear-gradient(135deg,#059669,#10b981)", text:"#fff", glow:"rgba(5,150,105,0.5)"   },
  USOIL:   { bg: "linear-gradient(135deg,#1c1c1c,#333)",   text:"#f59e0b",glow:"rgba(245,158,11,0.4)"},
};

function getIconStyle(symbol: string, market: string) {
  return SYMBOL_OVERRIDES[symbol] ?? MARKET_COLORS[market] ?? MARKET_COLORS.Other;
}

// ── Live price row (RAF-driven DOM mutation for 60fps) ─────────────────────
const LivePriceCell = memo(function LivePriceCell({ symbol }: { symbol: string }) {
  const priceRef = useRef<HTMLSpanElement>(null);
  const changeRef = useRef<HTMLSpanElement>(null);
  const prevTickRef = useRef<{ price: number; changePct: number } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const t = useTickStore.getState().ticks[symbol];
      if (!t) return;
      const prev = prevTickRef.current;
      if (prev && prev.price === t.price && prev.changePct === t.changePct) return;
      prevTickRef.current = { price: t.price, changePct: t.changePct };
      if (priceRef.current)  priceRef.current.textContent = fmtPrice(t.price, symbol);
      if (changeRef.current) {
        const pct = t.changePct;
        changeRef.current.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
        changeRef.current.style.color = pct >= 0 ? "#00e676" : "#ff4d67";
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [symbol]);

  const tick = useTickStore.getState().ticks[symbol];
  const price = tick?.price ?? null;
  const pct   = tick?.changePct ?? 0;
  const isUp  = pct >= 0;

  return (
    <div style={{ textAlign:"right", minWidth:80 }}>
      <div style={{ fontSize:13, fontWeight:600, color:"#e8e8e8", fontVariantNumeric:"tabular-nums", letterSpacing:"-0.01em", lineHeight:1.3 }}>
        <span ref={priceRef}>{price !== null ? fmtPrice(price, symbol) : "—"}</span>
      </div>
      <div style={{ fontSize:11, fontWeight:500, marginTop:2, fontVariantNumeric:"tabular-nums" }}>
        <span ref={changeRef} style={{ color: isUp ? "#00e676" : "#ff4d67" }}>
          {isUp ? "+" : ""}{pct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
});

// ── Symbol icon ────────────────────────────────────────────────────────────
function SymbolIcon({ symbol, badge, market }: { symbol: string; badge: string; market: string }) {
  const style = getIconStyle(symbol, market);
  return (
    <div style={{
      width:36, height:36, borderRadius:"50%", flexShrink:0,
      background: style.bg,
      display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:`0 0 10px ${style.glow}`,
      fontSize: badge.length > 4 ? 7.5 : badge.length > 3 ? 8.5 : badge.length > 2 ? 9.5 : 10.5,
      fontWeight:800, color: style.text,
      letterSpacing:"-0.01em",
    }}>
      {badge.slice(0,5)}
    </div>
  );
}

// ── Single watchlist row ───────────────────────────────────────────────────
const WatchlistRow = memo(function WatchlistRow({
  item, isActive, onSelect,
}: {
  item: WatchlistEntry; isActive: boolean; onSelect: () => void;
}) {
  const cat = SYMBOL_CATALOG[item.symbol];
  const market = cat?.market ?? "Other";

  return (
    <div
      onClick={onSelect}
      style={{
        display:"flex", alignItems:"center", gap:11,
        padding:"9px 14px",
        borderBottom:"1px solid rgba(255,255,255,0.04)",
        cursor:"pointer",
        background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
        WebkitTapHighlightColor:"transparent",
        userSelect:"none",
      }}
      onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.07)"; }}
      onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.background = isActive ? "rgba(255,255,255,0.04)" : "transparent"; }}
    >
      <SymbolIcon symbol={item.symbol} badge={item.badge} market={market} />

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:13.5, fontWeight:600,
          color: isActive ? "#ffffff" : "rgba(255,255,255,0.85)",
          lineHeight:1.25,
          display:"flex", alignItems:"center", gap:6,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        }}>
          {item.badge}
          {isActive && (
            <span style={{
              fontSize:8, fontWeight:700, padding:"1px 5px",
              borderRadius:4, background:"rgba(183,255,90,0.15)",
              color:"#B7FF5A", letterSpacing:"0.05em", flexShrink:0,
            }}>LIVE</span>
          )}
        </div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {item.label}
        </div>
      </div>

      <LivePriceCell symbol={item.symbol} />
    </div>
  );
});


// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  visible:      boolean;
  activeSymbol: string;
  onClose:      () => void;
  onSelect:     (symbol: string) => void;
  onOpenChart:  () => void;
}

// ── Main overlay ───────────────────────────────────────────────────────────
export const MobileWatchlistOverlay = memo(function MobileWatchlistOverlay({
  visible, activeSymbol, onClose, onSelect, onOpenChart,
}: Props) {
  const { items, loading } = useWatchlist();
  const [activeTab, setActiveTab] = useState(0);

  const handleSelect = useCallback((symbol: string) => {
    onSelect(symbol);
    onClose();
  }, [onSelect, onClose]);

  const handleChartTab = useCallback(() => {
    onOpenChart();
    onClose();
  }, [onOpenChart, onClose]);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            style={{
              position:"fixed", inset:0, zIndex:200,
              background:"rgba(0,0,0,0.55)",
              backdropFilter:"blur(6px)",
              WebkitBackdropFilter:"blur(6px)",
            }}
          />

          {/* Overlay panel */}
          <motion.div
            key="panel"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type:"spring", stiffness:340, damping:34, opacity:{ duration:0.18 } }}
            style={{
              position:"fixed", inset:0, zIndex:201,
              display:"flex", flexDirection:"column",
              background:"linear-gradient(180deg, rgba(10,12,10,0.97) 0%, rgba(4,6,4,0.99) 100%)",
              overflow:"hidden",
              willChange:"transform",
              // Green ambient top glow
              boxShadow:"inset 0 0 120px rgba(0,50,20,0.18)",
            }}
          >
            {/* Top ambient gradient */}
            <div style={{
              position:"absolute", top:0, left:0, right:0, height:220, pointerEvents:"none", zIndex:0,
              background:"radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,180,80,0.08) 0%, transparent 100%)",
            }} />

            {/* ── HEADER ── */}
            <div style={{
              height:52, flexShrink:0,
              display:"flex", alignItems:"center",
              padding:"0 12px",
              borderBottom:"1px solid rgba(255,255,255,0.06)",
              zIndex:1,
            }}>
              <button style={{ width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"none", cursor:"pointer", flexShrink:0 }}>
                <Menu style={{ width:18, height:18, color:"rgba(255,255,255,0.55)" }} />
              </button>

              <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{
                    width:22, height:22, borderRadius:6,
                    background:"linear-gradient(135deg,#B7FF5A,#00e676)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <TrendingUp style={{ width:11, height:11, color:"#07110D" }} />
                  </div>
                  <span style={{ fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.85)", letterSpacing:"-0.01em" }}>TradingJournal</span>
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                <button style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Plus style={{ width:14, height:14, color:"rgba(255,255,255,0.65)" }} />
                </button>
                <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.09)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <X style={{ width:13, height:13, color:"rgba(255,255,255,0.5)" }} />
                </button>
              </div>
            </div>

            {/* ── TABS ── */}
            <div style={{
              display:"flex", alignItems:"center", gap:6,
              padding:"8px 14px 6px",
              flexShrink:0, zIndex:1,
            }}>
              {["Watchlist", "+ Add list"].map((label, i) => {
                const isActive = i === activeTab;
                return (
                  <button key={label} onClick={() => setActiveTab(i)} style={{
                    height:28, padding:"0 13px", borderRadius:14, cursor:"pointer",
                    background: isActive ? "rgba(183,255,90,0.12)" : "rgba(255,255,255,0.06)",
                    border:`1px solid ${isActive ? "rgba(183,255,90,0.28)" : "rgba(255,255,255,0.09)"}`,
                    color: isActive ? "#B7FF5A" : "rgba(255,255,255,0.45)",
                    fontSize:12, fontWeight: isActive ? 600 : 400,
                    transition:"all 0.12s",
                  }}>
                    {label}
                  </button>
                );
              })}
              <div style={{ flex:1 }} />
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.22)", fontWeight:500, letterSpacing:"0.03em" }}>Price · Chg%</span>
            </div>

            {/* ── LIST ── */}
            <div style={{
              flex:1, overflowY:"auto", zIndex:1,
              scrollbarWidth:"none",
              WebkitOverflowScrolling:"touch",
            }}>
              {loading ? (
                <div style={{ display:"flex", flexDirection:"column" }}>
                  {Array.from({length:10}).map((_,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.06)", flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ width:56, height:10, borderRadius:3, background:"rgba(255,255,255,0.07)", marginBottom:6 }} />
                        <div style={{ width:80, height:9, borderRadius:3, background:"rgba(255,255,255,0.04)" }} />
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ width:64, height:10, borderRadius:3, background:"rgba(255,255,255,0.07)", marginBottom:6, marginLeft:"auto" }} />
                        <div style={{ width:44, height:9, borderRadius:3, background:"rgba(255,255,255,0.04)", marginLeft:"auto" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                items.map(item => (
                  <WatchlistRow
                    key={item.symbol}
                    item={item}
                    isActive={item.symbol === activeSymbol}
                    onSelect={() => handleSelect(item.symbol)}
                  />
                ))
              )}

              {/* Bottom space for nav */}
              <div style={{ height:24 }} />
            </div>

            {/* ── BOTTOM NAV ── */}
            <MobileBottomNav />

          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
});
