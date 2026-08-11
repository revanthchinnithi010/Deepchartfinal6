import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Radio, Wifi, WifiOff, Eye, EyeOff, Loader2, Check,
  RefreshCw, Bell, Palette, Send, Zap, Activity,
  Download, Upload, Database, ServerCrash, ShieldCheck,
  Globe, Copy, CheckCheck,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { PageTransition, AnimatedCard, AnimatedList, AnimatedListItem, AnimatedButton, FadeIn } from "@/components/animations";
import { AnimatePresence, motion } from "motion/react";

function SectionHeader({ icon: Icon, title, description }: {
  icon: React.ElementType; title: string; description: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(57,91,67,0.22)", border: "1px solid rgba(57,91,67,0.32)" }}>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-white leading-tight">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

type DeltaStatus = "connected" | "connecting" | "disconnected" | "reconnecting" | "error";

const BADGE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  connected:    { bg: "rgba(96,165,250,0.10)",   border: "rgba(96,165,250,0.28)",   text: "#60a5fa", dot: "#60a5fa" },
  connecting:   { bg: "rgba(251,191,36,0.10)",   border: "rgba(251,191,36,0.28)",   text: "#fbbf24", dot: "#fbbf24" },
  reconnecting: { bg: "rgba(251,191,36,0.10)",   border: "rgba(251,191,36,0.28)",   text: "#fbbf24", dot: "#fbbf24" },
  testing:      { bg: "rgba(251,191,36,0.10)",   border: "rgba(251,191,36,0.28)",   text: "#fbbf24", dot: "#fbbf24" },
  disconnected: { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.18)", text: "#94a3b8", dot: "#94a3b8" },
  invalid_key:  { bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.25)",   text: "#f87171", dot: "#f87171" },
  error:        { bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.25)",   text: "#f87171", dot: "#f87171" },
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Feed Live", connecting: "Connecting…", reconnecting: "Reconnecting…",
  disconnected: "Disconnected", invalid_key: "Invalid Key", error: "Error", testing: "Testing…",
};

function StatusBadge({ status }: { status: string }) {
  const c = BADGE[status] ?? BADGE.disconnected;
  const spin = status === "connecting" || status === "reconnecting" || status === "testing";
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {spin
        ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
        : <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: c.dot }} />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function StatPill({ label, value, glow }: { label: string; value: string | number; glow?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-1.5 rounded-xl min-w-[60px]"
      style={{
        background: "rgba(16,37,28,0.7)",
        border: `1px solid ${glow ?? "rgba(57,91,67,0.22)"}`,
        boxShadow: glow ? `0 0 8px ${glow}22` : undefined,
      }}>
      <span className="text-[13px] font-bold text-white tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function MsgBox({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
  const isError = type === "error";
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-[12px]"
      style={{
        background: isError ? "rgba(239,68,68,0.08)"  : "rgba(255,255,255,0.04)",
        border:     isError ? "1px solid rgba(239,68,68,0.22)" : "1px solid rgba(255,255,255,0.10)",
      }}>
      {isError
        ? <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
        : <Check   className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />}
      <span style={{ color: isError ? "#f87171" : "rgba(148,163,184,0.9)" }}>{children}</span>
    </div>
  );
}

/* ─── Delta Panel ───────────────────────────────────────────────── */
function DeltaPanel() {
  const [status, setStatus]           = useState<DeltaStatus>("disconnected");
  const [tickCount, setTickCount]     = useState(0);
  const [reconnectCount, setReconnect] = useState(0);
  const [lastTickAgo, setLastTickAgo] = useState<number | null>(null);
  const [apiKeyMasked, setApiKeyMasked]       = useState<string | null>(null);
  const [apiSecretMasked, setApiSecretMasked] = useState<string | null>(null);
  const [apiKey, setApiKey]       = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showKey, setShowKey]     = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState<"connect" | "test" | "disconnect" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const d = await fetch("/api/delta/status").then(r => r.json()) as {
        connected: boolean; status: string; tickCount: number;
        reconnectCount: number; lastTickAgo: number | null;
        apiKeyMasked: string | null; apiSecretMasked: string | null;
      };
      setStatus(d.status as DeltaStatus);
      setTickCount(d.tickCount);
      setReconnect(d.reconnectCount);
      setLastTickAgo(d.lastTickAgo);
      setApiKeyMasked(d.apiKeyMasked);
      setApiSecretMasked(d.apiSecretMasked);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const connect = async () => {
    setError(null); setSuccess(null); setLoading("connect"); setStatus("connecting");
    const body: Record<string, string> = {};
    if (apiKey.trim())    body.apiKey    = apiKey.trim();
    if (apiSecret.trim()) body.apiSecret = apiSecret.trim();
    const d = await fetch("/api/delta/connect", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => ({ success: false, error: "Network error" })) as { success: boolean; error?: string };
    setLoading(null);
    if (d.success) { setSuccess("Connected! Crypto prices streaming live."); setApiKey(""); setApiSecret(""); await fetchStatus(); }
    else { setStatus("error"); setError(d.error ?? "Connection failed"); }
  };

  const test = async () => {
    setError(null); setSuccess(null); setLoading("test");
    const d = await fetch("/api/delta/test", { method: "POST" }).then(r => r.json()).catch(() => ({ success: false, error: "Network error" })) as { success: boolean; latencyMs?: number; error?: string };
    setLoading(null);
    if (d.success) { setSuccess(`Feed alive${d.latencyMs != null ? ` — last tick ${d.latencyMs}ms ago` : ""}.`); }
    else { setError(d.error ?? "Test failed"); }
  };

  const disconnect = async () => {
    setError(null); setSuccess(null); setLoading("disconnect");
    await fetch("/api/delta/connect", { method: "DELETE" }).catch(() => {});
    setLoading(null); setStatus("disconnected"); setTickCount(0); setReconnect(0); setLastTickAgo(null);
    setApiKeyMasked(null); setApiSecretMasked(null);
    setSuccess("Disconnected. Crypto feed stopped.");
  };

  const isLive = status === "connected" || status === "reconnecting";

  const latencyLabel = (() => {
    if (lastTickAgo === null) return "—";
    if (lastTickAgo < 1000)  return `${lastTickAgo}ms`;
    return `${(lastTickAgo / 1000).toFixed(1)}s`;
  })();

  return (
    <div className="rounded-2xl p-4 space-y-4"
      style={{ background: "rgba(16,37,28,0.65)", border: "1px solid rgba(57,91,67,0.24)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.28)" }}>
            <Activity className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-[14px] leading-tight">Delta Exchange</p>
            <p className="text-[11px] text-muted-foreground">BTCUSD · ETHUSD · SOLUSD · DOGEUSD · PEPEUSD</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {isLive && (
        <div className="flex items-center gap-2 flex-wrap">
          <StatPill label="Ticks" value={tickCount.toLocaleString()} glow="rgba(96,165,250,0.5)" />
          <StatPill label="Latency" value={latencyLabel} glow="rgba(59,130,246,0.5)" />
          <StatPill label="Reconnects" value={reconnectCount} />
          {(apiKeyMasked || apiSecretMasked) && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px]"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <Check className="w-3 h-3 text-blue-400" />
              <span className="text-foreground/70 font-medium">API key active</span>
            </div>
          )}
        </div>
      )}

      {!isLive && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-muted-foreground">
              No API key needed for live prices. Keys unlock order execution &amp; account data.
            </p>
            <button type="button" onClick={() => setShowOptional(v => !v)}
              className="text-[11px] text-primary hover:text-primary/80 whitespace-nowrap ml-3 transition-colors">
              {showOptional ? "Hide keys ↑" : "Add keys ↓"}
            </button>
          </div>

          <AnimatePresence>
            {showOptional && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">API Key <span className="normal-case text-muted-foreground/50">(optional)</span></Label>
                    <div className="relative">
                      <Input type={showKey ? "text" : "password"} placeholder="Delta Exchange API key…"
                        value={apiKey} onChange={e => setApiKey(e.target.value)}
                        className="rounded-xl h-10 pr-10 font-mono text-sm"
                        style={{ background: "rgba(16,37,28,0.55)", border: "1px solid rgba(57,91,67,0.28)" }} />
                      <button type="button" onClick={() => setShowKey(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">API Secret <span className="normal-case text-muted-foreground/50">(optional)</span></Label>
                    <div className="relative">
                      <Input type={showSecret ? "text" : "password"} placeholder="Delta Exchange API secret…"
                        value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                        className="rounded-xl h-10 pr-10 font-mono text-sm"
                        style={{ background: "rgba(16,37,28,0.55)", border: "1px solid rgba(57,91,67,0.28)" }} />
                      <button type="button" onClick={() => setShowSecret(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {error   && <MsgBox type="error">{error}</MsgBox>}
      {success && <MsgBox type="success">{success}</MsgBox>}

      <div className="flex items-center gap-2 flex-wrap">
        {!isLive ? (
          <Button size="sm" onClick={connect} disabled={loading !== null}
            className="rounded-xl h-8 px-4 text-sm"
            style={{ background: "rgba(139,92,246,0.85)", color: "white" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,1)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(139,92,246,0.85)")}>
            {loading === "connect" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 mr-1.5" />}
            Connect
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={test} disabled={loading !== null}
              className="rounded-xl h-8 px-4 text-sm"
              style={{ border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.10)", color: "#c4b5fd" }}>
              {loading === "test" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Test Feed
            </Button>
            <Button size="sm" variant="outline" onClick={disconnect} disabled={loading !== null}
              className="rounded-xl h-8 px-4 text-sm"
              style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "#f87171" }}>
              {loading === "disconnect" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <WifiOff className="w-3.5 h-3.5 mr-1.5" />}
              Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Telegram Panel ────────────────────────────────────────────── */
function TelegramPanel() {
  const [botToken,      setBotToken]      = useState("");
  const [chatId,        setChatId]        = useState("");
  const [showToken,     setShowToken]     = useState(false);
  const [status,        setStatus]        = useState<"connected" | "disconnected">("disconnected");
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [loading,       setLoading]       = useState<"connect" | "test" | "disconnect" | "toggle" | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState<string | null>(null);
  const [masked,        setMasked]        = useState<{ botToken: string | null; chatId: string | null }>({ botToken: null, chatId: null });

  const fetchStatus = useCallback(async () => {
    try {
      const d = await fetch("/api/telegram/status").then(r => r.json()) as {
        configured: boolean; tokenMasked?: string | null; chatId?: string | null; globalEnabled?: boolean;
      };
      setStatus(d.configured ? "connected" : "disconnected");
      setMasked({ botToken: d.tokenMasked ?? null, chatId: d.chatId ?? null });
      setGlobalEnabled(d.globalEnabled ?? true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const connect = async () => {
    const trimToken  = botToken.trim();
    const trimChatId = chatId.trim();
    if (!trimToken || !trimChatId) { setError("Both Bot Token and Chat ID are required"); return; }
    if (trimToken.length < 20) { setError("Bot token looks too short — copy it directly from @BotFather"); return; }
    setError(null); setSuccess(null); setLoading("connect");
    const d = await fetch("/api/telegram/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: trimToken, chatId: trimChatId }),
    }).then(r => r.json()).catch(() => ({ success: false, error: "Network error — check your connection" })) as {
      success: boolean; error?: string; errorType?: string;
    };
    setLoading(null);
    if (d.success) {
      setSuccess("✅ Telegram connected! A confirmation message was sent to your chat.");
      setBotToken(""); setChatId("");
      await fetchStatus();
    } else {
      setError(d.error ?? "Connection failed — please try again");
    }
  };

  const toggle = async (enabled: boolean) => {
    setGlobalEnabled(enabled);
    setLoading("toggle");
    await fetch("/api/telegram/toggle", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
    setLoading(null);
  };

  const test = async () => {
    setError(null); setSuccess(null); setLoading("test");
    const d = await fetch("/api/telegram/test", { method: "POST" }).then(r => r.json()).catch(() => ({ success: false, error: "Network error" })) as { success: boolean; error?: string };
    setLoading(null);
    if (d.success) setSuccess("Test message sent to your Telegram chat!");
    else setError(d.error ?? "Test failed");
  };

  const disconnectTelegram = async () => {
    setError(null); setSuccess(null); setLoading("disconnect");
    await fetch("/api/telegram/config", { method: "DELETE" }).catch(() => {});
    setLoading(null); setStatus("disconnected"); setMasked({ botToken: null, chatId: null });
    setSuccess("Telegram disconnected.");
  };

  const isLive = status === "connected";

  return (
    <div className="rounded-2xl p-4 space-y-4"
      style={{ background: "rgba(16,37,28,0.65)", border: "1px solid rgba(57,91,67,0.24)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(0,136,204,0.14)", border: "1px solid rgba(0,136,204,0.28)" }}>
            <Send className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-[14px] leading-tight">Telegram Bot</p>
            <p className="text-[11px] text-muted-foreground">Receive price alerts &amp; daily summaries via Telegram</p>
          </div>
        </div>
        <StatusBadge status={isLive ? "connected" : "disconnected"} />
      </div>

      {/* Global enable toggle — always visible */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div>
          <p className="text-[13px] font-semibold text-white">Enable Telegram Alerts</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {globalEnabled ? "All triggered alerts will be forwarded to Telegram" : "Alerts paused — bot stays connected"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggle(!globalEnabled)}
          disabled={loading === "toggle"}
          aria-label="Toggle Telegram alerts"
          style={{
            width: 46, height: 26, borderRadius: 13, flexShrink: 0, position: "relative",
            background: globalEnabled ? "#0ea5e9" : "rgba(255,255,255,0.12)",
            border: "none", cursor: "pointer",
            transition: "background 200ms",
            opacity: loading === "toggle" ? 0.6 : 1,
          }}
        >
          <span style={{
            position: "absolute", top: 3,
            left: globalEnabled ? 23 : 3,
            width: 20, height: 20, borderRadius: "50%",
            background: globalEnabled ? "#fff" : "rgba(255,255,255,0.70)",
            transition: "left 200ms",
          }} />
        </button>
      </div>

      {isLive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-foreground/70 font-medium">Bot:</span>
          <span className="text-muted-foreground font-mono">{masked.botToken ?? "—"}</span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="text-foreground/70 font-medium">Chat:</span>
          <span className="text-muted-foreground font-mono">{masked.chatId ?? "—"}</span>
        </div>
      )}

      {!isLive && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Bot Token</Label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                value={botToken}
                autoComplete="off"
                onChange={e => { setBotToken(e.target.value); setError(null); }}
                onKeyDown={e => e.key === "Enter" && connect()}
                className="rounded-xl h-10 pr-10 font-mono text-sm"
                style={{ background: "rgba(16,37,28,0.55)", border: "1px solid rgba(57,91,67,0.28)" }}
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Chat ID</Label>
            <Input
              type="text"
              placeholder="-100123456789"
              value={chatId}
              autoComplete="off"
              onChange={e => { setChatId(e.target.value); setError(null); }}
              onKeyDown={e => e.key === "Enter" && connect()}
              className="rounded-xl h-10 font-mono text-sm"
              style={{ background: "rgba(16,37,28,0.55)", border: "1px solid rgba(57,91,67,0.28)" }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Create a bot via <span className="text-sky-400">@BotFather</span> on Telegram, then get your Chat ID from <span className="text-sky-400">@userinfobot</span>.
          </p>
        </div>
      )}

      {error   && <MsgBox type="error">{error}</MsgBox>}
      {success && <MsgBox type="success">{success}</MsgBox>}

      <div className="flex items-center gap-2 flex-wrap">
        {!isLive ? (
          <Button size="sm" onClick={connect} disabled={loading !== null || !botToken.trim() || !chatId.trim()}
            className="rounded-xl h-8 px-4 text-sm bg-sky-600 hover:bg-sky-500 text-white">
            {loading === "connect" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Connect
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={test} disabled={loading !== null}
              className="rounded-xl h-8 px-4 text-sm"
              style={{ border: "1px solid rgba(57,91,67,0.32)", background: "rgba(57,91,67,0.12)", color: "#94a3b8" }}>
              {loading === "test" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Send Test
            </Button>
            <Button size="sm" variant="outline" onClick={disconnectTelegram} disabled={loading !== null}
              className="rounded-xl h-8 px-4 text-sm"
              style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "#f87171" }}>
              {loading === "disconnect" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <WifiOff className="w-3.5 h-3.5 mr-1.5" />}
              Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── System Health Panel ───────────────────────────────────────── */
type HealthStatus = {
  status: string;
  database: { connected: boolean; latencyMs: number | null };
  delta:    { status: string };
  telegram: { enabled: boolean };
} | null;

function SystemHealthPanel() {
  const [health, setHealth]   = useState<HealthStatus>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const d = await fetch("/api/health").then(r => r.ok ? r.json() : null) as HealthStatus;
      setHealth(d);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const rows: Array<{ label: string; icon: React.ElementType; ok: boolean; detail?: string }> = health ? [
    { label: "Database",  icon: Database,   ok: health.database.connected,
      detail: health.database.connected ? `${health.database.latencyMs ?? "—"}ms` : "Unavailable" },
    { label: "Delta Exch", icon: Activity,  ok: health.delta.status === "connected" || health.delta.status === "reconnecting",
      detail: health.delta.status },
    { label: "Telegram",  icon: Send,       ok: health.telegram.enabled,
      detail: health.telegram.enabled ? "Configured" : "Not configured" },
  ] : [];

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: "rgba(16,37,28,0.65)", border: "1px solid rgba(57,91,67,0.24)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-[13px] font-semibold text-white">System Health</span>
        </div>
        <button type="button" onClick={fetchHealth} disabled={loading}
          className="text-muted-foreground hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !health && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking status…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <ServerCrash className="w-3.5 h-3.5 shrink-0" />
          API server is offline — health check unavailable.
        </div>
      )}

      {health && (
        <div className="grid grid-cols-2 gap-2">
          {rows.map(row => (
            <div key={row.label} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
              style={{
                background: row.ok ? "rgba(255,255,255,0.04)" : "rgba(239,68,68,0.06)",
                border: `1px solid ${row.ok ? "rgba(255,255,255,0.10)" : "rgba(239,68,68,0.18)"}`,
              }}>
              <row.icon className={`w-3.5 h-3.5 shrink-0 ${row.ok ? "text-blue-400" : "text-red-400"}`} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white leading-tight">{row.label}</p>
                <p className={`text-[10px] capitalize leading-tight ${row.ok ? "text-foreground/50" : "text-red-400/80"}`}>
                  {row.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Server IP Panel ───────────────────────────────────────────── */
type IpState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; ip: string; provider: string; timestamp: string }
  | { status: "error"; message: string };

function ServerIpPanel() {
  const [state, setState] = useState<IpState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const fetchIp = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/my-ip", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json() as { ip?: string; provider?: string; timestamp?: string; error?: string };
      if (!res.ok || !data.ip) {
        setState({ status: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({ status: "ok", ip: data.ip, provider: data.provider ?? "Replit", timestamp: data.timestamp ?? new Date().toISOString() });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }, []);

  useEffect(() => { fetchIp(); }, [fetchIp]);

  const copy = async () => {
    if (state.status !== "ok") return;
    try {
      await navigator.clipboard.writeText(state.ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const formattedTs = state.status === "ok"
    ? new Date(state.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
    : null;

  return (
    <div className="rounded-2xl p-4 space-y-4"
      style={{ background: "rgba(16,37,28,0.65)", border: "1px solid rgba(57,91,67,0.24)" }}>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.26)" }}>
            <Globe className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-[14px] leading-tight">Backend Server IP</p>
            <p className="text-[11px] text-muted-foreground">
              This is the Replit backend server IP used for Delta Exchange India API whitelisting.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0"
          style={{
            background: state.status === "ok" ? "rgba(96,165,250,0.10)" : state.status === "error" ? "rgba(239,68,68,0.10)" : "rgba(251,191,36,0.10)",
            border: state.status === "ok" ? "1px solid rgba(96,165,250,0.28)" : state.status === "error" ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(251,191,36,0.28)",
            color: state.status === "ok" ? "#60a5fa" : state.status === "error" ? "#f87171" : "#fbbf24",
          }}>
          {state.status === "loading"
            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
            : <span className="w-2 h-2 rounded-full animate-pulse" style={{
                background: state.status === "ok" ? "#60a5fa" : state.status === "error" ? "#f87171" : "#fbbf24"
              }} />}
          {state.status === "ok" ? "Live" : state.status === "loading" ? "Detecting…" : state.status === "error" ? "Error" : "Idle"}
        </span>
      </div>

      {state.status === "ok" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap"
            style={{ background: "rgba(16,37,28,0.8)", border: "1px solid rgba(251,191,36,0.22)", borderRadius: "0.75rem", padding: "10px 14px" }}>
            <Globe className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="font-mono text-[15px] sm:text-[17px] font-bold text-white tracking-wider flex-1 break-all">
              {state.ip}
            </span>
            <Button size="sm" onClick={copy}
              className="rounded-lg h-8 px-3 text-[12px] shrink-0 transition-all"
              style={{
                background: copied ? "rgba(255,255,255,0.08)" : "rgba(251,191,36,0.14)",
                border: copied ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(251,191,36,0.30)",
                color: copied ? "rgba(148,163,184,0.9)" : "#fbbf24",
              }}>
              {copied
                ? <><CheckCheck className="w-3.5 h-3.5 mr-1.5" />Copied!</>
                : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy IP</>}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <div className="px-3 py-2 rounded-xl"
              style={{ background: "rgba(16,37,28,0.6)", border: "1px solid rgba(57,91,67,0.18)" }}>
              <p className="uppercase tracking-wider text-[10px] font-semibold mb-0.5 text-muted-foreground/60">Provider</p>
              <p className="text-white font-medium">{state.provider}</p>
            </div>
            <div className="px-3 py-2 rounded-xl"
              style={{ background: "rgba(16,37,28,0.6)", border: "1px solid rgba(57,91,67,0.18)" }}>
              <p className="uppercase tracking-wider text-[10px] font-semibold mb-0.5 text-muted-foreground/60">Detected at</p>
              <p className="text-white font-medium">{formattedTs}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px]"
            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)" }}>
            <Globe className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
            <span className="text-yellow-300/80 leading-relaxed">
              Copy this IP and add it to your Delta Exchange India API key whitelist. Re-check after importing this project to a new Replit account or redeploying — the IP may change.
            </span>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-[12px]"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
          <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <span className="text-red-400">Failed to detect IP: {state.message}</span>
        </div>
      )}

      {state.status === "loading" && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Contacting ipify.org to detect outbound IP…
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={fetchIp} disabled={state.status === "loading"}
          className="rounded-xl h-8 px-4 text-sm"
          style={{ background: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.28)", color: "#fbbf24" }}>
          {state.status === "loading"
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Refresh IP
        </Button>
        {state.status === "ok" && (
          <span className="text-[11px] text-muted-foreground/60">
            IP detected via api.ipify.org · no caching
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Backup & Restore Panel ────────────────────────────────────── */
function BackupPanel() {
  const [importing,  setImporting]  = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [importMsg,  setImportMsg]  = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/config/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const cd   = res.headers.get("Content-Disposition") ?? "";
      const fnMatch = cd.match(/filename="?([^"]+)"?/);
      a.href     = url;
      a.download = fnMatch?.[1] ?? `tradevault-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res  = await fetch("/api/config/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json() as { success: boolean; summary?: Record<string, number>; error?: string };
      if (data.success) {
        const s = data.summary ?? {};
        setImportMsg({
          type: "success",
          text: `Imported: ${s.settings ?? 0} settings · ${s.watchlist ?? 0} symbols · ${s.alerts ?? 0} alerts · ${s.zones ?? 0} zones · ${s.trendlines ?? 0} trendlines`,
        });
      } else {
        setImportMsg({ type: "error", text: data.error ?? "Import failed" });
      }
    } catch (err) {
      setImportMsg({ type: "error", text: `Invalid file: ${err instanceof Error ? err.message : "parse error"}` });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl p-4 space-y-4"
      style={{ background: "rgba(16,37,28,0.65)", border: "1px solid rgba(57,91,67,0.24)" }}>
      <div>
        <p className="text-[13px] font-semibold text-white mb-0.5">Backup &amp; Restore</p>
        <p className="text-[11px] text-muted-foreground">
          Export all your settings, watchlist, alerts, and zones into a single JSON file.
          Import it on any device or Replit account to restore instantly.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={handleExport} disabled={exporting}
          className="rounded-xl h-8 px-4 text-sm"
          style={{ background: "rgba(57,91,67,0.7)", color: "white" }}>
          {exporting
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <Download className="w-3.5 h-3.5 mr-1.5" />}
          Export Config
        </Button>

        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}
          className="rounded-xl h-8 px-4 text-sm"
          style={{ border: "1px solid rgba(57,91,67,0.32)", background: "rgba(57,91,67,0.12)", color: "#94a3b8" }}>
          {importing
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <Upload className="w-3.5 h-3.5 mr-1.5" />}
          Import Config
        </Button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>

      {importMsg && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-[12px]"
          style={{
            background: importMsg.type === "success" ? "rgba(255,255,255,0.04)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${importMsg.type === "success" ? "rgba(255,255,255,0.10)" : "rgba(239,68,68,0.22)"}`,
          }}>
          {importMsg.type === "success"
            ? <Check className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            : <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
          <span style={{ color: importMsg.type === "success" ? "rgba(148,163,184,0.9)" : "#f87171" }}>{importMsg.text}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Settings Page ─────────────────────────────────────────────── */
export default function Settings() {
  return (
    <PageTransition className="space-y-5 max-w-3xl pb-16" fill={false}>
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage connections, preferences, and trading parameters.</p>
      </div>

      {/* ── 0. System Health ── */}
      <AnimatedCard index={0}>
        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <SectionHeader icon={ShieldCheck} title="System Status"
              description="Real-time health of database, market feeds, and notifications" />
          </CardHeader>
          <CardContent>
            <SystemHealthPanel />
          </CardContent>
        </Card>
      </AnimatedCard>

      {/* ── 1. Market Data Providers ── */}
      <AnimatedCard index={1}>
        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <SectionHeader icon={Radio} title="Market Data Providers"
              description="Manual connect — feeds only start when you click Connect" />
          </CardHeader>
          <CardContent className="space-y-3">
            <DeltaPanel />
          </CardContent>
        </Card>
      </AnimatedCard>

      {/* ── 2. Backend Server IP ── */}
      <AnimatedCard index={2}>
        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <SectionHeader icon={Globe} title="Backend Server IP"
              description="Detect the Replit server's outbound IP for Delta Exchange India whitelisting" />
          </CardHeader>
          <CardContent>
            <ServerIpPanel />
          </CardContent>
        </Card>
      </AnimatedCard>

      {/* ── 3. Telegram Alerts ── */}
      <AnimatedCard index={3}>
        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <SectionHeader icon={Bell} title="Telegram Alerts"
              description="Get price alerts and daily summaries in your Telegram chat" />
          </CardHeader>
          <CardContent>
            <TelegramPanel />
            <div className="mt-4">
              <AnimatedList className="space-y-3">
                {[
                  { label: "Price alert triggers", sub: "Notify when a price zone is breached", checked: true },
                  { label: "Daily P&L summary", sub: "End-of-day report at market close", checked: true },
                  { label: "Win streak notifications", sub: "Celebrate when you hit 3+ wins in a row", checked: false },
                  { label: "Loss limit warnings", sub: "Alert when you approach daily loss limit", checked: true },
                ].map(n => (
                  <AnimatedListItem key={n.label} className="flex items-center justify-between gap-3 py-1">
                    <div>
                      <p className="text-sm font-medium text-white">{n.label}</p>
                      <p className="text-[11px] text-muted-foreground">{n.sub}</p>
                    </div>
                    <Switch defaultChecked={n.checked} />
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            </div>
          </CardContent>
        </Card>
      </AnimatedCard>

      {/* ── 3. Appearance ── */}
      <AnimatedCard index={4}>
        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <SectionHeader icon={Palette} title="Appearance" description="Display and layout preferences" />
          </CardHeader>
          <CardContent>
            <AnimatedList className="space-y-3">
              {[
                { label: "Dark theme", sub: "Toggle dark / light mode via the sun icon in the header", checked: true, disabled: true },
                { label: "Compact trade table", sub: "Reduce row height for denser view", checked: false },
                { label: "Show broker column", sub: "Display broker in the trades table", checked: true },
                { label: "Animated price tickers", sub: "Flash price cells on tick update", checked: true },
                { label: "Show change percentage", sub: "Display % change alongside price", checked: true },
              ].map(n => (
                <AnimatedListItem key={n.label} className="flex items-center justify-between gap-3 py-1">
                  <div>
                    <p className="text-sm font-medium text-white">{n.label}</p>
                    <p className="text-[11px] text-muted-foreground">{n.sub}</p>
                  </div>
                  <Switch defaultChecked={n.checked} disabled={n.disabled} />
                </AnimatedListItem>
              ))}
            </AnimatedList>
          </CardContent>
        </Card>
      </AnimatedCard>

      {/* ── 4. Trading Preferences ── */}
      <AnimatedCard index={5}>
        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <SectionHeader icon={Zap} title="Trading Preferences" description="Default values for trade entry and risk management" />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Account Size ($)", defaultValue: "12453", type: "number" },
                { label: "Max Risk Per Trade (%)", defaultValue: "1", type: "number", step: "0.1" },
                { label: "Daily Loss Limit ($)", defaultValue: "200", type: "number" },
              ].map(f => (
                <div key={f.label} className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{f.label}</Label>
                  <Input defaultValue={f.defaultValue} type={f.type} step={f.step}
                    className="rounded-xl h-10"
                    style={{ background: "rgba(16,37,28,0.55)", border: "1px solid rgba(57,91,67,0.22)" }} />
                </div>
              ))}
            </div>

            <div>
              <AnimatedList className="space-y-3">
                {[
                  { label: "Default trade direction", sub: "Pre-fill Long or Short on new trade form", checked: false },
                  { label: "Auto-calculate position size", sub: "Use account size + risk % to suggest size", checked: true },
                  { label: "Show R:R calculator", sub: "Display risk-reward ratio on trade entry", checked: true },
                  { label: "Require setup tag", sub: "Enforce setup tagging before saving a trade", checked: false },
                ].map(n => (
                  <AnimatedListItem key={n.label} className="flex items-center justify-between gap-3 py-1">
                    <div>
                      <p className="text-sm font-medium text-white">{n.label}</p>
                      <p className="text-[11px] text-muted-foreground">{n.sub}</p>
                    </div>
                    <Switch defaultChecked={n.checked} />
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            </div>

            <div className="flex justify-end">
              <AnimatedButton className="rounded-xl h-9 px-6 bg-primary hover:bg-primary/90 text-primary-foreground">
                Save Preferences
              </AnimatedButton>
            </div>
          </CardContent>
        </Card>
      </AnimatedCard>

      {/* ── 5. Backup & Restore ── */}
      <AnimatedCard index={6}>
        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <SectionHeader icon={Database} title="Backup &amp; Restore"
              description="Export your full config to JSON — import on any device or Replit account" />
          </CardHeader>
          <CardContent>
            <BackupPanel />
          </CardContent>
        </Card>
      </AnimatedCard>
    </PageTransition>
  );
}
