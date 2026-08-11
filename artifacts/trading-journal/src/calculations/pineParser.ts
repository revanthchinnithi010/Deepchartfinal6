import type { OHLCBar } from "@/store/chartStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PineResultType =
  | "EMA" | "SMA" | "RSI" | "VWAP" | "WAVETREND"
  | "SMC_FULL" | "SMC_STRUCTURE" | "SMC_FVG" | "SMC_OB" | "SMC_LIQUIDITY"
  | "UNKNOWN";

export interface PinePlot {
  time:  number;
  value: number;
}

/** A single rendered series (line or area) */
export interface PineSeries {
  id:             string;
  name:           string;
  plots:          PinePlot[];
  color:          string;
  lineWidth?:     number;
  style:          "line" | "area" | "histogram";
  areaTopColor?:  string;
  areaBottomColor?: string;
}

/** Horizontal reference line */
export interface PineHLine {
  price:    number;
  color:    string;
  lineStyle?: "solid" | "dashed" | "dotted";
  label?:   string;
}

export interface PineZone {
  kind:      "fvg_bull" | "fvg_bear" | "ob_bull" | "ob_bear";
  top:       number;
  bottom:    number;
  startTime: number;
  endTime:   number;
  label?:    string;
}

export interface PineLevel {
  kind:  "bos_bull" | "bos_bear" | "choch_bull" | "choch_bear" | "liq_high" | "liq_low";
  price: number;
  time:  number;
  label: string;
}

