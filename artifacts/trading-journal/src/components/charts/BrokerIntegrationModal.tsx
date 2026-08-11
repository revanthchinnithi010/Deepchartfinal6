/**
 * BrokerIntegrationModal — full-screen bottom sheet for broker integrations.
 * Uses internal stack navigation (activeBroker state) — the user never
 * leaves the sheet when connecting a broker.
 *
 * Stack:
 *   null  →  Broker list (tabs: cTrader / Delta / Fusion)
 *   "delta" | "mt5"  →  Inline connect form with ← back button
 *
 * Android back button is handled via history.pushState / popstate.
 */
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, Wifi, Zap, Globe, ChevronLeft,
  ShieldCheck, Server,
  CheckCircle2, Eye, EyeOff,
  Loader2, XCircle, RefreshCw,
} from "lucide-react";
import { CtraderWidget } from "@/components/charts/CtraderWidget";
import { BrokerListContent } from "@/components/broker/BrokerSelectModal";
import { DeltaApiConnectForm } from "@/components/broker/DeltaApiConnectForm";
import { BrokerLogo } from "@/components/broker/BrokerLogos";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerId } from "@/types/broker";

// ── Types ──────────────────────────────────────────────────────────────────────
type BrokerTab    = "ctrader" | "delta" | "fusion";
type ActiveBroker = "delta" | "mt5" | null;

const TABS: { id: BrokerTab; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: "ctrader", label: "cTrader", icon: Wifi             },
  { id: "delta",   label: "Delta",   icon: Zap,  badge: "Δ" },
  { id: "fusion",  label: "Fusion",  icon: Globe             },
];

// ── Security badges ────────────────────────────────────────────────────────────
function SecurityBadges() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" as const }}>
      {[
        { icon: <ShieldCheck size={13} />, label: "AES-256 encrypted"   },
        { icon: <Server size={13} />,      label: "Backend-only signing" },
        { icon: <Wifi size={13} />,        label: "Live WS sync"         },
      ].map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(0,255,180,0.7)" }}>{item.icon}</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Success banner ─────────────────────────────────────────────────────────────
function SuccessBanner({ brokerName, onBack }: { brokerName: string; onBack: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 16, padding: "40px 24px", textAlign: "center",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 64, height: 64, borderRadius: "50%",
        background: "rgba(0,255,180,0.1)", border: "1.5px solid rgba(0,255,180,0.3)",
      }}>
        <CheckCircle2 size={32} style={{ color: "#00FFB4" }} />
      </div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#00FFB4", margin: 0 }}>
          Connected to {brokerName}
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "6px 0 0" }}>
          Syncing positions, orders & balance…
        </p>
      </div>
      <button onClick={onBack} style={{
        marginTop: 8, padding: "8px 20px", borderRadius: 10,
        fontSize: 13, fontWeight: 500,
        background: "rgba(0,255,180,0.1)", color: "#00FFB4",
        border: "1px solid rgba(0,255,180,0.25)", cursor: "pointer",
      }}>
        Done
      </button>
    </div>
  );
}

