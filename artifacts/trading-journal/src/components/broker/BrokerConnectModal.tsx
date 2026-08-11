import { useState } from "react";
import {
  CheckCircle2, XCircle, Loader2,
  RefreshCw, Eye, EyeOff, Server, ShieldCheck, Wifi,
  ChevronLeft, X,
} from "lucide-react";
import { BrokerLogo } from "@/components/broker/BrokerLogos";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";
import { DeltaApiConnectForm } from "./DeltaApiConnectForm";
import { useIsMobile } from "@/hooks/use-mobile";

type Status = "idle" | "loading" | "success" | "error";

const LS_TOKEN_PREFIX = "tj_broker_token_";

// ── Shared logic hook ─────────────────────────────────────────────────────────
function useBrokerConnect() {
  const { authBrokerId, closeAuthModal, openSelectModal, loadAccounts, connect } = useBrokerStore();
  const broker = BROKERS.find(b => b.id === authBrokerId);

  const [status,      setStatus]      = useState<Status>("idle");
  const [errorMsg,    setErrorMsg]    = useState("");
  const [mt5Server,   setMt5Server]   = useState("");
  const [mt5Login,    setMt5Login]    = useState("");
  const [mt5Password, setMt5Password] = useState("");
  const [mt5Label,    setMt5Label]    = useState("");
  const [showMt5Pass, setShowMt5Pass] = useState(false);

  async function handleMt5Connect(e: React.FormEvent) {
    e.preventDefault();
    if (!mt5Server.trim() || !mt5Login.trim() || !mt5Password.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/broker-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          broker_id:    "mt5",
          mt5_server:   mt5Server.trim(),
          mt5_login:    mt5Login.trim(),
          mt5_password: mt5Password.trim(),
          label:        mt5Label.trim() || "MT5 Account",
        }),
      });
      const data = await res.json() as {
        ok: boolean; account?: BrokerAccount; api_token?: string; error?: string;
      };
      if (!data.ok || !data.account || !data.api_token) {
        setStatus("error");
        setErrorMsg(data.error ?? "Connection failed");
        return;
      }
      try { localStorage.setItem(`${LS_TOKEN_PREFIX}${data.account.id}`, data.api_token); } catch { /* ignore */ }
      setStatus("success");
      await loadAccounts();
      setTimeout(() => {
        connect({ ...data.account!, api_token: data.api_token! });
        closeAuthModal();
      }, 1200);
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  return {
    broker, status, setStatus, errorMsg, setErrorMsg,
    mt5Server, setMt5Server, mt5Login, setMt5Login,
    mt5Password, setMt5Password, mt5Label, setMt5Label,
    showMt5Pass, setShowMt5Pass,
    handleMt5Connect,
    closeAuthModal, openSelectModal,
  };
}

// ── Shared broker form content ────────────────────────────────────────────────
function BrokerFormContent({
  broker, status, setStatus, errorMsg, setErrorMsg,
  mt5Server, setMt5Server, mt5Login, setMt5Login,
  mt5Password, setMt5Password, mt5Label, setMt5Label,
  showMt5Pass, setShowMt5Pass,
  handleMt5Connect,
  onDone,
}: ReturnType<typeof useBrokerConnect> & { onDone: () => void }) {
  if (!broker) return null;

  return (
    <div style={{ padding: "24px 20px 32px" }}>
      {/* Security badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" as const }}>
        {[
          { icon: <ShieldCheck size={13} />, label: "AES-256 encrypted" },
          { icon: <Server size={13} />,      label: "Backend-only signing" },
          { icon: <Wifi size={13} />,        label: "Live WS sync" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "rgba(0,255,180,0.7)" }}>{item.icon}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Delta */}
      {broker.id === "delta" && (
        status === "success"
          ? <SuccessBanner broker={broker} onClose={onDone} />
          : <DeltaApiConnectForm onSuccess={onDone} onError={msg => { setStatus("error"); setErrorMsg(msg); }} />
      )}

      {/* MT5 */}
      {broker.id === "mt5" && (
        status === "success"
          ? <SuccessBanner broker={broker} onClose={onDone} />
          : <Mt5CredentialsForm
              status={status} errorMsg={errorMsg}
              mt5Server={mt5Server}   setMt5Server={setMt5Server}
              mt5Login={mt5Login}     setMt5Login={setMt5Login}
              mt5Password={mt5Password} setMt5Password={setMt5Password}
              mt5Label={mt5Label}     setMt5Label={setMt5Label}
              showPass={showMt5Pass}  setShowPass={setShowMt5Pass}
              onSubmit={handleMt5Connect}
              onRetry={() => { setStatus("idle"); setErrorMsg(""); }}
            />
      )}

    </div>
  );
}

// ── Mobile: full-screen broker setup page ─────────────────────────────────────
function MobileBrokerConnectPage() {
  const ctx = useBrokerConnect();
  const { broker, closeAuthModal, openSelectModal } = ctx;
  if (!broker) return null;

  const brokerTitle = broker.name;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 201, background: "#0B1017",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "0 16px", height: 56, flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(11,16,23,0.98)",
      }}>
        <button
          onClick={() => { closeAuthModal(); openSelectModal(); }}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "none", cursor: "pointer",
            background: "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.8)", flexShrink: 0,
          }}
        >
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            <BrokerLogo brokerId={broker.id} size={30} />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>{brokerTitle}</p>
            <p style={{ fontSize: 11, color: "rgba(167,184,169,0.5)", margin: "3px 0 0" }}>{broker.description}</p>
          </div>
        </div>
      </div>
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}>
        <BrokerFormContent {...ctx} onDone={closeAuthModal} />
      </div>
    </div>
  );
}

