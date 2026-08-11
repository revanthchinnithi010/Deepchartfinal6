import { useState, useEffect, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import {
  Bell, Plus, X, Search, Play, Pause, Trash2, Edit2,
  Target, Layers, GitBranch, TrendingUp, TrendingDown,
  ChevronDown, Clock, CheckCircle2, AlertTriangle, Minus,
} from "lucide-react";
import { toast } from "sonner";
import {
  TIMEFRAMES,
  type AnyAlert, type AlertStatus, type AlertType,
  type PriceAlert, type ZoneAlert, type TrendlineAlert,
} from "@/data/alertsData";
import { useAlertStore } from "@/store/alertStore";
import { useWatchlist, type WatchlistEntry, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<AlertStatus, { label: string; dot: string; text: string; bg: string }> = {
  active:    { label: "Active",    dot: "#60a5fa", text: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  triggered: { label: "Triggered", dot: "#B7FF5A", text: "#B7FF5A", bg: "rgba(183,255,90,0.12)"  },
  paused:    { label: "Paused",    dot: "#FFC857", text: "#FFC857", bg: "rgba(255,200,87,0.12)"  },
  expired:   { label: "Expired",   dot: "#9ca3af", text: "#9ca3af", bg: "rgba(156,163,175,0.10)" },
};

const TYPE_CFG: Record<AlertType, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  price:     { label: "Price",     Icon: Target,    color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  zone:      { label: "Zone",      Icon: Layers,    color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
  trendline: { label: "Trendline", Icon: GitBranch, color: "#B7FF5A", bg: "rgba(183,255,90,0.12)"  },
};

function fmtAlertDesc(a: AnyAlert): string {
  if (a.type === "price") {
    const cond = a.condition === "above" ? "↑ Above" : a.condition === "below" ? "↓ Below" : "⟷ Touch";
    return `${cond} ${a.targetPrice.toLocaleString()}`;
  }
  if (a.type === "zone") {
    return `${a.lowerPrice.toLocaleString()} – ${a.upperPrice.toLocaleString()}`;
  }
  if (a.type === "trendline") {
    return `${a.point1Price.toLocaleString()} → ${a.point2Price.toLocaleString()}`;
  }
  return "";
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function getTimeframe(a: AnyAlert): string {
  if (a.type === "price") return "—";
  return (a as ZoneAlert | TrendlineAlert).timeframe ?? "—";
}

function getConditionLabel(a: AnyAlert): string {
  const c = a.condition;
  const map: Record<string, string> = {
    above: "Price Above", below: "Price Below", touch: "Touch",
    break: "Breakout", retest: "Retest",
  };
  return map[c] ?? c;
}

// ── Small UI atoms ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AlertStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 20,
      background: cfg.bg, color: cfg.text,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
      border: `1px solid ${cfg.text}25`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0,
        ...(status === "active" ? { animation: "acPulse 1.8s ease-in-out infinite" } : {}),
      }} />
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: AlertType }) {
  const cfg = TYPE_CFG[type];
  const { Icon } = cfg;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 6,
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 700,
    }}>
      <Icon style={{ width: 10, height: 10 }} />
      {cfg.label}
    </span>
  );
}

function ActionBtn({
  label, bg, color, icon: Icon, onClick, title,
}: {
  label?: string; bg: string; color: string;
  icon: React.ElementType; onClick: () => void; title: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: label ? "4px 9px" : "4px 7px",
        borderRadius: 7, border: "none", cursor: "pointer",
        background: hov ? bg.replace("0.12", "0.22") : bg,
        color, fontSize: 10, fontWeight: 700,
        transition: "background 0.15s",
      }}
    >
      <Icon style={{ width: 11, height: 11 }} />
      {label}
    </button>
  );
}

