import { useState } from "react";
import { X, BarChart2, Loader2, AlertTriangle } from "lucide-react";
import { useBrokerStore } from "@/store/brokerStore";
import { BROKERS } from "@/types/broker";
import type { BrokerOrder } from "@/types/broker";

function OrderRow({ ord }: { ord: BrokerOrder }) {
  const { cancelOrder } = useBrokerStore();
  const [cancelling, setCancelling] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handleCancel = async () => {
    if (!confirm) { setConfirm(true); return; }
    setCancelling(true);
    await cancelOrder(ord);
    setCancelling(false);
    setConfirm(false);
  };

  const isBuy = ord.side === "Buy";
  const d = ord.createdAt ? new Date(Number(ord.createdAt) || ord.createdAt) : null;
  const timeStr = d && !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="flex flex-col gap-1 px-4 py-3 border-b"
      style={{ borderColor: "rgba(57,91,67,0.12)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
            style={{
              background: isBuy ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
              color: isBuy ? "#4ade80" : "#f87171",
            }}>
            {ord.side.toUpperCase()}
          </span>
          <span className="text-[13px] font-bold text-white">{ord.symbol}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(57,91,67,0.2)", color: "rgba(167,184,169,0.6)" }}>
            {ord.orderType}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: "rgba(167,184,169,0.4)" }}>{timeStr}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(167,184,169,0.45)" }}>Price</p>
          <p className="text-[11px] font-semibold text-white">{ord.price > 0 ? ord.price.toFixed(2) : "Market"}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(167,184,169,0.45)" }}>Qty</p>
          <p className="text-[11px] font-semibold text-white">{ord.qty}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded"
          style={{ background: "rgba(57,91,67,0.15)", color: "rgba(167,184,169,0.5)" }}>
          {ord.status}
        </span>
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="h-6 px-3 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
          style={{
            background: confirm ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)",
            color: confirm ? "#f87171" : "rgba(239,68,68,0.6)",
            border: `1px solid ${confirm ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.15)"}`,
          }}
        >
          {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : confirm ? <><AlertTriangle className="w-3 h-3" /> Confirm Cancel</> : "Cancel"}
        </button>
      </div>
    </div>
  );
}

export function OrdersList() {
  const { orders, activeAccount, setShowOrders, refreshOrders, connectionStatus } = useBrokerStore();
  const broker = BROKERS.find(b => b.id === activeAccount?.broker_id);

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{ background: "rgba(5,14,10,0.98)", borderLeft: "1px solid rgba(57,91,67,0.2)" }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(57,91,67,0.15)" }}>
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4" style={{ color: "#B7FF5A" }} />
          <span className="text-sm font-bold text-white">Open Orders</span>
          {broker && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: broker.color + "22", color: broker.color }}>
              {broker.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => refreshOrders()}
            className="h-6 px-2 rounded-md text-[10px] transition-colors"
            style={{ color: "rgba(167,184,169,0.6)", background: "rgba(57,91,67,0.15)" }}>
            Refresh
          </button>
          <button onClick={() => setShowOrders(false)}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.06]"
            style={{ color: "rgba(167,184,169,0.5)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {connectionStatus === "connecting" ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "rgba(167,184,169,0.4)" }} />
            <p className="text-[11px]" style={{ color: "rgba(167,184,169,0.4)" }}>Loading orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <BarChart2 className="w-8 h-8" style={{ color: "rgba(57,91,67,0.4)" }} />
            <p className="text-[12px] font-semibold" style={{ color: "rgba(167,184,169,0.5)" }}>No open orders</p>
          </div>
        ) : (
          orders.map(ord => <OrderRow key={ord.id} ord={ord} />)
        )}
      </div>
    </div>
  );
}
