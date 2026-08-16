import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { TAP_TRANSITION, tweenFast } from "@/animations/motion";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Globe, ArrowLeftRight, BarChart2, Bell } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useChartStore } from "@/store/chartStore";
import { useTheme } from "@/contexts/ThemeContext";

type NavTab =
  | { kind: "link"; href: string; label: string; Icon: React.ElementType }
  | { kind: "action"; label: string; Icon: React.ElementType; onTap: () => void };

const TABS: NavTab[] = [
  { kind: "link", href: "/", label: "Home", Icon: LayoutDashboard },
  { kind: "link", href: "/markets", label: "Markets", Icon: Globe },
  { kind: "link", href: "/trades", label: "Trade", Icon: ArrowLeftRight },
  { kind: "link", href: "/charts", label: "Charts", Icon: BarChart2 },
  { kind: "link", href: "/alerts", label: "Alerts", Icon: Bell },
];

// Slightly taller than the previous compact bar, while keeping the flat
// full-width Instagram-style navigation layout.
const BAR_H = 66;
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";
const NAV_Z = "2147483647";

export function MobileBottomNav() {
  const [location] = useLocation();
  const { unreadCount } = useNotifications();
  const mobileChartFullscreen = useChartStore(s => s.mobileChartFullscreen);
  const dashboardSheetOpen = useChartStore(s => s.dashboardSheetOpen);
  const { theme } = useTheme();
  const isLight = theme === "light";
  const hostRef = useRef<HTMLDivElement>(null);

  const hidden = mobileChartFullscreen || dashboardSheetOpen;
  const activeIdx = TABS.findIndex(t => t.kind === "link" && t.href === location);
  const [visualIdx, setVisualIdx] = useState(activeIdx >= 0 ? activeIdx : 0);

  useEffect(() => {
    if (activeIdx >= 0 && !mobileChartFullscreen) setVisualIdx(activeIdx);
  }, [activeIdx, mobileChartFullscreen]);

  // Mobile browsers can suspend the WebSocket/timer stack while the app is in
  // the background. When the user returns to an already-open Charts route,
  // force a complete navigation so CustomChart starts from fresh REST OHLC +
  // a new live stream instead of resuming a stale in-memory series.
  useEffect(() => {
    let wasHidden = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
        return;
      }
      if (document.visibilityState === "visible" && wasHidden && location === "/charts") {
        wasHidden = false;
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [location]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const setImportant = (property: string, value: string) => host.style.setProperty(property, value, "important");

    setImportant("position", "fixed");
    setImportant("left", "0");
    setImportant("right", "0");
    setImportant("bottom", "0");
    setImportant("width", "100%");
    setImportant("height", `calc(${BAR_H}px + ${SAFE_BOTTOM})`);
    setImportant("box-sizing", "border-box");
    setImportant("padding", `0 0 ${SAFE_BOTTOM}`);
    setImportant("background", "transparent");
    setImportant("background-color", "transparent");
    setImportant("background-image", "none");
    setImportant("border", "0");
    setImportant("border-radius", "0");
    setImportant("box-shadow", "none");
    setImportant("-webkit-box-shadow", "none");
    setImportant("filter", "none");
    setImportant("-webkit-filter", "none");
    setImportant("backdrop-filter", "none");
    setImportant("-webkit-backdrop-filter", "none");
    setImportant("mix-blend-mode", "normal");
    setImportant("opacity", hidden ? "0" : "1");
    setImportant("visibility", hidden ? "hidden" : "visible");
    setImportant("pointer-events", hidden ? "none" : "auto");
    setImportant("isolation", "auto");
    setImportant("contain", "none");
    setImportant("clip-path", "none");
    setImportant("-webkit-clip-path", "none");
    setImportant("transform", "none");
    setImportant("will-change", "auto");
    setImportant("z-index", NAV_Z);
    setImportant("overflow", "visible");

    const body = document.body;
    const html = document.documentElement;
    const pageBg = isLight ? "#f8fafc" : "#000000";
    body.style.setProperty("background", pageBg, "important");
    body.style.setProperty("background-color", pageBg, "important");
    body.style.setProperty("background-image", "none", "important");
    body.style.setProperty("box-shadow", "none", "important");
    body.style.setProperty("filter", "none", "important");
    body.style.setProperty("backdrop-filter", "none", "important");
    html.style.setProperty("background", pageBg, "important");
    html.style.setProperty("background-color", pageBg, "important");
    html.style.setProperty("background-image", "none", "important");
  }, [hidden, isLight]);

  if (typeof document === "undefined") return null;

  const barBg = isLight ? "#ffffff" : "#0d0d0d";
  const barBorder = isLight ? "1px solid #e2e8f0" : "1px solid rgba(255,255,255,0.07)";
  const activeIconColor = isLight ? "#111827" : "#ffffff";
  const inactiveIconColor = isLight ? "#64748b" : "rgba(148,163,184,0.52)";
  const activeLabelColor = isLight ? "#111827" : "rgba(255,255,255,0.92)";
  const inactiveLabelColor = isLight ? "#64748b" : "rgba(148,163,184,0.48)";
  const badgeBorder = isLight ? "#ffffff" : "#0d0d0d";

  return createPortal(
    <div
      ref={hostRef}
      className="tj-mobile-nav-host"
      data-theme={isLight ? "light" : "dark"}
      aria-hidden={hidden}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: `calc(${BAR_H}px + ${SAFE_BOTTOM})`,
        boxSizing: "border-box",
        padding: `0 0 ${SAFE_BOTTOM}`,
        background: "transparent",
        backgroundColor: "transparent",
        backgroundImage: "none",
        border: 0,
        borderRadius: 0,
        boxShadow: "none",
        filter: "none",
        WebkitFilter: "none",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        mixBlendMode: "normal",
        opacity: hidden ? 0 : 1,
        visibility: hidden ? "hidden" : "visible",
        pointerEvents: hidden ? "none" : "auto",
        isolation: "auto",
        contain: "none",
        clipPath: "none",
        transform: "none",
        willChange: "auto",
        zIndex: 2147483647,
        overflow: "visible",
      }}
    >
      <div
        className="tj-mobile-nav-container"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: SAFE_BOTTOM,
          width: "100%",
          height: BAR_H,
          minHeight: BAR_H,
          boxSizing: "border-box",
          padding: 0,
          background: barBg,
          backgroundColor: barBg,
          backgroundImage: "none",
          borderTop: barBorder,
          borderBottom: 0,
          borderLeft: 0,
          borderRight: 0,
          borderRadius: 0,
          boxShadow: "none",
          filter: "none",
          WebkitFilter: "none",
          backdropFilter: "none",
          isolation: "auto",
          contain: "none",
          transform: "none",
          overflow: "visible",
        }}
      >
        <div
          className="tj-mobile-nav-pill"
          style={{
            height: BAR_H,
            borderRadius: 0,
            padding: 0,
            margin: 0,
            width: "100%",
            background: barBg,
            backgroundColor: barBg,
            backgroundImage: "none",
            border: 0,
            boxShadow: "none",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            boxSizing: "border-box",
            filter: "none",
            WebkitFilter: "none",
            backdropFilter: "none",
            isolation: "auto",
          }}
        >
          {TABS.map((tab, idx) => {
            const active = idx === visualIdx;
            const isAlerts = tab.kind === "link" && tab.href === "/alerts";
            const badge = isAlerts && unreadCount > 0 ? unreadCount : 0;
            return (
              <Link
                key={tab.kind === "link" ? tab.href : `action-${idx}`}
                href={tab.kind === "link" ? tab.href : "/"}
                onClick={(event) => {
                  if (tab.kind === "link" && tab.href === "/charts") {
                    // Do not let the keep-alive Charts page resume stale state.
                    // A full navigation gives us a new CustomChart instance and
                    // a clean historical OHLC + WebSocket lifecycle every time.
                    event.preventDefault();
                    window.location.assign("/charts");
                  }
                }}
                style={{ flex: 1, display: "flex", textDecoration: "none", WebkitTapHighlightColor: "transparent", outline: "none", position: "relative", zIndex: 10 } as React.CSSProperties}
              >
                <motion.div
                  className="tj-mobile-nav-tab"
                  whileTap={{ scale: 0.97 }}
                  transition={TAP_TRANSITION}
                  style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", userSelect: "none", filter: "none", WebkitFilter: "none" }}
                >
                  <motion.div animate={{ scale: active ? 1.08 : 1 }} transition={tweenFast} style={{ position: "relative", filter: "none", WebkitFilter: "none" }}>
                    <tab.Icon style={{ width: 22, height: 22, flexShrink: 0, color: active ? activeIconColor : inactiveIconColor, transition: "color 0.22s ease", display: "block", filter: "none" }} />
                    {badge > 0 && (
                      <span style={{ position: "absolute", top: -5, right: -6, minWidth: 14, height: 14, borderRadius: 9999, background: "#ef4444", boxShadow: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", lineHeight: 1, padding: "0 3px", border: `1.5px solid ${badgeBorder}`, pointerEvents: "none" }}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </motion.div>
                  <span style={{ fontSize: 10, lineHeight: 1, fontWeight: active ? 600 : 400, color: active ? activeLabelColor : inactiveLabelColor, letterSpacing: active ? "0.04em" : "0.01em", transition: "color 0.22s ease", whiteSpace: "nowrap" }}>
                    {tab.label}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
