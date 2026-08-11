import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, Trash2, ChevronDown } from "lucide-react";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyStore } from "@/store/currencyStore";

// ─── Design tokens (premium institutional / grayscale-first) ────────────────
const BG        = "#000000";
const CARD      = "#151515";
const BORDER    = "#252525";
const DIVIDER   = "#262626";
const MUTED     = "#8A8A8A";   // labels
const VALUE     = "#E8E8E8";   // values (never pure white)
const PRIMARY   = "#E8E8E8";
const TITLE     = "#F3F3F3";   // screen title
const GREEN     = "#35C37A";
const RED       = "#E0524F";
const ORANGE    = "#C6862F";
const RADIUS    = 20;
const CARD_SHADOW = "0 1px 2px rgba(0,0,0,0.3)";
const FONT      = "'Inter', system-ui, -apple-system, sans-serif";

const USD_TO_INR_FALLBACK = 85;

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmt(v: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function fmtCompact(v: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fUSD(v: number, sign = false) {
  const abs = Math.abs(v);
  const str = "$" + fmt(abs);
  if (sign && v > 0) return "+" + str;
  if (v < 0) return "-" + str;
  return str;
}

function fINR(v: number, sign = false) {
  const abs = Math.abs(v);
  const str = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs);
  if (sign && v > 0) return "+" + str;
  if (v < 0) return "-" + str;
  return str;
}

function formatDate(ts: string | number | undefined): string {
  if (!ts) return "—";
  try {
    // Numeric timestamps arrive in different units per broker (cTrader/MT5
    // time_msc: milliseconds; MT5 time / Unix-style: seconds) — treat
    // anything already in the millisecond range (> ~2001 in ms) as-is,
    // otherwise assume seconds and scale up.
    const d = new Date(typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000) : ts);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const time = d.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
    return isToday ? `Today ${time}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
  } catch { return "—"; }
}

// ─── Small shared bits ────────────────────────────────────────────────────────
function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[12px] font-semibold leading-none inline-flex items-center"
      style={{
        height: 32,
        borderRadius: 16,
        padding: "0 14px",
        background: "rgba(255,255,255,0.04)",
        color: color ?? MUTED,
        border: `1px solid ${color ? color + "35" : BORDER}`,
      }}
    >
      {children}
    </span>
  );
}

function Segmented({
  value, onChange, accent,
}: { value: "Market" | "Limit"; onChange: (v: "Market" | "Limit") => void; accent: string }) {
  return (
    <div
      className="inline-flex items-center"
      style={{ background: "#1A1A1A", border: `1px solid #2B2B2B`, borderRadius: 10, padding: 2 }}
    >
      {(["Market", "Limit"] as const).map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="font-semibold transition-colors"
          style={{
            fontSize: 11,
            padding: "5px 10px",
            borderRadius: 8,
            background: value === opt ? accent + "20" : "transparent",
            color:      value === opt ? accent : "#8A8A8A",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function PctChip({ label, onClick, accent }: { label: string; onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      className="font-semibold active:scale-95 transition-transform"
      style={{
        fontSize: 11,
        height: 26,
        padding: "0 10px",
        borderRadius: 14,
        background: "#1A1A1A",
        border: `1px solid #2B2B2B`,
        color: "#B8B8B8",
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PositionDetail() {
  const [, navigate] = useLocation();

  const position = useSelectedPositionStore(s => s.position);

  const closePosition    = useBrokerStore(s => s.closePosition);
  const placeOrder       = useBrokerStore(s => s.placeOrder);
  const connectionStatus = useBrokerStore(s => s.connectionStatus);
  const activeBrokerId   = useBrokerStore(s => s.activeAccount?.brokerId ?? "");

  const ticks = useTickStore(s => s.ticks);
  const xr    = useCurrencyStore(s => s.exchangeRate) || USD_TO_INR_FALLBACK;

  const [tpValue,  setTpValue]  = useState("");
  const [slValue,  setSlValue]  = useState("");
  const [closing,  setClosing]  = useState(false);
  const [updating, setUpdating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [tpOrderType, setTpOrderType] = useState<"Market" | "Limit">("Market");
  const [slOrderType, setSlOrderType] = useState<"Market" | "Limit">("Market");
  const [tpLimitPrice, setTpLimitPrice] = useState("");
  const [slLimitPrice, setSlLimitPrice] = useState("");
  const [showTpSlConfirm, setShowTpSlConfirm] = useState(false);
  const [bracketOpen, setBracketOpen] = useState(false);

  // Clear the selected position only when this page actually unmounts (i.e.
  // after its exit transition finishes), not synchronously on click — clearing
  // it eagerly re-renders this still-visible page into the "No position
  // selected" empty state for ~200ms before the AnimatePresence exit
  // completes, producing a visible flash on every back/close navigation.
  useEffect(() => {
    return () => { useSelectedPositionStore.getState().setPosition(null); };
  }, []);

  useEffect(() => {
    if (!position) return;
    const raw = position.raw as Record<string, unknown> | null;
    setTpValue(raw?.take_profit ? String(raw.take_profit) : "");
    setSlValue(raw?.stop_loss   ? String(raw.stop_loss)   : "");
  }, [position?.id]);

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (!position) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-4"
        style={{ background: BG }}
      >
        <AlertTriangle className="w-8 h-8" style={{ color: MUTED }} />
        <p className="text-[14px] font-semibold" style={{ color: MUTED }}>
          No position selected
        </p>
        <button
          onClick={() => navigate("/portfolio?tab=positions")}
          className="text-[13px] font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-transform"
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: PRIMARY }}
        >
          ← Back to Portfolio
        </button>
      </div>
    );
  }

  // ─── Derived values ─────────────────────────────────────────────────────────
  const symKey    = position.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const livePrice = ticks[symKey]?.price ?? position.markPrice;

  const pnlUsd = position.side === "Long"
    ? (livePrice - position.entryPrice) * position.size
    : (position.entryPrice - livePrice) * position.size;
  const pnlInr = pnlUsd * xr;
  const pnlPct = position.entryPrice > 0
    ? (Math.abs(pnlUsd) / (position.entryPrice * position.size)) * 100 * (pnlUsd >= 0 ? 1 : -1)
    : 0;

  const isProfit  = pnlUsd >= 0;
  const pnlColor  = isProfit ? GREEN : RED;
  const sideColor = position.side === "Long" ? GREEN : RED;

  const raw        = position.raw as Record<string, unknown> | null;

  // Field names differ per broker's raw position payload — check every known
  // variant (Delta: liquidation_price/margin/created_at; cTrader: usedMargin/
  // openTimestamp, no liquidation price exposed; MT5: margin/time or time_msc).
  const liqPriceRaw = raw?.liquidation_price ?? raw?.liq_price ?? null;
  const liqPrice    = liqPriceRaw !== null && liqPriceRaw !== undefined ? Number(liqPriceRaw) : null;

  const marginRaw   = raw?.margin ?? raw?.usedMargin ?? raw?.used_margin ?? raw?.maintenance_margin ?? null;
  const marginUsed  = marginRaw !== null && marginRaw !== undefined && marginRaw !== ""
    ? Number(marginRaw)
    // Fallback: derive from notional value / leverage when the broker doesn't report margin directly.
    : (position.leverage && Number(position.leverage) > 0
        ? (position.size * position.entryPrice) / Number(position.leverage)
        : null);

  const openedAt   = (raw?.created_at ?? raw?.updated_at ?? raw?.openTimestamp ?? raw?.open_timestamp
    ?? raw?.time_msc ?? raw?.time ?? raw?.setupTime ?? null) as string | number | null;

  const posValue   = position.size * position.entryPrice;
  const positionId = raw?.id ?? raw?.order_id ?? raw?.position_id ?? raw?.product_id ?? raw?.positionId ?? null;

  const brokerLabel =
    activeBrokerId === "delta"   ? "Delta Exchange" :
    activeBrokerId === "ctrader" ? "cTrader"        :
    activeBrokerId === "mt5"     ? "MetaTrader 5"   : "Exchange";

  const canUpdate = (!!tpValue || !!slValue) && !updating;
  const canClose  = !closing && connectionStatus === "connected";

  // ─── Bracket order helpers ────────────────────────────────────────────────
  const pctChips = [0.25, 0.5, 1, 2];
  function pnlAtPrice(price: number) {
    return position.side === "Long"
      ? (price - position.entryPrice) * position.size
      : (position.entryPrice - price) * position.size;
  }
  function tpPriceForPct(pct: number) {
    return position.side === "Long"
      ? position.entryPrice * (1 + pct / 100)
      : position.entryPrice * (1 - pct / 100);
  }
  function slPriceForPct(pct: number) {
    return position.side === "Long"
      ? position.entryPrice * (1 - pct / 100)
      : position.entryPrice * (1 + pct / 100);
  }
  const tpPnlPreview = tpValue ? pnlAtPrice(parseFloat(tpValue)) : null;
  const slPnlPreview = slValue ? pnlAtPrice(parseFloat(slValue)) : null;

  // ─── Handlers ───────────────────────────────────────────────────────────────
  async function handleClose() {
    if (closing || connectionStatus !== "connected") return;
    setClosing(true);
    try {
      await closePosition(position);
      navigate("/portfolio?tab=positions");
    } catch { /* toast handled by broker service */ }
    finally { setClosing(false); setShowCloseConfirm(false); }
  }

  async function handleUpdateTpSl() {
    if (updating) return;
    if (!tpValue && !slValue) return;
    setUpdating(true);
    try {
      const exitSide = position.side === "Long" ? "Sell" : "Buy";
      if (tpValue) {
        await placeOrder({
          symbol:     position.symbol,
          side:       exitSide,
          orderType:  tpOrderType,
          qty:        String(position.size),
          ...(tpOrderType === "Limit" ? { price: tpLimitPrice || tpValue } : {}),
          takeProfit: tpValue,
        });
      }
      if (slValue) {
        await placeOrder({
          symbol:     position.symbol,
          side:       exitSide,
          orderType:  slOrderType,
          qty:        String(position.size),
          ...(slOrderType === "Limit" ? { price: slLimitPrice || slValue } : {}),
          stopLoss:   slValue,
        });
      }
    } catch { /* toast handled by broker service */ }
    finally { setUpdating(false); setShowTpSlConfirm(false); }
  }

  // ─── Trade detail rows ───────────────────────────────────────────────────────
  type Row = { label: string; value: string; valueColor?: string };
  const tradeRows: Row[] = [
    { label: "Entry Price",       value: fmtCompact(position.entryPrice) },
    { label: "Mark Price",        value: fmtCompact(livePrice) },
    { label: "Liquidation Price", value: liqPrice   !== null ? fmtCompact(liqPrice)   : "—", valueColor: liqPrice !== null ? ORANGE : undefined },
    { label: "Position Size",     value: `${position.size} ${position.symbol.replace(/USDT$|USD$|PERP$/, "")}` },
    { label: "Position Value",    value: fUSD(posValue) },
    { label: "Margin Used",       value: marginUsed !== null ? fUSD(marginUsed) : "—" },
    { label: "Leverage",          value: position.leverage ? `${position.leverage}x` : "—" },
    { label: "Opened",            value: formatDate(openedAt as string | number | undefined) },
    ...(positionId ? [{ label: "Position ID", value: `#${String(positionId).slice(0, 12)}` }] : []),
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: BG, overflowY: "hidden", fontFamily: FONT }}
    >

      {/* ══════════ HEADER ══════════════════════════════════════════════════
          Rendered inside the page (not in Layout) so header and content are
          part of the same PageTransition motion tree. This guarantees they
          always animate in/out together — including on first load when the
          lazy chunk isn't cached yet. Previously the header lived in Layout
          and reacted instantly to pathname changes while content waited behind
          a <Suspense> boundary, causing a visible desync on the first visit. */}
      <div
        className="flex-shrink-0 flex items-center justify-between"
        style={{ height: 56, paddingLeft: 20, paddingRight: 20, background: BG, borderBottom: "1px solid #262626" }}
      >
        <button
          onClick={() => navigate("/portfolio?tab=positions")}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent" }}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#E8E8E8" }} />
        </button>
        <span className="font-semibold" style={{ color: "#F3F3F3", fontSize: 17 }}>
          Position Details
        </span>
        <div style={{ width: 32, height: 32 }} />
      </div>

      {/* ══════════ SCROLLABLE BODY ═════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto pd-scroll-hide" style={{ overscrollBehavior: "contain" }}>
        <div className="flex flex-col gap-4" style={{ padding: 20 }}>

          {/* ──────────────────── TOP CARD ───────────────────────────────── */}
          <div className="dash-account-card" style={{ padding: "18px 20px" }}>
            {/* Row 1: symbol + pills */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="font-bold" style={{ color: "var(--stat-value)", fontSize: 22, letterSpacing: "-0.3px" }}>
                {position.symbol}
              </span>
              <Badge color={sideColor}>{position.side === "Long" ? "LONG" : "SHORT"}</Badge>
              {position.leverage && <Badge>{position.leverage}x</Badge>}
            </div>

            {/* Row 2: label */}
            <p className="font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--stat-sub)", fontSize: 11 }}>
              Unrealized P&amp;L
            </p>

            {/* Row 3: P&L value */}
            <p className="font-black leading-none" style={{ color: pnlColor, fontSize: 28 }}>
              {fUSD(pnlUsd, true)}
            </p>

            {/* INR + pct row */}
            <p className="font-medium mt-2 mb-4" style={{ color: pnlColor, fontSize: 13 }}>
              {fINR(pnlInr, true)}
              <span style={{ color: "var(--stat-sub)", fontWeight: 500 }}> · {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
            </p>

            {/* Bottom row: Mark price / Status — sub-widget grid matching AccountValueWidget */}
            <div
              className="grid grid-cols-2 overflow-hidden rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="px-3.5 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--stat-sub)", fontSize: 11 }}>
                  Mark Price
                </p>
                <p className="font-black leading-none" style={{ color: "var(--stat-value)", fontSize: 15 }}>
                  {fmtCompact(livePrice)}
                </p>
              </div>
              <div className="px-3.5 py-3">
                <p className="font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--stat-sub)", fontSize: 11 }}>
                  Status
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[6px] h-[6px] rounded-full" style={{ background: GREEN }} />
                  <span className="font-black leading-none" style={{ color: GREEN, fontSize: 15 }}>
                    Live
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ──────────────────── POSITION DETAILS CARD (collapsible) ─────── */}
          <div className="dash-account-card dash-account-card-dim" style={{ overflow: "hidden" }}>
            <button
              onClick={() => setDetailsOpen(o => !o)}
              className="w-full flex items-center justify-between"
              style={{ padding: "14px 20px", background: "transparent" }}
              aria-expanded={detailsOpen}
            >
              <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--stat-sub)", fontSize: 11 }}>
                Position Details
              </span>
              <ChevronDown
                size={16}
                style={{
                  color: "var(--stat-sub)",
                  transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {detailsOpen && (
              <div>
                {tradeRows.map((row, i) => (
                  <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <div
                      className="flex items-center justify-between px-5"
                      style={{ height: 54 }}
                    >
                      <span className="font-normal" style={{ color: "var(--stat-sub)", fontSize: 13 }}>
                        {row.label}
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: row.valueColor ?? "var(--stat-value)", fontSize: 15 }}
                      >
                        {row.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ──────────────────── BRACKET ORDER CARD (collapsible) ─────────── */}
          <div className="dash-account-card dash-account-card-dim" style={{ overflow: "hidden" }}>
            <button
              onClick={() => setBracketOpen(o => !o)}
              className="w-full flex items-center justify-between"
              style={{ padding: "14px 20px" }}
              aria-expanded={bracketOpen}
            >
              <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--stat-sub)", fontSize: 11 }}>
                Bracket Order
              </span>
              <ChevronDown
                size={16}
                style={{
                  color: "var(--stat-sub)",
                  transform: bracketOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {bracketOpen && (
            <div style={{ padding: "0 20px 15px" }}>

            {/* Take Profit */}
            <div style={{ marginBottom: 9 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
                <span className="font-semibold" style={{ color: GREEN, fontSize: 12 }}>Take Profit</span>
                <Segmented value={tpOrderType} onChange={setTpOrderType} accent={GREEN} />
              </div>

              <div
                className="flex items-center"
                style={{ height: 42, borderRadius: 12, border: "1px solid #2B2B2B", background: "#1A1A1A", padding: "0 12px" }}
              >
                <input
                  type="number"
                  step="any"
                  value={tpValue}
                  onChange={e => setTpValue(e.target.value)}
                  placeholder="Trigger Price"
                  className="flex-1 bg-transparent outline-none font-semibold"
                  style={{ color: tpValue ? VALUE : "#6E6E6E", fontSize: 14 }}
                />
                <span className="font-medium" style={{ color: MUTED, fontSize: 11 }}>USD</span>
              </div>

              {tpOrderType === "Limit" && (
                <div
                  className="flex items-center"
                  style={{ height: 42, borderRadius: 12, border: "1px solid #2B2B2B", background: "#1A1A1A", padding: "0 12px", marginTop: 7 }}
                >
                  <input
                    type="number"
                    step="any"
                    value={tpLimitPrice}
                    onChange={e => setTpLimitPrice(e.target.value)}
                    placeholder="Limit Price (optional)"
                    className="flex-1 bg-transparent outline-none font-semibold"
                    style={{ color: tpLimitPrice ? VALUE : "#6E6E6E", fontSize: 14 }}
                  />
                  <span className="font-medium" style={{ color: MUTED, fontSize: 11 }}>USD</span>
                </div>
              )}

              <div className="flex gap-2" style={{ marginTop: 9 }}>
                {pctChips.map(p => (
                  <PctChip key={p} label={`${p}%`} accent={GREEN} onClick={() => setTpValue(tpPriceForPct(p).toFixed(2))} />
                ))}
              </div>

              <div className="flex items-center justify-between" style={{ marginTop: 9 }}>
                <span className="font-normal" style={{ color: "var(--stat-sub)", fontSize: 12 }}>Estimated Exit PnL</span>
                <span className="font-semibold" style={{ color: tpPnlPreview === null ? "var(--stat-sub)" : (tpPnlPreview >= 0 ? GREEN : RED), fontSize: 13 }}>
                  {tpPnlPreview === null ? "—" : fUSD(tpPnlPreview, true)}
                </span>
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginTop: 3, marginBottom: 12 }} />

            {/* Stop Loss */}
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
                <span className="font-semibold" style={{ color: RED, fontSize: 12 }}>Stop Loss</span>
                <Segmented value={slOrderType} onChange={setSlOrderType} accent={RED} />
              </div>

              <div
                className="flex items-center"
                style={{ height: 42, borderRadius: 12, border: "1px solid #2B2B2B", background: "#1A1A1A", padding: "0 12px" }}
              >
                <input
                  type="number"
                  step="any"
                  value={slValue}
                  onChange={e => setSlValue(e.target.value)}
                  placeholder="Trigger Price"
                  className="flex-1 bg-transparent outline-none font-semibold"
                  style={{ color: slValue ? VALUE : "#6E6E6E", fontSize: 14 }}
                />
                <span className="font-medium" style={{ color: MUTED, fontSize: 11 }}>USD</span>
              </div>

              {slOrderType === "Limit" && (
                <div
                  className="flex items-center"
                  style={{ height: 42, borderRadius: 12, border: "1px solid #2B2B2B", background: "#1A1A1A", padding: "0 12px", marginTop: 7 }}
                >
                  <input
                    type="number"
                    step="any"
                    value={slLimitPrice}
                    onChange={e => setSlLimitPrice(e.target.value)}
                    placeholder="Limit Price (optional)"
                    className="flex-1 bg-transparent outline-none font-semibold"
                    style={{ color: slLimitPrice ? VALUE : "#6E6E6E", fontSize: 14 }}
                  />
                  <span className="font-medium" style={{ color: MUTED, fontSize: 11 }}>USD</span>
                </div>
              )}

              <div className="flex gap-2" style={{ marginTop: 9 }}>
                {pctChips.map(p => (
                  <PctChip key={p} label={`${p}%`} accent={RED} onClick={() => setSlValue(slPriceForPct(p).toFixed(2))} />
                ))}
              </div>

              <div className="flex items-center justify-between" style={{ marginTop: 9 }}>
                <span className="font-normal" style={{ color: "var(--stat-sub)", fontSize: 12 }}>Estimated Stop PnL</span>
                <span className="font-semibold" style={{ color: slPnlPreview === null ? "var(--stat-sub)" : (slPnlPreview >= 0 ? GREEN : RED), fontSize: 13 }}>
                  {slPnlPreview === null ? "—" : fUSD(slPnlPreview, true)}
                </span>
              </div>
            </div>

            {/* Update TP/SL button */}
            <button
              onClick={() => setShowTpSlConfirm(true)}
              disabled={!canUpdate}
              className="w-full rounded-2xl font-semibold active:scale-[0.98] transition-transform"
              style={{
                marginTop: 15,
                height: 54,
                fontSize: 14,
                borderRadius: 16,
                background: canUpdate ? "#202020" : "#181818",
                color:      canUpdate ? "#F2F2F2" : MUTED,
                border:     `1px solid ${BORDER}`,
                cursor: canUpdate ? "pointer" : "not-allowed",
              }}
            >
              {updating ? "Updating…" : "Update TP / SL"}
            </button>
            </div>
            )}
          </div>

          {/* ──────────────────── CLOSE POSITION BUTTON ──────────────────── */}
          <button
            onClick={() => setShowCloseConfirm(true)}
            disabled={!canClose}
            className="w-full rounded-xl font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            style={{
              height: 54,
              fontSize: 15,
              background: canClose ? "#3A1114" : "#201012",
              color:      canClose ? "#FF6A6A" : MUTED,
              border:     `1px solid ${canClose ? "#61242B" : BORDER}`,
              cursor: canClose ? "pointer" : "not-allowed",
            }}
          >
            <Trash2 size={15} />
            {closing ? "Closing Position…" : "Close Position"}
          </button>

          {/* Safe-area spacer */}
          <div style={{ height: 8 }} />
        </div>
      </div>

      {/* ══════════ CLOSE CONFIRMATION MODAL ═══════════════════════════════ */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.6)", padding: 20 }}
          onClick={() => !closing && setShowCloseConfirm(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full"
            style={{ maxWidth: 340, background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
          >
            <p className="font-semibold" style={{ color: TITLE, fontSize: 16, marginBottom: 6 }}>
              Close Position?
            </p>
            <p className="font-normal" style={{ color: MUTED, fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
              You're about to close <span style={{ color: VALUE, fontWeight: 600 }}>{position.symbol}</span> at market price.
              Current P&amp;L:{" "}
              <span style={{ color: pnlColor, fontWeight: 600 }}>{fUSD(pnlUsd, true)}</span>. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseConfirm(false)}
                disabled={closing}
                className="flex-1 rounded-xl font-semibold active:scale-[0.98] transition-transform"
                style={{ height: 48, fontSize: 14, background: "#1D1D1D", color: "#F2F2F2", border: `1px solid ${BORDER}` }}
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="flex-1 rounded-xl font-semibold active:scale-[0.98] transition-transform"
                style={{
                  height: 48,
                  fontSize: 14,
                  background: "#3B1114",
                  color: "#FF6767",
                  border: "1px solid #6C2A30",
                  cursor: closing ? "not-allowed" : "pointer",
                }}
              >
                {closing ? "Closing…" : "Confirm Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ UPDATE TP/SL CONFIRMATION MODAL ═════════════════════════ */}
      {showTpSlConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.6)", padding: 20 }}
          onClick={() => !updating && setShowTpSlConfirm(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full"
            style={{ maxWidth: 340, background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
          >
            <p className="font-semibold" style={{ color: TITLE, fontSize: 16, marginBottom: 6 }}>
              Update TP / SL?
            </p>
            <p className="font-normal" style={{ color: MUTED, fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
              Apply the following bracket order for <span style={{ color: VALUE, fontWeight: 600 }}>{position.symbol}</span>:
            </p>

            <div style={{ background: "#1A1A1A", border: "1px solid #2B2B2B", borderRadius: 12, padding: "10px 12px", marginBottom: 18 }}>
              {tpValue && (
                <div className="flex items-center justify-between" style={{ marginBottom: slValue ? 6 : 0 }}>
                  <span className="font-medium" style={{ color: GREEN, fontSize: 12 }}>
                    Take Profit ({tpOrderType})
                  </span>
                  <span className="font-semibold" style={{ color: VALUE, fontSize: 13 }}>
                    {fmtCompact(parseFloat(tpValue))} USD
                  </span>
                </div>
              )}
              {slValue && (
                <div className="flex items-center justify-between">
                  <span className="font-medium" style={{ color: RED, fontSize: 12 }}>
                    Stop Loss ({slOrderType})
                  </span>
                  <span className="font-semibold" style={{ color: VALUE, fontSize: 13 }}>
                    {fmtCompact(parseFloat(slValue))} USD
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTpSlConfirm(false)}
                disabled={updating}
                className="flex-1 rounded-xl font-semibold active:scale-[0.98] transition-transform"
                style={{ height: 48, fontSize: 14, background: "#1D1D1D", color: "#F2F2F2", border: `1px solid ${BORDER}` }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateTpSl}
                disabled={updating}
                className="flex-1 rounded-xl font-semibold active:scale-[0.98] transition-transform"
                style={{
                  height: 48,
                  fontSize: 14,
                  background: "#202020",
                  color: "#F2F2F2",
                  border: `1px solid ${BORDER}`,
                  cursor: updating ? "not-allowed" : "pointer",
                }}
              >
                {updating ? "Updating…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
