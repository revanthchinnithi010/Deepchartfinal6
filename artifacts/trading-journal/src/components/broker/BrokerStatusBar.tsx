import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import type { PrivateWsStatus } from "@/store/brokerStore";
import {
  BarChart2, ShoppingCart, Power, TrendingUp, TrendingDown,
  RefreshCw, Wifi, WifiOff, Activity, AlertTriangle,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMoney(val: string | number | undefined, dp = 2): string {
  const n = parseFloat(String(val ?? "0"));
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtLatency(ms: number | null): string {
  if (ms === null) return "";
  return `${ms}ms`;
}

// ─── Live dot ────────────────────────────────────────────────────────────────

interface LiveDotProps {
  color: string;
  pulse: boolean;
}

function LiveDot({ color, pulse }: LiveDotProps) {
  return (
    <span className="relative flex items-center justify-center w-2 h-2">
      {pulse && (
        <span
          className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping"
          style={{ background: color }}
        />
      )}
      <span
        className="relative inline-flex w-1.5 h-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 5px ${color}` }}
      />
    </span>
  );
}

// ─── Private WS feed indicator ───────────────────────────────────────────────

interface FeedBadgeProps {
  status: PrivateWsStatus;
}

function FeedBadge({ status }: FeedBadgeProps) {
  if (status === "idle") return null;

  const map: Record<PrivateWsStatus, { label: string; color: string; Icon: React.FC<{ className?: string }> }> = {
    idle:         { label: "",           color: "transparent", Icon: Wifi },
    connecting:   { label: "WS…",       color: "#f59e0b",     Icon: Activity },
    connected:    { label: "WS Live",   color: "#4ade80",     Icon: Wifi },
    reconnecting: { label: "WS reconnecting", color: "#f59e0b", Icon: Activity },
    failed:       { label: "WS failed", color: "#ef4444",     Icon: WifiOff },
  };

  const { label, color, Icon } = map[status];

  return (
    <span
      className="flex items-center gap-0.5 text-[9px] font-medium tracking-wide px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BrokerStatusBar() {
  const {
    activeAccount,
    balance,
    positions,
    orders,
    connectionStatus,
    connectionLatency,
    reconnectAttempts,
    reconnectingState,
    privateWsStatus,
    livePnl,
    disconnect,
    reconnect,
    setShowPositions,
    setShowOrders,
    setShowPlaceOrder,
    showPositions,
    showOrders,
    showPlaceOrder,
  } = useBrokerStore();

  if (!activeAccount || connectionStatus === "disconnected") return null;

  const broker = BROKERS.find(b => b.id === activeAccount.broker_id);

  // ── Status classification ──────────────────────────────────────────────────
  const isConnected  = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";
  const isError      = connectionStatus === "error";

  const dotColor   = isError ? "#ef4444" : isConnecting ? "#f59e0b" : "#4ade80";
  const dotPulse   = isConnecting || reconnectingState;
  const statusText = isError
    ? reconnectAttempts > 0 ? `Error (retry ${reconnectAttempts})` : "Error"
    : isConnecting
    ? reconnectingState ? "Reconnecting…" : "Connecting…"
    : "Live";

  // ── PnL — prefer live tick-driven values, fall back to broker balance ───────
  const livePnlTotal = Object.values(livePnl).reduce((a, b) => a + b, 0);
  const hasFeedPnl   = Object.keys(livePnl).length > 0;
  const pnlValue     = hasFeedPnl
    ? livePnlTotal
    : parseFloat(balance?.unrealisedPnl ?? "0");
  const pnlPositive  = pnlValue >= 0;
  const pnlColor     = pnlPositive ? "#4ade80" : "#f87171";

  const equity = parseFloat(balance?.equity ?? "0");
  const avail  = parseFloat(balance?.availableToWithdraw ?? "0");
  const hasBalance = !!balance;

  // ── Broker env hint (India / International) ────────────────────────────────
  const envLabel = activeAccount.env_name
    ? activeAccount.env_name === "india" ? "India" : activeAccount.env_name
    : null;

  return (
    <div
      style={{
        background: "rgba(5,14,10,0.98)",
        borderTop: "1px solid rgba(57,91,67,0.2)",
        flexShrink: 0,
        minHeight: 44,
      }}
    >
      {/* Error banner — full width, above main bar */}
      {isError && (
        <div
          className="flex items-center gap-2 px-3 py-1 text-[11px]"
          style={{
            background: "rgba(239,68,68,0.08)",
            borderBottom: "1px solid rgba(239,68,68,0.15)",
          }}
        >
          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
          <span style={{ color: "#f87171" }}>
            Broker connection error
            {reconnectAttempts > 0 ? ` — attempt ${reconnectAttempts}` : ""}
          </span>
          <button
            onClick={() => reconnect()}
            className="ml-1 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors"
            style={{
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.1)",
            }}
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Retry
          </button>
        </div>
      )}

      {/* Main bar */}
      <div className="flex items-center gap-2 px-3 select-none" style={{ height: 44 }}>

        {/* Broker badge */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
            style={{
              background: broker?.image ? "transparent" : (broker?.color ?? "#888") + "22",
              color: broker?.color,
            }}
          >
            {broker?.image
              ? <img src={broker.image} alt={broker.name} className="w-full h-full object-cover" />
              : broker?.logo}
          </div>
          <span className="text-[11px] font-bold text-white hidden md:inline truncate">
            {broker?.name}
          </span>
          {envLabel && (
            <span
              className="text-[9px] font-medium px-1 rounded hidden sm:inline"
              style={{ color: "#f97316", background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.2)" }}
            >
              {envLabel}
            </span>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-4 shrink-0" style={{ background: "rgba(57,91,67,0.3)" }} />

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <LiveDot color={dotColor} pulse={dotPulse} />
          <span className="text-[11px] font-semibold" style={{ color: dotColor }}>
            {statusText}
          </span>
          {connectionLatency !== null && isConnected && (
            <span
              className="text-[9px] tabular-nums font-medium"
              style={{ color: "rgba(167,184,169,0.5)" }}
            >
              {fmtLatency(connectionLatency)}
            </span>
          )}
        </div>

        {/* Private WS feed badge */}
        <FeedBadge status={privateWsStatus} />

        {/* Separator */}
        <div className="w-px h-4 shrink-0" style={{ background: "rgba(57,91,67,0.3)" }} />

        {/* Account data */}
        {hasBalance && (
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            {/* Equity */}
            <div className="hidden xs:block">
              <p className="text-[8px] uppercase tracking-wider leading-none mb-0.5"
                style={{ color: "rgba(167,184,169,0.4)" }}>
                Equity
              </p>
              <p className="text-[12px] font-bold text-white tabular-nums leading-none">
                ${fmtMoney(equity)}
              </p>
            </div>

            {/* Available */}
            <div className="hidden lg:block">
              <p className="text-[8px] uppercase tracking-wider leading-none mb-0.5"
                style={{ color: "rgba(167,184,169,0.4)" }}>
                Avail
              </p>
              <p className="text-[12px] font-semibold tabular-nums leading-none"
                style={{ color: "rgba(167,184,169,0.75)" }}>
                ${fmtMoney(avail)}
              </p>
            </div>

            {/* Unrealised PnL */}
            <div>
              <p className="text-[8px] uppercase tracking-wider leading-none mb-0.5 hidden xs:block"
                style={{ color: "rgba(167,184,169,0.4)" }}>
                {hasFeedPnl ? "Live PnL" : "Unr. PnL"}
              </p>
              <p
                className="text-[12px] font-bold tabular-nums leading-none flex items-center gap-0.5"
                style={{ color: pnlColor }}
              >
                {pnlPositive
                  ? <TrendingUp className="w-3 h-3 shrink-0" />
                  : <TrendingDown className="w-3 h-3 shrink-0" />}
                {pnlPositive ? "+" : ""}
                {fmtMoney(pnlValue)}
              </p>
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">

          {/* Positions */}
          <button
            onClick={() => { setShowPositions(!showPositions); setShowOrders(false); setShowPlaceOrder(false); }}
            className="flex items-center gap-1 h-7 px-2 rounded text-[11px] font-semibold transition-all"
            style={{
              background: showPositions ? "rgba(183,255,90,0.12)" : "rgba(57,91,67,0.18)",
              color:      showPositions ? "#B7FF5A" : "rgba(167,184,169,0.75)",
              border:     showPositions ? "1px solid rgba(183,255,90,0.22)" : "1px solid transparent",
            }}
          >
            <TrendingUp className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Pos</span>
            {positions.length > 0 && (
              <span
                className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                style={{
                  background: showPositions ? "rgba(183,255,90,0.25)" : "rgba(57,91,67,0.4)",
                  color: showPositions ? "#B7FF5A" : "rgba(167,184,169,0.9)",
                }}
              >
                {positions.length}
              </span>
            )}
          </button>

          {/* Orders */}
          <button
            onClick={() => { setShowOrders(!showOrders); setShowPositions(false); setShowPlaceOrder(false); }}
            className="flex items-center gap-1 h-7 px-2 rounded text-[11px] font-semibold transition-all"
            style={{
              background: showOrders ? "rgba(183,255,90,0.12)" : "rgba(57,91,67,0.18)",
              color:      showOrders ? "#B7FF5A" : "rgba(167,184,169,0.75)",
              border:     showOrders ? "1px solid rgba(183,255,90,0.22)" : "1px solid transparent",
            }}
          >
            <BarChart2 className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Orders</span>
            {orders.length > 0 && (
              <span
                className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                style={{
                  background: showOrders ? "rgba(183,255,90,0.25)" : "rgba(57,91,67,0.4)",
                  color: showOrders ? "#B7FF5A" : "rgba(167,184,169,0.9)",
                }}
              >
                {orders.length}
              </span>
            )}
          </button>

          {/* Trade */}
          <button
            onClick={() => { setShowPlaceOrder(!showPlaceOrder); setShowPositions(false); setShowOrders(false); }}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-bold transition-all"
            style={{
              background: showPlaceOrder ? "#B7FF5A" : "rgba(183,255,90,0.14)",
              color:      showPlaceOrder ? "#07110D" : "#B7FF5A",
              border: "1px solid rgba(183,255,90,0.28)",
            }}
          >
            <ShoppingCart className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Trade</span>
          </button>

          {/* Divider */}
          <div className="w-px h-4 mx-0.5" style={{ background: "rgba(57,91,67,0.3)" }} />

          {/* Disconnect */}
          <button
            onClick={disconnect}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            title="Disconnect broker"
            style={{ color: "rgba(239,68,68,0.55)" }}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
