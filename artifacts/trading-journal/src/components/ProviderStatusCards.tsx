import { memo, useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, RefreshCw, Zap, TrendingUp } from "lucide-react";

export type ProviderStatus = "connected" | "reconnecting" | "disconnected" | "error";

export interface ProviderStats {
  name: string;
  displayName: string;
  badge: string;
  color: string;
  status: ProviderStatus;
  tickCount: number;
  reconnectCount: number;
  lastTickAt: number | null;
  latencyMs: number | null;
  subscriptions: string[];
  connectedAt: number | null;
}

const PROVIDER_DISPLAY: Record<string, { label: string; symbols: string }> = {
  delta: { label: "Delta Exchange", symbols: "BTCUSD · ETHUSD · SOLUSD · DOGEUSD · PEPEUSD" },
};

function fmtUptime(connectedAt: number | null): string {
  if (connectedAt === null) return "—";
  const s = Math.floor((Date.now() - connectedAt) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function fmtLastTick(lastTickAt: number | null): string {
  if (!lastTickAt) return "No ticks yet";
  return `${Math.round((Date.now() - lastTickAt) / 1000)}s ago`;
}

const StatusIcon = memo(function StatusIcon({ status }: { status: ProviderStatus }) {
  if (status === "connected")    return <Wifi className="w-3.5 h-3.5 text-blue-400" />;
  if (status === "reconnecting") return <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: "1.5s" }} />;
  return <WifiOff className="w-3.5 h-3.5 text-red-400" />;
});

const StatusPill = memo(function StatusPill({ status }: { status: ProviderStatus }) {
  const cfg = {
    connected:    { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", label: "Connected" },
    reconnecting: { bg: "bg-amber-500/10  border-amber-500/20",   text: "text-amber-400",   label: "Reconnecting" },
    disconnected: { bg: "bg-red-500/10    border-red-500/20",     text: "text-red-400",     label: "Offline" },
    error:        { bg: "bg-red-500/10    border-red-500/20",     text: "text-red-400",     label: "Error" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
      {status === "connected" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
        </span>
      )}
      {cfg.label}
    </span>
  );
});

const ProviderCard = memo(function ProviderCard({ stats, now }: { stats: ProviderStats; now: number }) {
  const info = PROVIDER_DISPLAY[stats.name] ?? { label: stats.displayName, symbols: stats.subscriptions.join(" · ") };

  return (
    <div className="glass-card relative overflow-hidden group transition-colors duration-200">
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${stats.color}08, transparent 70%)` }}
      />

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${stats.color}18`, border: `1px solid ${stats.color}30` }}
            >
              <StatusIcon status={stats.status} />
            </div>
            <div>
              <p className="text-[13px] font-bold text-white leading-tight">{info.label}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 capitalize">{stats.badge} feed</p>
            </div>
          </div>
          <StatusPill status={stats.status} />
        </div>

        <p className="text-[10px] text-muted-foreground/50 font-mono leading-relaxed">{info.symbols}</p>

        <div className="grid grid-cols-4 gap-2 pt-1 border-t border-white/[0.05]">
          <div>
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Latency</p>
            <p className="text-[12px] font-bold text-white mt-0.5">
              {stats.latencyMs !== null ? `${stats.latencyMs}ms` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Ticks</p>
            <p className="text-[12px] font-bold text-white mt-0.5">
              {stats.tickCount > 999 ? `${(stats.tickCount / 1000).toFixed(1)}k` : stats.tickCount}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Reconnects</p>
            <p className={`text-[12px] font-bold mt-0.5 ${stats.reconnectCount > 0 ? "text-amber-400" : "text-white"}`}>
              {stats.reconnectCount}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Uptime</p>
            <p className="text-[12px] font-bold text-white mt-0.5">{fmtUptime(stats.connectedAt)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <p className="text-[10px] text-muted-foreground/40">
            Last tick: <span className="text-muted-foreground/60">{fmtLastTick(stats.lastTickAt)}</span>
          </p>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-muted-foreground/30" />
            <span className="text-[10px] text-muted-foreground/40">{stats.subscriptions.length} symbols</span>
          </div>
        </div>
      </div>
    </div>
  );
});

const POLL_INTERVAL_MS = 10_000;
const FETCH_TIMEOUT_MS = 5_000;
const OFFLINE_FALLBACK: ProviderStats[] = [
  {
    name: "delta", displayName: "Delta Exchange", badge: "crypto",
    color: "#8B5CF6", status: "disconnected",
    tickCount: 0, reconnectCount: 0, lastTickAt: null,
    latencyMs: null, subscriptions: [], connectedAt: null,
  },
];

export function ProviderStatusCards() {
  const [providers, setProviders] = useState<ProviderStats[]>([]);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const fetchProviders = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/market/providers", { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) {
          console.warn("[ProviderStatusCards] API returned", res.status);
          return;
        }
        const data = await res.json() as ProviderStats[];
        if (aliveRef.current && Array.isArray(data)) {
          console.log("[ProviderStatusCards] API success:", data.length, "providers");
          setProviders(data);
          setNow(Date.now());
        }
      } catch (err) {
        clearTimeout(timer);
        if ((err as Error).name !== "AbortError") {
          console.warn("[ProviderStatusCards] API failed:", (err as Error).message);
        }
      } finally {
        if (aliveRef.current) setInitialFetchDone(true);
      }
    };

    fetchProviders();
    const pollTimer = setInterval(fetchProviders, POLL_INTERVAL_MS);

    return () => {
      aliveRef.current = false;
      clearInterval(pollTimer);
    };
  }, []);

  const displayProviders = providers.length > 0 ? providers : (initialFetchDone ? OFFLINE_FALLBACK : []);

  if (!initialFetchDone && displayProviders.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-36 rounded-2xl shimmer-loading" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {displayProviders.map((p) => (
        <ProviderCard key={p.name} stats={p} now={now} />
      ))}
    </div>
  );
}

export const ProviderBadge = memo(function ProviderBadge({ provider, small }: { provider: string; small?: boolean }) {
  const cfg: Record<string, { label: string; color: string }> = {
    delta:   { label: "Δ Delta", color: "#8B5CF6" },
    ctrader: { label: "cTrader", color: "#F59E0B" },
  };
  const c = cfg[provider.toLowerCase()] ?? { label: provider.toUpperCase(), color: "#64748b" };

  return (
    <span
      className={`inline-flex items-center font-bold rounded-md ${small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"}`}
      style={{ background: `${c.color}18`, color: c.color, border: `1px solid ${c.color}30` }}
    >
      {c.label}
    </span>
  );
});

export function LivePriceRow({ symbol, provider, price, change }: {
  symbol: string;
  provider: string;
  price?: number;
  change?: number;
}) {
  const isUp = (change ?? 0) >= 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-white">{symbol}</span>
        <ProviderBadge provider={provider} small />
      </div>
      <div className="text-right">
        <p className="text-[13px] font-bold text-white">
          {price != null ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : "—"}
        </p>
        {change != null && (
          <p className={`text-[10px] font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            {isUp ? "+" : ""}{change.toFixed(2)}%
          </p>
        )}
      </div>
    </div>
  );
}

export function getProviderFromSymbol(symbol: string): string {
  const cryptoSymbols = ["BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD"];
  return cryptoSymbols.includes(symbol.toUpperCase()) ? "delta" : "unknown";
}
