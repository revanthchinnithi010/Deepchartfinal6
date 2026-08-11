/**
 * CtraderWidget — reusable cTrader OAuth + symbol management widget.
 * Extracted from ctrader-test page; renders inline (no page wrapper).
 * Used in BrokerIntegrationModal and the standalone /ctrader-test page.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";
import { toArray } from "@/lib/safeArray";
import {
  RefreshCw, Plug, PlugZap, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronRight, Copy, Check,
  Loader2, Wifi, WifiOff, Key, Users, UserCheck, BookOpen,
  Radio, StopCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Safe JSON helper — reads the response body as text first so we never
 * call .json() on an empty body ("Unexpected end of JSON input").
 *
 * Logs full diagnostics (URL, HTTP status, body length, preview) before
 * throwing, making it clear whether the failure is:
 *   - empty body       → server crashed before writing response
 *   - non-JSON body    → server returned HTML error page
 *   - non-200 status   → structured API error (returned, not thrown)
 *   - network/timeout  → caught by the outer fetch() try/catch
 */
async function safeJson<T>(
  res: Response,
  url: string,
  context?: Record<string, unknown>,
): Promise<T> {
  const text = await res.text();
  const diag = {
    url:        url.replace(/[?&](oauth_token|token|access_token)=[^&]+/g, "$1=***"),
    status:     res.status,
    bodyLength: text.length,
    ...context,
  };

  if (!text.trim()) {
    const msg = `[cTrader] Empty response body — HTTP ${res.status} from ${url.split("?")[0]}`;
    console.error("[cTrader] Empty body", diag);
    throw new Error(msg);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const preview = text.slice(0, 400);
    console.error("[cTrader] Non-JSON body", { ...diag, preview });
    throw new Error(
      `[cTrader] Non-JSON response — HTTP ${res.status} from ${url.split("?")[0]}: ${preview}`,
    );
  }

  if (!res.ok) {
    // Non-200 but valid JSON — log for diagnostics; caller inspects {ok, error}
    console.warn("[cTrader] HTTP error (JSON body)", { ...diag, preview: text.slice(0, 300) });
  }

  return parsed as T;
}

type LogLevel = "info" | "success" | "error" | "warn" | "step";
interface LogEntry { ts: number; level: LogLevel; msg: string; }

interface OAuthConfig  { configured: boolean; hasClientId: boolean; hasClientSecret: boolean; redirectUri: string; authUrl: string | null; }
interface TokenStatus  { ok: boolean; masked_token: string | null; expires_at: number; expired: boolean; error?: string; }
interface OAuthStatus  { connected: boolean; expires_at?: number; expired?: boolean; updated_at?: string; error?: string; }
interface SessionInfo {
  sessionRestored:       boolean;
  tokenValid:            boolean;
  tokenExpired:          boolean;
  tokenExists:           boolean;
  expiresAt:             number;
  hasRefreshToken:       boolean;
  needsReauth:           boolean;
  accountRestored:       boolean;
  accountId:             number | null;
  isLive:                boolean;
  symbolsRestored:       number;
  subscriptionsRestored: number;
  engineStatus:          string;
}
interface SessionRestoreResult {
  ok:                     boolean;
  reason?:                string;
  needsReauth?:           boolean;
  needsSetup?:            boolean;
  tokenRefreshed?:        boolean;
  accountId?:             number;
  isLive?:                boolean;
  symbolsRestored?:       number;
  subscriptionsRestored?: number;
  engineStatus?:          string;
  error?:                 string;
}
interface CtraderAccount {
  ctidTraderAccountId: number;
  traderLogin?: number;
  isLive: boolean;
  brokerName?: string;
  depositCurrency?: string;
  balance?: number;
  leverage?: number;
  accountType?: string;
  accountName?: string;
}
interface AccountsResult {
  ok: boolean; http_status: number; accounts: CtraderAccount[] | null; raw?: string;
  note?: string; error?: string; endpoint_url?: string;
}
interface CtraderSymbol { symbolId: number; symbolName: string; description: string; pipPosition: number; digits: number; }
interface TraceEntry {
  seq: number; direction: "→" | "←"; msgName: string;
  payloadType: number; payloadBytes: number; summary: Record<string, unknown>; tsMs: number;
}
interface SymbolsResult {
  ok: boolean; trace?: TraceEntry[]; acctAuthOk?: boolean;
  acctAuthFields?: Record<string, unknown>; errorCodes?: string[];
  totalSymbols?: number; first20?: CtraderSymbol[]; durationMs?: number;
  error?: string; count?: number; via?: string; symbols?: CtraderSymbol[];
}
interface SpotsStatus { running: boolean; symbolCount: number; accountId?: number; }

type StepState = "idle" | "loading" | "success" | "error";

const LOG_COLORS: Record<LogLevel, string> = {
  info:    "rgba(148,163,184,0.85)",
  success: "#34d399",
  error:   "#f87171",
  warn:    "#fbbf24",
  step:    "#60a5fa",
};

const STEP_ICON: Record<string, React.ElementType> = {
  config:   Wifi,
  token:    Key,
  accounts: Users,
  auth:     UserCheck,
  symbols:  BookOpen,
};