export interface ParsedPineResult {
  type:        PineResultType;
  overlay:     boolean;      // false = separate oscillator pane
  period?:     number;
  plots:       PinePlot[];   // backward-compat single series
  multiSeries: PineSeries[]; // multi-series support (WaveTrend etc.)
  hlines:      PineHLine[];  // horizontal levels
  zones:       PineZone[];
  levels:      PineLevel[];
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parsePineScript(code: string): { type: PineResultType; period?: number; overlay: boolean } {
  const lower = code.toLowerCase();

  // WaveTrend detection — look for characteristic variables/functions
  const isWT = /wavetrend|wt[\s_]?lb|wt1|wt2|tci\s*=|hlc3|ci\s*=\s*\(ap|channel.?length/.test(lower)
    || (/wt1/.test(lower) && /wt2/.test(lower));
  if (isWT) return { type: "WAVETREND", overlay: false };

  // overlay=false detection for generic oscillators
  const overlayFalse = /overlay\s*=\s*false/.test(lower);

  // SMC keywords
  const smcKw = /\b(bos|choch|ob|order[\s._-]?block|fvg|fair[\s._-]?value|liquidity|smc|smart[\s._-]?money|imbalance|supply|demand)\b/;
  if (smcKw.test(lower)) {
    const hasBOS = /\b(bos|choch|structure)\b/.test(lower);
    const hasFVG = /\b(fvg|fair[\s._-]?value|imbalance)\b/.test(lower);
    const hasOB  = /\b(ob|order[\s._-]?block|supply|demand)\b/.test(lower);
    const hasLiq = /\b(liquidity|equal[\s._-]?(high|low))\b/.test(lower);
    if ([hasBOS, hasFVG, hasOB, hasLiq].filter(Boolean).length >= 2) return { type: "SMC_FULL", overlay: true };
    if (hasFVG) return { type: "SMC_FVG", overlay: true };
    if (hasBOS) return { type: "SMC_STRUCTURE", overlay: true };
    if (hasOB)  return { type: "SMC_OB", overlay: true };
    if (hasLiq) return { type: "SMC_LIQUIDITY", overlay: true };
    return { type: "SMC_FULL", overlay: true };
  }

  const emaM = code.match(/ta\.ema\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (emaM) return { type: "EMA", period: parseInt(emaM[1], 10), overlay: true };

  const smaM = code.match(/ta\.sma\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (smaM) return { type: "SMA", period: parseInt(smaM[1], 10), overlay: true };

  const rsiM = code.match(/ta\.rsi\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);
  if (rsiM) return { type: "RSI", period: parseInt(rsiM[1], 10), overlay: !overlayFalse };

  if (/ta\.vwap/.test(code)) return { type: "VWAP", overlay: true };

  return { type: "UNKNOWN", overlay: true };
}

// ── Calculation helpers ───────────────────────────────────────────────────────

function ema(vals: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let e = vals[0];
  for (let i = 0; i < vals.length; i++) {
    if (i === 0) { out.push(vals[0]); continue; }
    e = vals[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

function sma(vals: number[], period: number): number[] {
  return vals.map((_, i) => {
    if (i < period - 1) return 0;
    return vals.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

export function calcEMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let e: number | null = null;
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) { e = values.slice(0, period).reduce((s, v) => s + v, 0) / period; out.push(e); continue; }
    e = values[i] * k + e! * (1 - k);
    out.push(e);
  }
  return out;
}

function calcSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) =>
    i < period - 1 ? null : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  );
}

function calcVWAP(bars: OHLCBar[]): (number | null)[] {
  let pv = 0, vol = 0;
  return bars.map(b => {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume; vol += b.volume;
    return vol > 0 ? pv / vol : null;
  });
}

function calcRSI(closes: number[], period: number): (number | null)[] {
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

// ── WaveTrend calculation ─────────────────────────────────────────────────────

function calcWaveTrend(
  bars: OHLCBar[],
  n1 = 10,   // channel length
  n2 = 21,   // average length
  smaPeriod = 4,
): { wt1: number[]; wt2: number[]; diff: number[] } {
  const ap = bars.map(b => (b.high + b.low + b.close) / 3); // hlc3
  const esaArr = ema(ap, n1);
  const dArr = ema(ap.map((v, i) => Math.abs(v - esaArr[i])), n1);
  const ci = ap.map((v, i) => {
    const d = dArr[i];
    return d < 1e-10 ? 0 : (v - esaArr[i]) / (0.015 * d);
  });
  const wt1 = ema(ci, n2);
  const wt2 = sma(wt1, smaPeriod);
  const diff = wt1.map((v, i) => v - wt2[i]);
  return { wt1, wt2, diff };
}

// ── Supertrend ────────────────────────────────────────────────────────────────

export interface SupertrendPoint { value: number; bull: boolean }

export function calcSupertrend(bars: OHLCBar[], period = 10, mult = 3): (SupertrendPoint | null)[] {
  if (bars.length < period + 1) return bars.map(() => null);
  const trArr = bars.map((b, i) => {
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

// ── Extract params from Pine code ─────────────────────────────────────────────

function extractIntParam(code: string, names: string[], defaultVal: number): number {
  for (const name of names) {
    const m = code.match(new RegExp(`${name}\\s*=\\s*input\\.int\\s*\\(\\s*(\\d+)`, "i"))
      ?? code.match(new RegExp(`${name}\\s*=\\s*(\\d+)`, "i"));
    if (m) return parseInt(m[1], 10);
  }
  return defaultVal;
}

// ── Main compute function ─────────────────────────────────────────────────────

export function computeCustomIndicator(
  parsed: { type: PineResultType; period?: number; overlay: boolean },
  bars: OHLCBar[],
  color: string,
  pineCode = "",
): ParsedPineResult {
  const base: ParsedPineResult = {
    type: parsed.type,
    overlay: parsed.overlay,
    period: parsed.period,
    plots: [], multiSeries: [], hlines: [], zones: [], levels: [],
  };
  if (bars.length < 5) return base;

  const closes = bars.map(b => b.close);

  switch (parsed.type) {
    case "EMA": {
      const p = parsed.period ?? 9;
      const vals = calcEMA(closes, p);
      base.plots = bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time, value: vals[i]! }] : []);
      break;
    }
    case "SMA": {
      const p = parsed.period ?? 20;
      const vals = calcSMA(closes, p);
      base.plots = bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time, value: vals[i]! }] : []);
      break;
    }
    case "VWAP": {
      const vals = calcVWAP(bars);
      base.plots = bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time, value: vals[i]! }] : []);
      break;
    }
    case "RSI": {
      const p = parsed.period ?? 14;
      const rsiVals = calcRSI(closes, p);
      const slice = closes.slice(-100);
      const minP = Math.min(...slice), maxP = Math.max(...slice);
      const range = maxP - minP || 1;
      base.plots = bars.flatMap((b, i) => {
        const r = rsiVals[i];
        return r != null ? [{ time: b.time, value: minP + (r / 100) * range }] : [];
      });
      break;
    }
    case "WAVETREND": {
      const n1  = extractIntParam(pineCode, ["n1", "channel_length", "channelLength"], 10);
      const n2  = extractIntParam(pineCode, ["n2", "average_length", "averageLength"], 21);
      const ob1 = extractIntParam(pineCode, ["obLevel1", "oblevel1"], 60);
      const ob2 = extractIntParam(pineCode, ["obLevel2", "oblevel2"], 53);
      const os1 = Math.abs(extractIntParam(pineCode, ["osLevel1", "oslevel1"], -60));
      const os2 = Math.abs(extractIntParam(pineCode, ["osLevel2", "oslevel2"], -53));

      if (bars.length < n2 + 4) break;

      const { wt1, wt2, diff } = calcWaveTrend(bars, n1, n2);

      base.multiSeries = [
        {
          id: "wt_diff",
          name: "WT Diff",
          plots: bars.map((b, i) => ({ time: b.time, value: diff[i] })),
          color: "rgba(59,130,246,0.25)",
          style: "area",
          areaTopColor: "rgba(59,130,246,0.30)",
          areaBottomColor: "rgba(59,130,246,0.05)",
        },
        {
          id: "wt2",
          name: "WT2",
          plots: bars.map((b, i) => ({ time: b.time, value: wt2[i] })),
          color: "#ef4444",
          lineWidth: 1,
          style: "line",
        },
        {
          id: "wt1",
          name: "WT1",
          plots: bars.map((b, i) => ({ time: b.time, value: wt1[i] })),
          color: "#22c55e",
          lineWidth: 1,
          style: "line",
        },
      ];

      base.hlines = [
        { price:  ob1, color: "rgba(239,68,68,0.7)",   lineStyle: "solid",  label: `${ob1}` },
        { price:  ob2, color: "rgba(239,68,68,0.45)",  lineStyle: "dashed", label: `${ob2}` },
        { price:  0,   color: "rgba(156,163,175,0.5)", lineStyle: "solid",  label: "0" },
        { price: -os2, color: "rgba(34,197,94,0.45)",  lineStyle: "dashed", label: `-${os2}` },
        { price: -os1, color: "rgba(34,197,94,0.7)",   lineStyle: "solid",  label: `-${os1}` },
      ];
      break;
    }
    case "SMC_FULL":
    case "SMC_STRUCTURE": {
      const { levels } = detectStructure(bars);
      base.levels = levels;
      if (parsed.type === "SMC_FULL") {
        const { zones: fvgZ } = detectFVG(bars);
        const { zones: obZ }  = detectOB(bars);
        const { levels: liqL } = detectLiquidity(bars);
        base.zones  = [...fvgZ, ...obZ];
        base.levels = [...levels, ...liqL];
      }
      break;
    }
    case "SMC_FVG":      { const { zones }  = detectFVG(bars);       base.zones  = zones;  break; }
    case "SMC_OB":       { const { zones }  = detectOB(bars);        base.zones  = zones;  break; }
    case "SMC_LIQUIDITY":{ const { levels } = detectLiquidity(bars); base.levels = levels; break; }
    default: break;
  }

  void color;
  return base;
}

