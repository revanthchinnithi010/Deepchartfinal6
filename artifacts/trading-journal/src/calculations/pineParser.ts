import type { OHLCBar } from "@/store/chartStore";

export type PineResultType =
  | "EMA" | "SMA" | "RSI" | "VWAP" | "WAVETREND"
  | "SMC_FULL" | "SMC_STRUCTURE" | "SMC_FVG" | "SMC_OB" | "SMC_LIQUIDITY"
  | "UNKNOWN";

export interface PinePlot { time: number; value: number }
export interface PineSeries {
  id: string; name: string; plots: PinePlot[]; color: string;
  lineWidth?: number; style: "line" | "area" | "histogram";
  areaTopColor?: string; areaBottomColor?: string;
}
export interface PineHLine { price: number; color: string; lineStyle?: "solid" | "dashed" | "dotted"; label?: string }
export interface PineZone {
  kind: "fvg_bull" | "fvg_bear" | "ob_bull" | "ob_bear";
  top: number; bottom: number; startTime: number; endTime: number; label?: string;
}
export interface PineLevel {
  kind: "bos_bull" | "bos_bear" | "choch_bull" | "choch_bear" | "liq_high" | "liq_low";
  price: number; time: number; label: string;
}
export interface ParsedPineResult {
  type: PineResultType; overlay: boolean; period?: number;
  plots: PinePlot[]; multiSeries: PineSeries[]; hlines: PineHLine[];
  zones: PineZone[]; levels: PineLevel[];
}

