import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Layers } from "lucide-react";
import { motion } from "motion/react";
import { TAP_TRANSITION } from "@/animations/motion";
import { useCurrencyStore, formatAmount } from "@/store/currencyStore";
import type { Currency } from "@/store/currencyStore";
import { useLocation } from "wouter";

function AlertIcon({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 478 501" width={size} height={size}>
      <path d="m209.5 50.7c-20.3 2.4-29.1 4.1-43.5 8.3-30.7 9.2-57.1 25.2-81.6 49.5-17 16.9-26.9 30.6-36.8 50.9-13.2 27-19.6 55.2-19.6 86.3 0 59.5 25.5 112.9 72.5 151.8 22.3 18.4 46 30.7 74.1 38.5 17.6 4.8 52.1 9.1 53.6 6.7 0.4-0.7 0.8-4.8 0.8-9.3 0-4.5 0.3-10.8 0.6-14.1l0.6-5.9-13.8-1.2c-38.4-3.1-67.7-14.6-96.9-38.1-23.9-19.2-41.9-45.3-52.1-75.5-1.9-5.5-4.1-13.4-5-17.5-1.9-9-4.3-33-3.9-38 0.2-2 0.6-7 1-11.1 3.3-39.8 20.8-78.7 47.4-105 47.8-47.3 119.5-61.8 182.9-37.1 43.7 17 82.1 57.3 97.9 102.6 6.8 19.7 9.3 38.3 8.5 63.7l-0.4 13.8 7.8 0.1c4.4 0.1 10.7 0.3 14.1 0.5 3.5 0.1 6.5-0.2 6.8-0.7 0.4-0.5 0.6-9.4 0.6-19.8 0-29.5-4-52.1-13.4-75.1-15.8-39.1-39.7-68.7-74.3-92-10.7-7.3-33.4-18.4-45.4-22.3-14-4.6-32.9-8.5-47-9.7-10.9-0.9-29-1.1-35.5-0.3z" fill="currentColor"/>
      <path d="m219.6 134.7c-0.3 7.6-1.1 29.5-1.6 48.8-0.6 19.2-1.3 40-1.6 46.2l-0.6 11.2-2.6-0.4c-1.5-0.3-15.7-1-31.7-1.6-15.9-0.5-32-1.2-35.7-1.4l-6.6-0.3-0.7 12.5c-0.6 10.1-0.5 12.7 0.6 13.4 0.8 0.5 4.8 0.9 8.9 0.9 4.1 0 26.6 0.7 49.9 1.5 23.3 0.9 42.5 1.5 42.6 1.3 0.5-0.5 2-44.8 4.1-120.8 0.3-11.3 0.7-21.5 1-22.7 0.4-2.1 0.2-2.1-12.5-2.2l-12.8-0.1zm121.5 164c-0.1 4.9-0.6 18.2-1.1 29.8-0.5 11.5-1.2 28.3-1.6 37.3l-0.7 16.3-13.1-0.5c-30.4-1.4-59.7-2.6-68.1-2.8l-9-0.3-0.8 12.9c-0.4 7.1-0.6 13.1-0.4 13.2 0.2 0.2 16.7 1 36.8 1.9 20 0.8 40.1 1.8 44.7 2.1l8.3 0.6-0.5 5.6c-0.3 3.2-0.8 10.9-1.1 17.2-2 45.3-2.7 66.1-2.3 66.5 0.3 0.3 6.8 0.8 14.5 1.2l14.1 0.6 0.6-6.4c0.3-3.5 1-18.3 1.6-32.9 0.5-14.6 1.3-32.1 1.6-38.9l0.6-12.4 17.7 0.7c9.7 0.4 29.8 1.3 44.6 2.1 14.9 0.7 27.3 1 27.6 0.7 0.4-0.4 0.9-6.6 1.1-13.7l0.3-13-7.5-0.2c-35-1-82.1-3.2-82.9-3.9-0.2-0.2 0.1-12.8 0.8-28.1 0.6-15.3 1.4-34.8 1.7-43.3 0.3-8.5 0.7-16.4 0.9-17.6 0.4-2-0.1-2.1-9.3-2.7-5.3-0.4-11.8-0.7-14.3-0.7h-4.6z" fill="currentColor"/>
    </svg>
  );
}

function Dots({ count = 10 }: { count?: number }) {
  return (
    <span className="inline-flex items-center gap-[3px] align-middle">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="inline-block w-[6px] h-[6px] rounded-full bg-foreground/25" />
      ))}
    </span>
  );
}

/** Format a pre-converted display value with the sign prefix. */
function fmt(v: number, currency: Currency, masked: boolean): React.ReactNode {
  if (masked) return <Dots count={6} />;
  return `${v >= 0 ? "+" : ""}${formatAmount(v, currency)}`;
}

