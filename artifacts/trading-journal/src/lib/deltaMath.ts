/**
 * deltaMath.ts — Pure contract-quantity utilities for Delta Exchange order panels.
 *
 * Delta Exchange is COMPLETELY INDEPENDENT from cTrader's lot-based system (see lotMath.ts).
 * Never mix the two: Delta orders are always placed in whole contracts, never "lots".
 *
 * Terminology:
 *  - contractValue: coin (or unit) amount represented by exactly 1 contract, e.g. 0.001 BTC.
 *  - quantityMode "coin": UI shows quantity in the underlying coin (contracts × contractValue),
 *    e.g. "0.001 BTC", "0.01 ETH" — used when contractValue < 1.
 *  - quantityMode "contracts": UI shows the raw integer contract count, e.g. "100 Contracts" —
 *    used when contractValue >= 1.
 *  - Regardless of display mode, the actual order is always submitted as an integer contract count.
 */

export interface DeltaQtySpec {
  contractUnit:          string;
  contractValue:         number;
  minOrderSizeContracts: number;
  maxOrderSizeContracts: number;
  stepSizeContracts:     number;
  tickSize:              number;
  pricePrecision:        number;
  quantityMode:          "coin" | "contracts";
  quantityPrecision:     number;
}

// ── Contracts <-> displayed quantity conversion ───────────────────────────────

/** Convert a whole contract count into the displayed quantity (coin amount or contract count). */
export function contractsToDisplayQty(contracts: number, spec: DeltaQtySpec): number {
  return spec.quantityMode === "coin" ? contracts * spec.contractValue : contracts;
}

/** Convert a displayed quantity (coin amount or contract count) back into whole contracts, rounded. */
export function displayQtyToContracts(displayQty: number, spec: DeltaQtySpec): number {
  const raw = spec.quantityMode === "coin" ? displayQty / spec.contractValue : displayQty;
  return Math.round(raw);
}

/** Format a displayed quantity with the spec's precision. */
export function formatDeltaQty(displayQty: number, spec: DeltaQtySpec): string {
  return displayQty.toFixed(spec.quantityPrecision);
}

/** Human label for the quantity unit, e.g. "BTC", "ETH", "Contracts". */
export function deltaUnitLabel(spec: DeltaQtySpec): string {
  return spec.quantityMode === "coin" ? spec.contractUnit : "Contracts";
}

/**
 * Live "1 Lot = X" reference line, always derived from the Delta contract spec —
 * never hardcoded. Always expressed in the underlying coin unit, regardless of
 * the active quantityMode, e.g. "1 Lot = 0.001 BTC", "1 Lot = 1 FARTCOIN".
 */
export function formatDeltaLotEquivalent(spec: DeltaQtySpec): string {
  const precision = Math.max(0, (String(spec.contractValue).split(".")[1] ?? "").length);
  return `1 Lot = ${spec.contractValue.toFixed(precision)} ${spec.contractUnit}`;
}

// ── Validation & snapping (operate on whole contracts) ────────────────────────

/** Snap a raw contract count to the nearest valid integer step, clamped to [min, max]. */
export function snapContracts(rawContracts: number, spec: DeltaQtySpec): number {
  const { minOrderSizeContracts, maxOrderSizeContracts, stepSizeContracts } = spec;
  if (rawContracts <= minOrderSizeContracts) return minOrderSizeContracts;
  if (rawContracts >= maxOrderSizeContracts) return maxOrderSizeContracts;
  const steps = Math.round((rawContracts - minOrderSizeContracts) / stepSizeContracts);
  return minOrderSizeContracts + steps * stepSizeContracts;
}

/** Return the next valid contract count above current, clamped to max. */
export function incrementContracts(contracts: number, spec: DeltaQtySpec): number {
  return Math.min(spec.maxOrderSizeContracts, contracts + spec.stepSizeContracts);
}

/** Return the next valid contract count below current, clamped to min. */
export function decrementContracts(contracts: number, spec: DeltaQtySpec): number {
  return Math.max(spec.minOrderSizeContracts, contracts - spec.stepSizeContracts);
}

/** Returns true if the contract count is a valid, in-range whole-contract quantity. */
export function isValidContracts(contracts: number, spec: DeltaQtySpec): boolean {
  if (contracts < spec.minOrderSizeContracts || contracts > spec.maxOrderSizeContracts) return false;
  if (!Number.isInteger(contracts)) return false;
  const steps = (contracts - spec.minOrderSizeContracts) / spec.stepSizeContracts;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

// ── Financial calculations ────────────────────────────────────────────────────

/** Notional position value = contracts × contractValue × price. */
export function calcDeltaPositionValue(contracts: number, price: number, spec: DeltaQtySpec): number {
  return contracts * spec.contractValue * price;
}

/** Required margin = (contracts × contractValue × price) / leverage. */
export function calcDeltaMargin(contracts: number, price: number, leverage: number, spec: DeltaQtySpec): number {
  if (!leverage || leverage <= 0 || !price) return 0;
  return calcDeltaPositionValue(contracts, price, spec) / leverage;
}

/** Format a currency amount, e.g. "1,234.56 USD". */
export function formatDeltaCurrency(amount: number, currency = "USD"): string {
  if (!isFinite(amount)) return `0.00 ${currency}`;
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}
