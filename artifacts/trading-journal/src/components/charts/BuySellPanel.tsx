import { useState, useCallback, memo } from "react";
import { X, TrendingUp, TrendingDown, ChevronDown, AlertCircle } from "lucide-react";
import { fmtPrice } from "@/contexts/LiveMarketContext";

interface Props {
  symbol:       string;
  currentPrice: number | null;
  onClose:      () => void;
}

type OrderType = "market" | "limit" | "stop";
type Side      = "buy"    | "sell";

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "market", label: "Market" },
  { value: "limit",  label: "Limit"  },
  { value: "stop",   label: "Stop"   },
];

const QUICK_SIZES = ["25%", "50%", "75%", "100%"];

const BuySellPanel = memo(function BuySellPanel({ symbol, currentPrice, onClose }: Props) {
  const [side,      setSide]      = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [quantity,  setQuantity]  = useState("");
  const [price,     setPrice]     = useState(currentPrice ? currentPrice.toFixed(2) : "");
  const [stopPrice, setStopPrice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const isUp      = side === "buy";
  const accentCol = isUp ? "#B7FF5A" : "#ef4444";
  const accentBg  = isUp ? "rgba(183,255,90,0.12)" : "rgba(239,68,68,0.12)";
  const accentBdr = isUp ? "rgba(183,255,90,0.35)" : "rgba(239,68,68,0.35)";

  const totalValue = (() => {
    const q = parseFloat(quantity);
    const p = orderType === "market" ? (currentPrice ?? 0) : parseFloat(price);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) return q * p;
    return null;
  })();

  const handleSubmit = useCallback(() => {
    if (!quantity || parseFloat(quantity) <= 0) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
    setQuantity("");
  }, [quantity]);

  const inputStyle: React.CSSProperties = {
    width:          "100%",
    background:     "rgba(7,17,13,0.6)",
    border:         "1px solid rgba(57,91,67,0.3)",
    borderRadius:   7,
    padding:        "6px 10px",
    color:          "#F3FFF3",
    fontSize:       12,
    fontFamily:     "'Inter', system-ui, sans-serif",
    outline:        "none",
    transition:     "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize:      9,
    fontWeight:    700,
    color:         "rgba(167,184,169,0.55)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom:  4,
  };

  return (
    <div style={{
      width:          220,
      background:     "rgba(9,18,14,0.96)",
      backdropFilter: "blur(20px)",
      border:         "1px solid rgba(57,91,67,0.3)",
      borderRadius:   12,
      boxShadow:      "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(57,91,67,0.1)",
      display:        "flex",
      flexDirection:  "column",
      overflow:       "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid rgba(57,91,67,0.2)" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#F3FFF3" }}>{symbol.replace("USD", "")}</span>
          <span style={{ fontSize: 9, color: "rgba(167,184,169,0.5)", marginLeft: 4 }}>/ USD</span>
        </div>
        {currentPrice !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#B7FF5A", fontFamily: "monospace" }}>
            {fmtPrice(currentPrice, symbol)}
          </span>
        )}
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          <X style={{ width: 13, height: 13, color: "rgba(167,184,169,0.45)" }} />
        </button>
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Buy / Sell tabs */}
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(57,91,67,0.25)" }}>
          {(["buy", "sell"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSide(s)}
              style={{
                flex:       1,
                height:     32,
                border:     "none",
                cursor:     "pointer",
                fontWeight: 800,
                fontSize:   11,
                display:    "flex",
                alignItems: "center",
                justifyContent: "center",
                gap:        4,
                transition: "all 0.15s",
                background: side === s
                  ? (s === "buy" ? "rgba(183,255,90,0.18)" : "rgba(239,68,68,0.18)")
                  : "transparent",
                color: side === s
                  ? (s === "buy" ? "#B7FF5A" : "#ef4444")
                  : "rgba(167,184,169,0.5)",
              }}
            >
              {s === "buy"
                ? <TrendingUp  style={{ width: 11, height: 11 }} />
                : <TrendingDown style={{ width: 11, height: 11 }} />}
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Order type */}
        <div>
          <div style={labelStyle}>Order Type</div>
          <div style={{ display: "flex", gap: 3 }}>
            {ORDER_TYPES.map(ot => (
              <button
                key={ot.value}
                onClick={() => setOrderType(ot.value)}
                style={{
                  flex:       1,
                  height:     26,
                  borderRadius: 6,
                  border:     `1px solid ${orderType === ot.value ? accentBdr : "rgba(57,91,67,0.25)"}`,
                  background: orderType === ot.value ? accentBg : "transparent",
                  color:      orderType === ot.value ? accentCol : "rgba(167,184,169,0.6)",
                  fontSize:   10,
                  fontWeight: 700,
                  cursor:     "pointer",
                  transition: "all 0.12s",
                }}
              >
                {ot.label}
              </button>
            ))}
          </div>
        </div>

        {/* Limit price (hidden for market) */}
        {orderType !== "market" && (
          <div>
            <div style={labelStyle}>{orderType === "stop" ? "Stop Price" : "Price"}</div>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                value={orderType === "stop" ? stopPrice : price}
                onChange={e => orderType === "stop" ? setStopPrice(e.target.value) : setPrice(e.target.value)}
                placeholder={currentPrice?.toFixed(2) ?? "0.00"}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = accentBdr; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "rgba(57,91,67,0.3)"; }}
              />
              <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "rgba(167,184,169,0.4)", pointerEvents: "none" }}>USD</span>
            </div>
          </div>
        )}

        {/* Quantity */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={labelStyle}>Amount</span>
            {totalValue !== null && (
              <span style={{ fontSize: 9, color: "rgba(167,184,169,0.45)" }}>
                ≈ ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0.000"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = accentBdr; }}
              onBlur={e  => { e.currentTarget.style.borderColor = "rgba(57,91,67,0.3)"; }}
            />
            <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "rgba(167,184,169,0.4)", pointerEvents: "none" }}>
              {symbol.replace("USD", "")}
            </span>
          </div>

          {/* Quick size buttons */}
          <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
            {QUICK_SIZES.map(pct => (
              <button key={pct} onClick={() => setQuantity(String((parseFloat(pct) / 100 * 0.1).toFixed(4)))}
                style={{
                  flex: 1, height: 20, borderRadius: 4, border: "1px solid rgba(57,91,67,0.25)",
                  background: "rgba(57,91,67,0.1)", color: "rgba(167,184,169,0.55)",
                  fontSize: 9, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.1s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = accentBg; (e.currentTarget as HTMLButtonElement).style.color = accentCol; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.55)"; }}
              >
                {pct}
              </button>
            ))}
          </div>
        </div>

        {/* Order info row */}
        {orderType === "market" && currentPrice && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "rgba(57,91,67,0.08)", borderRadius: 6 }}>
            <span style={{ fontSize: 9, color: "rgba(167,184,169,0.5)" }}>Est. Price</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#F3FFF3", fontFamily: "monospace" }}>{fmtPrice(currentPrice, symbol)}</span>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          style={{
            width:        "100%",
            height:       36,
            borderRadius: 8,
            border:       "none",
            cursor:       parseFloat(quantity) > 0 ? "pointer" : "not-allowed",
            fontWeight:   800,
            fontSize:     12,
            letterSpacing: "0.03em",
            transition:   "all 0.15s",
            background:   submitted
              ? "rgba(255,255,255,0.08)"
              : parseFloat(quantity) > 0
                ? (isUp ? "linear-gradient(135deg, #7CBF4B, #B7FF5A)" : "linear-gradient(135deg, #dc2626, #ef4444)")
                : "rgba(57,91,67,0.15)",
            color: submitted
              ? "rgba(148,163,184,0.9)"
              : parseFloat(quantity) > 0
                ? (isUp ? "#07110D" : "#fff")
                : "rgba(167,184,169,0.35)",
            boxShadow: parseFloat(quantity) > 0 && !submitted
              ? `0 4px 14px ${isUp ? "rgba(183,255,90,0.25)" : "rgba(239,68,68,0.25)"}`
              : "none",
          }}
        >
          {submitted ? "✓ Placed" : `${side === "buy" ? "Buy" : "Sell"} ${symbol.replace("USD", "")}`}
        </button>

        {/* Disclaimer */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <AlertCircle style={{ width: 9, height: 9, color: "rgba(167,184,169,0.3)", marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 8.5, color: "rgba(167,184,169,0.3)", lineHeight: 1.4 }}>
            Paper trading only. No real orders placed.
          </span>
        </div>
      </div>
    </div>
  );
});

export default BuySellPanel;
