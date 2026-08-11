import { useEffect } from "react";
import { X, Plug, Trash2, ChevronLeft, CheckCircle2, AlertCircle, Loader2, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ConnectionStatus } from "@/types/broker";

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ConnectionStatus }) {
  const cfg = {
    connected:    { label: "Connected",    color: "#22C55E", bg: "rgba(34,197,94,0.12)",  icon: <CheckCircle2 size={11} /> },
    connecting:   { label: "Connecting…",  color: "#F59E0B", bg: "rgba(245,158,11,0.12)", icon: <Loader2 size={11} className="animate-spin" /> },
    disconnected: { label: "Disconnected", color: "rgba(167,184,169,0.5)", bg: "rgba(255,255,255,0.05)", icon: <WifiOff size={11} /> },
    error:        { label: "Error",        color: "#EF4444", bg: "rgba(239,68,68,0.12)",  icon: <AlertCircle size={11} /> },
  }[status] ?? { label: status, color: "rgba(167,184,169,0.5)", bg: "rgba(255,255,255,0.05)", icon: <Wifi size={11} /> };

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 20,
      background: cfg.bg,
      color: cfg.color,
      fontSize: 10, fontWeight: 600,
      border: `1px solid ${cfg.color}33`,
    }}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── Main broker list content ─────────────────────────────────────────────────
interface BrokerListContentProps {
  onClose: () => void;
  /**
   * Optional override for the "Connect X" / "Add Another Account" button.
   * When provided, this is called instead of openAuthModal so that callers
   * (e.g. BrokerIntegrationModal) can handle navigation internally without
   * opening a full-screen page.
   */
  onConnectBroker?: (brokerId: string) => void;
}

