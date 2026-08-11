import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, ShoppingCart, Loader2, CheckCircle2, XCircle, Plus, Minus, RefreshCw } from "lucide-react";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import {
  type LotSpec,
  computeLotPrecision,
  snapToStep,
  incrementLots,
  decrementLots,
  isValidLots,
  calcUnits,
  calcMargin,
  calcPositionValue,
  calcPipValue,
  formatLots,
  formatUnits,
  formatCurrency,
  formatLotEquivalent,
  validateVolumeSanity,
} from "@/lib/lotMath";
import {
  type DeltaQtySpec,
  contractsToDisplayQty,
  displayQtyToContracts,
  formatDeltaQty,
  deltaUnitLabel,
  formatDeltaLotEquivalent,
  snapContracts,
  incrementContracts,
  decrementContracts,
  isValidContracts,
  calcDeltaMargin,
  calcDeltaPositionValue,
  formatDeltaCurrency,
} from "@/lib/deltaMath";

// ── Types ────────────────────────────────────────────────────────────────────

interface BrokerContractSpec {
  broker:            "delta" | "ctrader";
  symbol:            string;
  fetchedAt:         number;
  description:       string;
  maxLeverageNum:    number;
  lotSizeNum:        number;
  settlementCurrency: string;
  partial?:          boolean;
  fields:            Array<{ label: string; value: string; highlight?: boolean }>;
  minVolumeLots:     number | null;
  maxVolumeLots:     number | null;
  stepVolumeLots:    number | null;
  leverage:          number | null;
  pipPosition:       number | null;
  digits:            number | null;
  deltaQty:          DeltaQtySpec | null;
}

