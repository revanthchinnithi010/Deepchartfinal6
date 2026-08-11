import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Zap, ChevronRight, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";

const PAIRS: Record<string, { label: string; pipSize: number; lotPipValue: number; dp: number; defaultEntry: number; defaultSL: number }> = {
  EURUSD: { label: "EUR/USD", pipSize: 0.0001, lotPipValue: 10,  dp: 4, defaultEntry: 1.0850, defaultSL: 20  },
  GBPJPY: { label: "GBP/JPY", pipSize: 0.01,   lotPipValue: 8.5, dp: 2, defaultEntry: 195.50, defaultSL: 30  },
  XAUUSD: { label: "XAU/USD", pipSize: 0.1,    lotPipValue: 10,  dp: 1, defaultEntry: 2320.0, defaultSL: 15  },
  NAS100: { label: "NAS100",  pipSize: 1,       lotPipValue: 1,   dp: 0, defaultEntry: 18500,  defaultSL: 50  },
  US30:   { label: "US30",    pipSize: 1,       lotPipValue: 1,   dp: 0, defaultEntry: 39500,  defaultSL: 50  },
  USOIL:  { label: "US Oil",  pipSize: 0.01,    lotPipValue: 10,  dp: 2, defaultEntry: 82.50,  defaultSL: 30  },
  UKOIL:  { label: "UK Oil",  pipSize: 0.01,    lotPipValue: 10,  dp: 2, defaultEntry: 86.50,  defaultSL: 30  },
};

const RISK_PRESETS = [0.5, 1, 1.5, 2, 3];
const LEV_PRESETS  = [10, 20, 30, 50, 100, 200, 500];
const LOT_PRESETS  = [0.01, 0.05, 0.1, 0.5, 1];