interface Props {
  /**
   * Raw USD totals — kept in the prop contract for callers (dashboard.tsx
   * passes them from useCombinedPortfolio()), but no longer rendered here:
   * the widget shows a single currency at a time, driven by the header's
   * $/₹ toggle, never both side-by-side.
   */
  accountValueUSD: number;
  upnlUSD: number;
  realizedPnlUSD?: number;
  netPnlUSD?: number;

  /**
   * Pre-converted display values already in the user's selected currency,
   * computed using per-broker conversion rates (Delta = fixed ₹85, cTrader =
   * live rate). Pass these from useCombinedPortfolio().display — do NOT
   * re-multiply by the global exchange rate.
   */
  accountValueDisplay: number;
  upnlDisplay: number;
  realizedPnlDisplay?: number;
  netPnlDisplay?: number;

  openPositions: number;
  openOrders: number;
}

export default function AccountValueWidget({
  accountValueDisplay,
  upnlDisplay,
  realizedPnlDisplay = 0,
  netPnlDisplay,
  openPositions,
  openOrders,
}: Props) {
  const [masked, setMasked] = useState(false);
  const [, navigate] = useLocation();
  const currency = useCurrencyStore(s => s.currency);

  const resolvedNetPnlDisplay = netPnlDisplay ?? (upnlDisplay + realizedPnlDisplay);

  const upPos   = upnlDisplay >= 0;
  const realPos = realizedPnlDisplay >= 0;
  const netPos  = resolvedNetPnlDisplay >= 0;

  // Palette constants
  const PROFIT  = "#22C55E";
  const LOSS    = "#EF4444";
  const DIVIDER = "var(--dash-metric-divider)";

  return (
    <div className="dash-account-card overflow-hidden">
      {/* ── Main section ── */}
      <div className="px-4 pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-0.5 group" onClick={() => navigate("/balances")}>
              <span className="text-[13px] font-semibold transition-colors" style={{ color: "var(--stat-title)" }}>
                Account Value
              </span>
              <ChevronRight className="w-3.5 h-3.5 transition-colors" style={{ color: "var(--stat-icon)" }} />
            </button>
            <button
              onClick={() => setMasked(m => !m)}
              className="transition-colors"
              style={{ color: "var(--stat-icon)" }}
              aria-label={masked ? "Show" : "Hide"}
            >
              {masked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={TAP_TRANSITION}
            onClick={() => navigate("/portfolio?tab=positions")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px]"
            style={{
              fontWeight: 600,
              background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              color: "#fff",
              boxShadow: "0 2px 10px rgba(249,115,22,0.35)",
            }}
          >
            <Layers className="w-3 h-3" />
            Show Positions
          </motion.button>
        </div>

        {/* Value row — single-currency display, driven entirely by the header's
            $/₹ toggle. No secondary amount in the other currency is ever shown. */}
        <div className="flex items-center">
          <span className="text-[28px] font-black tracking-tight leading-none" style={{ color: "var(--stat-value)" }}>
            {masked ? <Dots count={9} /> : formatAmount(accountValueDisplay, currency)}
          </span>
        </div>
      </div>

      {/* ── Sub-widget — combined across Delta Exchange + cTrader ── */}
      <div
        className="mx-3 mb-3 rounded-xl grid grid-cols-2 overflow-hidden"
        style={{
          background: "var(--elevate-1)",
          border: `1px solid ${DIVIDER}`,
        }}
      >
        {/* UPNL */}
        <div className="px-3.5 py-3 border-r border-b" style={{ borderColor: DIVIDER }}>
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              UPNL
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: upPos ? PROFIT : LOSS }}>
              {fmt(upnlDisplay, currency, masked)}
            </span>
          </div>
        </div>

        {/* Realized PNL */}
        <div className="px-3.5 py-3 border-b" style={{ borderColor: DIVIDER }}>
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              Realized PNL
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: realPos ? PROFIT : LOSS }}>
              {fmt(realizedPnlDisplay, currency, masked)}
            </span>
          </div>
        </div>

        {/* Net PNL — tapping navigates to the PNL Analytics page */}
        <div className="px-3.5 py-3 border-r" style={{ borderColor: DIVIDER }}>
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/pnl")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              Net PNL
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: netPos ? PROFIT : LOSS }}>
              {fmt(resolvedNetPnlDisplay, currency, masked)}
            </span>
          </div>
        </div>

        {/* Positions / Orders */}
        <div className="px-3.5 py-3">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              Positions / Orders
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-black leading-none" style={{ color: "var(--stat-value)" }}>{openPositions}</span>
            <span className="text-[15px] font-black leading-none" style={{ color: "var(--stat-sub)" }}>/</span>
            <span className="text-[15px] font-black leading-none" style={{ color: "var(--stat-value)" }}>{openOrders}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
