import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useElasticScroll } from "@/hooks/useElasticScroll";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { popupManager } from "@/lib/popupManager";
import { Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { useRepeatEngine } from "@/hooks/useRepeatEngine";
import { LiveMarketProvider } from "@/contexts/LiveMarketContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { motion, AnimatePresence } from "motion/react";
import { COMPOSITOR_EASE, COMPOSITOR_EASE_CLOSE, COMPOSITOR_OVERLAY_DURATION_OPEN, COMPOSITOR_OVERLAY_DURATION_ENTER_TRANSFORM } from "@/animations/motion";
import { PageTransition } from "@/components/animations/PageTransition";
import { SplashScreen } from "@/components/animations/SplashScreen";
import { getSymbolBreakdown, getGetSymbolBreakdownQueryKey } from "@workspace/api-client-react";
// Static imports — no lazy()/Suspense — so these pages are always available
// the instant the user navigates, with zero chunk-loading delay on first visit.
// Neither page imports heavy libraries (no Recharts, no chart engine).
import Portfolio     from "@/pages/portfolio";
import Balances      from "@/pages/balances";

const Dashboard   = lazy(() => import("@/pages/dashboard"));
const Markets     = lazy(() => import("@/pages/markets"));
const Trades      = lazy(() => import("@/pages/trades"));
const Reports     = lazy(() => import("@/pages/reports"));
const Calendar    = lazy(() => import("@/pages/calendar"));
const Notebook    = lazy(() => import("@/pages/notebook"));
const Settings    = lazy(() => import("@/pages/settings"));
const Brokers     = lazy(() => import("@/pages/brokers"));
const Alerts      = lazy(() => import("@/pages/alerts"));
const CalcCrypto  = lazy(() => import("@/pages/calc-crypto"));
const CalcForex   = lazy(() => import("@/pages/calc-forex"));
const CalcPosition= lazy(() => import("@/pages/calc-position"));
const CalcMargin  = lazy(() => import("@/pages/calc-margin"));
const CalcRisk    = lazy(() => import("@/pages/calc-risk"));
// Charts is kept alive permanently — never unmounts on tab switch.
// Using lazy() still splits the bundle (fast initial load), but the module
// is preloaded eagerly in the background so the first tap to /charts is instant.
const Charts         = lazy(() => import("@/pages/charts"));
const NetPnl           = lazy(() => import("@/pages/NetPnLAnalytics"));
const Trade            = lazy(() => import("@/pages/trade"));
const NotFound       = lazy(() => import("@/pages/not-found"));
const CtraderTest        = lazy(() => import("@/pages/ctrader-test"));
const CtraderIntegration = lazy(() => import("@/pages/ctrader-integration"));
const DeltaIntegration   = lazy(() => import("@/pages/delta-integration"));
// Kept lazy — imports Recharts; start immediately so it's ready before navigation.
const _pPnlAnalytics  = import("@/pages/pnl-analytics");
const _pPositionDetail = import("@/pages/position-detail");
const PnlAnalytics   = lazy(() => _pPnlAnalytics);
const PositionDetail = lazy(() => _pPositionDetail);

const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      retryDelay: 500,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      networkMode: "always",
    },
  },
});

(queryClient as unknown as { fetchWithTimeout: typeof fetchWithTimeout }).fetchWithTimeout = fetchWithTimeout;

function PageLoader() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 rounded-2xl bg-white/[0.03]" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white/[0.03]" />)}
      </div>
    </div>
  );
}

/**
 * StandardPageWrapper — scroll container + padding for regular (non-full-height) pages.
 *
 * Previously these styles lived on the Layout's location-based content wrapper.
 * Moving them here means the Layout always renders a single stable wrapper div
 * regardless of the current route, preventing the mid-transition container
 * switch that caused the Dashboard zoom/resize bug when opening Portfolio.
 *
 * Portfolio and Markets do NOT use this wrapper — they manage their own
 * height-filling flex layout internally.
 */
/**
 * Scroll positions are cached per-pathname across mount/unmount cycles. Each
 * StandardPageWrapper instance is destroyed when its page exits (AnimatePresence
 * mode="wait" fully unmounts non-keep-alive pages), so React state can't carry
 * the scroll offset — a module-level cache survives the unmount and lets a page
 * restore exactly where the user left it when they navigate back.
 */
const scrollPositions = new Map<string, number>();

/**
 * StandardPageWrapper — scroll container for regular (non-full-height) pages.
 *
 * `bottomPad` overrides the default 40px bottom spacing. Pass 80 on mobile so
 * the last content item scrolls above the fixed bottom nav bar.
 *
 * `pathname` keys the scroll-position cache so returning to this route restores
 * the exact scroll offset the user had before navigating away.
 */
