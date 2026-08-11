import { useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldAlert, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const INSTRUMENTS = [
  { key: "forex",   label: "Forex",        lotValue: 100_000, pip: 0.0001 },
  { key: "gold",    label: "Gold (XAU)",   lotValue: 100,     pip: 0.1   },
  { key: "indices", label: "Indices",      lotValue: 1,       pip: 1     },
  { key: "crypto",  label: "Crypto",       lotValue: 1,       pip: 1     },
];

const LEV_PRESETS = [10, 20, 30, 50, 100, 200, 500];

function fmt(v: number, dp = 2) {
  if (!isFinite(v) || isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUSD(v: number) {
  if (!isFinite(v) || isNaN(v)) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function NumInput({ label, value, onChange, step = 1, min = 0, suffix, help }: {
  label: string; value: string; onChange: (v: string) => void;
  step?: number; min?: number; suffix?: string; help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">{label}</label>
        {help && <span className="text-[10px] text-[#A7B8A9]/50">{help}</span>}
      </div>
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

function Gauge({ pct, label }: { pct: number; label: string }) {
  const capped = Math.min(pct, 100);
  const color = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#B7FF5A";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#A7B8A9] font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-[13px] font-black" style={{ color }}>{fmt(pct, 1)}%</span>
      </div>
      <div className="h-2 bg-[#0D1C16] rounded-full overflow-hidden border border-[#395B43]/25">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${capped}%`, background: color, boxShadow: `0 0 8px ${color}55` }} />
      </div>
    </div>
  );
}

export default function CalcMargin() {
  const [instrument, setInstrument] = useState("forex");
  const [balance, setBalance]       = useState("10000");
  const [openPnl, setOpenPnl]       = useState("0");
  const [price, setPrice]           = useState("1.0850");
  const [lots, setLots]             = useState("0.1");
  const [lev, setLev]               = useState("100");
  const [marginCallLev, setMcLev]   = useState("100");
  const [stopOutLev, setSoLev]      = useState("50");

  const inst = INSTRUMENTS.find(i => i.key === instrument)!;

  const calc = useMemo(() => {
    const bal       = parseFloat(balance)      || 0;
    const pnl       = parseFloat(openPnl)      || 0;
    const priceN    = parseFloat(price)        || 0;
    const lotsN     = parseFloat(lots)         || 0;
    const leverage  = parseFloat(lev)          || 1;
    const mcLev     = parseFloat(marginCallLev)|| 100;
    const soLev     = parseFloat(stopOutLev)   || 50;

    const equity    = bal + pnl;
    const tradeVal  = lotsN * inst.lotValue * priceN;
    const margin    = leverage > 0 ? tradeVal / leverage : 0;
    const freeMargin= equity - margin;
    const marginLvl = margin > 0 ? (equity / margin) * 100 : Infinity;
    const usedPct   = equity > 0 ? (margin / equity) * 100 : 0;

    // How many pips to margin call
    const pipVal    = lotsN * inst.lotValue * inst.pip;
    const pipsToMC  = pipVal > 0 && mcLev > 0
      ? (equity - margin * mcLev / 100) / pipVal
      : 0;
    const pipsToSO  = pipVal > 0 && soLev > 0
      ? (equity - margin * soLev / 100) / pipVal
      : 0;

    const status: "safe" | "warning" | "danger" =
      marginLvl < soLev ? "danger"
      : marginLvl < mcLev ? "warning"
      : "safe";

    return { equity, tradeVal, margin, freeMargin, marginLvl, usedPct, pipsToMC, pipsToSO, status };
  }, [balance, openPnl, price, lots, lev, marginCallLev, stopOutLev, inst]);

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#F3FFF3] mb-1">Margin Calculator</h1>
        <p className="text-sm text-[#A7B8A9]">Calculate margin requirements, free margin, and margin level.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* Inputs */}
        <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5 space-y-5"
          style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Instrument Type</label>
            <div className="flex gap-2 flex-wrap">
              {INSTRUMENTS.map(i => (
                <button key={i.key} onClick={() => setInstrument(i.key)}
                  className={cn("px-3 py-2 rounded-xl text-[12px] font-bold border transition-all",
                    i.key === instrument ? "bg-[#B7FF5A]/12 border-[#B7FF5A]/40 text-[#B7FF5A]"
                                        : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9]")}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Leverage</label>
            <div className="flex gap-1.5 flex-wrap">
              {LEV_PRESETS.map(p => (
                <button key={p} onClick={() => setLev(String(p))}
                  className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                    String(p) === lev ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                     : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9]")}>
                  {p}x
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Account Balance" value={balance} onChange={setBalance} step={500} suffix="$" />
            <NumInput label="Open PnL" value={openPnl} onChange={setOpenPnl} step={10} suffix="$" help="unrealized" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Current Price" value={price} onChange={setPrice} step={0.0001} />
            <NumInput label="Lot Size" value={lots} onChange={setLots} step={0.01} min={0.01} suffix="lots" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Margin Call Level %" value={marginCallLev} onChange={setMcLev} step={10} suffix="%" />
            <NumInput label="Stop Out Level %" value={stopOutLev} onChange={setSoLev} step={10} suffix="%" />
          </div>

          {/* Gauge */}
          <div className="space-y-4 pt-1">
            <Gauge pct={calc.usedPct}   label="Margin Usage" />
            <Gauge pct={Math.min(calc.marginLvl, 300)} label={`Margin Level (${fmt(calc.marginLvl, 0)}%)`} />
          </div>

          {/* Status */}
          {calc.status === "danger" && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/25">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-[12px] text-rose-300">Stop-out imminent — position may be auto-closed by broker!</p>
            </div>
          )}
          {calc.status === "warning" && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/25">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-[12px] text-amber-300">Margin Call level reached — deposit more funds or reduce position.</p>
            </div>
          )}
          {calc.status === "safe" && calc.margin > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <ShieldCheck className="w-4 h-4 text-foreground/60 shrink-0" />
              <p className="text-[12px] text-foreground/60">Margin level is healthy. Monitor if market moves against you.</p>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:sticky lg:top-4 space-y-3">
          <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5"
            style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#B7FF5A]/10 border border-[#B7FF5A]/20 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-[#B7FF5A]" />
              </div>
              <span className="text-[13px] font-bold text-[#F3FFF3]">Margin Breakdown</span>
            </div>

            <div className="space-y-0 divide-y divide-[#395B43]/20">
              {[
                { label: "Equity",          value: fmtUSD(calc.equity),          accent: true  },
                { label: "Trade Value",      value: fmtUSD(calc.tradeVal),        accent: false },
                { label: "Margin Required",  value: fmtUSD(calc.margin),          warn: false   },
                { label: "Free Margin",      value: fmtUSD(calc.freeMargin),      warn: calc.freeMargin < 0 },
                { label: "Margin Level",     value: `${fmt(calc.marginLvl, 0)}%`, warn: calc.status !== "safe" },
                { label: "Margin Used",      value: `${fmt(calc.usedPct, 1)}%`,   warn: calc.usedPct > 50 },
                { label: "Pips to MC",       value: calc.pipsToMC > 0 ? fmt(calc.pipsToMC, 1) : "N/A", warn: calc.pipsToMC < 20 && calc.pipsToMC > 0 },
                { label: "Pips to Stop-Out", value: calc.pipsToSO > 0 ? fmt(calc.pipsToSO, 1) : "N/A", warn: calc.pipsToSO < 10 && calc.pipsToSO > 0 },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[#A7B8A9]">{r.label}</span>
                  <span className={cn("text-[14px] font-black",
                    r.warn   ? "text-rose-400"
                    : r.accent ? "text-[#B7FF5A]"
                               : "text-[#F3FFF3]"
                  )}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
