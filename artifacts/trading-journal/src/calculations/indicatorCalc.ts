import type { OHLCBar } from "@/store/chartStore";

export function calcEMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let ema: number | null = null;
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) {
      ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
      out.push(ema); continue;
    }
    ema = values[i] * k + ema! * (1 - k);
    out.push(ema);
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

  // ATR
  const trArr: number[] = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prev = bars[i - 1];
    return Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
  });
  const atr: (number | null)[] = new Array(period - 1).fill(null);
  let atrVal = trArr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  atr.push(atrVal);
  for (let i = period; i < trArr.length; i++) {
    atrVal = (atrVal * (period - 1) + trArr[i]) / period;
    atr.push(atrVal);
  }

  const out: (SupertrendPoint | null)[] = new Array(period - 1).fill(null);
  let prevUp = 0, prevDn = 0, trend = true;

  for (let i = period - 1; i < bars.length; i++) {
    const b = bars[i];
    const hl2 = (b.high + b.low) / 2;
    const a = atr[i]!;
    let up = hl2 + mult * a;
    let dn = hl2 - mult * a;

    if (i > period - 1) {
      if (prevDn > dn || bars[i - 1].close < prevDn) dn = prevDn;
      if (prevUp < up || bars[i - 1].close > prevUp) up = prevUp;
      if (trend && b.close < dn) trend = false;
      else if (!trend && b.close > up) trend = true;
    }

    prevUp = up; prevDn = dn;
    out.push({ value: trend ? dn : up, bull: trend });
  }

  return out;
}

export type { OHLCBar };
