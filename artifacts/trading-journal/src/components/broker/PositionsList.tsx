import { useState } from "react";
import { X, TrendingUp, TrendingDown, Loader2, AlertTriangle } from "lucide-react";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { useBrokerStore } from "@/store/brokerStore";
import { BROKERS } from "@/types/broker";
import type { BrokerPosition } from "@/types/broker";
import { useTickStore } from "@/store/tickStore";

function PnlBadge({ pnl }: { pnl: number }) {
  const fc  = useCurrencyFormatter();
  const pos = pnl >= 0;
  return (
    <span className="flex items-center gap-0.5 text-[11px] font-bold"
      style={{ color: pos ? "#4ade80" : "#f87171" }}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pos ? "+" : ""}{fc(pnl)}
    </span>
  );
}

function PositionRow({ pos }: { pos: BrokerPosition }) {
  const { closePosition } = useBrokerStore();
  const ticks = useTickStore(s => s.ticks);
  const [closing, setClosing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const symKey = pos.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const liveTick = ticks[symKey];
  const livePrice = liveTick?.price ?? pos.markPrice;
  const livePnl = pos.side === "Long"
    ? (livePrice - pos.entryPrice) * pos.size
    : (pos.entryPrice - livePrice) * pos.size;

  const handleClose = async () => {
    if (!confirm) { setConfirm(true); return; }
    setClosing(true);
    await closePosition(pos);
    setClosing(false);
    setConfirm(false);
  };

  return (
    <div className="flex flex-col gap-1 px-4 py-3 border-b"
      style={{ borderColor: "rgba(57,91,67,0.12)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
            style={{
              background: pos.side === "Long" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
              color: pos.side === "Long" ? "#4ade80" : "#f87171",
            }}>
            {pos.side.toUpperCase()}
          </span>
          <span className="text-[13px] font-bold text-white">{pos.symbol}</span>
        </div>
        <PnlBadge pnl={livePnl} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1">
        <div>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(167,184,169,0.45)" }}>Entry</p>
          <p className="text-[11px] font-semibold text-white">{pos.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(167,184,169,0.45)" }}>Mark</p>
          <p className="text-[11px] font-semibold" style={{ color: "#B7FF5A" }}>{livePrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(167,184,169,0.45)" }}>Size</p>
          <p className="text-[11px] font-semibold text-white">{pos.size}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px]" style={{ color: "rgba(167,184,169,0.4)" }}>
          {pos.leverage ? `${pos.leverage}x leverage` : ""}
        </span>
        <button
          onClick={handleClose}
          disabled={closing}
          className="h-6 px-3 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
          style={{
            background: confirm ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)",
            color: confirm ? "#f87171" : "rgba(239,68,68,0.6)",
            border: `1px solid ${confirm ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.15)"}`,
          }}
        >
          {closing ? <Loader2 className="w-3 h-3 animate-spin" /> : confirm ? <><AlertTriangle className="w-3 h-3" /> Confirm Close</> : "Close"}
        </button>
      </div>
    </div>
  );
}

export function PositionsList() {
  const { positions, activeAccount, setShowPositions, refreshPositions, connectionStatus } = useBrokerStore();
  const broker = BROKERS.find(b => b.id === activeAccount?.broker_id);

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{ background: "rgba(5,14,10,0.98)", borderLeft: "1px solid rgba(57,91,67,0.2)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(57,91,67,0.15)" }}>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: "#B7FF5A" }} />
          <span className="text-sm font-bold text-white">Open Positions</span>
          {broker && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: broker.color + "22", color: broker.color }}>
              {broker.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => refreshPositions()}
            className="h-6 px-2 rounded-md text-[10px] transition-colors"
            style={{ color: "rgba(167,184,169,0.6)", background: "rgba(57,91,67,0.15)" }}>
            Refresh
          </button>
          <button onClick={() => setShowPositions(false)}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.06]"
            style={{ color: "rgba(167,184,169,0.5)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {connectionStatus === "connecting" ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "rgba(167,184,169,0.4)" }} />
            <p className="text-[11px]" style={{ color: "rgba(167,184,169,0.4)" }}>Loading positions…</p>
          </div>
        ) : positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <TrendingUp className="w-8 h-8" style={{ color: "rgba(57,91,67,0.4)" }} />
            <p className="text-[12px] font-semibold" style={{ color: "rgba(167,184,169,0.5)" }}>No open positions</p>
          </div>
        ) : (
          positions.map(pos => (
            <PositionRow key={pos.id} pos={pos} />
          ))
        )}
      </div>
    </div>
  );
}
