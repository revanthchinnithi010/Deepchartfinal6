import { useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck, TrendingDown, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  PageTransition, 
  AnimatedCard, 
  AnimatedList, 
  AnimatedListItem, 
  NumberCounter,
  AnimatedButton
} from "@/components/animations";

const RISK_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3];
const RR_PRESETS   = [1, 1.5, 2, 2.5, 3, 4];

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

export default function CalcRisk() {
  const [balance, setBalance]       = useState("10000");
  const [risk, setRisk]             = useState("1");
  const [rr, setRr]                 = useState("2");
  const [losses, setLosses]         = useState("5");
  const [dailyTarget, setDailyTarget] = useState("3");

  const calc = useMemo(() => {
    const bal    = parseFloat(balance)      || 0;
    const rPct   = parseFloat(risk)         || 0;
    const rrN    = parseFloat(rr)           || 1;
    const lossN  = parseFloat(losses)       || 0;
    const dTarget= parseFloat(dailyTarget)  || 0;

    const riskAmt   = bal * rPct / 100;
    const profitAmt = riskAmt * rrN;
    const breakEven = 1 / (1 + rrN);
    const breakEvenPct = breakEven * 100;

    // Consecutive loss simulation
    let runBalance = bal;
    const lossRows: { n: number; bal: number; loss: number; drawdown: number }[] = [];
    for (let i = 1; i <= Math.min(lossN, 20); i++) {
      const loss = runBalance * rPct / 100;
      runBalance -= loss;
      lossRows.push({ n: i, bal: runBalance, loss, drawdown: ((bal - runBalance) / bal) * 100 });
    }

    // Daily target scenarios
    const winsNeeded = dTarget > 0 && riskAmt > 0 ? Math.ceil((bal * dTarget / 100) / profitAmt) : 0;
    const tradesNeeded = dTarget > 0 ? Math.ceil(winsNeeded / breakEven) : 0;

    // Risk of ruin approximation
    const winRate = breakEven;
    const q = 1 - winRate;
    const ruinPct = Math.pow(q / winRate, 100 / rPct); // simplified
    const maxDrawdown = lossRows.length > 0 ? lossRows[lossRows.length - 1].drawdown : 0;

    return { riskAmt, profitAmt, breakEvenPct, lossRows, winsNeeded, tradesNeeded, maxDrawdown, ruinPct };
  }, [balance, risk, rr, losses, dailyTarget]);

  const highRisk = parseFloat(risk) > 2;

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#F3FFF3] mb-1">Risk Calculator</h1>
        <p className="text-sm text-[#A7B8A9]">Model drawdown scenarios, break-even rates, and daily targets.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 items-start">
        {/* Inputs + Summary */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5 space-y-5"
            style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>
            <NumInput label="Account Balance" value={balance} onChange={setBalance} step={500} suffix="$" />

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Risk Per Trade</label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {RISK_PRESETS.map(p => (
                  <button key={p} onClick={() => setRisk(String(p))}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                      String(p) === risk ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                        : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9]")}>
                    {p}%
                  </button>
                ))}
              </div>
              <div className="relative">
                <input type="number" step={0.1} min={0.1} max={10} value={risk}
                  onChange={e => setRisk(e.target.value)}
                  className="w-full h-11 rounded-xl px-3 text-[14px] font-medium text-[#F3FFF3] bg-[#0D1C16] border border-[#395B43]/40 focus:outline-none focus:border-[#B7FF5A]/60 transition-all"
                  style={{ appearance: "textfield" }} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A7B8A9] font-semibold pointer-events-none">%</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Risk : Reward</label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {RR_PRESETS.map(p => (
                  <button key={p} onClick={() => setRr(String(p))}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                      String(p) === rr ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                      : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9]")}>
                    1:{p}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input type="number" step={0.5} min={0.5} value={rr}
                  onChange={e => setRr(e.target.value)}
                  className="w-full h-11 rounded-xl px-3 text-[14px] font-medium text-[#F3FFF3] bg-[#0D1C16] border border-[#395B43]/40 focus:outline-none focus:border-[#B7FF5A]/60 transition-all"
                  style={{ appearance: "textfield" }} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A7B8A9] font-semibold pointer-events-none">R</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Consecutive Losses" value={losses} onChange={setLosses} step={1} min={1} suffix="trades" />
              <NumInput label="Daily Target %" value={dailyTarget} onChange={setDailyTarget} step={0.5} suffix="%" />
            </div>

            {highRisk && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/25">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <p className="text-[12px] text-rose-300">Risk above 2% accelerates drawdown exponentially. Professional traders use 0.5–1%.</p>
              </div>
            )}
          </div>

          {/* Key Metrics */}
          <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5"
            style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>
            <p className="text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider mb-4">Key Metrics</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Risk Per Trade",  value: fmtUSD(calc.riskAmt),          accent: false },
                { label: "Profit Per Win",  value: fmtUSD(calc.profitAmt),         accent: true  },
                { label: "Break-Even Rate", value: `${fmt(calc.breakEvenPct, 1)}%`, accent: false },
                { label: "Max Drawdown",    value: `${fmt(calc.maxDrawdown, 1)}%`,  warn: calc.maxDrawdown > 15 },
                { label: "Wins for Target", value: `${calc.winsNeeded} wins`,       accent: true  },
                { label: "Trades for Target",value: `~${calc.tradesNeeded} trades`, accent: false },
              ].map(m => (
                <div key={m.label} className={cn("rounded-xl p-3 border",
                  m.warn ? "bg-rose-500/8 border-rose-500/20" : m.accent ? "bg-[#B7FF5A]/6 border-[#B7FF5A]/25" : "bg-[#0D1C16] border-[#395B43]/25")}>
                  <p className="text-[10px] font-semibold text-[#A7B8A9] uppercase tracking-wider mb-1">{m.label}</p>
                  <p className={cn("text-[16px] font-black",
                    m.warn ? "text-rose-400" : m.accent ? "text-[#B7FF5A]" : "text-[#F3FFF3]"
                  )}>{m.value}</p>
                </div>
              ))}
            </div>
            {!highRisk && calc.riskAmt > 0 && (
              <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <ShieldCheck className="w-4 h-4 text-foreground/60 shrink-0" />
                <p className="text-[12px] text-foreground/60">Risk profile looks sustainable. Break-even at {fmt(calc.breakEvenPct, 0)}% win rate.</p>
              </div>
            )}
          </div>
        </div>

        {/* Drawdown Simulation Table */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5"
            style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <span className="text-[13px] font-bold text-[#F3FFF3]">Consecutive Loss Simulation</span>
            </div>
            <div className="space-y-1">
              <div className="grid grid-cols-4 gap-2 px-2 pb-2 border-b border-[#395B43]/30">
                {["Loss #", "Balance", "Lost", "Drawdown"].map(h => (
                  <span key={h} className="text-[10px] font-semibold text-[#A7B8A9] uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {calc.lossRows.map(row => (
                <div key={row.n} className={cn("grid grid-cols-4 gap-2 px-2 py-2 rounded-lg transition-all",
                  row.drawdown > 20 ? "bg-rose-500/6" : row.drawdown > 10 ? "bg-amber-500/5" : "")}>
                  <span className="text-[12px] font-bold text-[#A7B8A9]">L{row.n}</span>
                  <span className={cn("text-[12px] font-bold",
                    row.drawdown > 20 ? "text-rose-400" : "text-[#F3FFF3]"
                  )}>{fmtUSD(row.bal)}</span>
                  <span className="text-[12px] text-rose-400/80">-{fmtUSD(row.loss)}</span>
                  <span className={cn("text-[12px] font-bold",
                    row.drawdown > 20 ? "text-rose-400" : row.drawdown > 10 ? "text-amber-400" : "text-[#A7B8A9]"
                  )}>{fmt(row.drawdown, 1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recovery table */}
          <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5"
            style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#B7FF5A]/10 border border-[#B7FF5A]/20 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-[#B7FF5A]" />
              </div>
              <span className="text-[13px] font-bold text-[#F3FFF3]">Recovery Needed</span>
            </div>
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-2 px-2 pb-2 border-b border-[#395B43]/30">
                {["Drawdown", "Loss", "Recovery Needed"].map(h => (
                  <span key={h} className="text-[10px] font-semibold text-[#A7B8A9] uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {[5, 10, 15, 20, 25, 30, 40, 50].map(dd => {
                const loss = parseFloat(balance) * dd / 100;
                const recovery = dd / (100 - dd) * 100;
                return (
                  <div key={dd} className={cn("grid grid-cols-3 gap-2 px-2 py-2 rounded-lg",
                    dd >= 30 ? "bg-rose-500/5" : dd >= 20 ? "bg-amber-500/4" : "")}>
                    <span className="text-[12px] font-bold text-[#A7B8A9]">{dd}%</span>
                    <span className="text-[12px] text-rose-400">-{fmtUSD(loss)}</span>
                    <span className={cn("text-[12px] font-bold",
                      dd >= 30 ? "text-rose-400" : dd >= 20 ? "text-amber-400" : "text-[#F3FFF3]"
                    )}>{fmt(recovery, 1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