// ── SMC pattern detectors ─────────────────────────────────────────────────────

function detectFVG(bars: OHLCBar[]): { zones: PineZone[] } {
  const zones: PineZone[] = [];
  const last = bars.slice(-200);
  for (let i = 2; i < last.length; i++) {
    const a = last[i - 2], c = last[i];
    if (a.high < c.low) {
      zones.push({ kind: "fvg_bull", top: c.low, bottom: a.high, startTime: a.time, endTime: c.time, label: "FVG" });
    } else if (a.low > c.high) {
      zones.push({ kind: "fvg_bear", top: a.low, bottom: c.high, startTime: a.time, endTime: c.time, label: "FVG" });
    }
  }
  return { zones: zones.slice(-8) };
}

function detectOB(bars: OHLCBar[]): { zones: PineZone[] } {
  const zones: PineZone[] = [];
  const last = bars.slice(-150);
  const IMPULSE = 3;
  for (let i = 0; i < last.length - IMPULSE - 1; i++) {
    const ob = last[i];
    if (ob.close < ob.open) {
      let bull = 0;
      for (let j = 1; j <= IMPULSE; j++) if (last[i + j]?.close > last[i + j]?.open) bull++;
      if (bull === IMPULSE) zones.push({ kind: "ob_bull", top: ob.open, bottom: ob.close, startTime: ob.time, endTime: last[i + IMPULSE].time, label: "OB" });
    }
    if (ob.close > ob.open) {
      let bear = 0;
      for (let j = 1; j <= IMPULSE; j++) if (last[i + j]?.close < last[i + j]?.open) bear++;
      if (bear === IMPULSE) zones.push({ kind: "ob_bear", top: ob.close, bottom: ob.open, startTime: ob.time, endTime: last[i + IMPULSE].time, label: "OB" });
    }
  }
  return { zones: zones.slice(-6) };
}

