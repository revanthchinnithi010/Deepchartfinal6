/**
 * lotMath.ts — Pure lot-size utilities for cTrader / forex order panels.
 *
 * All volume values here are in LOTS (already converted).
 * The conversion from raw ProtoOA to lots happens in contract_info.ts (buildCtraderSpec).
 *
 * IMPORTANT — cTrader ProtoOA volume encoding (verified via live hex-dump + formula check):
 *   minVolume, maxVolume, stepVolume (fields 10, 9, 11) are in 1/100 UNITS —
 *   the same unit system as lotSize (field 30). Do NOT divide by just 100.
 *   Correct formula:  volumeLots = rawVolume / (100 × lotSizeUnits)
 *   Example (EURUSD): rawMinVolume=100,000 / (100 × 100,000) = 0.01 lots ✓
 *   The "÷100 = lots" (centilot) interpretation was wrong and yielded 1,000 lots minimum.
 */

export interface LotSpec {
  /** Minimum tradeable quantity in lots, e.g. 0.01 */
  minLots: number;
  /** Maximum tradeable quantity in lots, e.g. 500 */
  maxLots: number;
  /** Increment step in lots, e.g. 0.01 */
  stepLots: number;
  /** Units per 1 standard lot (contract size), e.g. 100_000 for EURUSD */
  lotSize: number;
  /** Account leverage ratio, e.g. 100 for 1:100 */
  leverage: number;
  /** Pip decimal position, e.g. 4 for EURUSD (1 pip = 10^-4) */
  pipPosition: number;
  /** Price decimal places shown by the broker, e.g. 5 for EURUSD */
  digits: number;
}

// ── Precision helpers ────────────────────────────────────────────────────────

/**
 * Compute the number of decimal places needed to represent stepLots accurately.
 * Always at least 2 dp so 0.10 shows as "0.10" not "0.1".
 */
export function computeLotPrecision(stepLots: number): number {
  if (stepLots >= 1) return 2;
  // Remove trailing zeros from the fixed-point representation
  const s = stepLots.toFixed(10).replace(/0+$/, "");
  const dot = s.indexOf(".");
  const dp = dot === -1 ? 0 : s.length - dot - 1;
  return Math.max(2, dp);
}

/**
 * Format a lot quantity for display with the correct precision.
 * Examples: 0.01, 0.10, 1.00, 2.50
 */
export function formatLots(lots: number, precision: number): string {
  return lots.toFixed(precision);
}

// ── Validation & snapping ─────────────────────────────────────────────────────

/**
 * Snap a raw lot value to the nearest valid step, then clamp to [min, max].
 * Handles floating-point drift by rounding to step precision.
 */
export function snapToStep(rawLots: number, spec: LotSpec): number {
  const { minLots, maxLots, stepLots } = spec;
  if (rawLots <= minLots) return minLots;
  if (rawLots >= maxLots) return maxLots;
  const prec = computeLotPrecision(stepLots);
  const steps = Math.round((rawLots - minLots) / stepLots);
  const snapped = minLots + steps * stepLots;
  return parseFloat(snapped.toFixed(prec));
}

/** Return the next valid step above current lots, clamped to maxLots. */
export function incrementLots(lots: number, spec: LotSpec): number {
  const prec = computeLotPrecision(spec.stepLots);
  const next = parseFloat((lots + spec.stepLots).toFixed(prec));
  return Math.min(spec.maxLots, next);
}

/** Return the next valid step below current lots, clamped to minLots. */
export function decrementLots(lots: number, spec: LotSpec): number {
  const prec = computeLotPrecision(spec.stepLots);
  const next = parseFloat((lots - spec.stepLots).toFixed(prec));
  return Math.max(spec.minLots, next);
}

/** Returns true if the lot value is valid per the spec. */
export function isValidLots(lots: number, spec: LotSpec): boolean {
  if (lots < spec.minLots || lots > spec.maxLots) return false;
  // Must align with step (within floating-point tolerance)
  const prec = computeLotPrecision(spec.stepLots);
  const steps = (lots - spec.minLots) / spec.stepLots;
  return Math.abs(steps - Math.round(steps)) < Math.pow(10, -(prec + 1));
}

// ── Financial calculations ────────────────────────────────────────────────────

/** Total contract units = lots × lotSize */
export function calcUnits(lots: number, lotSize: number): number {
  return lots * lotSize;
}

/**
 * Required margin in account currency:
 *   margin = (lots × lotSize × price) / leverage
 *
 * Assumes quote currency == account currency (USD pairs).
 * For cross pairs, caller should apply a conversion rate.
 */
export function calcMargin(
  lots: number,
  price: number,
  spec: LotSpec,
): number {
  if (!spec.leverage || spec.leverage <= 0 || !price || !spec.lotSize) return 0;
  return (lots * spec.lotSize * price) / spec.leverage;
}

/** Notional position value = lots × lotSize × price */
export function calcPositionValue(
  lots: number,
  price: number,
  lotSize: number,
): number {
  return lots * lotSize * price;
}

/**
 * Pip value per lot in quote currency:
 *   pip value = lots × lotSize × pipSize
 *   where pipSize = 10^(-pipPosition)
 */
export function calcPipValue(lots: number, spec: LotSpec): number {
  const pipSize = Math.pow(10, -spec.pipPosition);
  return lots * spec.lotSize * pipSize;
}

// ── Display formatting ────────────────────────────────────────────────────────

/** Format units with comma separators, no decimals. */
export function formatUnits(units: number): string {
  return units.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Live lot-equivalent reference line for cTrader, e.g. "1 Lot = 100,000 Units".
 * Always derived from the broker's actual lotSize — never hardcoded.
 */
export function formatLotEquivalent(lotSize: number): string {
  return `1 Lot = ${formatUnits(lotSize)} Units`;
}

/** Format a currency amount, e.g. "$1,234.56 USD" */
export function formatCurrency(amount: number, currency = "USD"): string {
  if (!isFinite(amount)) return `0.00 ${currency}`;
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

// ── Sanity validation (for diagnostic logging) ────────────────────────────────

export interface VolumeSanityResult {
  ok:      boolean;
  warning: string | null;
}

/**
 * Validate parsed volume values against known reasonable bounds.
 * If minVolumeLots > 5 for a forex/index instrument, something is wrong
 * (the raw value was not divided by 100, or the wrong proto field was read).
 */
export function validateVolumeSanity(
  minVolumeLots: number,
  maxVolumeLots: number,
  stepVolumeLots: number,
  symbol: string,
): VolumeSanityResult {
  if (minVolumeLots <= 0) {
    return { ok: false, warning: `minVolumeLots=${minVolumeLots} is non-positive — parse error` };
  }
  if (minVolumeLots > 10) {
    return {
      ok: false,
      warning:
        `minVolumeLots=${minVolumeLots} for ${symbol} is suspiciously large. ` +
        `Check ProtoOA field mapping: minVolume should be field 10, divided by 100. ` +
        `If raw value=${Math.round(minVolumeLots * 100)} is the lot count, ` +
        `the /100 conversion may be missing.`,
    };
  }
  if (maxVolumeLots < minVolumeLots) {
    return { ok: false, warning: `maxVolumeLots=${maxVolumeLots} < minVolumeLots=${minVolumeLots}` };
  }
  if (stepVolumeLots <= 0 || stepVolumeLots > minVolumeLots * 10 + 1) {
    return {
      ok: false,
      warning: `stepVolumeLots=${stepVolumeLots} looks wrong (step > 10×min or non-positive)`,
    };
  }
  return { ok: true, warning: null };
}