function StandardPageWrapper({ children, bottomPad = 40, pathname }: { children: React.ReactNode; bottomPad?: number; pathname: string }) {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = scrollPositions.get(pathname);
    if (saved) el.scrollTop = saved;

    const onScroll = () => { scrollPositions.set(pathname, el.scrollTop); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollPositions.set(pathname, el.scrollTop);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  useElasticScroll(scrollRef, contentRef);

  return (
    <div ref={scrollRef} style={{ height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }} className="scroll-container">
      <div
        ref={contentRef}
        className="px-5 pt-3 pb-5 md:px-6 md:pt-3 md:pb-6 mx-auto max-w-[1400px] min-h-full"
        style={{ paddingBottom: bottomPad }}
      >
        {children}
      </div>
    </div>
  );
}

// Charts is the only keep-alive page — its LWC instance must never remount.
// All other pages mount/unmount normally via AnimatePresence.
const CHARTS_NODE = (
  <Suspense fallback={null}>
    <Charts />
  </Suspense>
);

/**
 * Dashboard keep-alive wrapper — mirrors the Charts pattern.
 *
 * Previously Dashboard was rendered inside the single AnimatePresence flow
 * like every other tab page, meaning it fully unmounted the instant you
 * navigated away and remounted from scratch every time you came back:
 * react-query refetched stats/equity/weekly/trades, all useMemo caches were
 * thrown away, and the component replayed its internal loading-skeleton →
 * ready-content swap (a full subtree replacement) on every single visit —
 * that swap is exactly what looked like a "first-frame flash / layout jump".
 *
 * Keeping Dashboard permanently mounted (like Charts) means navigating to
 * "/" is just an instant display:flex toggle on an already fully-rendered,
 * up-to-date tree — no refetch, no remount, no skeleton replay, no jump.
 *
 * isMobile is read here (not in Router) so this element's identity never
 * changes across renders — same stability guarantee as CHARTS_NODE.
 */
function DashboardKeepAlive() {
  const isMobile = useIsMobile();
  const bp = isMobile ? 80 : 40;
  return (
    <StandardPageWrapper bottomPad={bp} pathname="/">
      <Dashboard />
    </StandardPageWrapper>
  );
}

const DASHBOARD_NODE = (
  <Suspense fallback={<PageLoader />}>
    <DashboardKeepAlive />
  </Suspense>
);

/**
 * Reports keep-alive wrapper — same pattern as DashboardKeepAlive.
 *
 * Reports previously mounted fresh on every navigation (via AnimatePresence,
 * like most other pages): its lazy chunk had to resolve, then its four
 * react-query hooks had to fetch, and until both settled the component's own
 * early-return replaced the ENTIRE tree — header, segmented control, and all
 * — with a bare shimmer grid. On a cold cache that produced exactly the
 * "blank/full-page loader on first open" symptom. Keeping Reports mounted
 * permanently (like Dashboard/Charts) means the first real navigation to
 * /reports is just a display:flex toggle on an already-rendered tree.
 *
 * Mounting is deliberately delayed a beat past initial paint (see
 * `ReportsPreload` below) so Reports' own chunk fetch + queries don't compete
 * with Dashboard's critical first-load network/render work.
 */
function ReportsKeepAlive() {
  const isMobile = useIsMobile();
  const bp = isMobile ? 80 : 40;
  return (
    <StandardPageWrapper bottomPad={bp} pathname="/reports">
      <Reports />
    </StandardPageWrapper>
  );
}

/**
 * Gates when the Reports keep-alive subtree actually mounts in the
 * background. Rendering `null` until `ready` flips means React never even
 * calls the lazy import for Reports' chunk until this timer fires — the two
 * Suspense boundaries (Dashboard's and this one) never contend for the same
 * tick of work.
 *
 * Critical: if the user actually navigates to /reports before that timer
 * fires, we must NOT keep waiting — Layout already flips the wrapper div to
 * display:flex the instant pathname === "/reports", so returning `null` past
 * that point would show a blank, seemingly-stuck panel. Checking the live
 * pathname here means a real navigation always short-circuits straight to
 * mounting, and only the *background* pre-mount (while still on "/") is
 * deferred.
 */
function ReportsPreload() {
  const [location] = useLocation();
  const onReportsRoute = location.split("?")[0] === "/reports";
  const [ready, setReady] = useState(onReportsRoute);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready && !onReportsRoute) return null;
  return <ReportsKeepAlive />;
}

