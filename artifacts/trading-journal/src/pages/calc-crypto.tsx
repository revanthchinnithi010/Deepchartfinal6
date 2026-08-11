import { useMemo, useState } from "react";
import { Bitcoin, AlertTriangle, TrendingUp, TrendingDown, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";

const COINS: Record<string, { name: string; lotSize: number; lotLabel: string; defaultEntry: number; step: number }> = {
  BTCUSD:  { name: "Bitcoin",  lotSize: 0.001,     lotLabel: "BTC", defaultEntry: 65000,  step: 0.001     },
  ETHUSD:  { name: "Ethereum", lotSize: 0.01,      lotLabel: "ETH", defaultEntry: 3200,   step: 0.01      },
  SOLUSD:  { name: "Solana",   lotSize: 1,         lotLabel: "SOL", defaultEntry: 155,    step: 0.1       },
  DOGEUSD: { name: "Dogecoin", lotSize: 100,       lotLabel: "DOGE",defaultEntry: 0.38,   step: 0.0001    },
  PEPEUSD: { name: "Pepe",     lotSize: 1_000_000, lotLabel: "PEPE",defaultEntry: 0.00001,step: 0.0000001 },
};

const RISK_PRESETS   = [0.5, 1, 1.5, 2, 3];
const LEV_PRESETS    = [5, 10, 20, 50, 100];

function fmt(v: number, dp = 2) {
  if (!isFinite(v) || isNaN(v)) return "—";
  if (dp === 0) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
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
      warn  ? "bg-rose-500/8 border-rose-500/20" :
      accent? "bg-[#B7FF5A]/6 border-[#B7FF5A]/25" :
              "bg-[#0D1C16] border-[#395B43]/30"
    )}>
      <p className="text-[10px] font-semibold text-[#A7B8A9] uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-[18px] font-black leading-tight",
        warn ? "text-rose-400" : accent ? "text-[#B7FF5A]" : "text-[#F3FFF3]"
      )}>{value}</p>
      {sub && <p className="text-[10px] text-[#A7B8A9]/70 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CalcCrypto() {
  const ticks = useTickStore(s => s.ticks);

  const [coin, setCoin]       = useState("BTCUSD");
  const [side, setSide]       = useState<"long" | "short">("long");
  const [capital, setCapital] = useState("10000");
  const [risk, setRisk]       = useState("1");
  const [lev, setLev]         = useState("10");
  const [entry, setEntry]     = useState("65000");
  const [sl, setSl]           = useState("64000");
  const [tp, setTp]           = useState("67000");
  const [lots, setLots]       = useState("1");

  const cfg      = COINS[coin];
  const liveTick = ticks[coin] ?? null;
  const livePrice = liveTick?.price ?? null;

  const calc = useMemo(() => {
    const cap = parseFloat(capital) || 0;
    const rPct = parseFloat(risk) || 0;
    const leverage = parseFloat(lev) || 1;
    const entryP = parseFloat(entry) || 0;
    const slP = parseFloat(sl) || 0;
    const tpP = parseFloat(tp) || 0;
    const lotsN = parseFloat(lots) || 1;
    const { lotSize } = cfg;

    if (!entryP || !slP) return null;

    const slDist = side === "long" ? entryP - slP : slP - entryP;
    const tpDist = side === "long" ? tpP - entryP : entryP - tpP;

    const riskAmount = cap * rPct / 100;
    const lossPerLot = lotSize * Math.max(slDist, 0);
    const recLots = lossPerLot > 0 ? riskAmount / lossPerLot : 0;

    const useLots = lotsN;
    const positionSize = useLots * lotSize;
    const tradeValue = positionSize * entryP;
    const marginUsed = tradeValue / leverage;
    const estLoss = useLots * lossPerLot;
    const estProfit = useLots * lotSize * Math.max(tpDist, 0);
    const rr = estLoss > 0 ? estProfit / estLoss : 0;
    const liqPrice = side === "long"
      ? entryP * (1 - 1 / leverage)
      : entryP * (1 + 1 / leverage);
    const marginPct = cap > 0 ? (marginUsed / cap) * 100 : 0;
    const overLev = leverage > 50;
    const highMargin = marginPct > 20;

    return { riskAmount, recLots, positionSize, tradeValue, marginUsed, estLoss, estProfit, rr, liqPrice, slDist, marginPct, overLev, highMargin };
  }, [capital, risk, lev, entry, sl, tp, lots, side, cfg]);

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#F3FFF3] mb-1">Crypto Calculator</h1>
        <p className="text-sm text-[#A7B8A9]">Delta Exchange style position sizing for crypto perpetuals.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* ── Inputs ── */}
        <div className="rounded-2xl border border-[#395B43]/30 bg-[#10251C] p-5 space-y-5"
          style={{ boxShadow: "0 8px 32px rgba(7,17,13,0.5)" }}>

          {/* Coin + Side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Coin</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(COINS).map(c => (
                  <button key={c} onClick={() => { setCoin(c); setEntry(String(COINS[c].defaultEntry)); }}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                      c === coin ? "bg-[#B7FF5A]/15 border-[#B7FF5A]/50 text-[#B7FF5A]"
                                 : "bg-[#0D1C16] border-[#395B43]/30 text-[#A7B8A9] hover:border-[#395B43]/60")}>
                    {c.replace("USD", "")}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Side</label>
              <div className="flex rounded-xl overflow-hidden border border-[#395B43]/30">
                {(["long","short"] as const).map(s => (
                  <button key={s} onClick={() => setSide(s)}
                    className={cn("flex-1 py-2.5 text-[12px] font-bold capitalize transition-all flex items-center justify-center gap-1.5",
                      s === side
                        ? s === "long" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                        : "bg-[#0D1C16] text-[#A7B8A9] hover:bg-[#0D1C16]/60")}>
                    {s === "long" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Risk + Leverage presets */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Risk %</label>
              <div className="flex gap-1 flex-wrap">
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
              <label className="block text-[11px] font-semibold text-[#A7B8A9] uppercase tracking-wider">Leverage</label>
              <div className="flex gap-1 flex-wrap">
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

          {/* Number Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Capital (USD)" value={capital} onChange={setCapital} step={100} suffix="$" />
            <NumInput label="Risk %" value={risk} onChange={setRisk} step={0.1} suffix="%" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Leverage" value={lev} onChange={setLev} step={1} suffix="x" />
            <NumInput label="Lot Size" value={lots} onChange={setLots} step={0.1} min={0.01} suffix="lots" />
          </div>
          {/* Live Price Banner */}
          {livePrice !== null && livePrice > 0 ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border"
              style={{ background: "rgba(183,255,90,0.05)", borderColor: "rgba(183,255,90,0.2)" }}>
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B7FF5A] opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#B7FF5A]" />
                </span>
                <span className="text-[10px] font-semibold text-[#A7B8A9]/70 uppercase tracking-wider">Live Market</span>
                <span
                  key={liveTick?.flashKey}
                  className={cn(
                    "font-mono font-black text-[13px]",
                    liveTick?.flashDir === "up"   ? "tick-flash-up"   :
                    liveTick?.flashDir === "down" ? "tick-flash-down" : "text-[#F3FFF3]"
                  )}
                >
                  {fmtPrice(livePrice, coin)}
                </span>
                {liveTick && (
                  <span className="text-[10px] font-bold" style={{ color: liveTick.changePct >= 0 ? "#B7FF5A" : "#ef4444" }}>
                    {liveTick.changePct >= 0 ? "+" : ""}{liveTick.changePct.toFixed(2)}%
                  </span>
                )}
              </div>
              <button
                onClick={() => setEntry(String(livePrice))}
                className="text-[10px] font-black px-3 py-1.5 rounded-lg transition-all"
                style={{ background: "rgba(183,255,90,0.15)", color: "#B7FF5A", border: "1px solid rgba(183,255,90,0.35)" }}
              >
                Fill Entry ↑
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#395B43]/20 bg-[#0D1C16]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A7B8A9]/30 inline-block" />
              <span className="text-[10px] text-[#A7B8A9]/50">Connecting to live feed…</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <NumInput label="Entry Price" value={entry} onChange={setEntry} step={cfg.step * 1000} suffix="$" />
            <NumInput label="Stop Loss" value={sl} onChange={setSl} step={cfg.step * 1000} suffix="$" />
            <NumInput label="Take Profit" value={tp} onChange={setTp} step={cfg.step * 1000} suffix="$" />
          </div>

          {/* Warnings */}
          {calc?.overLev && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/25">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-[12px] text-rose-300">High leverage ({lev}x) detected — liquidation risk is elevated.</p>
            </div>
          )}
          {calc?.highMargin && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/25">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-[12px] text-amber-300">Margin usage is {fmt(calc.marginPct, 1)}% of capital — consider reducing position.</p>
            </div>
          )}

          {/* Recommended lots */}
          {calc && calc.recLots > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#B7FF5A]/20 bg-[#B7FF5A]/5">
              <div>
                <p className="text-[11px] text-[#A7B8A9] uppercase tracking-wider font-semibold">Recommended Lot Size</p>
                <p className="text-[16px] font-black text-[#B7FF5A]">{fmt(calc.recLots, 3)} lots</p>
              </div>
              <button onClick={() => setLots(calc.recLots.toFixed(3))}
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
                <Bitcoin className="w-3.5 h-3.5 text-[#B7FF5A]" />
              </div>
              <span className="text-[13px] font-bold text-[#F3FFF3]">{COINS[coin].name} — {side.toUpperCase()}</span>
              <span className="ml-auto text-[10px] text-[#A7B8A9] bg-[#0D1C16] px-2 py-0.5 rounded-md border border-[#395B43]/30">{parseFloat(lev)}x lev</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <ResultCard label="Risk Amount"    value={calc ? fmtUSD(calc.riskAmount) : "—"} accent />
              <ResultCard label="Trade Value"    value={calc ? fmtUSD(calc.tradeValue) : "—"} />
              <ResultCard label="Margin Used"    value={calc ? fmtUSD(calc.marginUsed) : "—"} warn={calc?.highMargin} />
              <ResultCard label="Position Size"  value={calc ? `${fmt(calc.positionSize, 4)} ${cfg.lotLabel}` : "—"} />
              <ResultCard label="Est. Loss (SL)" value={calc ? fmtUSD(calc.estLoss) : "—"} warn={!!calc}
                sub={calc ? `SL distance: ${fmt(calc.slDist, calc.slDist < 0.01 ? 6 : 2)}` : undefined} />
              <ResultCard label="Est. Profit (TP)" value={calc ? fmtUSD(calc.estProfit) : "—"} accent={!!calc}
                sub={calc ? `RR: 1 : ${fmt(calc.rr, 2)}` : undefined} />
              <ResultCard label="Liq. Price" value={calc ? fmtUSD(calc.liqPrice) : "—"} warn={calc?.overLev} />
              <ResultCard label="Margin Used %" value={calc ? `${fmt(calc.marginPct, 1)}%` : "—"} warn={calc?.highMargin} />
            </div>
          </div>

          {/* RR Banner */}
          {calc && calc.rr > 0 && (
            <div className={cn("rounded-xl px-4 py-3 border flex items-center gap-3",
              calc.rr >= 2 ? "bg-emerald-500/8 border-emerald-500/25" : "bg-amber-500/8 border-amber-500/25")}>
              <Zap className={cn("w-4 h-4 shrink-0", calc.rr >= 2 ? "text-emerald-400" : "text-amber-400")} />
              <div>
                <p className={cn("text-[12px] font-bold", calc.rr >= 2 ? "text-emerald-300" : "text-amber-300")}>
                  {calc.rr >= 2 ? "Good RR Ratio" : calc.rr >= 1 ? "Acceptable RR" : "Poor RR Ratio"}
                </p>
                <p className="text-[11px] text-[#A7B8A9]">1 : {fmt(calc.rr, 2)} — {calc.rr >= 2 ? "Meets institutional standard" : "Aim for 1:2 or better"}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
