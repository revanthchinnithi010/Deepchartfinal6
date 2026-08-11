import { useState, useMemo, useEffect, useRef } from "react";
import { Minus, Plus, ChevronDown } from "lucide-react";
import {
  type DeltaQtySpec,
  contractsToDisplayQty,
  displayQtyToContracts,
  formatDeltaQty,
  snapContracts,
} from "@/lib/deltaMath";

/**
 * DeltaQuantitySection — Delta Exchange-only quantity input, styled after the
 * official Delta Exchange mobile app. Fully independent from cTrader's lot UI
 * (see the sibling ternary branch in MobileChartLayout.tsx) — nothing here is
 * shared with, or should ever be reused for, cTrader.
 *
 * `lotQty` (owned by the parent) stays in the SAME canonical convention as
 * before this component existed (i.e. spec.quantityMode display units), so
 * margin calculations / order submission elsewhere in the file are untouched.
 * The unit selector (Lot / USD / native asset) here is purely a presentation
 * + typing convenience layer that converts through whole contracts.
 */

type DeltaUnit = "lot" | "usd" | "native";

const TEXT_DIM   = "rgba(255,255,255,0.45)";
const TEXT_HI    = "rgba(255,255,255,0.92)";
const CARD       = "#181818";
const BORDER     = "rgba(255,255,255,0.09)";
const ACCENT     = "#F97316";

interface Props {
  dq:        DeltaQtySpec | null;
  lotQty:    number;
  setLotQty: (v: number) => void;
  livePrice: number | null;
  /** Called on every keystroke with the live lotQty (in display units), or null when
   *  the user finishes editing (blur / +/- button). Parent uses this for live margin. */
  onTypingQtyChange?: (lotQty: number | null) => void;
}

function unitLabel(unit: DeltaUnit, dq: DeltaQtySpec | null): string {
  if (unit === "lot") return "Lot";
  if (unit === "usd") return "USD";
  return dq?.contractUnit ?? "Coin";
}

/** contracts -> value shown for the given unit (null if not representable, e.g. USD w/o price) */
function contractsToUnit(contracts: number, unit: DeltaUnit, dq: DeltaQtySpec, price: number | null): number | null {
  if (unit === "lot") return contracts;
  const native = contracts * dq.contractValue;
  if (unit === "native") return native;
  if (!price || price <= 0) return null;
  return native * price;
}

/** value in the given unit -> raw (unsnapped) contract count */
function unitToContracts(value: number, unit: DeltaUnit, dq: DeltaQtySpec, price: number | null): number | null {
  if (unit === "lot") return value;
  if (unit === "native") return value / dq.contractValue;
  if (!price || price <= 0) return null;
  return value / (dq.contractValue * price);
}

function precisionFor(unit: DeltaUnit, dq: DeltaQtySpec): number {
  if (unit === "usd") return 2;
  if (unit === "lot") return 0;
  return dq.quantityMode === "coin" ? dq.quantityPrecision : 0;
}

/** Round to maxDecimals but drop trailing zeros when the value is a whole number. */
function smartFixed(v: number, maxDecimals: number): string {
  if (!isFinite(v)) return "0";
  const rounded = parseFloat(v.toFixed(maxDecimals));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(maxDecimals);
}