// ── Alert Card ─────────────────────────────────────────────────────────────────
const AlertCard = memo(function AlertCard({
  alert, onPause, onResume, onDelete, onEdit, triggering,
}: {
  alert: AnyAlert;
  onPause: () => void; onResume: () => void;
  onDelete: () => void; onEdit: () => void;
  triggering: boolean;
}) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: triggering
          ? "rgba(183,255,90,0.06)"
          : hov ? "rgba(255,255,255,0.025)" : "transparent",
        transition: "background 0.15s",
        animation: triggering ? "acGlow 0.8s ease-out" : undefined,
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {/* Symbol */}
        <span style={{
          fontSize: 13, fontWeight: 800, color: "#F3FFF3",
          fontFamily: "monospace",
        }}>
          {alert.symbol}
        </span>

        <TypeBadge type={alert.type} />
        <StatusBadge status={alert.status} />

        <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(167,184,169,0.4)", flexShrink: 0 }}>
          <Clock style={{ width: 10, height: 10, display: "inline", marginRight: 3, verticalAlign: "middle" }} />
          {fmtTime(alert.createdAt)}
        </span>
      </div>

      {/* Detail row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, color: "rgba(167,184,169,0.55)", fontWeight: 600 }}>
              {getConditionLabel(alert)}
            </span>
            <span style={{ fontSize: 11, color: "#D3DEDA", fontWeight: 700, fontFamily: "monospace" }}>
              {fmtAlertDesc(alert)}
            </span>
            {getTimeframe(alert) !== "—" && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: "rgba(167,184,169,0.4)",
                background: "rgba(57,91,67,0.2)", borderRadius: 4, padding: "1px 5px",
              }}>
                {getTimeframe(alert)}
              </span>
            )}
          </div>
          {alert.notes && (
            <p style={{
              margin: 0, fontSize: 10, color: "rgba(167,184,169,0.45)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {alert.notes}
            </p>
          )}
          {alert.status === "triggered" && alert.triggeredAt && (
            <p style={{ margin: "3px 0 0", fontSize: 9.5, color: "#B7FF5A", fontWeight: 700 }}>
              <CheckCircle2 style={{ width: 10, height: 10, display: "inline", marginRight: 3, verticalAlign: "middle" }} />
              Triggered {fmtTime(alert.triggeredAt)}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {alert.status === "paused" && (
          <ActionBtn
            title="Resume alert"
            icon={Play}
            label="Resume"
            bg="rgba(183,255,90,0.12)"
            color="#B7FF5A"
            onClick={onResume}
          />
        )}
        {(alert.status === "active" || alert.status === "triggered") && (
          <ActionBtn
            title="Pause alert"
            icon={Pause}
            label="Pause"
            bg="rgba(255,200,0,0.12)"
            color="#FFC857"
            onClick={onPause}
          />
        )}
        <ActionBtn
          title="Edit alert"
          icon={Edit2}
          label="Edit"
          bg="rgba(171,185,182,0.10)"
          color="#D3DEDA"
          onClick={onEdit}
        />
        <ActionBtn
          title="Delete alert"
          icon={Trash2}
          label="Delete"
          bg="rgba(255,80,80,0.12)"
          color="#FF5C5C"
          onClick={onDelete}
        />
      </div>
    </div>
  );
});

// ── Edit Modal (inline sub-modal) ──────────────────────────────────────────────
function EditAlertModal({
  alert, onClose, onSave,
}: { alert: AnyAlert; onClose: () => void; onSave: (updated: AnyAlert) => void }) {
  const [notes, setNotes] = useState(alert.notes);
  const [status, setStatus] = useState<AlertStatus>(alert.status);

  const handleSave = () => {
    onSave({ ...alert, notes, status });
    onClose();
  };

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
      }}
    >
      <div style={{
        width: 380, borderRadius: 16,
        background: "#0F1618",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        padding: 20,
        animation: "acFadeScale 0.22s ease-out",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: "rgba(183,255,90,0.1)", boxShadow: "0 0 0 1px rgba(183,255,90,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10,
          }}>
            <Edit2 style={{ width: 14, height: 14, color: "#B7FF5A" }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#F3FFF3" }}>Edit Alert</p>
            <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.45)" }}>
              {alert.symbol} · {TYPE_CFG[alert.type].label}
            </p>
          </div>
          <button onClick={onClose} style={{
            marginLeft: "auto", width: 28, height: 28, borderRadius: 8,
            border: "none", background: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X style={{ width: 14, height: 14, color: "rgba(167,184,169,0.4)" }} />
          </button>
        </div>

        {/* Status */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "rgba(167,184,169,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</p>
          <div style={{ display: "flex", gap: 6 }}>
            {(["active", "paused", "expired"] as AlertStatus[]).map(s => {
              const cfg = STATUS_CFG[s];
              const active = status === s;
              return (
                <button key={s} onClick={() => setStatus(s)} style={{
                  flex: 1, padding: "6px 4px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${active ? cfg.text + "50" : "rgba(255,255,255,0.06)"}`,
                  background: active ? cfg.bg : "transparent",
                  color: active ? cfg.text : "rgba(167,184,169,0.5)",
                  fontSize: 10, fontWeight: 700, transition: "all 0.12s",
                }}>
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "rgba(167,184,169,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Notes</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Alert notes..."
            style={{
              width: "100%", padding: "8px 10px", boxSizing: "border-box",
              borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)", color: "#F3FFF3",
              fontSize: 11, resize: "none", outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "8px 0", borderRadius: 9, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "transparent", color: "rgba(167,184,169,0.55)",
            fontSize: 11, fontWeight: 700,
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "8px 0", borderRadius: 9, cursor: "pointer",
            border: "none",
            background: "rgba(183,255,90,0.15)", color: "#B7FF5A",
            fontSize: 11, fontWeight: 700,
          }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ── Watchlist Symbol Picker ────────────────────────────────────────────────────
const MARKET_ORDER = ["Favorites", "Crypto", "Forex", "Indices", "Commodities", "Stocks", "Recently Viewed", "Other"] as const;

function WatchlistSymbolPicker({
  value, onChange,
}: { value: string; onChange: (sym: string) => void }) {
  const { items } = useWatchlist();
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => searchRef.current?.focus(), 60);
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered: WatchlistEntry[] = items.filter(it => {
    if (!q) return true;
    return (
      it.symbol.toLowerCase().includes(q) ||
      it.label.toLowerCase().includes(q) ||
      it.badge.toLowerCase().includes(q)
    );
  });

  const grouped = MARKET_ORDER.reduce<Record<string, WatchlistEntry[]>>((acc, mkt) => {
    const group = filtered.filter(it => {
      if (mkt === "Favorites") return it.isFavorite;
      return it.market === mkt && !it.isFavorite;
    });
    if (group.length) acc[mkt] = group;
    return acc;
  }, {});

  const currentLabel = (() => {
    const found = items.find(it => it.symbol === value);
    if (found) return found.badge || found.symbol;
    const cat = SYMBOL_CATALOG[value];
    return cat ? cat.badge || value : value;
  })();

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        style={{
          width: "100%", height: 34, padding: "0 10px",
          boxSizing: "border-box", borderRadius: 8,
          border: `1px solid ${open ? "rgba(183,255,90,0.35)" : "rgba(255,255,255,0.08)"}`,
          background: "rgba(255,255,255,0.04)", color: "#F3FFF3",
          fontSize: 11, outline: "none", fontFamily: "inherit",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "border-color 0.15s",
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: "0.03em" }}>{currentLabel || value}</span>
        <ChevronDown style={{
          width: 12, height: 12, color: "rgba(167,184,169,0.45)",
          transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s",
          flexShrink: 0,
        }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          zIndex: 2000, borderRadius: 10,
          background: "#0D1416", border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
          maxHeight: 280, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px 8px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.04)", borderRadius: 7,
              padding: "4px 8px", border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <Search style={{ width: 11, height: 11, color: "rgba(167,184,169,0.4)", flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search symbols…"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#F3FFF3", fontSize: 11, fontFamily: "inherit",
                }}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} style={{
                  background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 1,
                }}>
                  <X style={{ width: 10, height: 10, color: "rgba(167,184,169,0.4)" }} />
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {Object.keys(grouped).length === 0 ? (
              <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 11, color: "rgba(167,184,169,0.4)" }}>
                No symbols found
              </div>
            ) : Object.entries(grouped).map(([mkt, syms]) => (
              <div key={mkt}>
                <div style={{
                  padding: "6px 10px 3px", fontSize: 9, fontWeight: 800,
                  color: "rgba(167,184,169,0.35)", letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>
                  {mkt === "Favorites" ? "⭐ Favorites" : mkt}
                </div>
                {syms.map(it => (
                  <button
                    key={it.id}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      onChange(it.symbol);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px", border: "none", background: "transparent",
                      cursor: "pointer", textAlign: "left",
                      backgroundColor: it.symbol === value ? "rgba(183,255,90,0.07)" : "transparent",
                      borderLeft: it.symbol === value ? "2px solid rgba(183,255,90,0.5)" : "2px solid transparent",
                    }}
                    onMouseEnter={e => { if (it.symbol !== value) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = it.symbol === value ? "rgba(183,255,90,0.07)" : "transparent"; }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 800, color: "rgba(167,184,169,0.5)",
                      background: "rgba(255,255,255,0.06)", borderRadius: 4,
                      padding: "1px 5px", minWidth: 28, textAlign: "center", flexShrink: 0,
                    }}>{it.badge}</span>
                    <span style={{ fontSize: 11, fontWeight: it.symbol === value ? 700 : 500, color: "#F3FFF3", flex: 1 }}>{it.label}</span>
                    {it.symbol === value && (
                      <CheckCircle2 style={{ width: 11, height: 11, color: "#B7FF5A", flexShrink: 0 }} />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Alert sub-modal ─────────────────────────────────────────────────────
function QuickCreateModal({
  onClose, onSave,
}: { onClose: () => void; onSave: (a: AnyAlert) => void }) {
  const { items: wlItems } = useWatchlist();
  const [step, setStep] = useState<"pick" | "price" | "zone" | "trendline">("pick");
  const defaultSymbol = wlItems[0]?.symbol ?? "NAS100";
  const [form, setForm] = useState({
    symbol: defaultSymbol, condition: "above" as string,
    targetPrice: "", notes: "", timeframe: "1H",
    upperPrice: "", lowerPrice: "", zoneType: "supply", zoneCondition: "touch",
    p1Price: "", p2Price: "", trendlineCondition: "touch",
  });

  const handleCreate = () => {
    if (step === "price") {
      if (!form.targetPrice) return;
      onSave({
        id: `pa${Date.now()}`, type: "price",
        symbol: form.symbol, condition: form.condition as PriceAlert["condition"],
        targetPrice: parseFloat(form.targetPrice), currentPrice: 0,
        notes: form.notes, status: "active",
        expiry: null, createdAt: new Date().toISOString(), triggeredAt: null,
      });
    } else if (step === "zone") {
      if (!form.upperPrice || !form.lowerPrice) return;
      onSave({
        id: `za${Date.now()}`, type: "zone",
        symbol: form.symbol, zoneType: form.zoneType as ZoneAlert["zoneType"],
        upperPrice: parseFloat(form.upperPrice), lowerPrice: parseFloat(form.lowerPrice),
        timeframe: form.timeframe, condition: form.zoneCondition as ZoneAlert["condition"],
        notes: form.notes, status: "active",
        createdAt: new Date().toISOString(), triggeredAt: null,
      });
    } else if (step === "trendline") {
      if (!form.p1Price || !form.p2Price) return;
      onSave({
        id: `ta${Date.now()}`, type: "trendline",
        symbol: form.symbol, timeframe: form.timeframe,
        point1Price: parseFloat(form.p1Price), point1Time: new Date().toISOString(),
        point2Price: parseFloat(form.p2Price), point2Time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        condition: form.trendlineCondition as TrendlineAlert["condition"],
        notes: form.notes, status: "active",
        createdAt: new Date().toISOString(), triggeredAt: null,
      });
    }
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 34, padding: "0 10px", boxSizing: "border-box",
    borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)", color: "#F3FFF3",
    fontSize: 11, outline: "none", fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    margin: "0 0 5px", fontSize: 10, fontWeight: 700,
    color: "rgba(167,184,169,0.5)", textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: "fixed", inset: 0, zIndex: 1100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
    }}>
      <div style={{
        width: 400, borderRadius: 16,
        background: "#0F1618", border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)", padding: 20,
        animation: "acFadeScale 0.22s ease-out",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: "rgba(183,255,90,0.1)",
            boxShadow: "0 0 0 1px rgba(183,255,90,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10,
          }}>
            <Plus style={{ width: 14, height: 14, color: "#B7FF5A" }} />
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#F3FFF3" }}>
            {step === "pick" ? "Create Alert" : `New ${step.charAt(0).toUpperCase() + step.slice(1)} Alert`}
          </p>
          <button onClick={onClose} style={{
            marginLeft: "auto", width: 28, height: 28, borderRadius: 8,
            border: "none", background: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X style={{ width: 14, height: 14, color: "rgba(167,184,169,0.4)" }} />
          </button>
        </div>

        {step === "pick" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "rgba(167,184,169,0.5)" }}>Choose alert type:</p>
            {([
              { key: "price",     label: "Price Alert",     Icon: Target,    color: "#60a5fa", desc: "Trigger when price hits a level" },
              { key: "zone",      label: "Zone Alert",      Icon: Layers,    color: "#fb923c", desc: "Trigger when price enters a zone" },
              { key: "trendline", label: "Trendline Alert", Icon: GitBranch, color: "#B7FF5A", desc: "Trigger on trendline interaction" },
            ] as const).map(({ key, label, Icon, color, desc }) => (
              <button key={key} onClick={() => setStep(key)} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
                transition: "all 0.12s", textAlign: "left",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)"; }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon style={{ width: 15, height: 15, color }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#F3FFF3" }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.45)" }}>{desc}</p>
                </div>
                <ChevronDown style={{ width: 14, height: 14, color: "rgba(167,184,169,0.3)", marginLeft: "auto", transform: "rotate(-90deg)" }} />
              </button>
            ))}
          </div>
        )}

        {step !== "pick" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Symbol + TF */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <p style={labelStyle}>Symbol</p>
                <WatchlistSymbolPicker
                  value={form.symbol}
                  onChange={sym => setForm(f => ({ ...f, symbol: sym }))}
                />
              </div>
              {step !== "price" && (
                <div>
                  <p style={labelStyle}>Timeframe</p>
                  <select value={form.timeframe} onChange={e => setForm(f => ({ ...f, timeframe: e.target.value }))} style={{ ...inputStyle }}>
                    {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>

            {step === "price" && (
              <>
                <div>
                  <p style={labelStyle}>Condition</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([
                      ["above", "Above"], ["below", "Below"], ["touch", "Touch"],
                      ["percent_up", "% Up"], ["percent_down", "% Down"],
                    ] as const).map(([c, label]) => (
                      <button key={c} onClick={() => setForm(f => ({ ...f, condition: c }))} style={{
                        flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${form.condition === c ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.06)"}`,
                        background: form.condition === c ? "rgba(96,165,250,0.15)" : "transparent",
                        color: form.condition === c ? "#60a5fa" : "rgba(167,184,169,0.5)",
                        fontSize: 10, fontWeight: 700, textTransform: "capitalize",
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p style={labelStyle}>{form.condition.startsWith("percent_") ? "Target Change (%)" : "Target Price"}</p>
                  <input type="number" step={form.condition.startsWith("percent_") ? "0.1" : undefined} placeholder={form.condition.startsWith("percent_") ? "e.g. 2.5" : "e.g. 18750"} value={form.targetPrice}
                    onChange={e => setForm(f => ({ ...f, targetPrice: e.target.value }))}
                    style={inputStyle} />
                </div>
              </>
            )}

            {step === "zone" && (
              <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={labelStyle}>Upper Price</p>
                  <input type="number" placeholder="Upper" value={form.upperPrice}
                    onChange={e => setForm(f => ({ ...f, upperPrice: e.target.value }))}
                    style={inputStyle} />
                </div>
                <div>
                  <p style={labelStyle}>Lower Price</p>
                  <input type="number" placeholder="Lower" value={form.lowerPrice}
                    onChange={e => setForm(f => ({ ...f, lowerPrice: e.target.value }))}
                    style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <p style={labelStyle}>Condition</p>
                <select value={form.zoneCondition} onChange={e => setForm(f => ({ ...f, zoneCondition: e.target.value }))} style={{ ...inputStyle }}>
                  {(["enter", "touch", "break", "retest"] as const).map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                </select>
              </div>
              </>
            )}

            {step === "trendline" && (
              <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={labelStyle}>Point 1 Price</p>
                  <input type="number" placeholder="e.g. 18100" value={form.p1Price}
                    onChange={e => setForm(f => ({ ...f, p1Price: e.target.value }))}
                    style={inputStyle} />
                </div>
                <div>
                  <p style={labelStyle}>Point 2 Price</p>
                  <input type="number" placeholder="e.g. 18500" value={form.p2Price}
                    onChange={e => setForm(f => ({ ...f, p2Price: e.target.value }))}
                    style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <p style={labelStyle}>Condition</p>
                <select value={form.trendlineCondition} onChange={e => setForm(f => ({ ...f, trendlineCondition: e.target.value }))} style={{ ...inputStyle }}>
                  {(["touch", "break", "retest", "cross_above", "cross_below", "rejection", "atr_proximity"] as const).map(c => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
                </select>
              </div>
              </>
            )}

            <div>
              <p style={labelStyle}>Notes (optional)</p>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Alert notes..."
                style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "none" }} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button onClick={() => setStep("pick")} style={{
                flex: 1, padding: "8px 0", borderRadius: 9, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.08)", background: "transparent",
                color: "rgba(167,184,169,0.55)", fontSize: 11, fontWeight: 700,
              }}>Back</button>
              <button onClick={handleCreate} style={{
                flex: 2, padding: "8px 0", borderRadius: 9, cursor: "pointer",
                border: "none", background: "rgba(183,255,90,0.15)",
                color: "#B7FF5A", fontSize: 11, fontWeight: 700,
              }}>Create Alert</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Alert Sheet Content (mobile BottomSheet body) ─────────────────────────────
// Used by AlertSheet in MobileChartLayout — no portal/backdrop/animation wrapper.
// All sub-components (AlertCard, EditAlertModal, QuickCreateModal) are reused.
export function AlertSheetContent({ onClose: _onClose }: { onClose: () => void }) {
  const { alerts, addAlert, updateAlert, deleteAlert: storeDelete, hydrateFromApi } = useAlertStore();
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    void hydrateFromApi();
  }, [hydrateFromApi]);
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState<AnyAlert | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const filtered = alerts.filter(a => {
    if (filter !== "all" && a.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.symbol.toLowerCase().includes(q) ||
      a.type.includes(q) ||
      a.condition.includes(q) ||
      (a.notes || "").toLowerCase().includes(q)
    );
  });

  const handlePause  = useCallback((id: string) => {
    updateAlert(id, { status: "paused" as AlertStatus });
    toast.info("Alert paused", { description: "Alert will no longer trigger until resumed." });
  }, [updateAlert]);

  const handleResume = useCallback((id: string) => {
    updateAlert(id, { status: "active" as AlertStatus });
    toast.success("Alert resumed", { description: "Alert engine restarted." });
  }, [updateAlert]);

  const handleDelete = useCallback((id: string, symbol: string) => {
    storeDelete(id);
    toast.error("Alert deleted", { description: `${symbol} alert removed.` });
  }, [storeDelete]);

  const handleSaveEdit = useCallback((updated: AnyAlert) => {
    updateAlert(updated.id, updated);
    toast.success("Alert updated");
  }, [updateAlert]);

  const handleCreate = useCallback(async (a: AnyAlert) => {
    const saved = await persistAnyAlertToDb(a);
    if (!saved) {
      toast.error("Alert not saved", { description: "Could not save the alert to the database." });
      return;
    }
    addAlert(saved);
    setTriggeringId(saved.id);
    setTimeout(() => setTriggeringId(null), 1200);
    toast.success("Alert created", { description: `${saved.symbol} ${saved.type} alert is now active.` });
  }, [addAlert]);

  const counts = {
    all: alerts.length,
    active: alerts.filter(a => a.status === "active").length,
    triggered: alerts.filter(a => a.status === "triggered").length,
    paused: alerts.filter(a => a.status === "paused").length,
    expired: alerts.filter(a => a.status === "expired").length,
  };

  const STICKY_BG = "linear-gradient(170deg,rgba(11,25,19,0.99)0%,rgba(8,18,14,0.99)100%)";

  return (
    <>
      {/* Keyframes for AlertCard animations and sub-modal entry */}
      <style>{`
        @keyframes acPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes acGlow { 0% { background: rgba(183,255,90,0.18); } 100% { background: transparent; } }
        @keyframes acFadeScale { from { opacity: 0; transform: scale(0.985) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      {/* ── Sticky header: summary + Create button + Search + Filters ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 2,
        background: STICKY_BG,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* Summary + Create */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 8px" }}>
          <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.4)" }}>
            {counts.active} active · {counts.triggered} triggered · {counts.paused} paused
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 9, cursor: "pointer",
              border: "1px solid rgba(183,255,90,0.28)",
              background: "rgba(183,255,90,0.1)", color: "#B7FF5A",
              fontSize: 11, fontWeight: 700,
            }}
          >
            <Plus style={{ width: 12, height: 12 }} />
            Create Alert
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", padding: "0 16px 8px" }}>
          <Search style={{
            position: "absolute", left: 27, top: "50%", transform: "translateY(-68%)",
            width: 13, height: 13, color: "rgba(167,184,169,0.3)", pointerEvents: "none",
          }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search alerts..."
            style={{
              width: "100%", height: 34, paddingLeft: 33, paddingRight: 12,
              borderRadius: 10, boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "#F3FFF3", fontSize: 11.5, outline: "none",
            }}
          />
        </div>

        {/* Filter pills */}
        <div style={{
          display: "flex", gap: 6, padding: "0 16px 10px",
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          {FILTER_OPTIONS.map(opt => {
            const active = filter === opt.value;
            const count  = counts[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                  padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                  border: `1px solid ${active ? "rgba(183,255,90,0.35)" : "rgba(255,255,255,0.06)"}`,
                  background: active ? "rgba(183,255,90,0.12)" : "transparent",
                  color: active ? "#B7FF5A" : "rgba(167,184,169,0.5)",
                  fontSize: 10.5, fontWeight: 700, transition: "all 0.12s",
                }}
              >
                {opt.label}
                {count > 0 && (
                  <span style={{
                    minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px",
                    background: active ? "rgba(183,255,90,0.2)" : "rgba(255,255,255,0.07)",
                    fontSize: 9, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Alert list ── */}
      {filtered.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "48px 20px", gap: 12,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "rgba(57,91,67,0.1)",
            boxShadow: "0 0 0 1px rgba(57,91,67,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell style={{ width: 24, height: 24, color: "rgba(167,184,169,0.25)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "rgba(167,184,169,0.5)" }}>
              {query || filter !== "all" ? "No matching alerts" : "No Active Alerts"}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(167,184,169,0.28)" }}>
              {query || filter !== "all"
                ? "Try adjusting your search or filter"
                : "Create your first alert to get started"}
            </p>
          </div>
          {!query && filter === "all" && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 10, cursor: "pointer",
                border: "1px solid rgba(183,255,90,0.28)",
                background: "rgba(183,255,90,0.08)", color: "#B7FF5A",
                fontSize: 11, fontWeight: 700, marginTop: 4,
              }}
            >
              <Plus style={{ width: 13, height: 13 }} />
              Create First Alert
            </button>
          )}
        </div>
      ) : (
        filtered.map(alert => (
          <AlertCard
            key={alert.id}
            alert={alert}
            triggering={triggeringId === alert.id}
            onPause={() => handlePause(alert.id)}
            onResume={() => handleResume(alert.id)}
            onDelete={() => handleDelete(alert.id, alert.symbol)}
            onEdit={() => setEditTarget(alert)}
          />
        ))
      )}

      {/* Footer */}
      <div style={{
        padding: "10px 16px 6px",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.28)" }}>
          {filtered.length} of {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
        </p>
        <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.2)" }}>
          Alerts persist across sessions
        </p>
      </div>

      {/* Sub-modals — zIndex 1100 floats above everything including the BottomSheet */}
      {editTarget && (
        <EditAlertModal
          alert={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}
      {showCreate && (
        <QuickCreateModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </>
  );
}

// ── Main AlertCenterModal ──────────────────────────────────────────────────────
export interface AlertCenterModalProps {
  onClose: () => void;
}

const FILTER_OPTIONS = [
  { label: "All",       value: "all"       },
  { label: "Active",    value: "active"    },
  { label: "Triggered", value: "triggered" },
  { label: "Paused",    value: "paused"    },
  { label: "Expired",   value: "expired"   },
] as const;

type FilterValue = typeof FILTER_OPTIONS[number]["value"];

/**
 * Alert Center is used directly from Charts, so creation here must use the same
 * DB-backed API as the full Alerts page. Previously QuickCreate only wrote to
 * Zustand/localStorage, which made the chart alert disappear after refresh and
 * left AlertEngine unaware of it.
 */
async function persistAnyAlertToDb(alert: AnyAlert): Promise<AnyAlert | null> {
  try {
    if (alert.type === "price") {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: alert.symbol,
          condition:
            alert.condition === "below" ? "price_below" :
            alert.condition === "touch" ? "touch_price" :
            alert.condition === "percent_up" ? "percent_change_up" :
            alert.condition === "percent_down" ? "percent_change_down" :
            "price_above",
          targetPrice: alert.targetPrice,
          message: alert.notes || undefined,
          telegramEnabled: true,
          repeatMode: alert.repeatMode ?? "three_reminders",
        }),
      });
      if (!res.ok) return null;
      const a = await res.json() as Record<string, unknown>;
      return {
        ...alert,
        id: `p_${a.id}`,
        symbol: String(a.symbol ?? alert.symbol),
        targetPrice: Number(a.targetPrice ?? alert.targetPrice),
        status: a.isTriggered ? "triggered" : a.isActive === false ? "paused" : "active",
        createdAt: String(a.createdAt ?? alert.createdAt),
        triggeredAt: (a.triggeredAt as string | null) ?? null,
        repeatMode: (a.repeatMode as PriceAlert["repeatMode"]) ?? alert.repeatMode ?? "three_reminders",
      };
    }

    if (alert.type === "zone") {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: alert.symbol,
          upperPrice: alert.upperPrice,
          lowerPrice: alert.lowerPrice,
          zoneType: alert.zoneType,
          timeframe: alert.timeframe,
          condition: alert.condition,
          notes: alert.notes || undefined,
          telegramEnabled: true,
          repeatMode: alert.repeatMode ?? "three_reminders",
        }),
      });
      if (!res.ok) return null;
      const z = await res.json() as Record<string, unknown>;
      return {
        ...alert,
        id: `z_${z.id}`,
        symbol: String(z.symbol ?? alert.symbol),
        upperPrice: Number(z.upperPrice ?? alert.upperPrice),
        lowerPrice: Number(z.lowerPrice ?? alert.lowerPrice),
        timeframe: String(z.timeframe ?? alert.timeframe),
        condition: (z.condition as ZoneAlert["condition"]) ?? alert.condition,
        status: z.isTriggered ? "triggered" : z.isActive === false ? "paused" : "active",
        createdAt: String(z.createdAt ?? alert.createdAt),
        triggeredAt: (z.triggeredAt as string | null) ?? null,
        repeatMode: (z.repeatMode as ZoneAlert["repeatMode"]) ?? alert.repeatMode ?? "three_reminders",
      };
    }

    const res = await fetch("/api/trendlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: alert.symbol,
        timeframe: alert.timeframe,
        point1Price: alert.point1Price,
        point1Time: alert.point1Time,
        point2Price: alert.point2Price,
        point2Time: alert.point2Time,
        condition: alert.condition,
        drawingType: "trendline",
        notes: alert.notes || undefined,
        telegramEnabled: true,
        repeatMode: alert.repeatMode ?? "three_reminders",
      }),
    });
    if (!res.ok) return null;
    const t = await res.json() as Record<string, unknown>;
    const c = String(t.condition ?? alert.condition);
    const mappedCondition: TrendlineAlert["condition"] = c as TrendlineAlert["condition"];

    return {
      ...alert,
      id: `t_${t.id}`,
      symbol: String(t.symbol ?? alert.symbol),
      timeframe: String(t.timeframe ?? alert.timeframe),
      condition: mappedCondition,
      point1Price: Number(t.point1Price ?? alert.point1Price),
      point1Time: String(t.point1Time ?? alert.point1Time),
      point2Price: Number(t.point2Price ?? alert.point2Price),
      point2Time: String(t.point2Time ?? alert.point2Time),
      status: t.isTriggered ? "triggered" : t.isActive === false ? "paused" : "active",
      createdAt: String(t.createdAt ?? alert.createdAt),
      triggeredAt: (t.triggeredAt as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export default function AlertCenterModal({ onClose }: AlertCenterModalProps) {
  const { alerts, addAlert, updateAlert, deleteAlert: storeDelete, hydrateFromApi } = useAlertStore();
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    void hydrateFromApi();
  }, [hydrateFromApi]);
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState<AnyAlert | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  // Filter + search
  const filtered = alerts.filter(a => {
    if (filter !== "all" && a.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.symbol.toLowerCase().includes(q) ||
      a.type.includes(q) ||
      a.condition.includes(q) ||
      (a.notes || "").toLowerCase().includes(q)
    );
  });

  const handlePause = useCallback((id: string) => {
    updateAlert(id, { status: "paused" as AlertStatus });
    toast.info("Alert paused", { description: "Alert will no longer trigger until resumed." });
  }, [updateAlert]);

  const handleResume = useCallback((id: string) => {
    updateAlert(id, { status: "active" as AlertStatus });
    toast.success("Alert resumed", { description: "Alert engine restarted." });
  }, [updateAlert]);

  const handleDelete = useCallback((id: string, symbol: string) => {
    storeDelete(id);
    toast.error(`Alert deleted`, { description: `${symbol} alert removed.` });
  }, [storeDelete]);

  const handleSaveEdit = useCallback((updated: AnyAlert) => {
    updateAlert(updated.id, updated);
    toast.success("Alert updated");
  }, [updateAlert]);

  const handleCreate = useCallback(async (a: AnyAlert) => {
    const saved = await persistAnyAlertToDb(a);
    if (!saved) {
      toast.error("Alert not saved", { description: "Could not save the alert to the database." });
      return;
    }
    addAlert(saved);
    setTriggeringId(saved.id);
    setTimeout(() => setTriggeringId(null), 1200);
    toast.success("Alert created", { description: `${saved.symbol} ${saved.type} alert is now active.` });
  }, [addAlert]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  // Click-outside: close only if clicking the backdrop directly
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const counts = {
    all: alerts.length,
    active: alerts.filter(a => a.status === "active").length,
    triggered: alerts.filter(a => a.status === "triggered").length,
    paused: alerts.filter(a => a.status === "paused").length,
    expired: alerts.filter(a => a.status === "expired").length,
  };

  const modal = (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes acFadeScale {
          from { opacity: 0; transform: scale(0.985) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes acFadeOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(0.96); }
        }
        @keyframes acPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes acGlow {
          0%   { background: rgba(183,255,90,0.18); }
          100% { background: transparent; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(16px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.2s",
        }}
      >
        {/* Modal window */}
        <div
          ref={modalRef}
          onClick={e => e.stopPropagation()}
          style={{
            width: "min(720px, 95vw)",
            height: "80vh",
            maxHeight: "80vh",
            borderRadius: 20,
            background: "#0F1618",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: visible ? "acFadeScale 0.22s ease-out forwards" : "acFadeOut 0.18s ease-in forwards",
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: "rgba(183,255,90,0.1)",
              boxShadow: "0 0 0 1px rgba(183,255,90,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell style={{ width: 16, height: 16, color: "#B7FF5A" }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#F3FFF3" }}>Alerts Center</p>
              <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.4)" }}>
                {counts.active} active · {counts.triggered} triggered · {counts.paused} paused
              </p>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "7px 14px", borderRadius: 9, cursor: "pointer",
                  border: "1px solid rgba(183,255,90,0.28)",
                  background: "rgba(183,255,90,0.1)", color: "#B7FF5A",
                  fontSize: 11, fontWeight: 700,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.1)"; }}
              >
                <Plus style={{ width: 13, height: 13 }} />
                Create Alert
              </button>

              <button
                onClick={handleClose}
                style={{
                  width: 32, height: 32, borderRadius: 9, cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.15)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <X style={{ width: 14, height: 14, color: "rgba(167,184,169,0.5)" }} />
              </button>
            </div>
          </div>

          {/* ── Search + Filters ── */}
          <div style={{
            padding: "12px 20px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            flexShrink: 0,
          }}>
            {/* Search */}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search style={{
                position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                width: 13, height: 13, color: "rgba(167,184,169,0.3)", pointerEvents: "none",
              }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search alerts..."
                style={{
                  width: "100%", height: 36, paddingLeft: 33, paddingRight: 12,
                  borderRadius: 10, boxSizing: "border-box",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "#F3FFF3", fontSize: 11.5, outline: "none",
                }}
              />
            </div>

            {/* Filter pills */}
            <div style={{ display: "flex", gap: 6 }}>
              {FILTER_OPTIONS.map(opt => {
                const active = filter === opt.value;
                const count = counts[opt.value];
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                      border: `1px solid ${active ? "rgba(183,255,90,0.35)" : "rgba(255,255,255,0.06)"}`,
                      background: active ? "rgba(183,255,90,0.12)" : "transparent",
                      color: active ? "#B7FF5A" : "rgba(167,184,169,0.5)",
                      fontSize: 10.5, fontWeight: 700,
                      transition: "all 0.12s",
                    }}
                  >
                    {opt.label}
                    {count > 0 && (
                      <span style={{
                        minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px",
                        background: active ? "rgba(183,255,90,0.2)" : "rgba(255,255,255,0.07)",
                        fontSize: 9, fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Alert List ── */}
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(57,91,67,0.3) transparent" }}>
            {filtered.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "100%", gap: 12, padding: 40,
              }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 18,
                  background: "rgba(57,91,67,0.1)",
                  boxShadow: "0 0 0 1px rgba(57,91,67,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Bell style={{ width: 26, height: 26, color: "rgba(167,184,169,0.25)" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "rgba(167,184,169,0.5)" }}>
                    {query || filter !== "all" ? "No matching alerts" : "No Active Alerts"}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(167,184,169,0.28)" }}>
                    {query || filter !== "all"
                      ? "Try adjusting your search or filter"
                      : "Create your first alert to get started"}
                  </p>
                </div>
                {!query && filter === "all" && (
                  <button
                    onClick={() => setShowCreate(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 18px", borderRadius: 10, cursor: "pointer",
                      border: "1px solid rgba(183,255,90,0.28)",
                      background: "rgba(183,255,90,0.08)", color: "#B7FF5A",
                      fontSize: 11, fontWeight: 700, marginTop: 4,
                    }}
                  >
                    <Plus style={{ width: 13, height: 13 }} />
                    Create First Alert
                  </button>
                )}
              </div>
            ) : (
              filtered.map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  triggering={triggeringId === alert.id}
                  onPause={() => handlePause(alert.id)}
                  onResume={() => handleResume(alert.id)}
                  onDelete={() => handleDelete(alert.id, alert.symbol)}
                  onEdit={() => setEditTarget(alert)}
                />
              ))
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{
            padding: "8px 20px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.28)" }}>
              {filtered.length} of {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.2)" }}>
              Alerts persist across sessions
            </p>
          </div>
        </div>
      </div>

      {/* Sub-modals (rendered outside the backdrop to stack correctly) */}
      {editTarget && (
        <EditAlertModal
          alert={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}
      {showCreate && (
        <QuickCreateModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </>
  );

  return createPortal(modal, document.body);
}