// ── Desktop: modal overlay ────────────────────────────────────────────────────
function DesktopBrokerConnectModal() {
  const ctx = useBrokerConnect();
  const { broker, closeAuthModal } = ctx;
  if (!broker) return null;

  const brokerGlow = broker.color + "18";
  const glassStyle: React.CSSProperties = {
    background: "rgba(18,18,18,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) closeAuthModal(); }}
    >
      <div style={{
        ...glassStyle,
        position: "relative", width: "100%", maxWidth: 448,
        borderRadius: 20, maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 60px ${brokerGlow}, 0 24px 48px rgba(0,0,0,0.6)`,
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${broker.color}60, transparent)`,
        }} />
        <div style={{ padding: "24px 24px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                border: `1.5px solid ${broker.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}>
                <BrokerLogo brokerId={broker.id} size={44} />
              </div>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.95)", margin: 0 }}>
                  Connect {broker.name}
                </h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "3px 0 0" }}>{broker.description}</p>
              </div>
            </div>
            <button onClick={closeAuthModal} style={{
              padding: 6, borderRadius: 8, border: "none", cursor: "pointer",
              background: "transparent", color: "rgba(255,255,255,0.4)", flexShrink: 0, marginLeft: 12,
            }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 20 }} />
        </div>
        <div style={{ overflowY: "auto", overscrollBehavior: "contain", flex: 1, minHeight: 0 }}>
          <BrokerFormContent {...ctx} onDone={closeAuthModal} />
        </div>
      </div>
    </div>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function BrokerConnectModal() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileBrokerConnectPage /> : <DesktopBrokerConnectModal />;
}

export { BrokerConnectModal as BrokerAuthModal };

// ── Sub-components ────────────────────────────────────────────────────────────

function SuccessBanner({ broker, onClose }: { broker: { name: string }; onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0", textAlign: "center" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 64, height: 64, borderRadius: "50%",
        background: "rgba(0,255,180,0.1)", border: "1.5px solid rgba(0,255,180,0.3)",
      }}>
        <CheckCircle2 size={32} style={{ color: "#00FFB4" }} />
      </div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#00FFB4", margin: 0 }}>Connected to {broker.name}</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "6px 0 0" }}>Syncing positions, orders & balance…</p>
      </div>
      <button onClick={onClose} style={{
        marginTop: 8, padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
        background: "rgba(0,255,180,0.1)", color: "#00FFB4",
        border: "1px solid rgba(0,255,180,0.25)", cursor: "pointer",
      }}>
        Done
      </button>
    </div>
  );
}

// ── MT5 credentials form ──────────────────────────────────────────────────────

interface Mt5FormProps {
  status: Status;
  errorMsg: string;
  mt5Server: string; setMt5Server: (v: string) => void;
  mt5Login: string; setMt5Login: (v: string) => void;
  mt5Password: string; setMt5Password: (v: string) => void;
  mt5Label: string; setMt5Label: (v: string) => void;
  showPass: boolean; setShowPass: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRetry: () => void;
}

function Mt5CredentialsForm({
  status, errorMsg,
  mt5Server, setMt5Server, mt5Login, setMt5Login,
  mt5Password, setMt5Password, mt5Label, setMt5Label,
  showPass, setShowPass, onSubmit, onRetry,
}: Mt5FormProps) {
  const isLoading = status === "loading";

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { label: "Server", value: mt5Server, set: setMt5Server, placeholder: "e.g. MetaQuotes-Demo", type: "text" },
          { label: "Login",  value: mt5Login,  set: setMt5Login,  placeholder: "Account number",       type: "text" },
        ].map(({ label, value, set, placeholder, type }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>{label}</label>
            <input
              type={type}
              value={value}
              onChange={e => set(e.target.value)}
              placeholder={placeholder}
              required
              disabled={isLoading}
              style={{
                height: 40, padding: "0 12px", borderRadius: 9, fontSize: 13,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                color: "#fff", outline: "none", fontFamily: "monospace",
              }}
            />
          </div>
        ))}

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              value={mt5Password}
              onChange={e => setMt5Password(e.target.value)}
              placeholder="Account password"
              required
              disabled={isLoading}
              style={{
                height: 40, padding: "0 40px 0 12px", borderRadius: 9, fontSize: 13, width: "100%",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                color: "#fff", outline: "none", fontFamily: "monospace", boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 4,
              }}
            >
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>
            Label <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span>
          </label>
          <input
            type="text"
            value={mt5Label}
            onChange={e => setMt5Label(e.target.value)}
            placeholder="My MT5 Account"
            disabled={isLoading}
            style={{
              height: 40, padding: "0 12px", borderRadius: 9, fontSize: 13,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
              color: "#fff", outline: "none",
            }}
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
          <button type="button" onClick={onRetry} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10,
            fontSize: 13, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
          }}>
            <RefreshCw size={13} /> Retry
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
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
  );
}