interface Props {
  symbol: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BG          = "#0D1C16";
const BORDER_CLR  = "rgba(57,91,67,0.30)";
const BORDER_DIM  = "rgba(57,91,67,0.15)";
const TEXT_DIM    = "rgba(167,184,169,0.60)";
const TEXT_HI     = "#F3FFF3";
const ACCENT      = "#B7FF5A";
const ACCENT_BG   = "rgba(183,255,90,0.10)";
const ACCENT_BORD = "rgba(183,255,90,0.25)";
const INPUT_CLS: React.CSSProperties = {
  background: BG,
  border: `1px solid ${BORDER_CLR}`,
  borderRadius: 8,
  color: TEXT_HI,
  fontSize: 12,
  padding: "0 10px",
  height: 34,
  width: "100%",
  outline: "none",
};
const LABEL_CLS: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  marginBottom: 4,
  color: TEXT_DIM,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveLotSpec(spec: BrokerContractSpec | null): LotSpec | null {
  if (!spec) return null;

  const minLots  = spec.minVolumeLots  ?? null;
  const maxLots  = spec.maxVolumeLots  ?? null;
  const stepLots = spec.stepVolumeLots ?? null;
  const lotSize  = spec.lotSizeNum > 0 ? spec.lotSizeNum : null;
  const leverage = spec.leverage ?? (spec.maxLeverageNum > 0 ? spec.maxLeverageNum : null);
  const pipPos   = spec.pipPosition ?? 4;
  const digits   = spec.digits ?? 5;

  if (!minLots || !maxLots || !stepLots || !lotSize || !leverage) {
    console.warn("[PlaceOrderPanel] Incomplete LotSpec — missing fields:", {
      minLots, maxLots, stepLots, lotSize, leverage,
      symbol: spec.symbol,
    });
    return null;
  }

  // Sanity check — log a warning if values look wrong
  const sanity = validateVolumeSanity(minLots, maxLots, stepLots, spec.symbol);
  if (!sanity.ok) {
    console.warn("[PlaceOrderPanel] Volume sanity FAILED:", sanity.warning, {
      minVolumeLots: minLots, maxVolumeLots: maxLots, stepVolumeLots: stepLots,
      symbol: spec.symbol,
    });
    return null;
  }

  return { minLots, maxLots, stepLots, lotSize, leverage, pipPosition: pipPos, digits };
}

function calcAll(lots: number, price: number | null, spec: LotSpec) {
  if (!price || price <= 0) return { margin: null, posValue: null, pipVal: null, units: 0 };
  return {
    margin:   calcMargin(lots, price, spec),
    posValue: calcPositionValue(lots, price, spec.lotSize),
    pipVal:   calcPipValue(lots, spec),
    units:    calcUnits(lots, spec.lotSize),
  };
}

/** Read ONLY Delta metadata — never cTrader lot fields. Returns null if Delta hasn't
 *  provided a valid contract spec yet (never fall back to cTrader lot defaults). */
function deriveDeltaSpec(spec: BrokerContractSpec | null): DeltaQtySpec | null {
  if (!spec || !spec.deltaQty) return null;
  return spec.deltaQty;
}

function calcDeltaAll(contracts: number, price: number | null, leverage: number, spec: DeltaQtySpec) {
  if (!price || price <= 0) return { margin: null, posValue: null };
  return {
    margin:   calcDeltaMargin(contracts, price, leverage, spec),
    posValue: calcDeltaPositionValue(contracts, price, spec),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlaceOrderPanel({ symbol }: Props) {
  const { setShowPlaceOrder, placeOrder, activeAccount } = useBrokerStore();
  const ticks = useTickStore(s => s.ticks);

  // ── Live price ──────────────────────────────────────────────────────────────
  const symKey   = symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const tick     = ticks[symKey] ?? ticks[symbol];
  const livePrice = tick?.price ?? null;

  const broker = activeAccount?.broker_id ?? "ctrader";

  // ── Contract spec ─────────────────────────────────────────────────────────
  const [spec,        setSpec]        = useState<BrokerContractSpec | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specError,   setSpecError]   = useState<string | null>(null);
  const prevSymbolRef = useRef("");

  const fetchSpec = useCallback((sym: string) => {
    if (!sym) return;
    setSpecLoading(true);
    setSpecError(null);
    const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(/\/$/, "");
    const brokerQ = broker === "ctrader" ? "ctrader" : "delta";
    fetch(`${base}/api/contract-spec/${encodeURIComponent(sym)}?broker=${brokerQ}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: BrokerContractSpec) => {
        setSpec(d);
        setSpecLoading(false);
        console.info("[PlaceOrderPanel] spec loaded:", {
          symbol: sym, minVolumeLots: d.minVolumeLots, maxVolumeLots: d.maxVolumeLots,
          stepVolumeLots: d.stepVolumeLots, lotSize: d.lotSizeNum,
          leverage: d.leverage, pipPosition: d.pipPosition, digits: d.digits,
        });
      })
      .catch((e: Error) => {
        setSpecError(e.message);
        setSpecLoading(false);
        console.error("[PlaceOrderPanel] spec fetch error:", e.message);
      });
  }, [broker]);

  // Fetch on mount + when symbol changes
  useEffect(() => {
    if (symbol === prevSymbolRef.current) return;
    prevSymbolRef.current = symbol;
    setSpec(null);
    fetchSpec(symbol);
  }, [symbol, fetchSpec]);

  // Re-fetch when broker reconnects (cTrader reconnect may change leverage)
  const connectionKey = activeAccount?.broker_id ?? "";
  const prevConnRef   = useRef("");
  useEffect(() => {
    if (!connectionKey || connectionKey === prevConnRef.current) return;
    prevConnRef.current = connectionKey;
    if (spec) fetchSpec(symbol); // Only refresh if we already had one
  }, [connectionKey, spec, symbol, fetchSpec]);

  // ── Broker-specific spec — completely independent, never mixed ─────────────
  const isDelta  = broker !== "ctrader"; // any non-cTrader account routes through Delta
  const lotSpec   = useMemo(() => !isDelta ? deriveLotSpec(spec)   : null, [spec, isDelta]);
  const deltaSpec = useMemo(() => isDelta  ? deriveDeltaSpec(spec) : null, [spec, isDelta]);
  const prec = useMemo(() => {
    if (isDelta)  return deltaSpec ? deltaSpec.quantityPrecision : 0;
    return lotSpec ? computeLotPrecision(lotSpec.stepLots) : 2;
  }, [isDelta, deltaSpec, lotSpec]);
  const unitLabel = isDelta
    ? (deltaSpec ? deltaUnitLabel(deltaSpec) : "Contracts")
    : "Lot";

  // ── Quantity state ──────────────────────────────────────────────────────────
  // String state for the input so the user can type freely; we snap on blur/submit.
  // For Delta this represents the DISPLAYED quantity (coin amount or contract count),
  // never lots. Whole contracts are derived from it only when submitting.
  const [qtyStr,   setQtyStr]   = useState("");
  const [qtyError, setQtyError] = useState<string | null>(null);

  // When spec first loads (or changes), reset qty to the broker's own minimum.
  // Clears any previous broker's cached quantity/precision/step entirely.
  const prevSpecKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (isDelta) {
      if (!deltaSpec) return;
      const key = `delta:${deltaSpec.minOrderSizeContracts}:${deltaSpec.contractValue}`;
      if (prevSpecKeyRef.current === key && qtyStr !== "") return;
      prevSpecKeyRef.current = key;
      const minDisplay = contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec);
      setQtyStr(formatDeltaQty(minDisplay, deltaSpec));
      setQtyError(null);
    } else {
      if (!lotSpec) return;
      const key = `ctrader:${lotSpec.minLots}`;
      if (prevSpecKeyRef.current === key && qtyStr !== "") return;
      prevSpecKeyRef.current = key;
      setQtyStr(formatLots(lotSpec.minLots, prec));
      setQtyError(null);
    }
  }, [isDelta, deltaSpec, lotSpec, prec, qtyStr]);

  // Parsed displayed quantity (number) — used for all calculations
  const currentQty = useMemo(() => {
    const v = parseFloat(qtyStr);
    if (isDelta) {
      const minDisplay = deltaSpec ? contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec) : 1;
      return isNaN(v) || v <= 0 ? minDisplay : v;
    }
    return isNaN(v) || v <= 0 ? (lotSpec?.minLots ?? 0.01) : v;
  }, [qtyStr, isDelta, deltaSpec, lotSpec]);

  // Snap and validate the current qty using ONLY the active broker's own rules
  const validateQty = useCallback((qty: number): string | null => {
    if (isDelta) {
      if (!deltaSpec) return null;
      const contracts = displayQtyToContracts(qty, deltaSpec);
      const minDisplay = contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec);
      const maxDisplay = contractsToDisplayQty(deltaSpec.maxOrderSizeContracts, deltaSpec);
      if (contracts < deltaSpec.minOrderSizeContracts) {
        return `Minimum is ${formatDeltaQty(minDisplay, deltaSpec)} ${deltaUnitLabel(deltaSpec)}`;
      }
      if (contracts > deltaSpec.maxOrderSizeContracts) {
        return `Maximum is ${formatDeltaQty(maxDisplay, deltaSpec)} ${deltaUnitLabel(deltaSpec)}`;
      }
      if (!isValidContracts(contracts, deltaSpec)) {
        return `Must be a whole number of contracts`;
      }
      return null;
    }
    if (!lotSpec) return null;
    if (qty < lotSpec.minLots) {
      return `Minimum is ${formatLots(lotSpec.minLots, prec)} lots`;
    }
    if (qty > lotSpec.maxLots) {
      return `Maximum is ${formatLots(lotSpec.maxLots, prec)} lots`;
    }
    if (!isValidLots(qty, lotSpec)) {
      const snapped = snapToStep(qty, lotSpec);
      return `Must be a multiple of ${formatLots(lotSpec.stepLots, prec)} — nearest valid: ${formatLots(snapped, prec)}`;
    }
    return null;
  }, [isDelta, deltaSpec, lotSpec, prec]);

  const snapCurrentQty = useCallback((raw: number): number => {
    if (isDelta) {
      if (!deltaSpec) return raw;
      const contracts = snapContracts(displayQtyToContracts(raw, deltaSpec), deltaSpec);
      return contractsToDisplayQty(contracts, deltaSpec);
    }
    return lotSpec ? snapToStep(raw, lotSpec) : raw;
  }, [isDelta, deltaSpec, lotSpec]);

  const handleQtyBlur = useCallback(() => {
    if (isDelta ? !deltaSpec : !lotSpec) return;
    const raw = parseFloat(qtyStr);
    if (isNaN(raw) || raw <= 0) {
      const fallback = isDelta && deltaSpec
        ? formatDeltaQty(contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec), deltaSpec)
        : lotSpec ? formatLots(lotSpec.minLots, prec) : "";
      setQtyStr(fallback);
      setQtyError(null);
      return;
    }
    const snapped = snapCurrentQty(raw);
    const formatted = isDelta && deltaSpec ? formatDeltaQty(snapped, deltaSpec) : formatLots(snapped, prec);
    setQtyStr(formatted);
    setQtyError(validateQty(snapped));
  }, [qtyStr, isDelta, deltaSpec, lotSpec, prec, snapCurrentQty, validateQty]);

  const handleDecrement = useCallback(() => {
    if (isDelta) {
      if (!deltaSpec) return;
      const contracts = displayQtyToContracts(currentQty, deltaSpec);
      const next = decrementContracts(contracts, deltaSpec);
      setQtyStr(formatDeltaQty(contractsToDisplayQty(next, deltaSpec), deltaSpec));
      setQtyError(null);
      return;
    }
    if (!lotSpec) return;
    const next = decrementLots(currentQty, lotSpec);
    setQtyStr(formatLots(next, prec));
    setQtyError(null);
  }, [currentQty, isDelta, deltaSpec, lotSpec, prec]);

  const handleIncrement = useCallback(() => {
    if (isDelta) {
      if (!deltaSpec) return;
      const contracts = displayQtyToContracts(currentQty, deltaSpec);
      const next = incrementContracts(contracts, deltaSpec);
      setQtyStr(formatDeltaQty(contractsToDisplayQty(next, deltaSpec), deltaSpec));
      setQtyError(null);
      return;
    }
    if (!lotSpec) return;
    const next = incrementLots(currentQty, lotSpec);
    setQtyStr(formatLots(next, prec));
    setQtyError(null);
  }, [currentQty, isDelta, deltaSpec, lotSpec, prec]);

  // ── Derived financial values ───────────────────────────────────────────────
  const accountLeverage = spec?.leverage ?? (spec?.maxLeverageNum && spec.maxLeverageNum > 0 ? spec.maxLeverageNum : 1);
  const calcs = useMemo(() => {
    if (isDelta) {
      if (!deltaSpec) return null;
      const contracts = displayQtyToContracts(currentQty, deltaSpec);
      const r = calcDeltaAll(contracts, livePrice, accountLeverage, deltaSpec);
      return { margin: r.margin, posValue: r.posValue, pipVal: null, units: contracts };
    }
    if (!lotSpec) return null;
    return calcAll(currentQty, livePrice, lotSpec);
  }, [isDelta, deltaSpec, lotSpec, currentQty, livePrice, accountLeverage]);

  // ── Order form state ──────────────────────────────────────────────────────
  const [side,        setSide]       = useState<"Buy" | "Sell">("Buy");
  const [orderType,   setOrderType]  = useState<"Market" | "Limit">("Market");
  const [price,       setPrice]      = useState("");
  const [stopLoss,    setStopLoss]   = useState("");
  const [takeProfit,  setTakeProfit] = useState("");
  const [status,      setStatus]     = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg,         setMsg]        = useState("");

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeSpecOk = isDelta ? !!deltaSpec : !!lotSpec;
    if (!activeSpecOk) return;
    const snapped = snapCurrentQty(currentQty);
    const err = validateQty(snapped);
    if (err) { setQtyError(err); return; }

    // Delta orders are submitted as an integer contract count; cTrader as lots.
    const qtyForOrder = isDelta && deltaSpec
      ? String(displayQtyToContracts(snapped, deltaSpec))
      : formatLots(snapped, prec);

    setStatus("loading");
    setMsg("");
    const result = await placeOrder({
      symbol,
      side,
      orderType,
      qty:        qtyForOrder,
      price:      orderType === "Limit" && price ? price : undefined,
      stopLoss:   stopLoss    || undefined,
      takeProfit: takeProfit  || undefined,
      category:   "linear",
    });
    if (result.ok) {
      setStatus("success");
      setMsg("Order placed successfully!");
      const resetQty = isDelta && deltaSpec
        ? formatDeltaQty(contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec), deltaSpec)
        : lotSpec ? formatLots(lotSpec.minLots, prec) : "";
      setQtyStr(resetQty);
      setPrice(""); setStopLoss(""); setTakeProfit("");
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      setStatus("error");
      setMsg(result.error ?? "Order failed");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const buyColor  = "#4ade80";
  const sellColor = "#f87171";
  const sideColor = side === "Buy" ? buyColor : sellColor;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: "rgba(5,14,10,0.98)",
        border: `1px solid ${BORDER_DIM}`,
        borderRadius: 16,
        width: 300,
        minWidth: 300,
        maxHeight: "calc(100vh - 140px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${BORDER_DIM}` }}>
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          <span className="text-[12px] font-bold" style={{ color: TEXT_HI }}>Place Order</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: ACCENT_BG, color: ACCENT }}>
            {symbol}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Refresh spec */}
          <button
            onClick={() => { setSpec(null); fetchSpec(symbol); }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: TEXT_DIM }}
            title="Refresh symbol spec"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowPlaceOrder(false)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: TEXT_DIM }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 p-4 overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Live price */}
        {livePrice && (
          <div className="text-center py-1">
            <span className="text-[11px]" style={{ color: TEXT_DIM }}>Live: </span>
            <span className="text-[13px] font-bold" style={{ color: ACCENT }}>
              {livePrice.toLocaleString("en-US", {
                minimumFractionDigits: spec?.digits ?? 2,
                maximumFractionDigits: spec?.digits ?? 5,
              })}
            </span>
          </div>
        )}

        {/* Side toggle */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER_CLR}` }}>
          {(["Buy", "Sell"] as const).map(s => (
            <button key={s} type="button" onClick={() => setSide(s)}
              className="flex-1 h-8 text-[12px] font-bold transition-all"
              style={{
                background: side === s
                  ? s === "Buy" ? "rgba(74,222,128,0.20)" : "rgba(248,113,113,0.20)"
                  : "transparent",
                color: side === s
                  ? s === "Buy" ? buyColor : sellColor
                  : TEXT_DIM,
              }}
            >{s}</button>
          ))}
        </div>

        {/* Order type */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER_CLR}` }}>
          {(["Market", "Limit"] as const).map(t => (
            <button key={t} type="button" onClick={() => setOrderType(t)}
              className="flex-1 h-7 text-[11px] font-semibold transition-all"
              style={{
                background: orderType === t ? ACCENT_BG : "transparent",
                color: orderType === t ? ACCENT : TEXT_DIM,
              }}
            >{t}</button>
          ))}
        </div>

        {/* ── Quantity ──────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span style={LABEL_CLS}>Quantity ({unitLabel})</span>
            {specLoading && (
              <span style={{ fontSize: 10, color: TEXT_DIM, display: "flex", alignItems: "center", gap: 3 }}>
                <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} />
                Loading spec…
              </span>
            )}
            {specError && (
              <span style={{ fontSize: 10, color: "#f87171" }}>Spec unavailable</span>
            )}
          </div>

          {/* [−] input [+] */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={isDelta ? !deltaSpec : !lotSpec}
              style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: BG, border: `1px solid ${BORDER_CLR}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: TEXT_HI, cursor: "pointer",
                opacity: (isDelta ? !deltaSpec : !lotSpec) ? 0.35 : 1,
              }}
            >
              <Minus style={{ width: 14, height: 14 }} />
            </button>

            <input
              type="number"
              inputMode="decimal"
              value={qtyStr}
              onChange={e => { setQtyStr(e.target.value); setQtyError(null); }}
              onBlur={handleQtyBlur}
              step={isDelta ? (deltaSpec ? String(contractsToDisplayQty(deltaSpec.stepSizeContracts, deltaSpec)) : "1") : (lotSpec ? String(lotSpec.stepLots) : "0.01")}
              min={isDelta ? (deltaSpec ? String(contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec)) : "1") : (lotSpec ? String(lotSpec.minLots) : "0.01")}
              max={isDelta ? (deltaSpec ? String(contractsToDisplayQty(deltaSpec.maxOrderSizeContracts, deltaSpec)) : undefined) : (lotSpec ? String(lotSpec.maxLots) : undefined)}
              required
              style={{
                ...INPUT_CLS,
                height: 34, textAlign: "center",
                fontWeight: 700, fontSize: 14,
                border: qtyError ? "1px solid rgba(239,68,68,0.6)" : `1px solid ${BORDER_CLR}`,
              }}
            />

            <button
              type="button"
              onClick={handleIncrement}
              disabled={isDelta ? !deltaSpec : !lotSpec}
              style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: BG, border: `1px solid ${BORDER_CLR}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: TEXT_HI, cursor: "pointer",
                opacity: (isDelta ? !deltaSpec : !lotSpec) ? 0.35 : 1,
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Validation error */}
          {qtyError && (
            <p style={{ fontSize: 10, color: "#f87171", marginTop: 3 }}>{qtyError}</p>
          )}

          {/* Live Lot Equivalent — always derived from the broker's own spec, never hardcoded */}
          {isDelta && deltaSpec && (
            <p style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3, fontWeight: 600 }}>
              {formatDeltaLotEquivalent(deltaSpec)}
            </p>
          )}
          {!isDelta && lotSpec && (
            <p style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3, fontWeight: 600 }}>
              {formatLotEquivalent(lotSpec.lotSize)}
            </p>
          )}

          {/* Spec hints */}
          {isDelta && deltaSpec && (
            <p style={{ fontSize: 9, color: "rgba(167,184,169,0.35)", marginTop: 2 }}>
              Min {formatDeltaQty(contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec), deltaSpec)} · Max {formatDeltaQty(contractsToDisplayQty(deltaSpec.maxOrderSizeContracts, deltaSpec), deltaSpec)} · Step {formatDeltaQty(contractsToDisplayQty(deltaSpec.stepSizeContracts, deltaSpec), deltaSpec)}
            </p>
          )}
          {!isDelta && lotSpec && (
            <p style={{ fontSize: 9, color: "rgba(167,184,169,0.35)", marginTop: 2 }}>
              Min {formatLots(lotSpec.minLots, prec)} · Max {lotSpec.maxLots} · Step {formatLots(lotSpec.stepLots, prec)}
            </p>
          )}
        </div>

        {/* ── Margin / Position calculations ────────────────────────────────── */}
        {isDelta && deltaSpec && calcs && (
          <div style={{
            borderRadius: 8,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
            padding: "8px 10px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "5px 10px",
          }}>
            {calcs.margin !== null && (
              <CalcRow label="Req. Margin"
                value={formatDeltaCurrency(calcs.margin)}
                note={`@ 1:${accountLeverage}`} />
            )}
            {calcs.posValue !== null && (
              <CalcRow label="Position Value"
                value={formatDeltaCurrency(calcs.posValue)} />
            )}
            <CalcRow label="Contracts"
              value={String(calcs.units)} />
          </div>
        )}
        {!isDelta && lotSpec && calcs && (
          <div style={{
            borderRadius: 8,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
            padding: "8px 10px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "5px 10px",
          }}>
            {calcs.margin !== null && (
              <CalcRow label="Req. Margin"
                value={formatCurrency(calcs.margin)}
                note={`@ 1:${lotSpec.leverage}`} />
            )}
            {calcs.posValue !== null && (
              <CalcRow label="Position Value"
                value={formatCurrency(calcs.posValue)} />
            )}
            {calcs.pipVal !== null && (
              <CalcRow label="Pip Value"
                value={`${calcs.pipVal.toFixed(2)} USD`}
                note="per pip" />
            )}
            {calcs.units > 0 && (
              <CalcRow label="Units"
                value={formatUnits(calcs.units)} />
            )}
          </div>
        )}
        {specLoading && !lotSpec && !deltaSpec && (
          <div style={{
            borderRadius: 8, background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)", padding: "8px 10px",
            fontSize: 10, color: TEXT_DIM, textAlign: "center",
          }}>
            Loading margin data…
          </div>
        )}

        {/* Limit price */}
        {orderType === "Limit" && (
          <div>
            <label style={LABEL_CLS}>Limit Price</label>
            <input value={price} onChange={e => setPrice(e.target.value)}
              placeholder={livePrice ? livePrice.toFixed(spec?.digits ?? 2) : "0"}
              type="number" min="0" step="any" style={INPUT_CLS} />
          </div>
        )}

        {/* SL / TP */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={LABEL_CLS}>Stop Loss</label>
            <input value={stopLoss} onChange={e => setStopLoss(e.target.value)}
              placeholder="Optional" type="number" min="0" step="any" style={INPUT_CLS} />
          </div>
          <div>
            <label style={LABEL_CLS}>Take Profit</label>
            <input value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
              placeholder="Optional" type="number" min="0" step="any" style={INPUT_CLS} />
          </div>
        </div>

        {/* Status */}
        {status === "success" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORD}` }}>
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
            <p className="text-[11px]" style={{ color: ACCENT }}>{msg}</p>
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#ef4444" }} />
            <p className="text-[11px]" style={{ color: "#f87171" }}>{msg}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={status === "loading" || (isDelta ? !deltaSpec : !lotSpec) || !!qtyError}
          className="h-9 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-2"
          style={{
            background: side === "Buy" ? "rgba(74,222,128,0.20)" : "rgba(248,113,113,0.20)",
            color: sideColor,
            border: `1px solid ${side === "Buy" ? "rgba(74,222,128,0.30)" : "rgba(248,113,113,0.30)"}`,
            opacity: ((isDelta ? !deltaSpec : !lotSpec) || !!qtyError) ? 0.45 : 1,
            cursor: ((isDelta ? !deltaSpec : !lotSpec) || !!qtyError) ? "not-allowed" : "pointer",
          }}
        >
          {status === "loading"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Placing…</>
            : `${side} ${orderType}`}
        </button>

        {/* Spec source tag */}
        {spec && !specLoading && (
          <p style={{ fontSize: 9, color: "rgba(167,184,169,0.25)", textAlign: "center" }}>
            Spec via {spec.broker === "ctrader" ? "cTrader ProtoOA" : "Delta REST"}
            {" · "}Updated {new Date(spec.fetchedAt).toLocaleTimeString()}
          </p>
        )}
      </form>
    </div>
  );
}

// ── CalcRow sub-component ──────────────────────────────────────────────────

function CalcRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "rgba(167,184,169,0.45)", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#F3FFF3" }}>{value}</div>
      {note && <div style={{ fontSize: 9, color: "rgba(167,184,169,0.35)" }}>{note}</div>}
    </div>
  );
}
