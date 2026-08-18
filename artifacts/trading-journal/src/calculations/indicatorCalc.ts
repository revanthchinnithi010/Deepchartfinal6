import type { OHLCBar } from "@/store/chartStore";

/**
 * EMA with a continuous seed from the first available candle.
 *
 * The old implementation returned null for the first period-1 candles, which
 * made a 100 EMA disappear over the left side of the loaded historical chart.
 * We intentionally seed from the first close so the line is continuous across
 * every loaded historical candle. Once enough samples exist, the calculation
 * converges to the standard EMA recurrence.
 */
export function calcEMA(values: number[], period: number): (number | null)[] {
  if (!values.length) return [];
  const p = Math.max(1, Math.floor(period) || 1);
  const k = 2 / (p + 1);
  const out: (number | null)[] = new Array(values.length);
  let ema = values[0];
  out[0] = ema;
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calcSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) =>
    i < period - 1 ? null : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  );
}

export function calcVWAP(bars: OHLCBar[]): (number | null)[] {
  let pv = 0, vol = 0;
  return bars.map(b => {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume; vol += b.volume;
    return vol > 0 ? pv / vol : null;
  });
}

export function calcRSI(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(period).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return out;
}

export interface SupertrendPoint { value: number; bull: boolean }
export function calcSupertrend(bars: OHLCBar[], period = 10, mult = 3): (SupertrendPoint | null)[] {
  if (bars.length < period + 1) return bars.map(() => null);
  const trArr = bars.map((b, i) => { if (i === 0) return b.high - b.low; const prev = bars[i - 1]; return Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close)); });
  const atr: (number | null)[] = new Array(period - 1).fill(null);
  let atrVal = trArr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  atr.push(atrVal);
  for (let i = period; i < trArr.length; i++) { atrVal = (atrVal * (period - 1) + trArr[i]) / period; atr.push(atrVal); }
  const out: (SupertrendPoint | null)[] = new Array(period - 1).fill(null);
  let prevUp = 0, prevDn = 0, trend = true;
  for (let i = period - 1; i < bars.length; i++) {
    const b = bars[i], hl2 = (b.high + b.low) / 2, a = atr[i]!;
    let up = hl2 + mult * a, dn = hl2 - mult * a;
    if (i > period - 1) { if (prevDn > dn || bars[i - 1].close < prevDn) dn = prevDn; if (prevUp < up || bars[i - 1].close > prevUp) up = prevUp; if (trend && b.close < dn) trend = false; else if (!trend && b.close > up) trend = true; }
    prevUp = up; prevDn = dn; out.push({ value: trend ? dn : up, bull: trend });
  }
  return out;
}
export type { OHLCBar };
