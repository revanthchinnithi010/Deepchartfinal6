import { memo } from "react";
import { useLiveMarketContext } from "@/contexts/LiveMarketContext";

interface ConnectionStatusProps {
  compact?: boolean;
}

const STATUS_CONFIG = {
  connected:    { color: "#B7FF5A", label: "Live",         pulse: true  },
  connecting:   { color: "#F59E0B", label: "Connecting…",  pulse: true  },
  reconnecting: { color: "#F59E0B", label: "Reconnecting…",pulse: true  },
  disconnected: { color: "#6B7280", label: "Offline",      pulse: false },
  error:        { color: "#EF4444", label: "Error",        pulse: false },
};

export const ConnectionStatus = memo(function ConnectionStatus({ compact }: ConnectionStatusProps) {
  const { wsStatus, latencyMs } = useLiveMarketContext();
  const cfg = STATUS_CONFIG[wsStatus] ?? STATUS_CONFIG.disconnected;

  return (
    <div
      title={`WebSocket: ${cfg.label}${latencyMs !== null ? ` · ${latencyMs}ms` : ""}`}
      style={{
        display:     "flex",
        alignItems:  "center",
        gap:         5,
        padding:     compact ? "3px 8px" : "4px 10px",
        borderRadius: 20,
        background:  "rgba(255,255,255,0.04)",
        border:      `1px solid ${cfg.color}22`,
        flexShrink:  0,
        cursor:      "default",
        userSelect:  "none",
      }}
    >
      {/* Dot */}
      <div style={{ position: "relative", width: 7, height: 7, flexShrink: 0 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: cfg.color,
          boxShadow:  `0 0 6px ${cfg.color}`,
        }} />
        {cfg.pulse && (
          <div style={{
            position: "absolute", inset: -2,
            borderRadius: "50%",
            border: `1.5px solid ${cfg.color}`,
            animation: "ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
            opacity: 0.55,
          }} />
        )}
      </div>

      {!compact && (
        <span style={{
          fontSize:     10.5,
          fontWeight:   600,
          color:        cfg.color,
          letterSpacing:"0.01em",
          whiteSpace:   "nowrap",
        }}>
          {cfg.label}
        </span>
      )}

      {!compact && latencyMs !== null && wsStatus === "connected" && (
        <span style={{
          fontSize:   9.5,
          fontWeight: 500,
          color:      "rgba(167,184,169,0.45)",
          marginLeft: 1,
        }}>
          {latencyMs}ms
        </span>
      )}

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
});

export default ConnectionStatus;