// ── Inline Delta form ──────────────────────────────────────────────────────────
function InlineDeltaForm({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState(false);
  if (done) return <SuccessBanner brokerName="Delta Exchange" onBack={onBack} />;
  return (
    <div style={{ padding: "20px 20px 32px" }}>
      <SecurityBadges />
      <DeltaApiConnectForm
        onSuccess={() => setDone(true)}
        onError={() => {/* DeltaApiConnectForm shows its own error UI */}}
      />
    </div>
  );
}

// ── Inline MT5 form ────────────────────────────────────────────────────────────
type Mt5Status = "idle" | "loading" | "success" | "error";

function InlineMt5Form({ onBack }: { onBack: () => void }) {
  const { loadAccounts, connect } = useBrokerStore();
  const [status,   setStatus]   = useState<Mt5Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [server,   setServer]   = useState("");
  const [login,    setLogin]    = useState("");
  const [password, setPassword] = useState("");
  const [label,    setLabel]    = useState("");
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!server.trim() || !login.trim() || !password.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/broker-accounts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          broker_id:    "mt5",
          mt5_server:   server.trim(),
          mt5_login:    login.trim(),
          mt5_password: password.trim(),
          label:        label.trim() || "MT5 Account",
        }),
      });
      const data = await res.json() as {
        ok: boolean;
        account?: { id: string; [k: string]: unknown };
        api_token?: string;
        error?: string;
      };
      if (!data.ok || !data.account || !data.api_token) {
        setStatus("error");
        setErrorMsg(data.error ?? "Connection failed");
        return;
      }
      try { localStorage.setItem(`tj_broker_token_${data.account.id}`, data.api_token); } catch { /* ignore */ }
      setStatus("success");
      await loadAccounts();
      setTimeout(() => {
        connect({ ...data.account!, api_token: data.api_token! } as Parameters<typeof connect>[0]);
      }, 1200);
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  if (status === "success") return <SuccessBanner brokerName="MetaTrader 5" onBack={onBack} />;

  const isLoading = status === "loading";
  const baseInput: React.CSSProperties = {
    height: 40, borderRadius: 9, fontSize: 13,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff", outline: "none", fontFamily: "monospace",
    boxSizing: "border-box", width: "100%",
  };

  return (
    <div style={{ padding: "20px 20px 32px" }}>
      <SecurityBadges />
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Server */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>Server</label>
            <input
              type="text" value={server} onChange={e => setServer(e.target.value)}
              placeholder="e.g. MetaQuotes-Demo" required disabled={isLoading}
              style={{ ...baseInput, padding: "0 12px" }}
            />
          </div>

          {/* Login */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>Login</label>
            <input
              type="text" value={login} onChange={e => setLogin(e.target.value)}
              placeholder="Account number" required disabled={isLoading}
              style={{ ...baseInput, padding: "0 12px" }}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Account password" required disabled={isLoading}
                style={{ ...baseInput, padding: "0 40px 0 12px" }}
              />
              <button
                type="button" onClick={() => setShowPass(!showPass)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(255,255,255,0.4)", padding: 4,
                }}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Label (optional) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>
              Label <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span>
            </label>
            <input
              type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="My MT5 Account" disabled={isLoading}
              style={{ ...baseInput, padding: "0 12px" }}
            />
          </div>
        </div>

        {status === "error" && (
          <div style={{
            display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px", borderRadius: 10,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <XCircle size={15} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: "#EF4444", margin: 0, lineHeight: 1.5 }}>{errorMsg}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          {status === "error" && (
            <button type="button" onClick={() => { setStatus("idle"); setErrorMsg(""); }} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10,
              fontSize: 13, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
            }}>
              <RefreshCw size={13} /> Retry
            </button>
          )}
          <button
            type="submit" disabled={isLoading}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 600,
              background: isLoading
                ? "rgba(34,197,94,0.2)"
                : "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
              color: isLoading ? "rgba(255,255,255,0.4)" : "#fff",
              border: "none", cursor: isLoading ? "not-allowed" : "pointer",
              boxShadow: isLoading ? "none" : "0 0 24px rgba(34,197,94,0.25)",
            }}
          >
            {isLoading
              ? <><Loader2 size={15} className="animate-spin" /> Connecting…</>
              : "Connect MT5"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Fusion placeholder ─────────────────────────────────────────────────────────
function FusionTabContent() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "60px 24px", gap: 14, textAlign: "center",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)",
      }}>
        <Globe style={{ width: 22, height: 22, color: "#60a5fa" }} />
      </div>
      <div>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>
          Fusion Markets
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)", lineHeight: 1.6 }}>
          Integration coming soon.
          <br />Fusion Markets support will appear here when available.
        </p>
      </div>
      <span style={{
        padding: "5px 14px", borderRadius: 99,
        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.16)",
        fontSize: 11, fontWeight: 600, color: "#60a5fa",
      }}>Coming Soon</span>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface BrokerIntegrationModalProps {
  onClose: () => void;
  initialTab?: BrokerTab;
}