const REPORTS_NODE = (
  <Suspense fallback={<PageLoader />}>
    <ReportsPreload />
  </Suspense>
);

/**
 * PnlAnalytics keep-alive wrapper — same pattern as DashboardKeepAlive /
 * ReportsKeepAlive. Keeping PnlAnalytics permanently mounted means navigating
 * to "/pnl" is an instant display:flex toggle on an already-rendered, already-
 * fetched tree — no skeleton, no refetch, no chart-defer delay on every open.
 */
function PnlAnalyticsKeepAlive() {
  return <PnlAnalytics />;
}

/**
 * Gates when the PnlAnalytics keep-alive subtree mounts in the background.
 * Delayed slightly past ReportsPreload (400 ms) so three heavy subtrees never
 * race on startup. If the user navigates to /pnl before the timer fires the
 * gate short-circuits immediately so the page never shows blank.
 */
function PnlPreload() {
  const [location] = useLocation();
  const onPnlRoute = location.split("?")[0] === "/pnl";
  const [ready, setReady] = useState(onPnlRoute);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready && !onPnlRoute) return null;
  return <PnlAnalyticsKeepAlive />;
}

const PNL_NODE = (
  <Suspense fallback={null}>
    <PnlPreload />
  </Suspense>
);

/**
 * Markets keep-alive — same pattern as DashboardKeepAlive / ReportsKeepAlive.
 * Markets manages its own full-height flex layout internally (no StandardPageWrapper).
 * Keeping it mounted means navigating to "/markets" is an instant display:flex
 * toggle — no lazy-chunk suspension, no blank flash, no data re-fetch on every visit.
 */
function MarketsKeepAlive() {
  return <Markets />;
}

function MarketsPreload() {
  const [location] = useLocation();
  const onRoute = location.split("?")[0] === "/markets";
  const [ready, setReady] = useState(onRoute);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready && !onRoute) return null;
  return <MarketsKeepAlive />;
}

const MARKETS_NODE = (
  <Suspense fallback={null}>
    <MarketsPreload />
  </Suspense>
);

/**
 * Trades keep-alive — same pattern as Markets. Trades has its own secondary
 * header and manages its own layout, so no StandardPageWrapper wrapper needed.
 */
function TradesKeepAlive() {
  return <Trades />;
}

function TradesPreload() {
  const [location] = useLocation();
  const onRoute = location.split("?")[0] === "/trades";
  const [ready, setReady] = useState(onRoute);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready && !onRoute) return null;
  return <TradesKeepAlive />;
}

const TRADES_NODE = (
  <Suspense fallback={null}>
    <TradesPreload />
  </Suspense>
);

/**
 * Alerts keep-alive — same pattern as Markets/Trades. Alerts uses
 * StandardPageWrapper for its scroll container (same as Brokers, Calendar, etc).
 * isMobile read here (not in Router) so element identity never changes.
 */
function AlertsKeepAlive() {
  const isMobile = useIsMobile();
  const bp = isMobile ? 80 : 40;
  return (
    <StandardPageWrapper bottomPad={bp} pathname="/alerts">
      <Alerts />
    </StandardPageWrapper>
  );
}

function AlertsPreload() {
  const [location] = useLocation();
  const onRoute = location.split("?")[0] === "/alerts";
  const [ready, setReady] = useState(onRoute);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready && !onRoute) return null;
  return <AlertsKeepAlive />;
}

const ALERTS_NODE = (
  <Suspense fallback={null}>
    <AlertsPreload />
  </Suspense>
);

// ── Header-sync path sets ────────────────────────────────────────────────
// Used by Router to compute the deferred headerVisible prop passed to Layout.
// Must stay in sync with NO_HEADER_PATHS_LAYOUT in layout.tsx.

/** Pages that hide the Layout header entirely. */
const APP_NO_HEADER_PATHS = new Set([
  "/charts",                // gesture surface owns the full viewport
  "/position-detail",       // clip-path shared-element covers the full screen
  "/pnl",                   // keep-alive full-viewport UI
  "/trades",                // has its own secondary header
  "/ctrader-integration",   // full-screen detail page with its own custom header
  "/delta-integration",     // full-screen detail page with its own custom header
]);

/**
 * Pages rendered as CSS display-toggle keep-alives — they are never mounted
 * or unmounted via AnimatePresence. Transitions FROM these pages have no
 * AnimatePresence exit animation to wait for, so the header update must be
 * applied immediately (cannot rely on onExitComplete, which won't fire).
 */
