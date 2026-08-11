import { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Star, Plus, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AnimatedList, AnimatedListItem } from "@/components/animations";

// ── Label helpers ─────────────────────────────────────────────────────────────
export function tfLabel(value: string): string {
  const MAP: Record<string, string> = {
    "1":"1m","2":"2m","3":"3m","5":"5m","10":"10m","12":"12m",
    "15":"15m","20":"20m","30":"30m","45":"45m",
    "60":"1H","90":"90m","120":"2H","180":"3H","240":"4H",
    "360":"6H","480":"8H","720":"12H",
    "D":"1D","W":"1W","M":"1M",
  };
  return MAP[value] ?? value;
}

function parseCustom(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d+)\s*(s|m|h|d|w)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 0) return null;
  const unit = (m[2] ?? "m").toLowerCase();
  if (unit === "s") return null;
  if (unit === "m") return String(n);
  if (unit === "h") return n === 1 ? "60" : String(n * 60);
  if (unit === "d") return n === 1 ? "D" : String(n * 1440);
  if (unit === "w") return n === 1 ? "W" : String(n * 10080);
  return null;
}

interface TFItem   { label: string; value: string }
interface TFSection{ title: string; items: TFItem[] }

const ALL_SECTIONS: TFSection[] = [
  {
    title: "MINUTES",
    items: [
      { label: "1 minute",   value: "1"  },
      { label: "2 minutes",  value: "2"  },
      { label: "3 minutes",  value: "3"  },
      { label: "5 minutes",  value: "5"  },
      { label: "10 minutes", value: "10" },
      { label: "15 minutes", value: "15" },
      { label: "30 minutes", value: "30" },
      { label: "45 minutes", value: "45" },
    ],
  },
  {
    title: "HOURS",
    items: [
      { label: "1 hour",  value: "60"  },
      { label: "2 hours", value: "120" },
      { label: "3 hours", value: "180" },
      { label: "4 hours", value: "240" },
    ],
  },
  {
    title: "DAYS",
    items: [{ label: "1 day", value: "D" }],
  },
  {
    title: "WEEKS",
    items: [{ label: "1 week", value: "W" }],
  },
];

const ALL_VALUES = new Set(ALL_SECTIONS.flatMap(s => s.items.map(i => i.value)));

// ── Canonical timeframe sort order ────────────────────────────────────────────
const TF_ORDER: Record<string, number> = {
  "1":1,"2":2,"3":3,"5":4,"10":5,"12":6,
  "15":7,"20":8,"30":9,"45":10,
  "60":11,"90":12,"120":13,"180":14,"240":15,
  "360":16,"480":17,"720":18,
  "D":19,"W":20,"M":21,
};

export function sortTFs(favs: string[]): string[] {
  return [...new Set(favs)].sort((a, b) => (TF_ORDER[a] ?? 999) - (TF_ORDER[b] ?? 999));
}

function SmallBtn({ onClick, children, title, active = false }: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background:   active ? "rgba(183,255,90,0.15)" : "transparent",
        border:       "none",
        cursor:       "pointer",
        padding:      "3px 4px",
        borderRadius: 4,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        color:        active ? "#B7FF5A" : "rgba(167,184,169,0.35)",
        transition:   "color 0.15s, background 0.15s",
        flexShrink:   0,
        touchAction:  "manipulation",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.8)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.35)"; }}
    >
      {children}
    </button>
  );
}