function ts(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString();
}
function fmtTime(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

function StepCard({ icon: Icon, title, state, children }: {
  icon: React.ElementType; title: string; state: StepState; children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const stateColor = state === "success" ? "#34d399" : state === "error" ? "#f87171" : state === "loading" ? "#fbbf24" : "rgba(148,163,184,0.50)";
  const StateIcon = state === "success" ? CheckCircle2 : state === "error" ? XCircle : Clock;
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,${state === "idle" ? "0.06" : "0.10"})`, borderRadius: 14, overflow: "hidden" }}>
      <button onClick={() => setExpanded(p => !p)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Icon style={{ width: 14, height: 14, color: "rgba(148,163,184,0.70)" }} />
        </div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{title}</span>
        <StateIcon style={{ width: 15, height: 15, color: stateColor, flexShrink: 0 }} />
        {expanded ? <ChevronDown style={{ width: 13, height: 13, color: "rgba(148,163,184,0.40)" }} /> : <ChevronRight style={{ width: 13, height: 13, color: "rgba(148,163,184,0.40)" }} />}
      </button>
      {expanded && <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}

function MonoBox({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }, [value]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "7px 10px", border: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ flex: 1, fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.70)", wordBreak: "break-all", lineHeight: 1.5 }}>{value}</span>
        {copyable && (
          <button onClick={doCopy} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, marginTop: 1 }}>
            {copied ? <Check style={{ width: 12, height: 12, color: "#34d399" }} /> : <Copy style={{ width: 12, height: 12, color: "rgba(148,163,184,0.40)" }} />}
          </button>
        )}
      </div>
    </div>
  );
}

function CWBadge({ label, color, bg, dot = true }: { label: string; color: string; bg: string; dot?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, background: bg, border: `1px solid ${color}33` }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}99`, flexShrink: 0 }} />}
      <span style={{ fontSize: 10, fontWeight: 600, color }}>{label}</span>
    </div>
  );
}

function ActionBtn({ onClick, loading, disabled, children, variant = "primary" }: {
  onClick: () => void; loading?: boolean; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "danger" | "ghost" | "success";
}) {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    primary: { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.28)", color: "#60a5fa" },
    danger:  { bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.22)",  color: "#f87171" },
    ghost:   { bg: "rgba(255,255,255,0.05)",border: "rgba(255,255,255,0.10)",color: "rgba(255,255,255,0.65)" },
    success: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.22)", color: "#34d399" },
  };
  const s = styles[variant]!;
  return (
    <button onClick={onClick} disabled={loading || disabled} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 600, background: s.bg, border: `1px solid ${s.border}`, color: s.color, cursor: (loading || disabled) ? "default" : "pointer", opacity: (loading || disabled) ? 0.55 : 1, transition: "opacity 0.12s", touchAction: "manipulation" }}>
      {loading ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
      {children}
    </button>
  );
}

