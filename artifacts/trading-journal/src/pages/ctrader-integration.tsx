/**
 * CtraderIntegrationPage — full-screen cTrader integration page.
 *
 * Reachable from Dashboard → cTrader quick-action card.
 * Renders the same CtraderWidget used inside BrokerIntegrationModal so both
 * locations share a single source of truth with zero duplication.
 *
 * Header spec (mirrors AppHeader):
 *   Total height : calc(56px + env(safe-area-inset-top))
 *   Layout       : [← Back (44px)] [cTrader centered] [placeholder (44px)]
 *   Background   : #000000
 *   Divider      : 1px solid rgba(255,255,255,0.07)
 *
 * Page transition: standard PageTransition (fade + 8px y-slide) — same as all
 * other sidebar/utility pages (/brokers, /settings, /calc/*, …).
 */

import { useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { CtraderWidget } from "@/components/charts/CtraderWidget";

// ── Safe-area helper (mirrors AppHeader's getSafeTop) ──────────────────────────
function getSafeTop(): string {
  if (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__EXPO_TABLET__
  ) {
    return "0px";
  }
  return "env(safe-area-inset-top)";
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CtraderIntegrationPage() {
  const [, navigate] = useLocation();
  const safeTop = getSafeTop();

  const goBack = useCallback(() => navigate("/"), [navigate]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#000000",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          flexShrink: 0,
          display: "grid",
          gridTemplateColumns: "44px 1fr 44px",
          alignItems: "center",
          paddingTop: safeTop,
          height: `calc(56px + ${safeTop})`,
          paddingLeft: 8,
          paddingRight: 8,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "#000000",
        }}
      >
        {/* Back button — 44×44 touch target */}
        <button
          onClick={goBack}
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.6)",
            WebkitTapHighlightColor: "transparent",
            flexShrink: 0,
          }}
          aria-label="Back to Dashboard"
        >
          <ArrowLeft style={{ width: 20, height: 20 }} />
        </button>

        {/* Title — truly centered over the full header width */}
        <h1
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "#ffffff",
            margin: 0,
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          cTrader
        </h1>

        {/* Right placeholder — keeps title centered */}
        <div style={{ width: 44 }} />
      </div>

      {/* ── Scrollable content ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}
      >
        <div
          style={{
            padding: "14px 14px",
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          <CtraderWidget />
        </div>

        {/* Bottom safe-area clearance + nav bar gap */}
        <div style={{ height: "max(80px, env(safe-area-inset-bottom))" }} />
      </div>
    </div>
  );
}
