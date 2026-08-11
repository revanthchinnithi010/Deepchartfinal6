import { useMemo, useState } from "react";
import { Target, AlertTriangle, ChevronRight, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

const ASSET_TYPES = [
  { key: "forex",  label: "Forex / Indices",   pipLabel: "pips",    pipHelp: "e.g. 20 pips" },
  { key: "crypto", label: "Crypto / Linear",   pipLabel: "% move",  pipHelp: "e.g. 1.5%" },
  { key: "stocks", label: "Stocks / Futures",  pipLabel: "$ move",  pipHelp: "e.g. 2.50" },
] as const;

const RISK_PRESETS  = [0.25, 0.5, 1, 1.5, 2, 3];
const BROKER_PRESETS = [
  { label: "Conservative", risk: 0.5 },
  { label: "Standard",     risk: 1   },
  { label: "Aggressive",   risk: 2   },
];

function fmt(v: number, dp = 2) {
  if (!isFinite(v) || isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUSD(v: number) {
  if (!isFinite(v) || isNaN(v)) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function NumInput({ label, value, onChange, step = 1, min = 0, max, suffix, help }: {
  label: string; value: string; onChange: (v: string) => void;
  step?: number; min?: number; max?: number; suffix?: string; help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">{label}</label>
        {help && <span className="text-[10px] text-[#A7B8A9]/50">{help}</span>}
      </div>
      <div className="relative">
        <input
          type="number" step={step} min={min} max={max} value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-11 rounded-xl px-3 text-[14px] font-medium text-[#F3FFF3] bg-[#0D1C16] border border-[#395B43]/40 focus:outline-none focus:border-[#B7FF5A]/60 focus:ring-1 focus:ring-[#B7FF5A]/20 transition-all"
          style={{ appearance: "textfield" }}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A7B8A9] font-semibold pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultRow({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-3 border-b border-[#395B43]/20 last:border-0")}>
      <span className="text-[13px] text-[#A7B8A9]">{label}</span>
      <span className={cn("text-[14px] font-black",
        warn ? "text-rose-400" : accent ? "text-[#B7FF5A]" : "text-[#F3FFF3]"
      )}>{value}</span>
    </div>
  );
}

export default function CalcPosition() {
  const [assetType, setAssetType] = useState<"forex" | "crypto" | "stocks">("forex");
  const [account, setAccount] = useState("10000");
  const [risk, setRisk]       = useState("1");
  const [pipValue, setPipValue] = useState("10");
  const [slMove, setSlMove]   = useState("20");
  const [entry, setEntry]     = useState("1.0850");
  const [tp, setTp]           = useState("1.1050");
  const [leverage, setLeverage] = useState("100");

  const cfg = ASSET_TYPES.find(a => a.key === assetType)!;

  const calc = useMemo(() => {
    const acc   = parseFloat(account) || 0;
    const rPct  = parseFloat(risk) || 0;
    const pv    = parseFloat(pipValue) || 0;
    const slM   = parseFloat(slMove) || 0;
    const entP  = parseFloat(entry) || 0;
    const tpP   = parseFloat(tp) || 0;
    const lev   = parseFloat(leverage) || 1;

    const riskAmount  = acc * rPct / 100;

    let positionSize = 0;
    let lotSize = 0;
    let tpDist = 0;
    let estProfit = 0;
    let rr = 0;
    let tradeValue = 0;
    let marginReq = 0;
    let unitRisk = 0;

    if (assetType === "forex") {
      // forex: pv = pip value per lot, slMove = pips
      lotSize = slM > 0 && pv > 0 ? riskAmount / (slM * pv) : 0;
      positionSize = lotSize * 100_000;
      unitRisk = slM * pv * lotSize;
      tpDist = Math.abs(tpP - entP) / 0.0001; // in pips (rough for EUR/USD)
      estProfit = tpDist * pv * lotSize;
      rr = unitRisk > 0 ? estProfit / unitRisk : 0;
      tradeValue = lotSize * 100_000;
      marginReq = tradeValue / lev;
    } else if (assetType === "crypto") {
      // slMove = % move, pv = price per unit
      const slFrac = slM / 100;
      const pricePerUnit = pv;
      positionSize = slFrac > 0 && pricePerUnit > 0 ? riskAmount / (slFrac * pricePerUnit) : 0;
      unitRisk = positionSize * slFrac * pricePerUnit;
      const tpPct = entP > 0 ? Math.abs(tpP - entP) / entP : 0;
      estProfit = positionSize * tpPct * pricePerUnit;
      rr = unitRisk > 0 ? estProfit / unitRisk : 0;
      tradeValue = positionSize * pricePerUnit;
      marginReq = tradeValue / lev;
      lotSize = positionSize;
    } else {
      // stocks: slMove = $ per share, pv = price per share (optional)
      positionSize = slM > 0 ? riskAmount / slM : 0;
      unitRisk = positionSize * slM;
      tpDist = Math.abs(tpP - entP);
      estProfit = positionSize * tpDist;
      rr = unitRisk > 0 ? estProfit / unitRisk : 0;
      tradeValue = positionSize * entP;
      marginReq = tradeValue / lev;
      lotSize = positionSize;
    }

    const marginPct = acc > 0 ? (marginReq / acc) * 100 : 0;
    const highRisk = rPct > 2;

    return { riskAmount, positionSize, lotSize, unitRisk, estProfit, rr, tradeValue, marginReq, marginPct, highRisk };
  }, [account, risk, pipValue, slMove, entry, tp, leverage, assetType]);

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#F3FFF3] mb-1">Position Size Calculator</h1>
        <p className="text-sm text-[#A7B8A9]">Calculate the exact position size to risk a defined % of your account.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5 space-y-5"
          style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>

          {/* Asset Type */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Asset Type</label>
            <div className="flex gap-2">
              {ASSET_TYPES.map(a => (
                <button key={a.key} onClick={() => setAssetType(a.key)}
                  className={cn("flex-1 py-2.5 rounded-xl text-[12px] font-bold border transition-all",
                    assetType === a.key ? "bg-[#B7FF5A]/12 border-[#B7FF5A]/40 text-[#B7FF5A]"
                                       : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9] hover:border-[#395B43]/60")}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Broker presets */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Broker / Risk Profile</label>
            <div className="flex gap-2">
              {BROKER_PRESETS.map(b => (
                <button key={b.label} onClick={() => setRisk(String(b.risk))}
                  className={cn("flex-1 py-2 rounded-xl text-[11px] font-bold border transition-all",
                    String(b.risk) === risk ? "bg-[#B7FF5A]/12 border-[#B7FF5A]/40 text-[#B7FF5A]"
                                           : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9]")}>
                  {b.label}
                  <span className="block text-[10px] font-normal opacity-60">{b.risk}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Risk presets */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Risk % Presets</label>
            <div className="flex gap-1.5">
              {RISK_PRESETS.map(p => (
                <button key={p} onClick={() => setRisk(String(p))}
                  className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                    String(p) === risk ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                      : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9]")}>
                  {p}%
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Account Balance" value={account} onChange={setAccount} step={500} suffix="$" />
            <NumInput label="Risk %" value={risk} onChange={setRisk} step={0.1} max={10} suffix="%" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput
              label={assetType === "forex" ? "Pip Value / Lot" : assetType === "crypto" ? "Price Per Unit ($)" : "Share Price ($)"}
              value={pipValue} onChange={setPipValue} step={0.5}
              help={assetType === "forex" ? "e.g. $10 for EUR/USD" : undefined}
              suffix={assetType === "forex" ? "$/pip" : "$"}
            />
            <NumInput
              label={`SL Distance (${cfg.pipLabel})`}
              value={slMove} onChange={setSlMove} step={assetType === "forex" ? 1 : 0.1}
              help={cfg.pipHelp} suffix={cfg.pipLabel}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumInput label="Entry Price" value={entry} onChange={setEntry} step={0.001} />
            <NumInput label="Take Profit" value={tp} onChange={setTp} step={0.001} />
            <NumInput label="Leverage" value={leverage} onChange={setLeverage} step={1} suffix="x" />
          </div>

          {calc.highRisk && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/25">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-[12px] text-rose-300">Risk % above 2% — high drawdown risk. Consider reducing position.</p>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="space-y-3 lg:sticky lg:top-4">
          <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5"
            style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#B7FF5A]/10 border border-[#B7FF5A]/20 flex items-center justify-center">
                <Crosshair className="w-3.5 h-3.5 text-[#B7FF5A]" />
              </div>
              <span className="text-[13px] font-bold text-[#F3FFF3]">Position Sizing Result</span>
            </div>

            {/* Hero result */}
            <div className="rounded-xl bg-[#B7FF5A]/8 border border-[#B7FF5A]/25 p-4 mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[#A7B8A9] uppercase tracking-wider font-semibold mb-1">
                  {assetType === "forex" ? "Recommended Lot Size" : "Recommended Position"}
                </p>
                <p className="text-[28px] font-black text-[#B7FF5A] leading-none">
                  {assetType === "forex" ? fmt(calc.lotSize, 2) : fmt(calc.positionSize, assetType === "crypto" ? 4 : 0)}
                </p>
                <p className="text-[11px] text-[#A7B8A9]/70 mt-1">
                  {assetType === "forex" ? "lots" : assetType === "crypto" ? "units" : "shares"}
                </p>
              </div>
              <Target className="w-8 h-8 text-[#B7FF5A]/30" />
            </div>

            <div>
              <ResultRow label="Risk Amount ($)"      value={fmtUSD(calc.riskAmount)}  accent />
              <ResultRow label="Estimated Loss"       value={fmtUSD(calc.unitRisk)}    warn />
              <ResultRow label="Estimated Profit"     value={fmtUSD(calc.estProfit)}   accent />
              <ResultRow label="Risk / Reward"        value={`1 : ${fmt(calc.rr, 2)}`} accent={calc.rr >= 2} />
              <ResultRow label="Trade Value"          value={fmtUSD(calc.tradeValue)} />
              <ResultRow label="Margin Required"      value={fmtUSD(calc.marginReq)}   warn={calc.marginPct > 20} />
              <ResultRow label="Margin Used %"        value={`${fmt(calc.marginPct, 1)}%`} warn={calc.marginPct > 20} />
            </div>
          </div>

          {/* Copy suggestion */}
          {calc.lotSize > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#B7FF5A]/20 bg-[#B7FF5A]/5">
              <div>
                <p className="text-[11px] text-[#A7B8A9]">Break-even win rate for {fmt(calc.rr, 1)}:1 RR</p>
                <p className="text-[15px] font-black text-[#B7FF5A]">
                  {calc.rr > 0 ? fmt(100 / (1 + calc.rr), 1) : "—"}%
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#B7FF5A]/40" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
