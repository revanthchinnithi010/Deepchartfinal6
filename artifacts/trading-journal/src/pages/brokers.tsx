import { useState, useRef, useCallback, useEffect } from "react";
import { useBrokerStore } from "@/store/brokerStore";
import { motion, AnimatePresence } from "motion/react";
import { tweenStandard, tweenFast } from "@/animations/motion";
import {
  Wifi, WifiOff, RefreshCw, CheckCircle2, X, Upload, Shield,
  Lock, Clock, AlertCircle, Zap, FileText, AlertTriangle,
  Eye, EyeOff, Database, Activity, Globe, TrendingUp,
  ChevronRight, ArrowUpRight, ArrowDownRight, Filter, Download,
  Link2, Unlink, Signal, ExternalLink, Copy, Server, BarChart3,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrencyFormatter } from "@/store/currencyStore";
import {
  SAMPLE_SYNCED_TRADES,
  DELTA_SYNC_HISTORY,
  FUSION_IMPORT_HISTORY,
  GROWW_IMPORT_HISTORY,
  type SyncedTrade,
  type BrokerName,
} from "@/data/brokerData";
import {
  AnimatedPresenceList,
  PageTransition,
  AnimatedCard,
  AnimatedButton,
  AnimatedIconButton,
  AnimatedList,
  AnimatedListItem,
  LoadingSpinner,
  NumberCounter,
} from "@/components/animations";

type ActiveTab = "delta" | "fusion" | "groww" | "ctrader";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SyncStatus = "idle" | "syncing" | "success" | "error";
type ImportStatus = "idle" | "importing" | "success" | "error";


function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${checked ? "bg-primary" : "bg-white/[0.12]"}`}
    >
      <motion.div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 22 : 2 }}
        transition={tweenFast}
      />
    </button>
  );
}

function SyncSpinner() {
  return (
    <div className="w-3.5 h-3.5">
      <LoadingSpinner />
    </div>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {connected && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${connected ? "bg-blue-400" : "bg-white/20"}`} />
    </span>
  );
}

interface BrokerCardProps {
  name: string;
  tag: ActiveTab;
  active: boolean;
  connected: boolean;
  lastSync: string;
  tradesCount: number;
  accentColor: string;
  icon: React.ReactNode;
  onSelect: () => void;
  onToggleConnect: () => void;
}

