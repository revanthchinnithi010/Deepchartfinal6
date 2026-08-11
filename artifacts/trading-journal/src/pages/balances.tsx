import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import AccountCard from "@/components/portfolio/AccountCard";
import { useDeltaAccount } from "@/store/deltaAccountStore";
import { useCtraderAccount } from "@/store/ctraderAccountStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCurrencyStore, CURRENCY_META } from "@/store/currencyStore";

/**
 * Dedicated Balances page — reached only from Dashboard's "Account Value"
 * card. Shows the per-broker account cards (Delta Exchange + cTrader) that
 * used to live at the top of the Portfolio page. Portfolio itself no longer
 * shows any balance information; it only covers Positions / Orders / Stop
 * Orders.
 *
 * Renders its own secondary header (back-arrow, title, USD/INR toggle) —
 * same self-contained pattern as Portfolio's inline header — because the
 * page is mounted position:fixed/inset:0 with its own z-index (see App.tsx's
 * "cover-detail" PageTransition), which sits above Layout's always-mounted
 * header tree. Previously the header lived in Layout.tsx, but that left it
 * hidden behind this page's fixed overlay.
 *
 * Manages its own full-height, pure-black scroll region (rather than
 * StandardPageWrapper's themed page background) so the black continues
 * seamlessly below the header — no light/dark seam at the header boundary
 * in either theme.
 */
export default function Balances() {
  const [, navigate]   = useLocation();
  const deltaAccount   = useDeltaAccount();
  const ctraderAccount = useCtraderAccount();
  const isMobile       = useIsMobile();
  const { currency, setCurrency } = useCurrencyStore();

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--balances-bg)" }}>

      {/* ── Secondary header — back-arrow left, title centred, USD/INR toggle right ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5"
        style={{ height: 56, borderBottom: "1px solid var(--balances-header-border)" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent" }}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "var(--balances-icon-color)" }} />
        </button>
        <span className="font-semibold" style={{ color: "var(--balances-title-color)", fontSize: 17 }}>
          Balances
        </span>
        <button
          onClick={() => setCurrency(currency === "USD" ? "INR" : "USD")}
          className="flex items-center justify-center gap-1 rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent", color: "var(--balances-icon-color)" }}
          aria-label={`Switch to ${currency === "USD" ? "INR" : "USD"}`}
          title={`Switch to ${currency === "USD" ? "INR (₹)" : "USD ($)"}`}
        >
          <span className="text-[15px] font-bold leading-none">{CURRENCY_META[currency].symbol}</span>
        </button>
      </div>

      {/* ── Scroll area ── */}
      <div
        className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div
          className="mx-auto w-full max-w-[1400px] px-4 md:px-6 pt-4"
          style={{ paddingBottom: isMobile ? 80 : 40 }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AccountCard account={deltaAccount} index={0} />
            <AccountCard account={ctraderAccount} index={1} />
          </div>
        </div>
      </div>
    </div>
  );
}