export function parsePineScript(code: string): { type: PineResultType; period?: number; overlay: boolean } {
  const lower = code.toLowerCase();
  if (/wavetrend|wt[\s_]?lb|wt1|wt2|tci\s*=|hlc3|ci\s*=\s*\(ap|channel.?length/.test(lower)) {
    return { type: "WAVETREND", overlay: false };
  }
  const smc = /\b(bos|choch|ob|order[\s._-]?block|fvg|fair[\s._-]?value|liquidity|smc|smart[\s._-]?money|imbalance|supply|demand)\b/;
  if (smc.test(lower)) {
    const hasBos = /\b(bos|choch|structure)\b/.test(lower);
    const hasFvg = /\b(fvg|fair[\s._-]?value|imbalance)\b/.test(lower);
    const hasOb = /\b(ob|order[\s._-]?block|supply|demand)\b/.test(lower);
    const hasLiq = /\b(liquidity|equal[\s._-]?(high|low))\b/.test(lower);
    if ([hasBos, hasFvg, hasOb, hasLiq].filter(Boolean).length >= 2) return { type: "SMC_FULL", overlay: true };
    if (hasFvg) return { type: "SMC_FVG", overlay: true };
    if (hasBos) return { type: "SMC_STRUCTURE", overlay: true };
    if (hasOb) return { type: "SMC_OB", overlay: true };
    return { type: "SMC_LIQUIDITY", overlay: true };
  }
  const emaM = code.match(/ta\.ema\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (emaM) return { type: "EMA", period: Number(emaM[1]), overlay: true };
  const smaM = code.match(/ta\.sma\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (smaM) return { type: "SMA", period: Number(smaM[1]), overlay: true };
  const rsiM = code.match(/ta\.rsi\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (rsiM) return { type: "RSI", period: Number(rsiM[1]), overlay: !/overlay\s*=\s*false/.test(lower) };
  if (/ta\.vwap/.test(code)) return { type: "VWAP", overlay: true };
  return { type: "UNKNOWN", overlay: true };
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const out: number[] = [];
  const k = 2 / (period + 1);
  let e = values[0];
  out.push(e);
  for (let i = 1; i < values.length; i++) { e = values[i] * k + e * (1 - k); out.push(e); }
  return out;
}

function sma(values: number[], period: number): number[] {
  return values.map((_, i) => i < period - 1 ? 0 : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
}

/** Continuous EMA seed so the line is visible across the entire loaded history. */
export function calcEMA(values: number[], period: number): (number | null)[] {
  if (!values.length) return [];
  const p = Math.max(1, Math.floor(period) || 1);
  const k = 2 / (p + 1);
  const out: (number | null)[] = new Array(values.length);
  let e = values[0];
  out[0] = e;
  for (let i = 1; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

function calcSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => i < period - 1 ? null : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
}

function calcVWAP(bars: OHLCBar[]): (number | null)[] {
  let pv = 0, vol = 0;
  return bars.map(b => {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume; vol += b.volume;
    return vol > 0 ? pv / vol : null;
  });
}

function calcRSI(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(period).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  gain /= period; loss /= period;
  out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  }
  return out;
}

function extractInt(code: string, names: string[], fallback: number): number {
  for (const name of names) {
    const m = code.match(new RegExp(`${name}\\s*=\\s*input\\.int\\s*\\(\\s*(-?\\d+)`, "i"))
      ?? code.match(new RegExp(`${name}\\s*=\\s*(-?\\d+)`, "i"));
    if (m) return Number(m[1]);
  }
  return fallback;
}

function calcWaveTrend(bars: OHLCBar[], n1 = 10, n2 = 21, smooth = 4) {
  const ap = bars.map(b => (b.high + b.low + b.close) / 3);
  const esa = ema(ap, n1);
  const dev = ema(ap.map((v, i) => Math.abs(v - esa[i])), n1);
  const ci = ap.map((v, i) => dev[i] < 1e-10 ? 0 : (v - esa[i]) / (0.015 * dev[i]));
  const wt1 = ema(ci, n2);
  const wt2 = sma(wt1, smooth);
  return { wt1, wt2, diff: wt1.map((v, i) => v - wt2[i]) };
}

function detectFVG(bars: OHLCBar[]): PineZone[] {
  const zones: PineZone[] = [];
  const a = bars.slice(-200);
  for (let i = 2; i < a.length; i++) {
    const left = a[i - 2], right = a[i];
    if (left.high < right.low) zones.push({ kind: "fvg_bull", top: right.low, bottom: left.high, startTime: left.time, endTime: right.time, label: "FVG" });
    else if (left.low > right.high) zones.push({ kind: "fvg_bear", top: left.low, bottom: right.high, startTime: left.time, endTime: right.time, label: "FVG" });
  }
  return zones.slice(-8);
}

function detectOB(bars: OHLCBar[]): PineZone[] {
  const zones: PineZone[] = [];
  const a = bars.slice(-150);
  for (let i = 0; i < a.length - 4; i++) {
    const b = a[i];
    if (b.close < b.open && [1, 2, 3].every(j => a[i + j].close > a[i + j].open)) {
      zones.push({ kind: "ob_bull", top: b.open, bottom: b.close, startTime: b.time, endTime: a[i + 3].time, label: "OB" });
    }
    if (b.close > b.open && [1, 2, 3].every(j => a[i + j].close < a[i + j].open)) {
      zones.push({ kind: "ob_bear", top: b.close, bottom: b.open, startTime: b.time, endTime: a[i + 3].time, label: "OB" });
    }
  }
  return zones.slice(-6);
}

function detectStructure(bars: OHLCBar[]): PineLevel[] {
  const a = bars.slice(-120);
  const highs: { price: number; time: number }[] = [];
  const lows: { price: number; time: number }[] = [];
  for (let i = 2; i < a.length - 2; i++) {
    const b = a[i];
    if (b.high > a[i - 1].high && b.high > a[i - 2].high && b.high > a[i + 1].high && b.high > a[i + 2].high) highs.push({ price: b.high, time: b.time });
    if (b.low < a[i - 1].low && b.low < a[i - 2].low && b.low < a[i + 1].low && b.low < a[i + 2].low) lows.push({ price: b.low, time: b.time });
  }
  const levels: PineLevel[] = [];
  for (let i = 1; i < highs.length; i++) if (highs[i].price > highs[i - 1].price) levels.push({ kind: "bos_bull", price: highs[i - 1].price, time: highs[i].time, label: "BOS" });
  for (let i = 1; i < lows.length; i++) if (lows[i].price < lows[i - 1].price) levels.push({ kind: "bos_bear", price: lows[i - 1].price, time: lows[i].time, label: "BOS" });
  if (highs.length >= 2 && lows.length >= 2) {
    const h = highs[highs.length - 1], ph = highs[highs.length - 2];
    const l = lows[lows.length - 1], pl = lows[lows.length - 2];
    if (h.price < ph.price && l.price < pl.price) levels.push({ kind: "choch_bear", price: h.price, time: h.time, label: "CHoCH" });
    if (h.price > ph.price && l.price > pl.price) levels.push({ kind: "choch_bull", price: l.price, time: l.time, label: "CHoCH" });
  }
  return levels.slice(-10);
}

function detectLiquidity(bars: OHLCBar[]): PineLevel[] {
  const a = bars.slice(-150), levels: PineLevel[] = [];
  for (let i = 0; i < a.length - 5; i++) for (let j = i + 3; j < a.length; j++) {
    if (Math.abs(a[i].high - a[j].high) / a[i].high < 0.002) { levels.push({ kind: "liq_high", price: (a[i].high + a[j].high) / 2, time: a[j].time, label: "EQH" }); break; }
  }
  for (let i = 0; i < a.length - 5; i++) for (let j = i + 3; j < a.length; j++) {
    if (Math.abs(a[i].low - a[j].low) / a[i].low < 0.002) { levels.push({ kind: "liq_low", price: (a[i].low + a[j].low) / 2, time: a[j].time, label: "EQL" }); break; }
  }
  return levels.slice(-8);
}

export function computeCustomIndicator(
  parsed: { type: PineResultType; period?: number; overlay: boolean },
  bars: OHLCBar[], color: string, pineCode = "",
): ParsedPineResult {
  const base: ParsedPineResult = { type: parsed.type, overlay: parsed.overlay, period: parsed.period, plots: [], multiSeries: [], hlines: [], zones: [], levels: [] };
  if (bars.length < 5) return base;
  const closes = bars.map(b => b.close);

  if (parsed.type === "EMA") {
    const vals = calcEMA(closes, parsed.period ?? 9);
    base.plots = bars.map((b, i) => ({ time: b.time, value: vals[i]! }));
  } else if (parsed.type === "SMA") {
    const vals = calcSMA(closes, parsed.period ?? 20);
    base.plots = bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time, value: vals[i]! }] : []);
  } else if (parsed.type === "VWAP") {
    const vals = calcVWAP(bars);
    base.plots = bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time, value: vals[i]! }] : []);
  } else if (parsed.type === "RSI") {
    const vals = calcRSI(closes, parsed.period ?? 14);
    const slice = closes.slice(-100), minP = Math.min(...slice), maxP = Math.max(...slice), range = maxP - minP || 1;
    base.plots = bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time, value: minP + (vals[i]! / 100) * range }] : []);
  } else if (parsed.type === "WAVETREND") {
    const n1 = extractInt(pineCode, ["n1", "channel_length", "channelLength"], 10);
    const n2 = extractInt(pineCode, ["n2", "average_length", "averageLength"], 21);
    const { wt1, wt2, diff } = calcWaveTrend(bars, n1, n2);
    base.multiSeries = [
      { id: "wt_diff", name: "WT Diff", plots: bars.map((b, i) => ({ time: b.time, value: diff[i] })), color: "rgba(59,130,246,.25)", style: "area", areaTopColor: "rgba(59,130,246,.3)", areaBottomColor: "rgba(59,130,246,.05)" },
      { id: "wt2", name: "WT2", plots: bars.map((b, i) => ({ time: b.time, value: wt2[i] })), color: "#ef4444", style: "line", lineWidth: 1 },
      { id: "wt1", name: "WT1", plots: bars.map((b, i) => ({ time: b.time, value: wt1[i] })), color: "#22c55e", style: "line", lineWidth: 1 },
    ];
    base.hlines = [
      { price: 60, color: "rgba(239,68,68,.7)" }, { price: 53, color: "rgba(239,68,68,.45)", lineStyle: "dashed" },
      { price: 0, color: "rgba(156,163,175,.5)" }, { price: -53, color: "rgba(34,197,94,.45)", lineStyle: "dashed" },
      { price: -60, color: "rgba(34,197,94,.7)" },
    ];
  } else if (parsed.type === "SMC_FULL" || parsed.type === "SMC_STRUCTURE") {
    base.levels = detectStructure(bars);
    if (parsed.type === "SMC_FULL") {
      base.zones = [...detectFVG(bars), ...detectOB(bars)];
      base.levels = [...base.levels, ...detectLiquidity(bars)];
    }
  } else if (parsed.type === "SMC_FVG") {
    base.zones = detectFVG(bars);
  } else if (parsed.type === "SMC_OB") {
    base.zones = detectOB(bars);
  } else if (parsed.type === "SMC_LIQUIDITY") {
    base.levels = detectLiquidity(bars);
  }

  void color;
  return base;
}