export function CtraderWidget() {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const popupRef   = useRef<Window | null>(null);

  const [config,   setConfig]   = useState<OAuthConfig | null>(null);
  const [oaStatus, setOaStatus] = useState<OAuthStatus | null>(null);
  const [tokenSt,  setTokenSt]  = useState<TokenStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountsResult | null>(null);
  const [symbols,  setSymbols]  = useState<SymbolsResult | null>(null);
  const [spotsStatus, setSpotsStatus] = useState<SpotsStatus | null>(null);
  const [accountIdInput, setAccountIdInput] = useState("");
  const [selectedIsLive, setSelectedIsLive] = useState(false);

  const [sessionInfo,    setSessionInfo]    = useState<SessionInfo | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(true);
  const [restoreResult,  setRestoreResult]  = useState<SessionRestoreResult | null>(null);

  const [stepStates, setStepStates] = useState<Record<string, StepState>>({
    config: "idle", token: "idle", accounts: "idle", symbols: "idle",
  });
  const [oauthLoading,      setOauthLoading]      = useState(false);
  const [refreshLoading,    setRefreshLoading]    = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [accountsLoading,   setAccountsLoading]  = useState(false);
  const [symbolsLoading,    setSymbolsLoading]   = useState(false);
  const [wireLoading,       setWireLoading]      = useState(false);
  const [wiredCount,        setWiredCount]       = useState<number | null>(null);
  const [feedLoading,       setFeedLoading]      = useState(false);

  const log = useCallback((level: LogLevel, msg: string) => {
    setLogs(p => [...p.slice(-199), { ts: Date.now(), level, msg }]);
  }, []);

  useEffect(() => {
    if (logOpen) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, logOpen]);

  const loadConfig = useCallback(async () => {
    log("step", "Fetching OAuth config…");
    setStepStates(p => ({ ...p, config: "loading" }));
    try {
      const res  = await fetch(`${BASE}/api/ctrader/oauth/config`);
      const data = (await res.json()) as OAuthConfig;
      if (!mountedRef.current) return;
      setConfig(data);
      if (data.configured) {
        log("success", `Config OK — Redirect URI: ${data.redirectUri}`);
        setStepStates(p => ({ ...p, config: "success" }));
      } else {
        log("warn", "CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET not set in Secrets");
        setStepStates(p => ({ ...p, config: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Config fetch failed: ${String(err)}`);
      setStepStates(p => ({ ...p, config: "error" }));
    }
  }, [log]);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, tokenRes] = await Promise.all([
        fetch(`${BASE}/api/ctrader/oauth/status`),
        fetch(`${BASE}/api/ctrader/oauth/token`),
      ]);
      const statusData = (await statusRes.json()) as OAuthStatus;
      const tokenData  = (await tokenRes.json()) as TokenStatus;
      if (!mountedRef.current) return;
      setOaStatus(statusData);
      setTokenSt(tokenData);
      if (statusData.connected) {
        log("info", `Token in DB — expires ${ts(statusData.expires_at ?? 0)}${statusData.expired ? " [EXPIRED]" : ""}`);
        setStepStates(p => ({ ...p, token: statusData.expired ? "error" : "success" }));
      } else {
        setStepStates(p => ({ ...p, token: "idle" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("warn", `Status fetch: ${String(err)}`);
    }
  }, [log]);

  const loadSpotsStatus = useCallback(async () => {
    try {
      const res  = await fetch(`${BASE}/api/ctrader/spots/status`);
      const data = await res.json() as SpotsStatus;
      if (!mountedRef.current) return;
      setSpotsStatus(data);
    } catch { /* no-op */ }
  }, []);

  const connectToBrokerStore = useCallback(async (overrideAccountId?: number, overrideIsLive?: boolean) => {
    const accountId = overrideAccountId ?? (accountIdInput ? Number(accountIdInput) : 0);
    if (!accountId) { log("warn", "No accountId — skipping broker store connect"); return; }
    const isLive = overrideIsLive ?? selectedIsLive;
    const { connect } = useBrokerStore.getState();
    const account: BrokerAccount = {
      id:          accountId,
      broker_id:   "ctrader",
      label:       `cTrader ${isLive ? "Live" : "Demo"} #${accountId}`,
      is_active:   true,
      api_token:   "",
      created_at:  new Date().toISOString(),
    };
    try {
      await connect(account);
      log("success", `Broker connected (account ${accountId}) — balance & positions polling active`);
    } catch (err) {
      log("warn", `Broker store connect failed: ${String(err)}`);
    }
  }, [accountIdInput, selectedIsLive, log]);

  const runFullAutoSetup = useCallback(async () => {
    log("step", "Auto-setup: fetching symbols + connecting broker…");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/auto-setup`, { method: "POST" });
      type SetupResult = { ok: boolean; accountId?: number; isLive?: boolean; symbolCount?: number; error?: string };
      const data = (await res.json()) as SetupResult;
      if (!mountedRef.current) return;
      if (data.ok && data.accountId) {
        log("success", `Auto-setup OK — ${data.symbolCount ?? 0} symbols, account ${data.accountId}`);
        setAccountIdInput(String(data.accountId));
        setSelectedIsLive(data.isLive ?? false);
        setStepStates(_p => ({ config: "success", token: "success", accounts: "success", symbols: "success" }));
        await Promise.all([loadStatus(), loadSpotsStatus()]);
        await connectToBrokerStore(data.accountId, data.isLive ?? false);
      } else {
        log("error", `Auto-setup failed: ${data.error ?? "unknown error"}`);
        await loadStatus();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Auto-setup error: ${String(err)}`);
    }
  }, [log, loadStatus, loadSpotsStatus, connectToBrokerStore]);

  const restoreSession = useCallback(async () => {
    setRestoreLoading(true);
    log("step", "Checking for existing cTrader session…");
    try {
      const sessionRes  = await fetch(`${BASE}/api/ctrader/session`);
      const session     = (await sessionRes.json()) as SessionInfo;
      if (!mountedRef.current) return;
      setSessionInfo(session);

      if (!session.tokenExists) {
        log("info", "No session stored — please complete OAuth login");
        return;
      }

      if (session.sessionRestored || (session.tokenValid && session.accountRestored && session.symbolsRestored > 0)) {
        log("info", "Existing session found — restoring silently…");
        const restoreRes  = await fetch(`${BASE}/api/ctrader/session-restore`, { method: "POST" });
        const restoreData = (await restoreRes.json()) as SessionRestoreResult;
        if (!mountedRef.current) return;
        setRestoreResult(restoreData);

        if (restoreData.ok) {
          const suffix = restoreData.tokenRefreshed ? " (token refreshed)" : "";
          log("success", `Session restored${suffix} — ${restoreData.subscriptionsRestored ?? 0} subscriptions active`);
          setStepStates(_p => ({ config: "success", token: "success", accounts: "success", symbols: "success" }));
          const acctId  = restoreData.accountId  ?? session.accountId  ?? undefined;
          const acctLive = restoreData.isLive    ?? session.isLive;
          if (acctId) {
            setAccountIdInput(String(acctId));
            setSelectedIsLive(acctLive);
          }
          await loadStatus();
          await loadSpotsStatus();
          if (acctId) await connectToBrokerStore(acctId, acctLive);
        } else if (restoreData.needsReauth) {
          log("warn", "Session expired and refresh failed — please re-authorize");
        } else if (restoreData.needsSetup) {
          log("warn", `Setup incomplete (${restoreData.reason}) — please wire symbols`);
        } else {
          log("warn", `Restore failed: ${restoreData.error ?? restoreData.reason ?? "unknown"}`);
        }
      } else if (session.tokenExpired && session.hasRefreshToken) {
        log("info", "Token expired — attempting silent refresh…");
        const restoreRes  = await fetch(`${BASE}/api/ctrader/session-restore`, { method: "POST" });
        const restoreData = (await restoreRes.json()) as SessionRestoreResult;
        if (!mountedRef.current) return;
        setRestoreResult(restoreData);
        if (restoreData.ok) {
          log("success", "Token refreshed — session restored");
          setStepStates(_p => ({ config: "success", token: "success", accounts: "success", symbols: "success" }));
          await loadStatus();
          await loadSpotsStatus();
          const rId   = restoreData.accountId  ?? session.accountId  ?? undefined;
          const rLive = restoreData.isLive     ?? session.isLive;
          if (rId) await connectToBrokerStore(rId, rLive);
        } else {
          log("warn", "Token refresh failed — please re-authorize");
        }
      } else {
        log("info", "Partial session — complete setup steps below");
        if (session.tokenValid) setStepStates(p => ({ ...p, token: "success" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("warn", `Session check error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setRestoreLoading(false);
    }
  }, [log, loadStatus, loadSpotsStatus, connectToBrokerStore]);

  useEffect(() => {
    log("info", "cTrader widget loaded");
    restoreSession().then(() => {
      loadConfig();
      if (!sessionInfo?.tokenValid) loadStatus();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "ctrader_oauth_result") return;
      if (e.data.status === "success") {
        log("success", `OAuth success — token: ${e.data.maskedToken ?? "?"}, expires: ${ts(e.data.expiresAt ?? 0)}`);
        popupRef.current = null;
        setOauthLoading(false);
        runFullAutoSetup();
      } else {
        log("error", `OAuth error: ${e.data.message ?? "unknown"}`);
        setOauthLoading(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [runFullAutoSetup, log]);

  const startOAuth = useCallback(async () => {
    if (!config?.authUrl) { log("error", "No auth URL — check CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET"); return; }
    if (oauthLoading) return;
    log("step", "Opening OAuth popup…");
    setOauthLoading(true);
    const w = 520; const h = 680;
    const left = Math.round(window.screenX + (window.outerWidth  - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(config.authUrl, "ctrader_oauth", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
    if (!popup) { log("error", "Popup blocked — allow popups for this page"); setOauthLoading(false); return; }
    popupRef.current = popup;
    log("info", `Popup opened…`);
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        if (mountedRef.current) { log("warn", "Popup closed (no postMessage received)"); setOauthLoading(false); loadStatus(); }
      }
    }, 600);
  }, [config, oauthLoading, loadStatus, log]);

  const handleRefresh = useCallback(async () => {
    if (refreshLoading) return;
    setRefreshLoading(true);
    log("step", "Requesting token refresh…");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/oauth/refresh`, { method: "POST" });
      const data = await res.json() as { ok: boolean; expires_at?: number; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) { log("success", `Token refreshed — expires: ${ts(data.expires_at ?? 0)}`); await loadStatus(); }
      else log("error", `Refresh failed: ${data.error}`);
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Refresh error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setRefreshLoading(false);
    }
  }, [refreshLoading, loadStatus, log]);

  const handleDisconnect = useCallback(async () => {
    if (disconnectLoading) return;
    setDisconnectLoading(true);
    log("step", "Disconnecting — clearing tokens, account config, and stopping engine…");
    try {
      await fetch(`${BASE}/api/ctrader/oauth/disconnect`, { method: "POST" });
      if (!mountedRef.current) return;
      log("success", "Disconnected — all session data cleared");
      setOaStatus(null); setTokenSt(null); setAccounts(null); setSymbols(null); setWiredCount(null);
      setSessionInfo(null); setRestoreResult(null); setAccountIdInput(""); setSelectedIsLive(false);
      setStepStates(_p => ({ config: "success", token: "idle", accounts: "idle", symbols: "idle" }));
      loadSpotsStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Disconnect error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setDisconnectLoading(false);
    }
  }, [disconnectLoading, log, loadSpotsStatus]);

  const fetchAccounts = useCallback(async () => {
    if (accountsLoading) return;
    setAccountsLoading(true);
    log("step", "Fetching cTrader accounts…");
    setStepStates(p => ({ ...p, accounts: "loading" }));
    try {
      const res  = await fetch(`${BASE}/api/ctrader/accounts`);
      const data = (await res.json()) as AccountsResult;
      if (!mountedRef.current) return;
      setAccounts(data);
      if (data.ok) {
        const list = Array.isArray(data.accounts) ? data.accounts : [];
        log("success", `Accounts received — ${list.length} account${list.length !== 1 ? "s" : ""}`);
        setStepStates(p => ({ ...p, accounts: "success" }));
        if (list.length === 1) {
          const only = list[0]!;
          const id = String(only.ctidTraderAccountId);
          log("info", `Auto-selecting single account: ${id}`);
          setAccountIdInput(id);
          setSelectedIsLive(only.isLive);
        }
      } else {
        log("warn", `Accounts HTTP ${data.http_status}: ${data.error ?? (data.raw ?? "").slice(0, 200)}`);
        setStepStates(p => ({ ...p, accounts: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Account fetch error: ${String(err)}`);
      setStepStates(p => ({ ...p, accounts: "error" }));
    } finally {
      if (mountedRef.current) setAccountsLoading(false);
    }
  }, [accountsLoading, log]);

  const fetchSymbols = useCallback(async (overrideId?: string, overrideIsLive?: boolean) => {
    const id     = overrideId     ?? accountIdInput.trim();
    const isLive = overrideIsLive ?? selectedIsLive;
    if (symbolsLoading || !id) return;
    setSymbolsLoading(true);
    setWiredCount(null);
    log("step", `Fetching symbols for account ${id} (${isLive ? "live" : "demo"})…`);
    setStepStates(p => ({ ...p, symbols: "loading" }));
    try {
      const url  = `${BASE}/api/ctrader/symbols-verbose/${encodeURIComponent(id)}?isLive=${isLive}`;
      const res  = await fetch(url);
      const data = (await res.json()) as SymbolsResult;
      if (!mountedRef.current) return;
      // Normalize the array-shaped fields once at the API boundary — the
      // response is a hand-rolled diagnostic payload from a debug endpoint,
      // so guard against `first20`/`symbols` ever coming back as something
      // other than an array before it reaches any `.map()` in the render.
      data.first20 = data.first20 !== undefined ? toArray<CtraderSymbol>(data.first20, "CtraderWidget.fetchSymbols.first20") : undefined;
      data.symbols = data.symbols !== undefined ? toArray<CtraderSymbol>(data.symbols, "CtraderWidget.fetchSymbols.symbols") : undefined;
      setSymbols(data);
      if (data.ok) {
        log("success", `${data.durationMs ?? "?"}ms — ${data.totalSymbols} symbols`);
        setStepStates(p => ({ ...p, symbols: "success" }));
      } else {
        log("warn", `Symbols error: ${data.error ?? "unknown"}`);
        setStepStates(p => ({ ...p, symbols: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Symbol fetch error: ${String(err)}`);
      setStepStates(p => ({ ...p, symbols: "error" }));
    } finally {
      if (mountedRef.current) setSymbolsLoading(false);
    }
  }, [symbolsLoading, accountIdInput, selectedIsLive, log]);

  const wireSymbols = useCallback(async () => {
    if (!symbols?.ok) return;
    const allSymbols = symbols.symbols ?? symbols.first20 ?? [];
    if (!allSymbols.length) return;
    setWireLoading(true);
    log("step", `Wiring ${allSymbols.length} symbols to watchlist…`);
    try {
      const accountId = accountIdInput ? Number(accountIdInput) : undefined;
      const res  = await fetch(`${BASE}/api/ctrader/symbols-cache`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: allSymbols, accountId, isLive: selectedIsLive }),
      });
      const data = await res.json() as { ok: boolean; cached?: number; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) {
        setWiredCount(data.cached ?? allSymbols.length);
        log("success", `Wired ${data.cached ?? allSymbols.length} symbols → cTrader Watchlist`);
        if (accountId) {
          try {
            const startRes  = await fetch(`${BASE}/api/ctrader/spots/start`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accountId, isLive: selectedIsLive }),
            });
            const startData = await startRes.json() as { ok: boolean; symbolCount?: number; error?: string };
            if (startData.ok) {
              log("success", `Live feed started — ${startData.symbolCount ?? "all"} symbols`);
              loadSpotsStatus();
            } else {
              log("warn", `Feed start: ${startData.error ?? "unknown"}`);
            }
          } catch (startErr) {
            log("warn", `Feed start error: ${String(startErr)}`);
          }
        }
      } else {
        log("error", `Wire failed: ${data.error ?? "unknown"}`);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Wire error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setWireLoading(false);
    }
  }, [symbols, accountIdInput, selectedIsLive, log, loadSpotsStatus]);

  const handleStartFeed = useCallback(async () => {
    const accountId = accountIdInput ? Number(accountIdInput) : spotsStatus?.accountId;
    if (!accountId) { log("warn", "Select an account first (Step 3) before starting the live feed"); return; }
    setFeedLoading(true);
    log("step", `Starting live feed for account ${accountId}…`);
    try {
      const res  = await fetch(`${BASE}/api/ctrader/spots/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, isLive: selectedIsLive }),
      });
      const data = await res.json() as { ok: boolean; symbolCount?: number; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) { log("success", `Live feed running — ${data.symbolCount ?? "all"} symbols subscribed`); }
      else { log("error", `Start failed: ${data.error ?? "unknown"}`); }
      loadSpotsStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Start error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setFeedLoading(false);
    }
  }, [accountIdInput, selectedIsLive, spotsStatus, log, loadSpotsStatus]);

  const handleStopFeed = useCallback(async () => {
    setFeedLoading(true);
    log("step", "Stopping live feed…");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/spots/stop`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) { log("success", "Live feed stopped"); }
      else { log("error", `Stop failed: ${data.error ?? "unknown"}`); }
      loadSpotsStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Stop error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setFeedLoading(false);
    }
  }, [log, loadSpotsStatus]);

  const handleRefreshSymbols = useCallback(async () => {
    if (accountIdInput.trim()) {
      await fetchSymbols();
    } else {
      log("warn", "Enter an account ID in Step 4 to refresh symbols");
    }
  }, [accountIdInput, fetchSymbols, log]);

  const connected = oaStatus?.connected && !oaStatus.expired;

  const sessionOk = restoreResult?.ok ?? false;
  const engineLive = (restoreResult?.engineStatus ?? sessionInfo?.engineStatus) === "streaming";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>

      {/* ── Session restore banner ── */}
      {restoreLoading ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
          background: "rgba(148,163,184,0.04)", border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <Loader2 style={{ width: 14, height: 14, color: "rgba(148,163,184,0.50)", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 12, color: "rgba(148,163,184,0.60)" }}>Checking for existing session…</span>
        </div>
      ) : sessionOk ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 14px", borderRadius: 12,
          background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.20)",
        }}>
          <CheckCircle2 style={{ width: 14, height: 14, color: "#34d399", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>Session Restored</span>
          {restoreResult?.tokenRefreshed && <CWBadge label="Token Refreshed" color="#fbbf24" bg="rgba(245,158,11,0.10)" />}
          {engineLive && <CWBadge label={`Live Feed · ${restoreResult?.subscriptionsRestored ?? 0} subs`} color="#60a5fa" bg="rgba(59,130,246,0.10)" />}
          <ActionBtn onClick={() => restoreSession()} variant="ghost" loading={restoreLoading}>
            <RefreshCw style={{ width: 10, height: 10 }} /> Re-check
          </ActionBtn>
        </div>
      ) : sessionInfo?.tokenExists ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 14px", borderRadius: 12,
          background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)",
        }}>
          <Clock style={{ width: 14, height: 14, color: "#fbbf24", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>
            {sessionInfo.tokenExpired ? "Token Expired — Re-authorize below" : "Partial Session — Complete setup below"}
          </span>
        </div>
      ) : null}

      {/* ── Session diagnostics ── */}
      {sessionInfo && (
        <div style={{
          padding: "10px 14px", borderRadius: 11,
          background: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.07)",
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 12px",
        }}>
          {([
            ["Session Restored", sessionInfo.sessionRestored, sessionOk],
            ["Token Valid",      sessionInfo.tokenValid,      sessionInfo.tokenValid],
            ["Account Restored", sessionInfo.accountRestored, sessionInfo.accountRestored],
            [`Symbols (${sessionInfo.symbolsRestored})`,  sessionInfo.symbolsRestored > 0, sessionInfo.symbolsRestored > 0],
            [`Subs (${restoreResult?.subscriptionsRestored ?? sessionInfo.subscriptionsRestored})`, (restoreResult?.subscriptionsRestored ?? sessionInfo.subscriptionsRestored) > 0, (restoreResult?.subscriptionsRestored ?? sessionInfo.subscriptionsRestored) > 0],
            [`Engine: ${restoreResult?.engineStatus ?? sessionInfo.engineStatus}`, engineLive, engineLive],
          ] as [string, boolean, boolean][]).map(([label, _bool, ok]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#34d399" : "#6b7280", flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: ok ? "rgba(255,255,255,0.70)" : "rgba(148,163,184,0.40)", fontFamily: "monospace" }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Status banner ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 14px", borderRadius: 12,
        background: connected ? "rgba(16,185,129,0.07)" : "rgba(148,163,184,0.05)",
        border: `1px solid ${connected ? "rgba(16,185,129,0.20)" : "rgba(255,255,255,0.08)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {connected
            ? <Plug style={{ width: 14, height: 14, color: "#34d399" }} />
            : <PlugZap style={{ width: 14, height: 14, color: "rgba(148,163,184,0.50)" }} />
          }
          <span style={{ fontSize: 12, fontWeight: 700, color: connected ? "#34d399" : "rgba(148,163,184,0.70)" }}>
            {connected ? "Connected" : oaStatus?.connected ? "Token Expired" : "Not Connected"}
          </span>
        </div>
        {config && (
          <CWBadge
            label={config.configured ? "Credentials OK" : "Credentials Missing"}
            color={config.configured ? "#34d399" : "#f87171"}
            bg={config.configured ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
          />
        )}
        {spotsStatus?.running && (
          <CWBadge label={`Live Feed · ${spotsStatus.symbolCount} symbols`} color="#60a5fa" bg="rgba(59,130,246,0.10)" />
        )}
        {oaStatus?.connected && oaStatus.expires_at && (
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", marginLeft: "auto" }}>
            {oaStatus.expired ? "⚠️ Expired" : "Expires"}: {ts(oaStatus.expires_at)}
          </span>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ActionBtn onClick={() => { loadConfig(); loadStatus(); loadSpotsStatus(); }} variant="ghost">
          <RefreshCw style={{ width: 11, height: 11 }} />
          Reload Status
        </ActionBtn>
        <ActionBtn onClick={handleRefreshSymbols} loading={symbolsLoading} disabled={!connected} variant="ghost">
          <BookOpen style={{ width: 11, height: 11 }} />
          Refresh Symbols
        </ActionBtn>
        {spotsStatus?.running ? (
          <ActionBtn onClick={handleStopFeed} loading={feedLoading} variant="danger">
            <StopCircle style={{ width: 11, height: 11 }} />
            Stop Live Feed
          </ActionBtn>
        ) : (
          <ActionBtn onClick={handleStartFeed} loading={feedLoading} disabled={!connected} variant="success">
            <Radio style={{ width: 11, height: 11 }} />
            Start Live Feed
          </ActionBtn>
        )}
        {connected && (
          <>
            <ActionBtn onClick={handleRefresh} loading={refreshLoading} variant="ghost">
              <RefreshCw style={{ width: 11, height: 11 }} />
              Refresh Token
            </ActionBtn>
            <ActionBtn onClick={handleDisconnect} loading={disconnectLoading} variant="danger">
              <WifiOff style={{ width: 11, height: 11 }} />
              Disconnect
            </ActionBtn>
          </>
        )}
      </div>

      {/* ── Step 1: Config ── */}
      <StepCard icon={STEP_ICON.config!} title="Step 1 — OAuth Configuration" state={stepStates.config!}>
        {config ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <CWBadge
                label={(config.hasClientId ?? config.configured) ? "Client ID ✓" : "Client ID Missing"}
                color={(config.hasClientId ?? config.configured) ? "#34d399" : "#f87171"}
                bg={(config.hasClientId ?? config.configured) ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
              />
              <CWBadge
                label={(config.hasClientSecret ?? config.configured) ? "Client Secret ✓" : "Client Secret Missing"}
                color={(config.hasClientSecret ?? config.configured) ? "#34d399" : "#f87171"}
                bg={(config.hasClientSecret ?? config.configured) ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
              />
            </div>
            <MonoBox label="Redirect URI" value={config.redirectUri} copyable />
            {config.authUrl && <MonoBox label="Auth URL Preview" value={config.authUrl.slice(0, 120) + (config.authUrl.length > 120 ? "…" : "")} />}
            {!config.configured && (
              <div style={{ padding: "10px 12px", borderRadius: 9, fontSize: 11, lineHeight: 1.6, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", color: "rgba(255,255,255,0.70)" }}>
                {!(config.hasClientId ?? false) && !(config.hasClientSecret ?? false) && (
                  <>Missing: <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}>CTRADER_CLIENT_ID</code> and <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}>CTRADER_CLIENT_SECRET</code></>
                )}
                {!(config.hasClientId ?? false) && (config.hasClientSecret ?? false) && (
                  <>Missing: <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}>CTRADER_CLIENT_ID</code></>
                )}
                {(config.hasClientId ?? false) && !(config.hasClientSecret ?? false) && (
                  <>Missing: <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}>CTRADER_CLIENT_SECRET</code></>
                )}
                {" "}Add the missing secret(s) in the <strong>Secrets</strong> panel, then <strong>restart the server</strong> workflow to pick them up.
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(148,163,184,0.55)" }}>
            <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            Loading config…
          </div>
        )}
      </StepCard>

      {/* ── Step 2: OAuth Flow ── */}
      <StepCard icon={STEP_ICON.token!} title="Step 2 — OAuth Login" state={stepStates.token!}>
        {connected ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <CWBadge label="Access Token Active" color="#34d399" bg="rgba(16,185,129,0.10)" />
              {oaStatus?.expired ? <CWBadge label="EXPIRED" color="#f87171" bg="rgba(239,68,68,0.10)" dot={false} /> : <CWBadge label="Valid" color="#34d399" bg="rgba(16,185,129,0.10)" dot={false} />}
            </div>
            {tokenSt?.masked_token && <MonoBox label="Access Token (masked)" value={tokenSt.masked_token} copyable />}
            {oaStatus?.expires_at && <MonoBox label="Expires At" value={ts(oaStatus.expires_at)} />}
            <div style={{ marginTop: 4 }}>
              <ActionBtn onClick={startOAuth} loading={oauthLoading} disabled={!config?.configured || !config.authUrl} variant="ghost">
                <RefreshCw style={{ width: 12, height: 12 }} />
                Reconnect (new OAuth flow)
              </ActionBtn>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.60)", lineHeight: 1.6 }}>
              Click <strong>Start OAuth</strong> to open the cTrader authorization popup. The redirect URI above must match your cTrader Open API app settings.
            </p>
            <ActionBtn onClick={startOAuth} loading={oauthLoading} disabled={!config?.configured || !config?.authUrl}>
              <PlugZap style={{ width: 13, height: 13 }} />
              {oauthLoading ? "Waiting for popup…" : "Start OAuth →"}
            </ActionBtn>
          </div>
        )}
      </StepCard>

      {/* ── Step 3: Accounts ── */}
      <StepCard icon={STEP_ICON.accounts!} title="Step 3 — Account List" state={stepStates.accounts!}>
        {!oaStatus?.connected ? (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)" }}>Complete Step 2 first.</p>
        ) : (
          <>
            <ActionBtn onClick={fetchAccounts} loading={accountsLoading}>
              <Users style={{ width: 12, height: 12 }} />
              Fetch Accounts
            </ActionBtn>

            {accounts?.error && (
              <div style={{ padding: "10px 12px", borderRadius: 9, fontSize: 11, lineHeight: 1.6, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", color: "#f87171" }}>
                ❌ {accounts.error}
              </div>
            )}

            {accounts?.ok && Array.isArray(accounts.accounts) && accounts.accounts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>
                    {accounts.accounts.length} Account{accounts.accounts.length !== 1 ? "s" : ""} Found
                  </span>
                  {accounts.accounts.length === 1 && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.22)", color: "#34d399" }}>
                      Auto-selected
                    </span>
                  )}
                </div>

                {accounts.accounts.map(acct => {
                  const id = String(acct.ctidTraderAccountId);
                  const isSelected = accountIdInput === id;
                  const displayBalance = acct.balance != null
                    ? `${(acct.balance / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${acct.depositCurrency ?? ""}`
                    : null;

                  return (
                    <div
                      key={acct.ctidTraderAccountId}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${isSelected ? "rgba(96,165,250,0.40)" : "rgba(255,255,255,0.08)"}`,
                        background: isSelected ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.02)",
                        overflow: "hidden",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      {/* Card header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px 9px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: "monospace", letterSpacing: "-0.01em" }}>
                              {acct.traderLogin ?? acct.ctidTraderAccountId}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                              background: acct.isLive ? "rgba(239,68,68,0.14)" : "rgba(59,130,246,0.14)",
                              color: acct.isLive ? "#f87171" : "#60a5fa",
                              border: `1px solid ${acct.isLive ? "rgba(239,68,68,0.28)" : "rgba(59,130,246,0.28)"}`,
                              letterSpacing: "0.06em",
                            }}>
                              {acct.isLive ? "LIVE" : "DEMO"}
                            </span>
                            {isSelected && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)", color: "#34d399" }}>
                                <CheckCircle2 style={{ width: 9, height: 9 }} />
                                Selected
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card body — field grid */}
                      <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 16px" }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(148,163,184,0.38)", marginBottom: 2 }}>Account ID</div>
                          <div style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{acct.ctidTraderAccountId}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(148,163,184,0.38)", marginBottom: 2 }}>Type</div>
                          <div style={{ fontSize: 12, color: acct.isLive ? "#f87171" : "#60a5fa", fontWeight: 600 }}>{acct.isLive ? "Live" : "Demo"}</div>
                        </div>
                        {acct.brokerName && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(148,163,184,0.38)", marginBottom: 2 }}>Broker</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{acct.brokerName}</div>
                          </div>
                        )}
                        {acct.depositCurrency && (
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(148,163,184,0.38)", marginBottom: 2 }}>Currency</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{acct.depositCurrency}</div>
                          </div>
                        )}
                        {acct.leverage != null && (
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(148,163,184,0.38)", marginBottom: 2 }}>Leverage</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>1:{acct.leverage}</div>
                          </div>
                        )}
                        {displayBalance && (
                          <div style={{ gridColumn: acct.leverage == null ? "1 / -1" : undefined }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(148,163,184,0.38)", marginBottom: 2 }}>Balance</div>
                            <div style={{ fontSize: 12, color: "#34d399", fontWeight: 700, fontFamily: "monospace" }}>{displayBalance}</div>
                          </div>
                        )}
                      </div>

                      {/* Select button */}
                      <div style={{ padding: "0 14px 12px" }}>
                        <button
                          onClick={() => {
                            setAccountIdInput(id);
                            setSelectedIsLive(acct.isLive);
                          }}
                          disabled={isSelected}
                          style={{
                            width: "100%", padding: "9px 0", borderRadius: 9,
                            fontSize: 13, fontWeight: 700,
                            background: isSelected ? "rgba(16,185,129,0.10)" : "rgba(96,165,250,0.14)",
                            border: `1px solid ${isSelected ? "rgba(16,185,129,0.28)" : "rgba(96,165,250,0.30)"}`,
                            color: isSelected ? "#34d399" : "#60a5fa",
                            cursor: isSelected ? "default" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                            touchAction: "manipulation",
                            transition: "all 0.15s",
                          }}
                        >
                          {isSelected
                            ? <><CheckCircle2 style={{ width: 13, height: 13 }} /> Selected</>
                            : <><UserCheck style={{ width: 13, height: 13 }} /> Select Account</>
                          }
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {accounts?.ok && Array.isArray(accounts.accounts) && accounts.accounts.length === 0 && (
              <div style={{ padding: "12px", textAlign: "center", fontSize: 12, color: "rgba(148,163,184,0.45)" }}>
                No trading accounts found for this OAuth token.
              </div>
            )}
          </>
        )}
      </StepCard>

      {/* ── Step 4: Symbol List ── */}
      <StepCard icon={STEP_ICON.symbols!} title="Step 4 — Fetch & Wire Symbols" state={stepStates.symbols!}>
        {!oaStatus?.connected ? (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)" }}>Complete Step 2 first.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text" placeholder="ctidTraderAccountId"
                value={accountIdInput} onChange={e => setAccountIdInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchSymbols()}
                style={{ flex: 1, padding: "7px 10px", borderRadius: 8, fontSize: 12, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.80)", fontFamily: "monospace", outline: "none" }}
              />
              <button onClick={() => setSelectedIsLive(v => !v)} style={{ padding: "7px 11px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: selectedIsLive ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)", border: `1px solid ${selectedIsLive ? "rgba(239,68,68,0.25)" : "rgba(59,130,246,0.25)"}`, color: selectedIsLive ? "#f87171" : "#60a5fa", cursor: "pointer", touchAction: "manipulation" }}>
                {selectedIsLive ? "LIVE" : "DEMO"}
              </button>
              <ActionBtn onClick={() => fetchSymbols()} loading={symbolsLoading} disabled={!accountIdInput.trim()}>
                <BookOpen style={{ width: 12, height: 12 }} />
                Fetch
              </ActionBtn>
            </div>

            {symbols && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <CWBadge label={symbols.ok ? "ProtoOA OK" : "Failed"} color={symbols.ok ? "#34d399" : "#f87171"} bg={symbols.ok ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"} />
                  {symbols.ok && symbols.totalSymbols !== undefined && (
                    <CWBadge label={`${symbols.totalSymbols} symbols`} color="#60a5fa" bg="rgba(59,130,246,0.10)" dot={false} />
                  )}
                  {symbols.durationMs !== undefined && (
                    <CWBadge label={`${symbols.durationMs}ms`} color="#fbbf24" bg="rgba(245,158,11,0.10)" dot={false} />
                  )}
                  {symbols.ok && (symbols.totalSymbols ?? 0) > 0 && !wiredCount && (
                    <ActionBtn onClick={wireSymbols} loading={wireLoading} variant="success">
                      <Plug style={{ width: 11, height: 11 }} />
                      Wire to Watchlist
                    </ActionBtn>
                  )}
                  {wiredCount && (
                    <CWBadge label={`✓ Wired ${wiredCount} → Watchlist`} color="#34d399" bg="rgba(16,185,129,0.10)" dot={false} />
                  )}
                </div>
                {symbols.error && (
                  <div style={{ padding: "10px 12px", borderRadius: 9, fontSize: 11, lineHeight: 1.6, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", color: "#f87171" }}>
                    ❌ {symbols.error}
                  </div>
                )}
                {symbols.ok && symbols.first20 && symbols.first20.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>
                      First {symbols.first20.length} Symbols{(symbols.totalSymbols ?? 0) > symbols.first20.length ? ` (of ${symbols.totalSymbols} total)` : ""}
                    </span>
                    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", padding: "6px 12px", background: "rgba(0,0,0,0.30)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["Symbol","Digits","ID"].map(h => (
                          <span key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>{h}</span>
                        ))}
                      </div>
                      {symbols.first20.map((s, i) => (
                        <div key={s.symbolId} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", padding: "5px 12px", background: i % 2 === 0 ? "rgba(0,0,0,0.15)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.82)", fontFamily: "monospace" }}>{s.symbolName}</span>
                          <span style={{ fontSize: 11, color: "rgba(148,163,184,0.70)", fontFamily: "monospace" }}>{s.digits}</span>
                          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.40)", fontFamily: "monospace" }}>{s.symbolId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </StepCard>

      {/* ── Verbose Log ── */}
      <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <button onClick={() => setLogOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", borderBottom: logOpen ? "1px solid rgba(255,255,255,0.07)" : "none", touchAction: "manipulation" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(148,163,184,0.50)" }}>
            Verbose Log
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)" }}>{logs.length} entries</span>
            {logOpen ? <ChevronDown style={{ width: 13, height: 13, color: "rgba(148,163,184,0.40)" }} /> : <ChevronRight style={{ width: 13, height: 13, color: "rgba(148,163,184,0.40)" }} />}
          </div>
        </button>
        {logOpen && (
          <div>
            <div style={{ maxHeight: 260, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 3, fontFamily: "monospace", fontSize: 11 }}>
              {logs.length === 0 && <span style={{ color: "rgba(148,163,184,0.30)", fontSize: 11 }}>No log entries yet…</span>}
              {logs.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "rgba(148,163,184,0.30)", flexShrink: 0, fontSize: 10, paddingTop: 1 }}>{fmtTime(entry.ts)}</span>
                  <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", paddingTop: 1, color: LOG_COLORS[entry.level], minWidth: 44 }}>{entry.level}</span>
                  <span style={{ color: LOG_COLORS[entry.level], lineHeight: 1.5, wordBreak: "break-all" }}>{entry.msg}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
            <div style={{ padding: "4px 14px 8px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setLogs([])} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 8px", fontSize: 10, color: "rgba(148,163,184,0.40)", borderRadius: 5, touchAction: "manipulation" }}>Clear</button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