function BrokerCard({ name, tag, active, connected, lastSync, tradesCount, accentColor, icon, onSelect, onToggleConnect }: BrokerCardProps) {
  return (
    <AnimatedCard
      onClick={onSelect}
      hoverable
      className={`relative overflow-hidden transition-all duration-300 ${
        active ? "glass-card border-primary/40 shadow-lg shadow-primary/10" : "glass-card hover:border-white/[0.12]"
      }`}
    >
      {active && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent pointer-events-none"
        />
      )}
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg`} style={{ background: accentColor }}>
            {icon}
          </div>
          <div className="flex items-center gap-2">
            <StatusDot connected={connected} />
            <span className={`text-[11px] font-semibold ${connected ? "text-blue-400" : "text-muted-foreground"}`}>
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-[15px] font-black text-white tracking-tight">{name}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Shield className="w-3 h-3 text-primary/70" />
            <span className="text-[10px] text-primary/70 font-medium">Secure Connection</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Synced Trades</p>
            <p className="text-[16px] font-black text-white mt-0.5">{connected ? <NumberCounter value={tradesCount} /> : "—"}</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Last Sync</p>
            <p className="text-[11px] font-semibold text-white mt-0.5 truncate">{connected ? lastSync : "Never"}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <AnimatedButton
            onClick={(e) => { e.stopPropagation(); onToggleConnect(); }}
            className={`flex-1 h-8 rounded-xl text-[12px] font-bold transition-all duration-200 ${
              connected
                ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                : "bg-primary text-white hover:bg-primary/85 shadow-md shadow-primary/25"
            }`}
          >
            {connected ? "Disconnect" : "Connect"}
          </AnimatedButton>
          <AnimatedButton
            onClick={onSelect}
            variant="ghost"
            className="h-8 px-3 rounded-xl text-[12px] font-semibold border border-white/[0.08] text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-all"
          >
            Manage
          </AnimatedButton>
        </div>
      </div>

      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}
    </AnimatedCard>
  );
}

function DeltaPanel({
  connected, onConnect, onDisconnect,
}: { connected: boolean; onConnect: () => void; onDisconnect: () => void }) {
  const [apiKey, setApiKey] = useState(connected ? "••••••••••••••••••••••••••••••••" : "");
  const [apiSecret, setApiSecret] = useState(connected ? "••••••••••••••••••••••••••••••••" : "");
  const [showSecret, setShowSecret] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncProgress, setSyncProgress] = useState(0);

  const handleConnect = () => {
    if (!apiKey || !apiSecret) return;
    setSyncStatus("syncing");
    setSyncProgress(0);
    const interval = setInterval(() => {
      setSyncProgress(p => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + 12;
      });
    }, 120);
    setTimeout(() => {
      setSyncStatus("success");
      setSyncProgress(100);
      onConnect();
      setTimeout(() => setSyncStatus("idle"), 2500);
    }, 1400);
  };

  const handleManualSync = () => {
    if (!connected) return;
    setSyncStatus("syncing");
    setSyncProgress(0);
    const interval = setInterval(() => {
      setSyncProgress(p => { if (p >= 100) { clearInterval(interval); return 100; } return p + 10; });
    }, 100);
    setTimeout(() => {
      setSyncStatus("success");
      setSyncProgress(100);
      setTimeout(() => { setSyncStatus("idle"); setSyncProgress(0); }, 2000);
    }, 1200);
  };

  return (
    <motion.div key="delta" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={tweenStandard} className="space-y-5">
      {/* Security notice */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-foreground/60" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-foreground/80">End-to-End Encrypted</p>
          <p className="text-[11px] text-muted-foreground">API keys are stored with AES-256 encryption. We never store plaintext credentials.</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Lock className="w-3 h-3 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground/60 font-semibold">TLS 1.3</span>
        </div>
      </div>

        {/* API Credentials */}
        <AnimatedCard className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Database className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-bold text-white">API Credentials</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider block mb-1.5">API Key</label>
              <Input
                type="text"
                placeholder="Enter your Delta Exchange API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={connected}
                className="bg-white/[0.04] border-white/[0.09] rounded-xl h-10 text-[13px] focus:border-primary/50 focus:ring-0 placeholder:text-muted-foreground/40 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider block mb-1.5">API Secret</label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder="Enter your Delta Exchange API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  disabled={connected}
                  className="bg-white/[0.04] border-white/[0.09] rounded-xl h-10 text-[13px] focus:border-primary/50 focus:ring-0 placeholder:text-muted-foreground/40 transition-colors pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-white transition-colors"
                >
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <AnimatePresence>
            {syncStatus === "syncing" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={tweenStandard} className="space-y-1.5 overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Connecting to Delta Exchange...</span>
                  <span className="text-[11px] font-semibold text-primary">{syncProgress}%</span>
                </div>
                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-lime-300"
                    animate={{ width: `${syncProgress}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!connected ? (
              <AnimatedButton
                onClick={handleConnect}
                disabled={syncStatus === "syncing" || !apiKey || !apiSecret}
                className="flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/85 shadow-md shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncStatus === "syncing" ? <SyncSpinner /> : syncStatus === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                {syncStatus === "syncing" ? "Connecting..." : syncStatus === "success" ? "Connected!" : "Connect Broker"}
              </AnimatedButton>
            ) : (
              <AnimatedButton
                onClick={onDisconnect}
                className="flex items-center gap-2 h-9 px-5 rounded-xl bg-red-500/10 text-red-400 text-[13px] font-bold border border-red-500/20 hover:bg-red-500/20 transition-all"
              >
                <WifiOff className="w-3.5 h-3.5" />
                Disconnect
              </AnimatedButton>
            )}

            {connected && (
              <AnimatedButton
                onClick={handleManualSync}
                disabled={syncStatus === "syncing"}
                variant="ghost"
                className="flex items-center gap-2 h-9 px-4 rounded-xl border border-white/[0.08] text-muted-foreground text-[13px] font-semibold hover:text-white hover:bg-white/[0.05] transition-all disabled:opacity-50"
              >
                {syncStatus === "syncing" ? <SyncSpinner /> : syncStatus === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {syncStatus === "syncing" ? "Syncing..." : syncStatus === "success" ? "Synced!" : "Manual Sync"}
              </AnimatedButton>
            )}
          </div>
        </AnimatedCard>

      {/* Auto Sync + Settings */}
      {connected && (
        <AnimatedCard className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-bold text-white">Sync Settings</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-[13px] text-white font-semibold">Auto Sync</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Automatically pull new trades every 30 minutes</p>
            </div>
            <Toggle checked={autoSync} onChange={setAutoSync} />
          </div>
          <div className="flex items-center justify-between py-1 border-t border-white/[0.05]">
            <div>
              <p className="text-[13px] text-white font-semibold">Connected Status</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Live connection to Delta Exchange API</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <StatusDot connected={true} />
              <span className="text-[11px] font-bold text-blue-400">Active</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
            <Globe className="w-4 h-4 text-primary/60 shrink-0" />
            <div>
              <p className="text-[11px] text-white font-semibold">api.delta.exchange</p>
              <p className="text-[10px] text-muted-foreground">Production endpoint · Read-only access</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/50 font-medium">Encrypted</span>
            </div>
          </div>
        </AnimatedCard>
      )}

      {/* Sync History */}
      {connected && (
        <AnimatedCard className="overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-bold text-white">Sync History</span>
              <span className="text-[10px] text-muted-foreground bg-white/[0.04] rounded-full px-2 py-0.5 border border-white/[0.06]">
                <NumberCounter value={DELTA_SYNC_HISTORY.filter(e => e.status === "success").reduce((a, e) => a + e.tradesImported, 0)} /> total trades
              </span>
            </div>
          </div>
          <AnimatedList className="divide-y divide-white/[0.04]">
            {DELTA_SYNC_HISTORY.map((entry, i) => (
              <AnimatedListItem
                key={entry.id}
                index={i}
                className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${entry.status === "success" ? "bg-blue-500/10" : "bg-red-500/10"}`}>
                  {entry.status === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white font-medium truncate">{entry.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {entry.status === "success" && entry.tradesImported > 0 && (
                  <span className="text-[11px] font-bold text-foreground/60 shrink-0">+{entry.tradesImported}</span>
                )}
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </AnimatedCard>
      )}
    </motion.div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────


function FusionPanel({ connected: _connected, onConnect: _onConnect, onDisconnect: _onDisconnect }: { connected: boolean; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <motion.div key="fusion" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={tweenStandard} className="space-y-4">
      <AnimatedCard className="p-6 space-y-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto">
          <Server className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h3 className="text-[15px] font-black text-white">FusionMarkets Integration</h3>
          <p className="text-[12px] text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
            Import your FusionMarkets trades manually using the CSV export from your broker portal.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 pt-2">
          <AnimatedButton className="px-5 py-2.5 rounded-xl text-[13px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/25 hover:bg-blue-500/18 transition-colors">
            <Download className="w-3.5 h-3.5 inline mr-1.5" />
            Import CSV
          </AnimatedButton>
          <p className="text-[10px] text-muted-foreground/50">Supports FusionMarkets MT4/MT5 trade history exports</p>
        </div>
      </AnimatedCard>
    </motion.div>
  );
}


function GrowwPanel({ connected, onConnect, onDisconnect }: { connected: boolean; onConnect: () => void; onDisconnect: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const simulateImport = () => {
    setImportStatus("importing");
    setImportProgress(0);
    const iv = setInterval(() => {
      setImportProgress(p => { if (p >= 100) { clearInterval(iv); return 100; } return p + 14; });
    }, 100);
    setTimeout(() => {
      setImportStatus("success");
      setImportProgress(100);
      if (!connected) onConnect();
      setTimeout(() => setImportStatus("idle"), 3000);
    }, 1100);
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) simulateImport(); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };

  return (
    <motion.div key="groww" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={tweenStandard} className="space-y-5">
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-teal-500/[0.06] border border-teal-500/[0.15]">
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-teal-400" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-teal-400">Groww Portfolio Import</p>
          <p className="text-[11px] text-muted-foreground">Import your Groww P&L and trade history. Download from Groww app → Reports → P&L Statement.</p>
        </div>
      </div>

      {/* Investment Tracking Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Invested Value", value: 124500, prefix: "₹", change: "+8.4%", positive: true },
          { label: "Current Value", value: 135028, prefix: "₹", change: "+₹10,528", positive: true },
          { label: "Total Returns", value: 10528, prefix: "₹", change: "8.45% XIRR", positive: true },
        ].map((card, i) => (
          <AnimatedCard key={card.label} index={i}
            className="glass-card p-4 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
            <p className="text-[18px] font-black text-white">{card.prefix}<NumberCounter value={card.value} /></p>
            <p className={`text-[11px] font-semibold ${card.positive ? "text-emerald-400" : "text-red-400"}`}>{card.change}</p>
          </AnimatedCard>
        ))}
      </div>

      {/* Manual Import */}
      <AnimatedCard className="p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-teal-500/15 flex items-center justify-center">
            <Upload className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <span className="text-[13px] font-bold text-white">Import from Groww</span>
        </div>

        <motion.div
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          animate={{ borderColor: dragOver ? "rgba(45,212,191,0.6)" : "rgba(255,255,255,0.08)", backgroundColor: dragOver ? "rgba(20,184,166,0.06)" : "rgba(255,255,255,0.02)" }}
          className="border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all"
        >
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={() => simulateImport()} />
          <AnimatePresence mode="wait">
            {importStatus === "importing" ? (
              <motion.div key="imp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
                <LoadingSpinner />
                <div className="w-48 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-muted-foreground">Processing...</span>
                    <span className="text-[11px] font-bold text-teal-400">{importProgress}%</span>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div className="h-full rounded-full bg-teal-500" animate={{ width: `${importProgress}%` }} transition={{ duration: 0.1 }} />
                  </div>
                </div>
              </motion.div>
            ) : importStatus === "success" ? (
              <motion.div key="suc" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-blue-400" />
                <p className="text-[13px] font-bold text-blue-400">Import Successful!</p>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 text-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${dragOver ? "bg-teal-500/20" : "bg-white/[0.04]"}`}>
                  <Upload className={`w-7 h-7 ${dragOver ? "text-teal-400" : "text-muted-foreground/60"}`} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Drop your Groww P&L file here</p>
                  <p className="text-[11px] text-muted-foreground mt-1">or <span className="text-teal-400 font-medium">browse to upload</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-muted-foreground">Groww CSV</span>
                  <span className="text-[10px] px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-muted-foreground">P&L Excel</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatedCard>

      {/* Import History */}
      <AnimatedCard className="overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-teal-500/15 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <span className="text-[13px] font-bold text-white">Import History</span>
          </div>
        </div>
        <AnimatedList className="divide-y divide-white/[0.04]">
          {GROWW_IMPORT_HISTORY.map((entry, i) => (
            <AnimatedListItem key={entry.id} index={i}
              className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-blue-500/10">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white font-medium truncate">{entry.fileName}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{entry.message}
                </p>
              </div>
              <span className="text-[11px] font-bold text-foreground/60 shrink-0">+{entry.tradesImported}</span>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      </AnimatedCard>
    </motion.div>
  );
}


function CTraderPanel() {
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [uriStatus, setUriStatus] = useState<"loading" | "detected" | "missing">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/ctrader/oauth/config`)
      .then(r => r.json())
      .then((data: { redirectUri?: string }) => {
        if (data.redirectUri) {
          setRedirectUri(data.redirectUri);
          setUriStatus("detected");
        } else {
          setUriStatus("missing");
        }
      })
      .catch(() => setUriStatus("missing"));
  }, []);

  const handleCopy = () => {
    if (!redirectUri) return;
    navigator.clipboard.writeText(redirectUri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div key="ctrader" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={tweenStandard} className="space-y-5">
      {/* OAuth Config Card */}
      <AnimatedCard className="p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center">
            <Link2 className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-[13px] font-bold text-white">OAuth Configuration</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
              Redirect URL
            </label>
            {uriStatus === "loading" && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
                <LoadingSpinner />
                Detecting…
              </span>
            )}
            {uriStatus === "detected" && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Redirect URL Detected ✓
              </span>
            )}
            {uriStatus === "missing" && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                Redirect URL Missing ✗
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={
                uriStatus === "loading"
                  ? "Detecting…"
                  : (redirectUri ?? "Unable to detect — API server may be offline")
              }
              className="flex-1 h-10 px-3 rounded-xl text-[12px] bg-white/[0.04] border border-white/[0.09] text-muted-foreground/80 outline-none font-mono cursor-default select-all"
              style={{ caretColor: "transparent" }}
            />
            <AnimatedButton
              onClick={handleCopy}
              disabled={!redirectUri}
              className="h-10 px-3 rounded-xl border border-white/[0.09] bg-white/[0.04] text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all flex items-center gap-1.5 text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {copied
                ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Copied!</>
                : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </AnimatedButton>
          </div>

          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            Auto-generated from your current environment. Register this exact URL in your cTrader Open API app under{" "}
            <span className="text-violet-400/80 font-medium">Redirect URIs</span> — no manual entry required.
          </p>
        </div>
      </AnimatedCard>

      {/* Setup Instructions */}
      <AnimatedCard className="p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-white/[0.05] flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-muted-foreground/60" />
          </div>
          <span className="text-[13px] font-bold text-white">Setup Instructions</span>
        </div>
        {[
          { step: 1, text: "Register a new application at connect.spotware.com" },
          { step: 2, text: "Add the Redirect URL above to your app's allowed redirect URIs" },
          { step: 3, text: "Copy your Client ID and Client Secret" },
          { step: 4, text: "Set CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET in Replit Secrets" },
        ].map(({ step, text }) => (
          <div key={step} className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-black text-violet-400">{step}</span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">{text}</p>
          </div>
        ))}
      </AnimatedCard>
    </motion.div>
  );
}


const BROKER_FILTER_OPTIONS: Array<{ label: string; value: BrokerName | "all" }> = [
  { label: "All Brokers", value: "all" },
  { label: "Delta Exchange", value: "Delta Exchange" },
  { label: "FusionMarkets", value: "FusionMarkets" },
  { label: "Groww", value: "Groww" },
];

export default function Brokers() {
  const fc = useCurrencyFormatter();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<ActiveTab>("delta");
  const [deltaConnected, setDeltaConnected] = useState(true);
  const [fusionConnected, setFusionConnected] = useState(false);
  const [growwConnected, setGrowwConnected] = useState(false);
  const [ctraderConnected, _setCtraderConnected] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<BrokerName | "all">("all");
  const filteredTrades = SAMPLE_SYNCED_TRADES.filter(
    t => tradeFilter === "all" || t.broker === tradeFilter
  );

  const deltaCount = SAMPLE_SYNCED_TRADES.filter(t => t.broker === "Delta Exchange").length;
  const fusionCount = SAMPLE_SYNCED_TRADES.filter(t => t.broker === "FusionMarkets").length;
  const growwCount = SAMPLE_SYNCED_TRADES.filter(t => t.broker === "Groww").length;

  return (
    <PageTransition fill={false}>
      <div className="space-y-6 pb-12">
        {/* Page Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-[22px] font-black text-white tracking-tight">Broker Connections</h1>
            <p className="text-[13px] text-muted-foreground mt-1">Connect your brokers to automatically sync trades and build your journal.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <Shield className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-[11px] font-semibold text-muted-foreground/60">Bank-Grade Security</span>
              <div className="w-px h-3.5 bg-white/[0.08]" />
              <Lock className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground/60">AES-256 · TLS 1.3</span>
            </div>
          </div>
        </div>

      {/* Broker Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <BrokerCard
          name="Delta Exchange"
          tag="delta"
          active={activeTab === "delta"}
          connected={deltaConnected}
          lastSync="10:30 AM"
          tradesCount={deltaCount}
          accentColor="transparent"
          icon={<img src="/broker-delta.png" alt="Delta Exchange" className="w-full h-full object-cover" />}
          onSelect={() => setActiveTab("delta")}
          onToggleConnect={() => setDeltaConnected(v => !v)}
        />
        <BrokerCard
          name="FusionMarkets"
          tag="fusion"
          active={activeTab === "fusion"}
          connected={fusionConnected}
          lastSync="9:45 AM"
          tradesCount={fusionCount}
          accentColor="transparent"
          icon={<img src="/broker-fusion.png" alt="FusionMarkets" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          onSelect={() => setActiveTab("fusion")}
          onToggleConnect={() => setFusionConnected(v => !v)}
        />
        <BrokerCard
          name="Groww"
          tag="groww"
          active={activeTab === "groww"}
          connected={growwConnected}
          lastSync="7:30 AM"
          tradesCount={growwCount}
          accentColor="transparent"
          icon={<img src="/broker-mt5.png" alt="MT5" className="w-full h-full object-cover" />}
          onSelect={() => setActiveTab("groww")}
          onToggleConnect={() => setGrowwConnected(v => !v)}
        />
        <BrokerCard
          name="cTrader"
          tag="ctrader"
          active={activeTab === "ctrader"}
          connected={ctraderConnected}
          lastSync="Never"
          tradesCount={0}
          accentColor="transparent"
          icon={<span style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>cT</span>}
          onSelect={() => setActiveTab("ctrader")}
          onToggleConnect={() => setActiveTab("ctrader")}
        />
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit flex-wrap">
        {[
          { key: "delta" as ActiveTab, label: "Delta Exchange", color: "text-orange-400" },
          { key: "fusion" as ActiveTab, label: "FusionMarkets", color: "text-blue-400" },
          { key: "groww" as ActiveTab, label: "Groww", color: "text-teal-400" },
          { key: "ctrader" as ActiveTab, label: "cTrader", color: "text-violet-400" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${activeTab === tab.key ? "text-white" : "text-muted-foreground hover:text-white"}`}
          >
            {activeTab === tab.key && (
              <motion.div layoutId="tabBg" className="absolute inset-0 rounded-lg bg-white/[0.07] border border-white/[0.08]" style={{ zIndex: -1 }} />
            )}
            <span className={activeTab === tab.key ? tab.color : ""}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Detail Panel */}
      <div>
        <AnimatePresence mode="wait">
          {activeTab === "delta" && (
            <DeltaPanel key="delta" connected={deltaConnected} onConnect={() => setDeltaConnected(true)} onDisconnect={() => setDeltaConnected(false)} />
          )}
          {activeTab === "fusion" && (
            <FusionPanel key="fusion" connected={fusionConnected} onConnect={() => setFusionConnected(true)} onDisconnect={() => setFusionConnected(false)} />
          )}
          {activeTab === "groww" && (
            <GrowwPanel key="groww" connected={growwConnected} onConnect={() => setGrowwConnected(true)} onDisconnect={() => setGrowwConnected(false)} />
          )}
          {activeTab === "ctrader" && (
            <CTraderPanel key="ctrader" />
          )}
        </AnimatePresence>
      </div>

      {/* Auto Imported Trades */}
      <div>
        <AnimatedCard className="overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Database className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-bold text-white">Auto Imported Trades</span>
              <span className="text-[10px] text-muted-foreground bg-white/[0.04] rounded-full px-2 py-0.5 border border-white/[0.06]">
                <NumberCounter value={filteredTrades.length} /> trades
              </span>
            </div>
            {/* Broker Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-muted-foreground/50" />
              {BROKER_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTradeFilter(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                    tradeFilter === opt.value
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-white/[0.03] border-white/[0.07] text-muted-foreground hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {opt.label === "All Brokers" ? "All" : opt.value === "Delta Exchange" ? "Delta" : opt.value === "FusionMarkets" ? "Fusion" : opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.015]">
                  {["Symbol", "Direction", "Entry", "Exit", "PNL", "Fees", "Broker", "Time"].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest ${["Entry","Exit","PNL","Fees"].includes(h) ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <AnimatedPresenceList as="tbody">
                {filteredTrades.map((trade, i) => (
                  <AnimatedListItem as="tr" key={trade.id} index={i}
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-5 rounded-full shrink-0 ${trade.status === "win" ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className="font-black text-[13px] text-white">{trade.symbol}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${trade.direction === "long" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"}`}>
                        {trade.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                      {trade.entry < 1 ? trade.entry.toFixed(7) : trade.entry < 10 ? trade.entry.toFixed(4) : trade.entry.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                      {trade.exit < 1 ? trade.exit.toFixed(7) : trade.exit < 10 ? trade.exit.toFixed(4) : trade.exit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold text-[12px] tabular-nums ${trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {trade.pnl >= 0 ? "+" : ""}{fc(trade.pnl)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground tabular-nums">{fc(trade.fees)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                        trade.broker === "Delta Exchange" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                        trade.broker === "FusionMarkets" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                        "bg-teal-500/10 text-teal-400 border-teal-500/20"
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {trade.broker}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(trade.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </AnimatedListItem>
                ))}
              </AnimatedPresenceList>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-white/[0.05] bg-white/[0.01] flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] text-muted-foreground">Auto-sync active</span>
            </div>
            <div className="flex items-center gap-4 ml-auto text-[11px] font-semibold">
              <span className="text-emerald-400">{filteredTrades.filter(t => t.status === "win").length} wins</span>
              <span className="text-red-400">{filteredTrades.filter(t => t.status === "loss").length} losses</span>
              <span className={filteredTrades.reduce((a, t) => a + t.pnl, 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                {filteredTrades.reduce((a, t) => a + t.pnl, 0) >= 0 ? "+" : ""}{fc(filteredTrades.reduce((a, t) => a + t.pnl, 0))} total
              </span>
            </div>
          </div>
        </AnimatedCard>
      </div>

      {/* Privacy Section */}
      <div>
        <AnimatedCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Lock className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-bold text-white">Security & Privacy</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Shield, title: "AES-256 Encryption", desc: "All credentials are encrypted at rest using military-grade encryption", color: "text-foreground/60", bg: "bg-white/[0.05]" },
              { icon: Globe, title: "TLS 1.3 Transport", desc: "All API calls use the latest TLS protocol for secure data transmission", color: "text-blue-400", bg: "bg-blue-500/10" },
              { icon: Lock, title: "Read-Only Access", desc: "We only request read-only API permissions. We cannot place or modify trades.", color: "text-primary", bg: "bg-primary/10" },
            ].map(({ icon: Icon, title, desc, color, bg }) => (
              <div key={title} className="flex gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div>
                  <p className={`text-[12px] font-bold ${color}`}>{title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </AnimatedCard>
      </div>
      </div>
    </PageTransition>
  );
}