export function DeltaQuantitySection({ dq, lotQty, setLotQty, livePrice, onTypingQtyChange }: Props) {
  const [unit, setUnit]           = useState<DeltaUnit>("lot");
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [displayStr, setDisplayStr]     = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const contracts = useMemo(
    () => (dq ? displayQtyToContracts(lotQty, dq) : 0),
    [dq, lotQty],
  );

  // Keep the visible input string in sync with the canonical qty + selected unit,
  // except while the user is actively typing (handled via onChange below).
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (editing || !dq) return;
    const v = contractsToUnit(contracts, unit, dq, livePrice);
    setDisplayStr(v == null ? "" : v.toFixed(precisionFor(unit, dq)));
  }, [contracts, unit, dq, livePrice, editing]);

  useEffect(() => {
    if (!unitMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUnitMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [unitMenuOpen]);

  if (!dq) {
    return (
      <div style={{
        height: 40, borderRadius: 8, background: CARD, border: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: TEXT_DIM,
      }}>
        Loading spec…
      </div>
    );
  }

  const minDisplay  = contractsToDisplayQty(dq.minOrderSizeContracts, dq);
  const maxDisplay  = contractsToDisplayQty(dq.maxOrderSizeContracts, dq);
  const stepDisplay = contractsToDisplayQty(dq.stepSizeContracts, dq);
  const atMin = lotQty <= minDisplay;
  const atMax = lotQty >= maxDisplay;

  // Live equivalent line — recomputed on every keystroke from whatever the user
  // has typed so far (not just the committed/snapped value), so it tracks the
  // input in real time exactly like the official Delta app.
  const typed = parseFloat(displayStr);
  const previewValue = !isNaN(typed) && typed >= 0 ? typed : contractsToUnit(contracts, unit, dq, livePrice) ?? 0;
  const previewLots = unit === "lot" ? previewValue : (unitToContracts(previewValue, unit, dq, livePrice) ?? 0);
  const previewNative = previewLots * dq.contractValue;
  const previewUsd = livePrice && livePrice > 0 ? previewNative * livePrice : null;
  const asset = dq.contractUnit;
  const lotWord = (n: number) => (Math.abs(n - 1) < 1e-9 ? "Lot" : "Lots");

  let equivalentText: string;
  if (unit === "lot") {
    equivalentText = `${smartFixed(previewLots, 0)} ${lotWord(previewLots)} ≈ ${formatDeltaQty(previewNative, dq)} ${asset}`;
  } else if (unit === "native") {
    equivalentText = `${formatDeltaQty(previewNative, dq)} ${asset} = ${smartFixed(previewLots, 2)} ${lotWord(previewLots)}`;
  } else {
    equivalentText = previewUsd != null
      ? `${smartFixed(previewValue, 2)} USD ≈ ${formatDeltaQty(previewNative, dq)} ${asset} (${smartFixed(previewLots, 2)} ${lotWord(previewLots)})`
      : `≈ ${formatDeltaQty(previewNative, dq)} ${asset} (${smartFixed(previewLots, 2)} ${lotWord(previewLots)})`;
  }

  const commit = (rawContracts: number | null) => {
    // Typing is done — clear the live preview before committing
    onTypingQtyChange?.(null);
    if (rawContracts == null || isNaN(rawContracts)) {
      setLotQty(minDisplay);
      return;
    }
    const snapped = snapContracts(rawContracts, dq);
    setLotQty(contractsToDisplayQty(snapped, dq));
  };

  const step = (dir: 1 | -1) => {
    // +/- commits immediately; clear any in-progress typed preview first
    onTypingQtyChange?.(null);
    const snapped = snapContracts(contracts + dir * dq.stepSizeContracts, dq);
    setLotQty(contractsToDisplayQty(snapped, dq));
  };

  const handleUnitChange = (next: DeltaUnit) => {
    setUnit(next);
    setUnitMenuOpen(false);
    setEditing(false);
  };

  return (
    <div>
      {/* [-] input+unit [+] */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atMin}
          style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: CARD, border: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: atMin ? "not-allowed" : "pointer",
            opacity: atMin ? 0.35 : 1,
          }}
        >
          <Minus style={{ width: 13, height: 13, color: TEXT_HI }} />
        </button>

        <div style={{
          flex: 1, height: 36, borderRadius: 8,
          background: CARD, border: `1px solid ${BORDER}`,
          display: "flex", alignItems: "stretch", overflow: "hidden",
        }}>
          <input
            type="number"
            inputMode="decimal"
            value={displayStr}
            onFocus={() => setEditing(true)}
            onChange={e => {
              setDisplayStr(e.target.value);
              // Fire live margin update on every keystroke (local math — no debounce needed)
              const n = parseFloat(e.target.value);
              if (!isNaN(n) && n > 0) {
                const rawContracts = unitToContracts(n, unit, dq, livePrice);
                if (rawContracts !== null && rawContracts > 0) {
                  // Pass as lotQty display units (not snapped — shows intent, blur will snap)
                  onTypingQtyChange?.(contractsToDisplayQty(Math.round(rawContracts), dq));
                } else {
                  onTypingQtyChange?.(null);
                }
              } else {
                onTypingQtyChange?.(null);
              }
            }}
            onBlur={e => {
              setEditing(false);
              const n = parseFloat(e.target.value);
              if (isNaN(n) || n <= 0) { commit(null); return; }
              const rawContracts = unitToContracts(n, unit, dq, livePrice);
              commit(rawContracts);
            }}
            style={{
              flex: 1, minWidth: 0, background: "transparent", border: "none",
              outline: "none", color: TEXT_HI, fontSize: 14, fontWeight: 700,
              textAlign: "center", padding: "0 6px",
            }}
          />

          {/* Unit selector — right side of the input */}
          <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setUnitMenuOpen(o => !o)}
              style={{
                height: "100%", display: "flex", alignItems: "center", gap: 3,
                padding: "0 8px", background: "rgba(255,255,255,0.05)",
                borderLeft: `1px solid ${BORDER}`, border: "none", borderLeftWidth: 1,
                borderLeftStyle: "solid", borderLeftColor: BORDER,
                color: TEXT_HI, fontSize: 11, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {unitLabel(unit, dq)}
              <ChevronDown style={{ width: 11, height: 11, color: TEXT_DIM }} />
            </button>

            {unitMenuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30,
                background: "#1f1f1f", border: `1px solid ${BORDER}`, borderRadius: 8,
                overflow: "hidden", minWidth: 88, boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              }}>
                {(["lot", "usd", "native"] as DeltaUnit[]).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => handleUnitChange(u)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "8px 10px", background: unit === u ? "rgba(249,115,22,0.12)" : "transparent",
                      border: "none", cursor: "pointer",
                      color: unit === u ? ACCENT : TEXT_HI, fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {unitLabel(u, dq)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={atMax}
          style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: CARD, border: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: atMax ? "not-allowed" : "pointer",
            opacity: atMax ? 0.35 : 1,
          }}
        >
          <Plus style={{ width: 13, height: 13, color: TEXT_HI }} />
        </button>
      </div>

      {/* Live equivalent — updates on every keystroke as the user types */}
      <div style={{ marginTop: 5, fontSize: 10, color: TEXT_DIM, fontWeight: 600 }}>
        {equivalentText}
      </div>

      {/* Min / Max / Step */}
      <div style={{ marginTop: 2, fontSize: 9, color: "rgba(255,255,255,0.20)" }}>
        {`Min ${formatDeltaQty(minDisplay, dq)} • Max ${formatDeltaQty(maxDisplay, dq)} • Step ${formatDeltaQty(stepDisplay, dq)} ${dq.contractUnit}`}
      </div>
    </div>
  );
}

export default DeltaQuantitySection;