export function BrokerListContent({ onClose, onConnectBroker }: BrokerListContentProps) {
  const {
    accounts, connect, deleteAccount, openAuthModal,
    connectedAccounts, brokerStatuses, disconnectBroker,
  } = useBrokerStore();

  return (
    <div style={{
      padding: "12px 12px 24px",
      display: "flex", flexDirection: "column", gap: 10,
      boxSizing: "border-box", width: "100%", maxWidth: "100%",
    }}>
      {BROKERS.map(broker => {
        const connectedAccount = connectedAccounts[broker.id];
        const status: ConnectionStatus = brokerStatuses[broker.id] ?? "disconnected";
        const isConnected = !!connectedAccount;
        const isConnecting = status === "connecting";

        const savedAccounts = accounts.filter(a => a.broker_id === broker.id);

        return (
          <div key={broker.id} style={{
            borderRadius: 16,
            border: isConnected
              ? "1px solid rgba(34,197,94,0.25)"
              : "1px solid rgba(57,91,67,0.2)",
            background: isConnected
              ? "rgba(34,197,94,0.04)"
              : "rgba(255,255,255,0.02)",
            overflow: "hidden",
            transition: "border-color 0.2s, background 0.2s",
            boxSizing: "border-box", width: "100%",
          }}>
            {/* Broker header row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 14px",
              minWidth: 0,
            }}>
              {/* Logo — delta & ctrader rendered monochrome */}
              {(() => {
                const mono = broker.id === "delta" || broker.id === "ctrader";
                return (
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: broker.image ? "transparent" : mono ? "rgba(255,255,255,0.12)" : broker.color + "22",
                    color: mono ? "#fff" : broker.color, fontSize: 16, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                    boxShadow: isConnected ? `0 0 14px ${mono ? "rgba(255,255,255,0.15)" : broker.color + "30"}` : "none",
                    transition: "box-shadow 0.3s",
                  }}>
                    {broker.image
                      ? <img src={broker.image} alt={broker.name} style={{ width: "100%", height: "100%", objectFit: "cover", ...(mono ? { filter: "grayscale(1) brightness(1.6)" } : {}) }} />
                      : broker.logo}
                  </div>
                );
              })()}

              {/* Name + description + status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  flexWrap: "wrap" as const, marginBottom: 3,
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: "#fff",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{broker.name}</span>
                  <StatusBadge status={status} />
                </div>
                <p style={{
                  fontSize: 11, color: "rgba(167,184,169,0.55)", margin: 0,
                  lineHeight: 1.4, overflow: "hidden",
                  display: "-webkit-box", WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as never,
                }}>{broker.description}</p>
              </div>
            </div>

            {/* Connected account info + actions */}
            {isConnected && connectedAccount && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                flexWrap: "wrap" as const,
                padding: "10px 14px 12px",
                borderTop: "1px solid rgba(34,197,94,0.12)",
              }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", margin: 0, flex: 1, minWidth: 0 }}>
                  Active: <span style={{ color: "#fff", fontWeight: 600 }}>{connectedAccount.label || "Account"}</span>
                </p>
                <button
                  onClick={() => disconnectBroker(broker.id)}
                  style={{
                    height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: "rgba(239,68,68,0.1)", color: "#EF4444",
                    border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                    touchAction: "manipulation",
                  }}
                >
                  <WifiOff size={11} /> Disconnect
                </button>
              </div>
            )}

            {/* Error state */}
            {!isConnected && status === "error" && (
              <div style={{ padding: "10px 14px 12px", borderTop: "1px solid rgba(239,68,68,0.15)" }}>
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "8px 10px", borderRadius: 10,
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
                }}>
                  <AlertCircle size={13} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 11, color: "#EF4444", lineHeight: 1.4 }}>Connection error — check credentials</span>
                </div>
              </div>
            )}

            {/* Saved accounts list + add button (when not connected) */}
            {!isConnected && !isConnecting && (
              <div style={{ padding: "0 14px 12px", borderTop: "1px solid rgba(57,91,67,0.1)" }}>
                {savedAccounts.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, marginBottom: 10 }}>
                    {savedAccounts.map(acc => (
                      <div key={acc.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", borderRadius: 10,
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(57,91,67,0.15)",
                        minWidth: 0,
                      }}>
                        <span style={{
                          flex: 1, fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          minWidth: 0,
                        }}>{acc.label || "Account"}</span>
                        <button
                          onClick={() => { connect(acc); onClose(); }}
                          style={{
                            height: 26, padding: "0 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                            background: "#B7FF5A", color: "#07110D", border: "none", cursor: "pointer",
                            flexShrink: 0, touchAction: "manipulation",
                          }}
                        >
                          Connect
                        </button>
                        <button
                          onClick={() => deleteAccount(acc.id)}
                          style={{
                            width: 26, height: 26, borderRadius: 7, border: "none", cursor: "pointer",
                            background: "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                            color: "rgba(239,68,68,0.55)", flexShrink: 0, touchAction: "manipulation",
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => {
                    if (onConnectBroker) onConnectBroker(broker.id);
                    else openAuthModal(broker.id as import("@/types/broker").BrokerId);
                  }}
                  style={{
                    width: "100%", marginTop: savedAccounts.length > 0 ? 0 : 10,
                    padding: "9px 8px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: "rgba(183,255,90,0.08)", color: "#B7FF5A",
                    border: "1px solid rgba(183,255,90,0.2)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    boxSizing: "border-box", touchAction: "manipulation",
                  }}
                  onTouchStart={e => (e.currentTarget.style.background = "rgba(183,255,90,0.15)")}
                  onTouchEnd={e => (e.currentTarget.style.background = "rgba(183,255,90,0.08)")}
                >
                  <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>+</span>
                  {savedAccounts.length > 0 ? "Add Another Account" : `Connect ${broker.name}`}
                </button>
              </div>
            )}

            {/* Connecting spinner */}
            {isConnecting && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 18px 14px",
                borderTop: "1px solid rgba(245,158,11,0.15)",
              }}>
                <Loader2 size={13} style={{ color: "#F59E0B" }} className="animate-spin" />
                <span style={{ fontSize: 12, color: "rgba(245,158,11,0.8)" }}>Establishing connection…</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Connected broker count summary */}
      {Object.keys(connectedAccounts).length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
          borderRadius: 12, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)",
          marginTop: 4, flexWrap: "wrap" as const,
        }}>
          <Wifi size={13} style={{ color: "#22C55E", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", flex: 1, minWidth: 0 }}>
            <span style={{ color: "#22C55E", fontWeight: 700 }}>
              {Object.keys(connectedAccounts).length}
            </span>
            {" "}broker{Object.keys(connectedAccounts).length !== 1 ? "s" : ""} connected
          </span>
          <button
            onClick={() => useBrokerStore.getState().disconnectAll()}
            style={{
              flexShrink: 0, fontSize: 10, fontWeight: 600, padding: "3px 10px",
              borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "rgba(239,68,68,0.7)",
              border: "1px solid rgba(239,68,68,0.15)", cursor: "pointer", touchAction: "manipulation",
            }}
          >
            Disconnect All
          </button>
        </div>
      )}
    </div>
  );
}

// ── Mobile: full-screen page ─────────────────────────────────────────────────
function MobileBrokerSelectPage() {
  const { closeSelectModal, loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 200,
      background: "#0B1017",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "0 16px", height: 56, flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(11,16,23,0.98)",
      }}>
        <button onClick={closeSelectModal} style={{
          width: 36, height: 36, borderRadius: 10, border: "none", cursor: "pointer",
          background: "rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.8)", flexShrink: 0,
        }}>
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <Plug style={{ width: 16, height: 16, color: "#B7FF5A" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Connect Brokers</span>
        </div>
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}>
        <BrokerListContent onClose={closeSelectModal} />
      </div>
    </div>
  );
}

// ── Desktop: modal overlay ───────────────────────────────────────────────────
function DesktopBrokerSelectModal() {
  const { closeSelectModal, loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) closeSelectModal(); }}
    >
      <div style={{
        width: 480, maxHeight: "85vh",
        borderRadius: 20,
        background: "hsl(var(--background))",
        border: "1px solid var(--surface-btn-border)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px",
          borderBottom: "1px solid rgba(57,91,67,0.15)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plug style={{ width: 16, height: 16, color: "#B7FF5A" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Connect Brokers</span>
          </div>
          <button onClick={closeSelectModal} style={{
            width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
            background: "transparent", display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(167,184,169,0.6)",
          }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <BrokerListContent onClose={closeSelectModal} />
        </div>
      </div>
    </div>
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────
export function BrokerSelectModal() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileBrokerSelectPage /> : <DesktopBrokerSelectModal />;
}