export function TFDropdown({
  interval,
  favorites,
  onSelect,
  onFavoritesChange,
}: {
  interval:          string;
  favorites:         string[];
  onSelect:          (v: string) => void;
  onFavoritesChange: (favs: string[]) => void;
}) {
  const [open,       setOpen]       = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customVal,  setCustomVal]  = useState("");
  const [customErr,  setCustomErr]  = useState(false);
  const [panelPos,   setPanelPos]   = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCustomMode(false);
    setCustomVal("");
    setCustomErr(false);
  }, []);

  const openDropdown = useCallback(() => {
    if (open) { close(); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const PANEL_W = 224;
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - PANEL_W - 8));
      setPanelPos({ top: rect.bottom + 6, left });
    }
    setOpen(true);
  }, [open, close]);

  // Close on outside pointer-down (works for touch + mouse)
  useEffect(() => {
    if (!open) return;
    const handle = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", handle, { capture: true });
    return () => document.removeEventListener("pointerdown", handle, { capture: true });
  }, [open, close]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const PANEL_W = 224;
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - PANEL_W - 8));
      setPanelPos({ top: rect.bottom + 6, left });
    };
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    window.addEventListener("resize", reposition, { passive: true });
    return () => {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (customMode) setTimeout(() => inputRef.current?.focus(), 30);
  }, [customMode]);

  const toggleFav = useCallback((value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = favorites.includes(value)
      ? favorites.filter(f => f !== value)
      : sortTFs([...favorites, value]);
    onFavoritesChange(next);
  }, [favorites, onFavoritesChange]);

  const selectAndClose = useCallback((v: string) => {
    onSelect(v);
    close();
  }, [onSelect, close]);

  const submitCustom = useCallback(() => {
    const parsed = parseCustom(customVal);
    if (!parsed) { setCustomErr(true); return; }
    if (!favorites.includes(parsed)) onFavoritesChange(sortTFs([...favorites, parsed]));
    selectAndClose(parsed);
  }, [customVal, favorites, onFavoritesChange, selectAndClose]);

  const panel = open && panelPos ? createPortal(
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        style={{
          position:     "fixed",
          top:          panelPos.top,
          left:         panelPos.left,
          width:        224,
          background:   "#0C1512",
          border:       "1px solid rgba(183,255,90,0.10)",
          borderRadius: 12,
          boxShadow:    "0 8px 30px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.3)",
          zIndex:       999999,
          overflow:     "hidden",
          pointerEvents: "auto",
        }}
      >
        {/* Custom interval row */}
        <div style={{ padding: "10px 12px 9px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {customMode ? (
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <input
                ref={inputRef}
                value={customVal}
                onChange={e => { setCustomVal(e.target.value); setCustomErr(false); }}
                onKeyDown={e => {
                  if (e.key === "Enter") submitCustom();
                  if (e.key === "Escape") { setCustomMode(false); setCustomVal(""); setCustomErr(false); }
                }}
                placeholder="2m, 4h, 1D…"
                style={{
                  flex: 1, height: 26, borderRadius: 5, fontSize: 11,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${customErr ? "rgba(239,68,68,0.6)" : "rgba(183,255,90,0.25)"}`,
                  color: customErr ? "#f87171" : "#E8F0E8",
                  padding: "0 8px", outline: "none",
                  fontFamily: "monospace", letterSpacing: "0.02em",
                }}
              />
              <button
                onClick={submitCustom}
                style={{
                  height: 26, padding: "0 9px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                  background: "#B7FF5A", color: "#0F1618", border: "none", cursor: "pointer", flexShrink: 0,
                  touchAction: "manipulation",
                }}
              >
                <Check style={{ width: 11, height: 11 }} />
              </button>
              <SmallBtn onClick={() => { setCustomMode(false); setCustomVal(""); setCustomErr(false); }}>
                <X style={{ width: 11, height: 11 }} />
              </SmallBtn>
            </div>
          ) : (
            <button
              onClick={() => setCustomMode(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", padding: "3px 2px",
                background: "transparent", border: "none",
                color: "rgba(183,255,90,0.65)", fontSize: 11, fontWeight: 600,
                cursor: "pointer", letterSpacing: "0.01em", transition: "color 0.15s",
                touchAction: "manipulation",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#B7FF5A"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(183,255,90,0.65)"; }}
            >
              <Plus style={{ width: 11, height: 11 }} />
              Add custom interval…
            </button>
          )}
        </div>

        {/* Scrollable sections */}
        <div style={{
          maxHeight: 360, overflowY: "auto", paddingBottom: 6,
          scrollbarWidth: "thin", scrollbarColor: "rgba(183,255,90,0.15) transparent",
        }}>
          <AnimatedList>
            {ALL_SECTIONS.map(section => (
              <AnimatedListItem key={section.title}>
                <div key={section.title}>
                  <div style={{
                    padding: "9px 12px 3px", fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.1em", color: "rgba(167,184,169,0.38)", userSelect: "none",
                  }}>
                    {section.title}
                  </div>
                  {section.items.map(item => (
                    <TFRow
                      key={item.value}
                      item={item}
                      isActive={item.value === interval}
                      isFav={favorites.includes(item.value)}
                      onSelect={selectAndClose}
                      onToggleFav={toggleFav}
                    />
                  ))}
                </div>
              </AnimatedListItem>
            ))}
          </AnimatedList>

          {favorites.filter(f => !ALL_VALUES.has(f)).length > 0 && (
            <div>
              <div style={{
                padding: "9px 12px 3px", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.1em", color: "rgba(167,184,169,0.38)", userSelect: "none",
              }}>
                CUSTOM
              </div>
              <AnimatedList>
                {favorites
                  .filter(f => !ALL_VALUES.has(f))
                  .map(f => (
                    <AnimatedListItem key={f}>
                      <TFRow
                        key={f}
                        item={{ label: tfLabel(f), value: f }}
                        isActive={f === interval}
                        isFav={true}
                        onSelect={selectAndClose}
                        onToggleFav={toggleFav}
                      />
                    </AnimatedListItem>
                  ))}
              </AnimatedList>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  ) : null;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        onClick={openDropdown}
        title="More timeframes"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 2, width: 22, height: 26, borderRadius: 5, fontSize: 11,
          background: open ? "rgba(183,255,90,0.10)" : "transparent",
          color: open ? "#B7FF5A" : "rgba(211,222,218,0.65)",
          border: `1px solid ${open ? "rgba(183,255,90,0.28)" : "rgba(211,222,218,0.10)"}`,
          cursor: "pointer", transition: "all 0.15s",
          touchAction: "manipulation",
        }}
        onMouseEnter={e => { if (!open) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(171,185,182,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#e8f0e8"; } }}
        onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(211,222,218,0.65)"; } }}
      >
        <ChevronDown style={{
          width: 11, height: 11,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }} />
      </button>
      {panel}
    </div>
  );
}

const TFRow = memo(function TFRow({
  item, isActive, isFav, onSelect, onToggleFav,
}: {
  item:         TFItem;
  isActive:     boolean;
  isFav:        boolean;
  onSelect:     (v: string) => void;
  onToggleFav:  (v: string, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(item.value)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 10px 0 12px", height: 32, cursor: "pointer",
        background: isActive
          ? "rgba(183,255,90,0.10)"
          : hovered ? "rgba(255,255,255,0.03)" : "transparent",
        transition: "background 0.1s",
        touchAction: "manipulation",
      }}
    >
      <span style={{
        fontSize: 12, fontWeight: isActive ? 700 : 400,
        color: isActive ? "#B7FF5A" : "rgba(211,222,218,0.85)",
        userSelect: "none",
      }}>
        {item.label}
      </span>
      <SmallBtn
        onClick={e => onToggleFav(item.value, e)}
        active={isFav}
        title={isFav ? "Remove from top bar" : "Pin to top bar"}
      >
        <Star style={{ width: 12, height: 12 }} fill={isFav ? "#B7FF5A" : "none"} strokeWidth={1.8} />
      </SmallBtn>
    </div>
  );
});
