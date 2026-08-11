import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Key, Lock, Tag, Loader2, CheckCircle2, XCircle, ExternalLink, Zap, Shield } from "lucide-react";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";

interface DeltaApiConnectFormProps {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

type FormStatus = "idle" | "connecting" | "success" | "error";

const LS_TOKEN_PREFIX = "tj_broker_token_";

export function DeltaApiConnectForm({ onSuccess, onError }: DeltaApiConnectFormProps) {
  const { loadAccounts, connect } = useBrokerStore();

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [balanceInfo, setBalanceInfo] = useState<string | null>(null);
  const [hasImported, setHasImported] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    fetch("/api/credentials/status", { credentials: "include" })
      .then(r => r.json())
      .then((d: { ok: boolean; status?: Record<string, boolean> }) => {
        if (d.ok && d.status?.DELTA_API_KEY && d.status?.DELTA_API_SECRET) {
          setHasImported(true);
        }
      })
      .catch(() => {});

    fetch("/api/delta/oauth/config", { credentials: "include" })
      .then(r => r.json())
      .then((d: { configured: boolean }) => {
        setOauthConfigured(d.configured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== "delta_oauth_result") return;

      const { status: cbStatus, message, accountId, apiToken, label: cbLabel } = event.data as {
        status: string;
        message: string | null;
        accountId: number | null;
        apiToken: string | null;
        label: string | null;
      };

      if (popupRef.current) {
        try { popupRef.current.close(); } catch { /* ignore */ }
        popupRef.current = null;
      }

      if (cbStatus !== "success") {
        const msg = message ?? "Delta OAuth failed — please try again";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      if (accountId && apiToken) {
        finishOAuthConnect(accountId, apiToken, cbLabel ?? "Delta Exchange");
      } else {
        fetch("/api/delta/oauth/pending-account", { credentials: "include" })
          .then(r => r.json())
          .then((d: { ok: boolean; accountId?: number; apiToken?: string; label?: string; error?: string }) => {
            if (!d.ok || !d.accountId || !d.apiToken) {
              const msg = d.error ?? "Could not retrieve Delta account after OAuth";
              setStatus("error");
              setErrorMsg(msg);
              onError(msg);
              return;
            }
            finishOAuthConnect(d.accountId, d.apiToken, d.label ?? "Delta Exchange");
          })
          .catch((err) => {
            const msg = `Network error: ${String(err)}`;
            setStatus("error");
            setErrorMsg(msg);
            onError(msg);
          });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function finishOAuthConnect(accountId: number, apiToken: string, accountLabel: string) {
    try {
      localStorage.setItem(`${LS_TOKEN_PREFIX}${accountId}`, apiToken);
    } catch { /* ignore */ }

    setStatus("success");
    await loadAccounts();

    const account: BrokerAccount = {
      id: accountId,
      broker_id: "delta",
      label: accountLabel,
      is_active: true,
      api_token: apiToken,
      created_at: new Date().toISOString(),
    };
    connect(account);

    try {
      await fetch("/api/broker/delta/ws/start", {
        method: "POST", credentials: "include",
        headers: { "X-Broker-Account-Id": String(accountId), "X-Broker-Token": apiToken },
      });
    } catch { /* non-fatal */ }

    setTimeout(() => { onSuccess(); }, 1200);
  }

  async function startDeltaOAuth() {
    setStatus("connecting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/delta/oauth/config", { credentials: "include" });
      const data = await res.json() as { configured: boolean; authUrl: string | null };

      if (!data.configured || !data.authUrl) {
        const msg = "Delta OAuth is not configured. Set DELTA_CLIENT_ID and DELTA_CLIENT_SECRET.";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      const popup = window.open(data.authUrl, "delta_oauth", "width=560,height=700,resizable=yes");
      if (!popup) {
        const msg = "Popup blocked — allow popups for this site and retry.";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      popupRef.current = popup;
      setStatus("connecting");

      const pollInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollInterval);
          popupRef.current = null;
          if (status === "connecting") {
            setStatus("idle");
          }
        }
      }, 800);
    } catch (err) {
      const msg = `Network error: ${String(err)}`;
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    }
  }

  const isLoading = status === "connecting";
  const canSubmit = apiKey.trim().length > 0 && apiSecret.trim().length > 0 && !isLoading;

  async function handleConnectImported() {
    setStatus("connecting");
    setErrorMsg("");
    setBalanceInfo(null);
    try {
      const res = await fetch("/api/credentials/connect/delta", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json() as {
        ok: boolean; accountId?: number; apiToken?: string;
        error?: string; usdtBalance?: string; envName?: string;
      };
      if (!data.ok || !data.accountId || !data.apiToken) {
        const msg = data.error ?? "Connection failed — check imported credentials";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }
      try { localStorage.setItem(`${LS_TOKEN_PREFIX}${data.accountId}`, data.apiToken); } catch { /* ignore */ }
      if (data.usdtBalance !== undefined) {
        setBalanceInfo(`USDT Balance: ${parseFloat(data.usdtBalance).toFixed(2)}${data.envName ? ` · ${data.envName}` : ""}`);
      }
      setStatus("success");
      await loadAccounts();
      const account: BrokerAccount = {
        id: data.accountId,
        broker_id: "delta",
        label: "Delta Exchange",
        is_active: true,
        api_token: data.apiToken,
        created_at: new Date().toISOString(),
      };
      connect(account);
      try {
        await fetch("/api/broker/delta/ws/start", {
          method: "POST", credentials: "include",
          headers: { "X-Broker-Account-Id": String(data.accountId), "X-Broker-Token": data.apiToken },
        });
      } catch { /* non-fatal */ }
      setTimeout(() => { onSuccess(); }, 1200);
    } catch (err) {
      const msg = `Network error: ${String(err)}`;
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("connecting");
    setErrorMsg("");
    setBalanceInfo(null);

    try {
      const res = await fetch("/api/broker-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          broker_id: "delta",
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
          label: label.trim() || "Delta Exchange",
        }),
      });

      const data = await res.json() as {
        ok: boolean;
        account?: BrokerAccount & { id: number; broker_id: "delta"; label: string; is_active: boolean; created_at: string };
        api_token?: string;
        error?: string;
        usdtBalance?: string;
      };

      if (!data.ok || !data.account || !data.api_token) {
        const msg = data.error ?? "Connection failed — check your credentials";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      const accountId = data.account.id;
      const apiToken = data.api_token;

      try { localStorage.setItem(`${LS_TOKEN_PREFIX}${accountId}`, apiToken); } catch { /* ignore */ }

      if (data.usdtBalance !== undefined) {
        setBalanceInfo(`USDT Balance: ${parseFloat(data.usdtBalance).toFixed(2)}`);
      }

      setStatus("success");
      await loadAccounts();

      const account: BrokerAccount = {
        id: accountId,
        broker_id: "delta",
        label: data.account.label ?? "Delta Exchange",
        is_active: true,
        api_token: apiToken,
        created_at: data.account.created_at ?? new Date().toISOString(),
      };

      connect(account);

      try {
        await fetch("/api/broker/delta/ws/start", {
          method: "POST",
          credentials: "include",
          headers: {
            "X-Broker-Account-Id": String(accountId),
            "X-Broker-Token": apiToken,
          },
        });
      } catch { /* WS start failure is non-fatal — polling continues */ }

      setTimeout(() => {
        onSuccess();
      }, 1200);
    } catch (err) {
      const msg = `Network error: ${String(err)}`;
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-full"
          style={{ background: "rgba(0,255,180,0.12)", border: "1.5px solid rgba(0,255,180,0.3)" }}
        >
          <CheckCircle2 size={32} style={{ color: "#00FFB4" }} />
        </div>
        <div>
          <p className="text-base font-semibold" style={{ color: "#00FFB4" }}>Connected to Delta Exchange</p>
          {balanceInfo && (
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{balanceInfo}</p>
          )}
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            Live positions, orders & balance syncing…
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="flex flex-col gap-4" autoComplete="off">
      {/* OAuth connect — shown when DELTA_CLIENT_ID + SECRET are configured */}
      {oauthConfigured && (
        <div style={{
          padding: "14px 16px", borderRadius: 12,
          background: "rgba(183,255,90,0.05)", border: "1px solid rgba(183,255,90,0.2)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={14} style={{ color: "#B7FF5A", flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#B7FF5A", margin: 0 }}>Connect via OAuth 2.0</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                Authorize securely without entering your API keys here.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startDeltaOAuth}
            disabled={isLoading}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: isLoading ? "rgba(183,255,90,0.1)" : "linear-gradient(135deg, #B7FF5A 0%, #7FCC00 100%)",
              color: isLoading ? "rgba(183,255,90,0.5)" : "#0B1017",
              border: "none", cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {isLoading ? <><Loader2 size={14} className="animate-spin" /> Authorizing…</> : <>Connect with OAuth</>}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}>or use API key below</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>
        </div>
      )}

      {/* One-click connect when credentials are already imported */}
      {hasImported && (
        <div style={{
          padding: "14px 16px", borderRadius: 12,
          background: "rgba(0,255,180,0.05)", border: "1px solid rgba(0,255,180,0.2)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} style={{ color: "#00FFB4", flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#00FFB4", margin: 0 }}>Imported credentials found</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                Connect instantly using your saved API key & secret.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnectImported}
            disabled={isLoading}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: isLoading ? "rgba(0,255,180,0.1)" : "linear-gradient(135deg, #00FFB4 0%, #00CC96 100%)",
              color: isLoading ? "rgba(0,255,180,0.5)" : "#0B1017",
              border: "none", cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {isLoading ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : <>Connect with Imported Key</>}
          </button>
          {!oauthConfigured && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}>or enter manually below</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
          API KEY
        </label>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: apiKey ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Key size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <input
            type="text"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Your Delta Exchange API Key"
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
          API SECRET
        </label>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: apiSecret ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Lock size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <input
            type={showSecret ? "text" : "password"}
            value={apiSecret}
            onChange={e => setApiSecret(e.target.value)}
            placeholder="Your Delta Exchange API Secret"
            disabled={isLoading}
            autoComplete="new-password"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}
          />
          <button
            type="button"
            onClick={() => setShowSecret(s => !s)}
            className="flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
          Secret is encrypted before storage and never exposed in logs.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
          ACCOUNT LABEL <span style={{ color: "rgba(255,255,255,0.28)" }}>(optional)</span>
        </label>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Tag size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Main Account"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)" }}
          />
        </div>
      </div>

      {status === "error" && (
        <div
          className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <XCircle size={15} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm leading-snug" style={{ color: "#EF4444" }}>{errorMsg}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: canSubmit
              ? "linear-gradient(135deg, #F97316 0%, #EA580C 100%)"
              : "rgba(249,115,22,0.2)",
            color: canSubmit ? "#fff" : "rgba(255,255,255,0.4)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit ? "0 0 24px rgba(249,115,22,0.25)" : "none",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Validating credentials…
            </>
          ) : (
            "Connect to Delta Exchange"
          )}
        </button>

        <a
          href="https://www.delta.exchange/app/account/manageapikeys"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs transition-opacity hover:opacity-80"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          <ExternalLink size={11} />
          Create API keys on delta.exchange
        </a>
      </div>
    </form>
  );
}