function detectStructure(bars: OHLCBar[]): { levels: PineLevel[] } {
  const levels: PineLevel[] = [];
  const last = bars.slice(-120);
  const swingHighs: { price: number; time: number }[] = [];
  const swingLows:  { price: number; time: number }[] = [];
  for (let i = 2; i < last.length - 2; i++) {
    const b = last[i];
    if (b.high > last[i-1].high && b.high > last[i-2].high && b.high > last[i+1].high && b.high > last[i+2].high)
      swingHighs.push({ price: b.high, time: b.time });
    if (b.low < last[i-1].low && b.low < last[i-2].low && b.low < last[i+1].low && b.low < last[i+2].low)
      swingLows.push({ price: b.low, time: b.time });
  }
  for (let i = 1; i < swingHighs.length; i++) {
    if (swingHighs[i].price > swingHighs[i-1].price)
      levels.push({ kind: "bos_bull", price: swingHighs[i-1].price, time: swingHighs[i].time, label: "BOS" });
  }
  for (let i = 1; i < swingLows.length; i++) {
    if (swingLows[i].price < swingLows[i-1].price)
      levels.push({ kind: "bos_bear", price: swingLows[i-1].price, time: swingLows[i].time, label: "BOS" });
  }
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lH = swingHighs[swingHighs.length - 1], pH = swingHighs[swingHighs.length - 2];
    const lL = swingLows[swingLows.length - 1],  pL = swingLows[swingLows.length - 2];
    if (lH.price < pH.price && lL.price < pL.price)
      levels.push({ kind: "choch_bear", price: lH.price, time: lH.time, label: "CHoCH" });
    if (lH.price > pH.price && lL.price > pL.price)
      levels.push({ kind: "choch_bull", price: lL.price, time: lL.time, label: "CHoCH" });
  }
  return { levels: levels.slice(-10) };
}

function detectLiquidity(bars: OHLCBar[]): { levels: PineLevel[] } {
  const levels: PineLevel[] = [];
  const last = bars.slice(-150);
  const TOL = 0.002;
  for (let i = 0; i < last.length - 5; i++) {
    for (let j = i + 3; j < last.length; j++) {
      if (Math.abs(last[i].high - last[j].high) / last[i].high < TOL) {
        levels.push({ kind: "liq_high", price: (last[i].high + last[j].high) / 2, time: last[j].time, label: "EQH" });
        break;
      }
    }
  }
  for (let i = 0; i < last.length - 5; i++) {
    for (let j = i + 3; j < last.length; j++) {
      if (Math.abs(last[i].low - last[j].low) / last[i].low < TOL) {
        levels.push({ kind: "liq_low", price: (last[i].low + last[j].low) / 2, time: last[j].time, label: "EQL" });
        break;
      }
    }
  }
  return { levels: levels.slice(-8) };
}