const APP_KEEP_ALIVE_PATHS = new Set(["/", "/charts", "/reports", "/pnl", "/markets", "/trades", "/alerts"]);

/**
 * Cover-detail pages — rendered as position:fixed inset:0 zIndex:50 overlays
 * that physically cover the Layout header at all times while active.
 *
 * When navigating AWAY from one of these pages, updating headerVisible
 * immediately is safe: the overlay is still on screen (its 140ms exit animation
 * hasn't finished) and continues to cover any header state change underneath it.
 * Waiting for onExitComplete is wrong here — it lets the header stay visible
 * while the overlay fades out, exposing it behind the entering destination page.
 */
const APP_COVER_DETAIL_PATHS = new Set([
  "/portfolio", "/balances", "/net-pnl",
  // Compositor-slide overlays (position:fixed z:55+) — same immediate-update
  // rule as cover-detail: the overlay is still sliding off-screen during the
  // 210ms close animation, so updating the header immediately is safe.
  "/position-detail", "/ctrader-integration", "/delta-integration",
]);

// Known pathnames — used to decide whether to render NotFound.
const KNOWN_PATHS = new Set([
  "/", "/markets", "/trades", "/brokers", "/alerts", "/reports",
  "/calendar", "/notebook", "/settings",
  "/calc/crypto", "/calc/forex", "/calc/position", "/calc/margin", "/calc/risk",
  "/portfolio", "/balances", "/pnl", "/net-pnl", "/trade", "/ctrader-test", "/charts",
  "/position-detail", "/ctrader-integration", "/delta-integration",
]);

/**
 * Bottom-tab order. The delta between prev and next index determines horizontal
 * slide direction: positive = navigate right (enter from right), negative = navigate left.
 * /charts is intentionally in the list so crossing it counts as a tab transition.
 * /reports is NOT in this list — Dashboard ↔ Reports switching is driven by
 * DashboardSegmentedControl's own click animation (the pill + press feedback),
 * not a page-level slide, so /reports uses the plain "page" transition below.
 */
const TAB_ORDER: string[] = ["/", "/markets", "/charts", "/trades", "/alerts"];

/**
 * PositionDetailWrapper — GPU compositor-thread slide-from-right entrance.
 *
 * Open:  translateX(100%) → translateX(0)   230ms cubic-bezier(0.22,1,0.36,1)
 * Close: translateX(0)    → translateX(100%) 210ms cubic-bezier(0.4,0,0.6,1)
 *
 * Mirrors DeltaIntegrationOverlay / CtraderIntegrationOverlay exactly.
 * Always-mounted once first opened; `open` prop drives open/close.
 * zIndex 55 — above Portfolio/Balances/NetPnl cover-detail pages (50).
 */
function PositionDetailWrapper({ open }: { open: boolean }) {
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      let rafId: number;
      const timerId = setTimeout(() => {
        rafId = requestAnimationFrame(() => setVisible(true));
      }, 0);
      return () => { clearTimeout(timerId); cancelAnimationFrame(rafId); };
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!hasOpenedRef.current) return null;

  return (
    <div
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        55,
        pointerEvents: open ? "auto" : "none",
        background:    "#000000",
        transform:     visible ? "translate3d(0,0,0)" : "translate3d(100%,0,0)",
        transition:    `transform ${visible ? CTRADER_DUR_OPEN : CTRADER_DUR_CLOSE}ms ${visible ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE}`,
        willChange:    "transform",
      }}
      className="transform-gpu"
    >
      <Suspense fallback={null}>
        <PositionDetail />
      </Suspense>
    </div>
  );
}

/**
 * DeltaIntegrationOverlay — full-screen compositor-animated overlay.
 *
 * Mirrors CtraderIntegrationOverlay / NotificationPanel exactly:
 *   Open:  translateX(100%) → translateX(0)   230ms cubic-bezier(0.22,1,0.36,1)
 *   Close: translateX(0)    → translateX(100%) 210ms cubic-bezier(0.4,0,0.6,1)
 *
 * Always mounted once first opened; `open` controls visibility only.
 * z-index 70 — same as NotificationPanel, above MobileBottomNav (60).
 */
function DeltaIntegrationOverlay({ open }: { open: boolean }) {
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      let rafId: number;
      const timerId = setTimeout(() => {
        rafId = requestAnimationFrame(() => setVisible(true));
      }, 0);
      return () => { clearTimeout(timerId); cancelAnimationFrame(rafId); };
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!hasOpenedRef.current) return null;

  return (
    <div
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        70,
        pointerEvents: open ? "auto" : "none",
        background:    "#000000",
        transform:     visible ? "translate3d(0,0,0)" : "translate3d(100%,0,0)",
        transition:    `transform ${visible ? CTRADER_DUR_OPEN : CTRADER_DUR_CLOSE}ms ${visible ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE}`,
        willChange:    "transform",
      }}
      className="transform-gpu"
    >
      <Suspense fallback={null}>
        <DeltaIntegration />
      </Suspense>
    </div>
  );
}