export function BrokerIntegrationModal({ onClose, initialTab = "ctrader" }: BrokerIntegrationModalProps) {
  const [activeTab,    setActiveTab]    = useState<BrokerTab>(initialTab);
  const [activeBroker, setActiveBroker] = useState<ActiveBroker>(null);

  const { loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape key: go back within the stack, or close the sheet
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (activeBroker) setActiveBroker(null);
      else onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeBroker, onClose]);

  // Android back button — push a history entry when entering the broker form
  // so the OS back gesture pops it and fires popstate.
  useEffect(() => {
    if (activeBroker) {
      window.history.pushState({ bimBrokerForm: activeBroker }, "");
    }
  }, [activeBroker]);

  useEffect(() => {
    const h = (_e: PopStateEvent) => {
      if (activeBroker) {
        setActiveBroker(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, [activeBroker, onClose]);

  // Called by BrokerListContent "Connect X" button — navigate into the form
  const handleConnectBroker = useCallback((brokerId: string) => {
    setActiveBroker(brokerId as ActiveBroker);
  }, []);

  const goBack = useCallback(() => setActiveBroker(null), []);

  // Broker info for the form header
  const brokerInfo = activeBroker ? BROKERS.find(b => b.id === activeBroker) : null;

  const modal = (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={() => { if (activeBroker) setActiveBroker(null); else onClose(); }}
        style={{
          position: "fixed", inset: 0, zIndex: 9200,
          background: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          animation: "bimBdIn 0.20s ease both",
        }}
      />

      {/* ── Sheet ── */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        zIndex: 9201,
        height: "calc(100dvh - 44px)",
        display: "flex", flexDirection: "column",
        background: "#0b0f14",
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: "1px solid rgba(255,255,255,0.09)", borderBottom: "none",
        boxShadow: "0 -16px 60px rgba(0,0,0,0.70)",
        overflow: "hidden",
        animation: "bimSheetIn 0.28s cubic-bezier(0.32,1.0,0.55,1) both",
      }}>

        {/* ── Drag handle ── */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)" }} />
        </div>

        {/* ── Header — morphs between list and form views ── */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center",
          padding: "10px 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          gap: 10,
        }}>
          {/* Back button (form view only) */}
          {activeBroker && (
            <button
              onClick={goBack}
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.10)",
                cursor: "pointer", touchAction: "manipulation",
              }}
            >
              <ChevronLeft style={{ width: 18, height: 18, color: "rgba(255,255,255,0.70)" }} />
            </button>
          )}

          {/* Title */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
            {activeBroker && brokerInfo && (
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}>
                <BrokerLogo brokerId={activeBroker as BrokerId} size={28} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                {activeBroker && brokerInfo ? `Connect ${brokerInfo.name}` : "Broker Integrations"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(148,163,184,0.38)", marginTop: 1 }}>
                {activeBroker && brokerInfo
                  ? brokerInfo.description
                  : "Closing keeps your connections active"}
              </div>
            </div>
          </div>

          {/* Close button — always visible, closes the entire sheet */}
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.10)",
              cursor: "pointer", touchAction: "manipulation",
            }}
          >
            <X style={{ width: 15, height: 15, color: "rgba(255,255,255,0.55)" }} />
          </button>
        </div>

        {/* ── Tabs (list view only) ── */}
        {!activeBroker && (
          <div style={{ flexShrink: 0, padding: "10px 14px 0" }}>
            <div style={{
              display: "flex",
              background: "rgba(255,255,255,0.05)",
              borderRadius: 10, padding: 3,
              border: "1px solid rgba(255,255,255,0.07)",
              marginBottom: 10, gap: 2,
            }}>
              {TABS.map(tab => {
                const active = tab.id === activeTab;
                const Icon   = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 5,
                      padding: "8px 6px",
                      border: "none", borderRadius: 7,
                      cursor: "pointer", touchAction: "manipulation",
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      color: active ? "#f0c060" : "rgba(148,163,184,0.45)",
                      background: active ? "rgba(245,158,11,0.15)" : "transparent",
                      boxShadow: active ? "0 0 0 1px rgba(245,158,11,0.25)" : "none",
                      transition: "all 0.15s",
                      whiteSpace: "nowrap" as const, minWidth: 0,
                    }}
                  >
                    <Icon style={{ width: 12, height: 12, flexShrink: 0, color: active ? "#f59e0b" : "rgba(148,163,184,0.38)" }} />
                    {tab.label}
                    {tab.badge && (
                      <span style={{
                        fontSize: 8.5, fontWeight: 700,
                        color: active ? "#f59e0b" : "rgba(148,163,184,0.28)",
                        background: active ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.06)",
                        border: `1px solid ${active ? "rgba(245,158,11,0.22)" : "rgba(148,163,184,0.08)"}`,
                        borderRadius: 4, padding: "1px 3px", flexShrink: 0,
                      }}>{tab.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -14px" }} />
          </div>
        )}

        {/* ── Scrollable content ── */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: "auto", overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}>

          {/* ── Form view (stack level 2) ── */}
          {activeBroker === "delta" && <InlineDeltaForm onBack={goBack} />}
          {activeBroker === "mt5"   && <InlineMt5Form   onBack={goBack} />}

          {/* ── List view (stack level 1) ── */}
          {!activeBroker && (
            <div style={{ padding: "14px 14px", boxSizing: "border-box", width: "100%", maxWidth: "100%", overflow: "hidden" }}>
              {activeTab === "ctrader" && <CtraderWidget />}
              {activeTab === "delta"   && (
                <BrokerListContent
                  onClose={onClose}
                  onConnectBroker={handleConnectBroker}
                />
              )}
              {activeTab === "fusion"  && <FusionTabContent />}
            </div>
          )}

          <div style={{ height: "max(20px, env(safe-area-inset-bottom))" }} />
        </div>
      </div>

      <style>{`
        @keyframes bimBdIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes bimSheetIn {
          from { transform: translateY(100%) }
          to   { transform: translateY(0) }
        }
      `}</style>
    </>
  );

  return createPortal(modal, document.body);
}
