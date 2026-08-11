import { useState } from "react";
import type { CSSProperties } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Wifi, WifiOff, Loader2, ChevronDown } from "lucide-react";
import { useCurrencyStore, formatAmount } from "@/store/currencyStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { AccountSnapshot } from "@/store/accountTypes";
import { tweenFast, tweenStandard } from "@/animations/motion";

// Balances page numeric styling — dense, professional (Bloomberg/Bybit/Binance
// Pro/TradingView register), not oversized fintech-card typography. Every
// value uses these exact tokens; never fall back to bold white text.
const VALUE_STYLE: CSSProperties = {
  fontSize:      16,
  fontWeight:    600,
  letterSpacing: "-0.2px",
  lineHeight:    "22px",
  color:         "var(--balance-value-color)",
};
const TOTAL_VALUE_STYLE: CSSProperties = {
  fontSize:   18,
  fontWeight: 700,
  color:      "var(--balance-value-color)",
};
export const VALUE_POSITIVE = "#35D39A";
export const VALUE_NEGATIVE = "#FF6B6B";
const LABEL_STYLE: CSSProperties = {
  fontSize:   13,
  fontWeight: 500,
  color:      "#8C8C8C",
};

function DualAmount({
  usd, toINR, color, total,
}: { usd: number; toINR: (v: number) => number; color?: string; total?: boolean }) {
  const currency = useCurrencyStore(s => s.currency);
  const native = currency === "INR" ? toINR(usd) : usd;
  const base = total ? TOTAL_VALUE_STYLE : VALUE_STYLE;
  // Single-currency display — the header's $/₹ toggle picks exactly which
  // currency is shown. No secondary amount is ever rendered alongside it,
  // so switching to INR hides USD entirely and vice versa.
  return (
    <span style={{ ...base, ...(color ? { color } : {}) }}>
      {formatAmount(native, currency)}
    </span>
  );
}

function MetricRow({
  label, usd, toINR, color,
}: { label: string; usd: number; toINR: (v: number) => number; color?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-[6px] border-b border-border/50 last:border-b-0">
      <span style={LABEL_STYLE}>{label}</span>
      <DualAmount usd={usd} toINR={toINR} color={color} />
    </div>
  );
}

const BROKER_ACCENT: Record<string, string> = {
  delta: "#f97316",
  ctrader: "#3b82f6",
};

interface Props {
  account: AccountSnapshot;
  index?: number;
}

export default function AccountCard({ account, index = 0 }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const reduced = useReducedMotion();
  const accent = BROKER_ACCENT[account.brokerId] ?? "#f97316";

  const StatusIcon = account.connectionStatus === "connecting"
    ? Loader2
    : account.isConnected ? Wifi : WifiOff;

  const content = (
    <div className="glass-card overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        {/* Left: accent dot + broker name */}
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          <span className="text-[13.5px] font-bold text-foreground">{account.label}</span>
        </div>

        {/* Right: connection status + chevron */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <StatusIcon
              className={`w-3.5 h-3.5 ${account.connectionStatus === "connecting" ? "animate-spin" : ""}`}
              style={{ color: account.isConnected ? "#34d399" : undefined }}
            />
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                account.isConnected ? "text-emerald-500" : "text-muted-foreground"
              }`}
            >
              {account.isConnected
                ? "Connected"
                : account.connectionStatus === "connecting"
                ? "Connecting"
                : "Offline"}
            </span>
          </div>

          {/* Chevron — sole expand/collapse control */}
          <button
            type="button"
            onClick={() => setIsExpanded(e => !e)}
            className="p-1 rounded-lg hover:bg-white/[0.07] transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse card" : "Expand card"}
          >
            <motion.div
              animate={{ rotate: isExpanded ? 0 : -90 }}
              transition={tweenFast}
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground/60" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* Exchange Total Balance — always visible, no label */}
      <div className="px-4 pb-2.5">
        <DualAmount usd={account.accountValueUSD} toINR={account.toINR} total />
        {account.rateLabel && (
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">{account.rateLabel}</p>
        )}
      </div>

      {/* Collapsible metrics */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="metrics"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={tweenStandard}
            style={{ overflow: "hidden" }}
          >
            <div className="mx-3 mb-3 rounded-xl overflow-hidden bg-muted/30 border border-border/50">
              <MetricRow
                label="Available Balance"
                usd={account.availableBalanceUSD}
                toINR={account.toINR}
              />
              <MetricRow
                label="Margin Used"
                usd={account.marginUsedUSD}
                toINR={account.toINR}
              />
              <MetricRow
                label="Unrealized PNL"
                usd={account.unrealizedPnlUSD}
                toINR={account.toINR}
                color={account.unrealizedPnlUSD >= 0 ? VALUE_POSITIVE : VALUE_NEGATIVE}
              />
              <MetricRow
                label="Realized PNL"
                usd={account.realizedPnlUSD}
                toINR={account.toINR}
                color={account.realizedPnlUSD >= 0 ? VALUE_POSITIVE : VALUE_NEGATIVE}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // No entrance animation on the card wrapper — the page itself (cover-page-enter
  // CSS compositor animation) already provides the entrance. Staggered card
  // fade-ins on top of the page animation created a double-layer effect that
  // looked like "loading" on first open.
  return <div className="h-full">{content}</div>;
}