/**
 * CtraderIntegrationOverlay — full-screen compositor-animated overlay.
 *
 * Mirrors NotificationPanel / ProfilePage sub-pages exactly:
 *   Open:  translateX(100%) → translateX(0)   230ms cubic-bezier(0.22,1,0.36,1)
 *   Close: translateX(0)    → translateX(100%) 210ms cubic-bezier(0.4,0,0.6,1)
 *
 * Always mounted once first opened; `open` controls visibility only.
 * z-index 70 — same as NotificationPanel, above MobileBottomNav (60).
 */
const CTRADER_DUR_OPEN  = 230; // ms — matches NotificationPanel / ProfilePage
const CTRADER_DUR_CLOSE = 210; // ms — matches NotificationPanel / ProfilePage

function CtraderIntegrationOverlay({ open }: { open: boolean }) {
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  /* `visible` drives the CSS transition — same double-rAF pattern as
     NotificationPanel: setTimeout(0) pushes past React's commit so the
     browser paints the closed position (translateX(100%)) before we flip
     to the open position, guaranteeing the slide-in fires every tap. */
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      let rafId: number;
      const timerId = setTimeout(() => {
        rafId = requestAnimationFrame(() => setVisible(true));
      }, 0);
      return () => { clearTimeout(timerId); cancelAnimationFrame(rafId); };
    } else {
      setVisible(false);
    }
  }, [open]);

  /* Never mount until first opened — keeps idle memory clean. After that
     the overlay stays mounted so re-opening never re-mounts CtraderWidget. */
  if (!hasOpenedRef.current) return null;

  return (
    <div
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        70,
        pointerEvents: open ? "auto" : "none",
        background:    "#000000",
        transform:     visible ? "translate3d(0,0,0)" : "translate3d(100%,0,0)",
        transition:    `transform ${visible ? CTRADER_DUR_OPEN : CTRADER_DUR_CLOSE}ms ${visible ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE}`,
        willChange:    "transform",
      }}
      className="transform-gpu"
    >
      <Suspense fallback={null}>
        <CtraderIntegration />
      </Suspense>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const isMobile   = useIsMobile();

  // Mount the repeat scheduler — watches alert events and manages follow-up
  // notifications + sounds for all three repeat modes (three_reminders,
  // repeat_until_dismissed, triple_ring). Placed here so it is always active
  // regardless of which page is open.
  useRepeatEngine();

  useEffect(() => {
    // Prefetch Reports' one unique query (stats/equity/weekly are already
    // shared with — and kept warm by — the always-mounted Dashboard). Timed
    // to land just after ReportsPreload mounts the keep-alive subtree, so by
    // the time a user actually taps the Reports card the cache is populated
    // and Reports renders with real data on the very first paint.
    const id = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: getGetSymbolBreakdownQueryKey(),
        queryFn: () => getSymbolBreakdown(),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    // Eagerly preload every route's lazy chunk shortly after the initial render.
    // Previously only Charts was preloaded — every other page stayed unresolved
    // until its route was first visited. Navigating to an unresolved route makes
    // its lazy import suspend *during* the navigation transition; React then keeps
    // the previously-committed page on screen (to avoid a flash of blank content)
    // until the new chunk resolves. That is exactly what produced the bug: the
    // URL/active-tab already pointed at the destination page, but the old page's
    // content kept rendering underneath until its module finished loading —
    // looking like "Dashboard shows Alerts content" or vice versa. Preloading
    // every chunk up front means every route's module is already resolved by the
    // time the user navigates, so Suspense never has anything to wait on and the
    // previous page is never left on screen past its own exit animation.
    const modules = [
      // High-priority: pages with heavy deps, reachable in 1 tap from Dashboard
      () => import("@/pages/pnl-analytics"),
      () => import("@/pages/position-detail"),
      // Tab pages
      () => import("@/pages/charts"),
      () => import("@/pages/dashboard"),
      () => import("@/pages/markets"),
      () => import("@/pages/trades"),
      () => import("@/pages/reports"),
      () => import("@/pages/alerts"),
      // Secondary pages
      () => import("@/pages/calendar"),
      () => import("@/pages/notebook"),
      () => import("@/pages/settings"),
      () => import("@/pages/brokers"),
      () => import("@/pages/calc-crypto"),
      () => import("@/pages/calc-forex"),
      () => import("@/pages/calc-position"),
      () => import("@/pages/calc-margin"),
      () => import("@/pages/calc-risk"),
      () => import("@/pages/NetPnLAnalytics"),
      () => import("@/pages/trade"),
      () => import("@/pages/ctrader-test"),
      () => import("@/pages/ctrader-integration"),
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const id = setTimeout(() => {
      modules.forEach((load, i) => {
        // Stagger slightly so this never competes with the initial route's
        // own network/render work.
        timers.push(setTimeout(() => { load().catch(() => {}); }, i * 30));
      });
    }, 80);
    return () => {
      clearTimeout(id);
      timers.forEach(clearTimeout);
    };
  }, []);

  // Strip query-string so "/portfolio?tab=positions" matches "/portfolio".
  const pathname = location.split("?")[0];

  // ── Direction tracking (synchronous, ref-based) ─────────────────────────
  // Computed during render so the correct direction is available on the very
  // first paint with the new pathname — before any useLayoutEffect would run.
  // prevPathRef tracks the pathname from the previous render.
  const prevPathRef = useRef(pathname);
  const dirRef      = useRef(0);

  if (prevPathRef.current !== pathname) {
    const pi = TAB_ORDER.indexOf(prevPathRef.current);
    const ni = TAB_ORDER.indexOf(pathname);
    // Both routes are tab pages → horizontal slide; otherwise → opacity fade.
    dirRef.current      = (pi !== -1 && ni !== -1) ? (ni > pi ? 1 : -1) : 0;
    prevPathRef.current = pathname;
  }
  const dir = dirRef.current;

  // ── Header-visibility sync ────────────────────────────────────────────────
  //
  // `headerVisible` is passed as a prop to Layout so Layout never computes it
  // from the raw `pathname` (which changes on the same frame as the navigation).
  //
  // The problem with the naive approach:
  //   AnimatePresence mode="wait" keeps the EXITING page alive for PAGE_EXIT
  //   (140 ms). If headerVisible flips the instant pathname changes, the header
  //   resizes while the old page is still animating → visible one-frame shift.
  //
  // The problem with the timer approach (setTimeout 150 ms):
  //   Framer Motion schedules the exit animation to BEGIN on the first RAF
  //   AFTER the React commit (~16 ms). So the exit COMPLETES at
  //   useEffect_time + 16 + 140 = +156 ms, but the timer fires at +150 ms —
  //   6 ms too early — causing an intermittent one-frame glitch on fast frames.
  //
  // The correct approach:
  //   AnimatePresence's `onExitComplete` fires definitively when the last
  //   exiting child has finished its animation — no timing approximation.
  //   We pass `onExitComplete={handleExitComplete}` to the AnimatePresence
  //   below and update `headerPath` only then.
  //
  //   Exception — keep-alive pages (/, /charts, /reports, /pnl) never go
  //   through AnimatePresence, so onExitComplete will not fire for transitions
  //   FROM them. We handle those in a useEffect with an immediate update.
  const [headerPath, setHeaderPath] = useState(pathname);
  // pathnameRef is always the current pathname; read by onExitComplete so its
  // closure never captures a stale value across multiple rapid navigations.
  const pathnameRef       = useRef(pathname);
  // headerPathRef mirrors headerPath state for reading inside useEffect without
  // including headerPath in the dep array (which would cause double-firing).
  const headerPathRef     = useRef(pathname);
  // prevPathnameRef tracks the pathname from the PREVIOUS render so we can
  // detect keep-alive → animated-page transitions in useEffect.
  const prevHdrPathnameRef = useRef(pathname);

  // Keep pathnameRef current on every render (synchronous, no effect needed).
  pathnameRef.current = pathname;

  useEffect(() => {
    const prev = prevHdrPathnameRef.current;
    prevHdrPathnameRef.current = pathname;

    const prevHdrVisible  = !APP_NO_HEADER_PATHS.has(headerPathRef.current);
    const nextHdrVisible  = !APP_NO_HEADER_PATHS.has(pathname);
    const fromKeepAlive   =  APP_KEEP_ALIVE_PATHS.has(prev);
    // Cover-detail pages (Portfolio, Balances, Net-PnL) sit at position:fixed
    // inset:0 zIndex:50 and physically hide the header while active. Any header
    // state change underneath them is invisible, so updating immediately is safe
    // — waiting for onExitComplete lets the header bleed through while the
    // overlay is fading out (the Dashboard-header-flash bug on Portfolio→detail).
    const fromCoverDetail =  APP_COVER_DETAIL_PATHS.has(prev);

    if (prevHdrVisible === nextHdrVisible || fromKeepAlive || fromCoverDetail) {
      // No header change — or the previous page was a keep-alive / cover-detail
      // with no visible consequence to an immediate header update. Apply now.
      headerPathRef.current = pathname;
      setHeaderPath(pathname);
    }
    // Otherwise: onExitComplete fires when FM finishes the exit animation and
    // calls setHeaderPath at exactly the right moment.
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ prevHdrPathnameRef / headerPathRef intentionally omitted: both are refs
  //   (not state), always current, and must not cause the effect to re-fire.

  const handleExitComplete = useCallback(() => {
    const p = pathnameRef.current;
    headerPathRef.current = p;
    setHeaderPath(p);
  }, []); // stable — reads via ref, never captures stale pathname

  const headerVisible = !APP_NO_HEADER_PATHS.has(headerPath);

  // On mobile the fixed bottom nav bar is ~80px tall; pages need that clearance.
  const bp = isMobile ? 80 : 40;

  return (
    // Charts is the only keep-alive node — its LWC chart instance must survive
    // tab switches. Every other page mounts fresh and unmounts on navigation.
    <Layout chartsNode={CHARTS_NODE} dashboardNode={DASHBOARD_NODE} reportsNode={REPORTS_NODE} pnlNode={PNL_NODE} marketsNode={MARKETS_NODE} tradesNode={TRADES_NODE} alertsNode={ALERTS_NODE} headerVisible={headerVisible}>
      {/*
        ── Single AnimatePresence (mode="wait") ────────────────────────────
        All pages — tab pages, sidebar pages, detail pages — live in ONE
        AnimatePresence so only a single page is ever in the DOM at a time.
        This prevents the cross-group stacking bug where a tab page (absolute)
        floated on top of a sidebar page (flow) during their concurrent exit/enter.

        mode="wait": current page fully exits before the next one enters, so
        the previous page is unmounted before the destination page mounts —
        never both at once.

        Each branch below carries its own <Suspense key={pathname}>, keyed by
        the route itself. Previously a single Suspense wrapped the *entire*
        AnimatePresence — if the destination page's lazy chunk hadn't resolved
        yet, that one shared boundary would suspend for the whole tree. React
        avoids flashing blank content by leaving the last *committed* tree
        (the PREVIOUS page) on screen until the new chunk resolves. That is
        what produced the bug: the URL/active tab already pointed at the new
        route, but the old page's DOM (and its stale props/state) kept
        rendering underneath it. Giving each route its own uniquely-keyed
        Suspense boundary means a still-loading destination page suspends
        *only its own* boundary — it can never keep the old page's boundary
        (and therefore its component tree) alive past the exit animation.
        Combined with eager-preloading every route's chunk on mount (see
        above), this boundary should essentially never need to show its
        fallback in practice — it exists purely as a correctness backstop.

        All PageTransitions use position:absolute;inset:0 — they fill the
        absolute container in layout.tsx and layer correctly.

        `custom={dir}` at the AP level so the EXITING page reads the correct
        direction even after pathname has changed. `initial={false}` skips
        the enter animation on the very first load.
      */}
      <AnimatePresence mode="wait" custom={dir} initial={false} onExitComplete={handleExitComplete}>
        {/* ── Tab pages — direction-aware fade-shift ──
             Dashboard ("/"), Markets ("/markets"), Trades ("/trades"), and
             Alerts ("/alerts") are intentionally NOT rendered here — they are
             permanently-mounted keep-alive nodes (see DASHBOARD_NODE /
             MARKETS_NODE / TRADES_NODE / ALERTS_NODE in Layout), exactly like
             Charts and Reports. They never enter/exit this AnimatePresence;
             switching to them is an instant display:flex toggle on an already
             fully-rendered tree — no lazy-chunk suspension, no blank flash,
             no data re-fetch on every tab visit. */}

        {/* ── Sidebar / utility pages — fade + slide-up ──
             /reports is intentionally NOT branched here — it is a
             permanently-mounted keep-alive node (REPORTS_NODE / Layout),
             exactly like Dashboard and Charts. It never enters/exits this
             AnimatePresence; switching to/from it is an instant
             display:flex toggle driven by DashboardSegmentedControl. */}
        {pathname === "/brokers"       && <Suspense key="/brokers"       fallback={<PageLoader />}><PageTransition key="/brokers"      custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/brokers"><Brokers     /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calendar"      && <Suspense key="/calendar"      fallback={<PageLoader />}><PageTransition key="/calendar"     custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calendar"><Calendar    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/notebook"      && <Suspense key="/notebook"      fallback={<PageLoader />}><PageTransition key="/notebook"     custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/notebook"><Notebook    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/settings"      && <Suspense key="/settings"      fallback={<PageLoader />}><PageTransition key="/settings"     custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/settings"><Settings    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/crypto"   && <Suspense key="/calc/crypto"   fallback={<PageLoader />}><PageTransition key="/calc/crypto"  custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/crypto"><CalcCrypto  /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/forex"    && <Suspense key="/calc/forex"    fallback={<PageLoader />}><PageTransition key="/calc/forex"   custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/forex"><CalcForex   /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/position" && <Suspense key="/calc/position" fallback={<PageLoader />}><PageTransition key="/calc/position"custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/position"><CalcPosition/></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/margin"   && <Suspense key="/calc/margin"   fallback={<PageLoader />}><PageTransition key="/calc/margin"  custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/margin"><CalcMargin  /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/risk"     && <Suspense key="/calc/risk"     fallback={<PageLoader />}><PageTransition key="/calc/risk"    custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/risk"><CalcRisk    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/trade"         && <Suspense key="/trade"         fallback={<PageLoader />}><PageTransition key="/trade"        custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/trade"><Trade       /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/ctrader-test"         && <Suspense key="/ctrader-test"         fallback={<PageLoader />}><PageTransition key="/ctrader-test"         custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/ctrader-test"><CtraderTest /></StandardPageWrapper></PageTransition></Suspense>}

        {/* ── 404 ── */}
        {!KNOWN_PATHS.has(pathname)    && <Suspense key="not-found" fallback={<PageLoader />}><PageTransition key="not-found"  custom={dir}><StandardPageWrapper bottomPad={bp} pathname="not-found"><NotFound    /></StandardPageWrapper></PageTransition></Suspense>}
      </AnimatePresence>

      {/* ── Cover-detail pages — own AnimatePresence (no mode="wait") so they mount
           INSTANTLY on pathname change, covering the layout from frame 1 before the
           header can start collapsing. All three share identical enter/exit animations
           (variant="cover-detail") and are fully interchangeable visually. */}
      <AnimatePresence initial={false}>
        {pathname === "/portfolio"        && <PageTransition key="/portfolio"        variant="cover-detail" custom={dir} style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000" }}><Portfolio /></PageTransition>}
        {pathname === "/balances"         && <PageTransition key="/balances"         variant="cover-detail" custom={dir} style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000" }}><Balances  /></PageTransition>}
        {pathname === "/net-pnl"          && <Suspense fallback={<PageLoader />}><PageTransition key="/net-pnl" variant="cover-detail" custom={dir} style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000" }}><NetPnl /></PageTransition></Suspense>}
      </AnimatePresence>

      {/* ── Cover-scale pages — CSS compositor animation, outside AnimatePresence ── */}
      {/* /pnl is a keep-alive node (PNL_NODE) rendered in Layout — not here */}
      <PositionDetailWrapper open={pathname === "/position-detail"} />

      {/* ── cTrader integration — compositor translateX slide (mirrors NotificationPanel).
           Always-mounted once first visited; open/close driven by URL only.
           z-index 70 (same as NotificationPanel) — above MobileBottomNav (60). */}
      <CtraderIntegrationOverlay open={pathname === "/ctrader-integration"} />

      {/* ── Delta integration — same compositor translateX slide as cTrader. */}
      <DeltaIntegrationOverlay open={pathname === "/delta-integration"} />
    </Layout>
  );
}

function App() {
  useEffect(() => { popupManager.init(); }, []);
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <LiveMarketProvider>
        <NotificationsProvider>
          <WatchlistProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                {/* Splash screen: shows once per session, dismissed after ~1.6 s */}
                <SplashScreen />
                <Router />
              </WouterRouter>
              <Toaster />
              <SonnerToaster
                position="top-center"
                theme="dark"
                toastOptions={{
                  unstyled: true,
                  classNames: {
                    toast: "glass",
                    title: "text-sm font-semibold text-white",
                    description: "text-xs text-white/60 mt-0.5",
                    success: "glass",
                    error: "glass",
                    icon: "text-white/80",
                  },
                  style: { padding: "14px 18px", minWidth: 260 },
                }}
              />
            </TooltipProvider>
          </WatchlistProvider>
        </NotificationsProvider>
      </LiveMarketProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