function fmt(v: number, dp = 2) {
  if (!isFinite(v) || isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUSD(v: number) {
  if (!isFinite(v) || isNaN(v)) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function NumInput({ label, value, onChange, step = 1, min = 0, suffix }: {
  label: string; value: string; onChange: (v: string) => void;
  step?: number; min?: number; suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type="number" step={step} min={min} value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-11 rounded-xl px-3 text-[14px] font-medium text-[#F3FFF3] bg-[#0D1C16] border border-[#395B43]/40 focus:outline-none focus:border-[#B7FF5A]/60 focus:ring-1 focus:ring-[#B7FF5A]/20 transition-all"
          style={{ appearance: "textfield" }}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A7B8A9] font-semibold pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultCard({ label, value, sub, accent, warn }: {
  label: string; value: string; sub?: string; accent?: boolean; warn?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl p-3.5 border transition-all",
      warn   ? "bg-rose-500/8 border-rose-500/20"
      : accent ? "bg-[#B7FF5A]/6 border-[#B7FF5A]/25"
               : "bg-[#0D1C16] border-[#395B43]/30"
    )}>
      <p className="text-[10px] font-semibold text-[#A7B8A9] uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-[18px] font-black leading-tight",
        warn ? "text-rose-400" : accent ? "text-[#B7FF5A]" : "text-[#F3FFF3]"
      )}>{value}</p>
      {sub && <p className="text-[10px] text-[#A7B8A9]/70 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CalcForex() {
  const ticks = useTickStore(s => s.ticks);

  const [pair, setPair]       = useState("EURUSD");
  const [side, setSide]       = useState<"long" | "short">("long");
  const [capital, setCapital] = useState("10000");
  const [risk, setRisk]       = useState("1");
  const [lev, setLev]         = useState("100");
  const [lots, setLots]       = useState("0.1");
  const [slPips, setSlPips]   = useState("20");
  const [tpPips, setTpPips]   = useState("40");

  const cfg       = PAIRS[pair];
  const liveTick  = ticks[pair] ?? null;
  const livePrice = liveTick?.price ?? null;

  const calc = useMemo(() => {
    const cap      = parseFloat(capital) || 0;
    const rPct     = parseFloat(risk) || 0;
    const leverage = parseFloat(lev) || 1;
    const lotsN    = parseFloat(lots) || 0;
    const slP      = parseFloat(slPips) || 0;
    const tpP      = parseFloat(tpPips) || 0;
    const { lotPipValue } = cfg;

    const riskAmount   = cap * rPct / 100;
    const pipCost      = lotsN * lotPipValue;
    const estLoss      = slP * pipCost;
    const estProfit    = tpP * pipCost;
    const rr           = estLoss > 0 ? estProfit / estLoss : 0;
    const recLots      = slP > 0 && lotPipValue > 0 ? riskAmount / (slP * lotPipValue) : 0;
    const tradeValue   = lotsN * 100_000;
    const marginReq    = tradeValue / leverage;
    const marginPct    = cap > 0 ? (marginReq / cap) * 100 : 0;
    const highMargin   = marginPct > 25;
    const overLev      = leverage > 200;

    return { riskAmount, pipCost, estLoss, estProfit, rr, recLots, tradeValue, marginReq, marginPct, highMargin, overLev };
  }, [capital, risk, lev, lots, slPips, tpPips, cfg]);

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#F3FFF3] mb-1">Forex / Indices / Commodities</h1>
        <p className="text-sm text-[#A7B8A9]">Pip-based position sizing for forex, gold, indices, and oil.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* ── Inputs ── */}
        <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5 space-y-5"
          style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>

          {/* Pair selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Market</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PAIRS).map(([k, v]) => (
                <button key={k} onClick={() => { setPair(k); setSlPips(String(v.defaultSL)); }}
                  className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all",
                    k === pair ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                               : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9] hover:border-[#395B43]/60")}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Side */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Direction</label>
            <div className="flex rounded-xl overflow-hidden border border-[#395B43]/30 w-fit">
              {(["long","short"] as const).map(s => (
                <button key={s} onClick={() => setSide(s)}
                  className={cn("px-6 py-2.5 text-[12px] font-bold capitalize transition-all flex items-center gap-1.5",
                    s === side
                      ? s === "long" ? "bg-blue-500/20 text-blue-400" : "bg-rose-500/20 text-rose-400"
                      : "bg-[#0D1C16] text-[#A7B8A9] hover:bg-[#0D1C16]/60")}>
                  {s === "long" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Risk presets */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Risk % Presets</label>
              <div className="flex gap-1.5 flex-wrap">
                {RISK_PRESETS.map(p => (
                  <button key={p} onClick={() => setRisk(String(p))}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                      String(p) === risk ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                        : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9] hover:border-[#395B43]/60")}>
                    {p}%
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Leverage Presets</label>
              <div className="flex gap-1.5 flex-wrap">
                {LEV_PRESETS.map(p => (
                  <button key={p} onClick={() => setLev(String(p))}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                      String(p) === lev ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                       : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9] hover:border-[#395B43]/60")}>
                    {p}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Capital (USD)" value={capital} onChange={setCapital} step={500} suffix="$" />
            <NumInput label="Risk %" value={risk} onChange={setRisk} step={0.1} suffix="%" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Leverage" value={lev} onChange={setLev} step={1} suffix="x" />
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Lot Size</label>
              <div className="flex gap-1.5 flex-wrap mb-1">
                {LOT_PRESETS.map(p => (
                  <button key={p} onClick={() => setLots(String(p))}
                    className={cn("px-2 py-0.5 rounded text-[10px] font-bold border transition-all",
                      String(p) === lots ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                        : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9]")}>
                    {p}
                  </button>
                ))}
              </div>
              <input type="number" step={0.01} min={0.01} value={lots} onChange={e => setLots(e.target.value)}
                className="w-full h-11 rounded-xl px-3 text-[14px] font-medium text-[#F3FFF3] bg-[#0D1C16] border border-[#395B43]/40 focus:outline-none focus:border-[#B7FF5A]/60 transition-all"
                style={{ appearance: "textfield" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Stop Loss (Pips)" value={slPips} onChange={setSlPips} step={1} suffix="pips" />
            <NumInput label="Take Profit (Pips)" value={tpPips} onChange={setTpPips} step={1} suffix="pips" />
          </div>

          {/* Live Price Reference Banner */}
          {livePrice !== null && livePrice > 0 ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border"
              style={{ background: "rgba(96,165,250,0.05)", borderColor: "rgba(96,165,250,0.2)" }}>
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
                </span>
                <span className="text-[10px] font-semibold text-[#A7B8A9]/70 uppercase tracking-wider">Live {cfg.label}</span>
                <span
                  key={liveTick?.flashKey}
                  className={cn(
                    "font-mono font-black text-[13px]",
                    liveTick?.flashDir === "up"   ? "tick-flash-up"   :
                    liveTick?.flashDir === "down" ? "tick-flash-down" : "text-[#F3FFF3]"
                  )}
                >
                  {fmtPrice(livePrice, pair)}
                </span>
                {liveTick && (
                  <span className="text-[10px] font-bold" style={{ color: liveTick.changePct >= 0 ? "#B7FF5A" : "#ef4444" }}>
                    {liveTick.changePct >= 0 ? "+" : ""}{liveTick.changePct.toFixed(2)}%
                  </span>
                )}
              </div>
              <span className="text-[9px] text-[#A7B8A9]/50 font-medium">use for SL/TP pip calc</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#395B43]/20 bg-[#0D1C16]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A7B8A9]/30 inline-block" />
              <span className="text-[10px] text-[#A7B8A9]/50">Connecting to live feed…</span>
            </div>
          )}

          <div className="px-3 py-2.5 rounded-xl bg-[#0D1C16] border border-[#395B43]/25">
            <p className="text-[11px] text-[#A7B8A9]">
              <span className="text-[#B7FF5A] font-semibold">{cfg.label}</span> — Pip size: {cfg.pipSize} · Pip value (1 lot): ${cfg.lotPipValue}
            </p>
          </div>

          {calc?.overLev && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/25">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-[12px] text-rose-300">Over-leverage ({lev}x) — broker margin call risk is high.</p>
            </div>
          )}
          {calc?.highMargin && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/25">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-[12px] text-amber-300">Margin usage {fmt(calc.marginPct, 1)}% of capital — consider reducing lot size.</p>
            </div>
          )}

          {calc && calc.recLots > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#B7FF5A]/20 bg-[#B7FF5A]/5">
              <div>
                <p className="text-[11px] text-[#A7B8A9] uppercase tracking-wider font-semibold">Recommended Lot Size</p>
                <p className="text-[16px] font-black text-[#B7FF5A]">{fmt(calc.recLots, 3)} lots</p>
              </div>
              <button onClick={() => setLots(calc.recLots.toFixed(2))}
                className="flex items-center gap-1 text-[11px] font-bold text-[#B7FF5A] bg-[#B7FF5A]/10 hover:bg-[#B7FF5A]/20 px-3 py-1.5 rounded-lg transition-all border border-[#B7FF5A]/30">
                Apply <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* ── Results ── */}
        <div className="space-y-3 lg:sticky lg:top-4">
          <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-4"
            style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#B7FF5A]/10 border border-[#B7FF5A]/20 flex items-center justify-center">
                <Globe className="w-3.5 h-3.5 text-[#B7FF5A]" />
              </div>
              <span className="text-[13px] font-bold text-[#F3FFF3]">{cfg.label} — {side.toUpperCase()}</span>
              <span className="ml-auto text-[10px] text-[#A7B8A9] bg-[#0D1C16] px-2 py-0.5 rounded-md border border-[#395B43]/30">{parseFloat(lev)}x</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <ResultCard label="Risk Amount"    value={calc ? fmtUSD(calc.riskAmount)  : "—"} accent />
              <ResultCard label="Pip Cost"       value={calc ? fmtUSD(calc.pipCost)     : "—"} sub="per pip (current lots)" />
              <ResultCard label="Trade Value"    value={calc ? fmtUSD(calc.tradeValue)  : "—"} />
              <ResultCard label="Margin Req."    value={calc ? fmtUSD(calc.marginReq)   : "—"} warn={calc?.highMargin} />
              <ResultCard label="Est. Loss (SL)" value={calc ? fmtUSD(calc.estLoss)     : "—"} warn={!!calc}
                sub={`${slPips} pips × ${fmt(calc?.pipCost ?? 0, 2)} pip value`} />
              <ResultCard label="Est. Profit (TP)" value={calc ? fmtUSD(calc.estProfit)  : "—"} accent={!!calc}
                sub={`${tpPips} pips × ${fmt(calc?.pipCost ?? 0, 2)} pip value`} />
              <ResultCard label="RR Ratio"       value={calc ? `1 : ${fmt(calc.rr, 2)}` : "—"} accent={!!calc && calc.rr >= 2} />
              <ResultCard label="Margin Used %"  value={calc ? `${fmt(calc.marginPct, 1)}%` : "—"} warn={calc?.highMargin} />
            </div>
          </div>

          {calc && calc.rr > 0 && (
            <div className={cn("rounded-xl px-4 py-3 border flex items-center gap-3",
              calc.rr >= 2 ? "bg-blue-500/8 border-blue-500/25" : "bg-amber-500/8 border-amber-500/25")}>
              <Zap className={cn("w-4 h-4 shrink-0", calc.rr >= 2 ? "text-blue-400" : "text-amber-400")} />
              <div>
                <p className={cn("text-[12px] font-bold", calc.rr >= 2 ? "text-blue-300" : "text-amber-300")}>
                  {calc.rr >= 2 ? "Good RR Ratio" : calc.rr >= 1 ? "Acceptable RR" : "Poor RR — review setup"}
                </p>
                <p className="text-[11px] text-[#A7B8A9]">1 : {fmt(calc.rr, 2)} — {calc.rr >= 2 ? "Sustainable long term" : "Consider improving TP target"}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
