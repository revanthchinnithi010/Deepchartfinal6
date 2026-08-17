import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { TAP_TRANSITION, tweenFast } from "@/animations/motion";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Globe, ArrowLeftRight, BarChart2, Bell, Loader2 } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useChartStore } from "@/store/chartStore";
import { useTheme } from "@/contexts/ThemeContext";

type NavTab = { kind: "link"; href: string; label: string; Icon: React.ElementType };

const TABS: NavTab[] = [
  { kind: "link", href: "/", label: "Home", Icon: LayoutDashboard },
  { kind: "link", href: "/markets", label: "Markets", Icon: Globe },
  { kind: "link", href: "/trades", label: "Trade", Icon: ArrowLeftRight },
  { kind: "link", href: "/charts", label: "Charts", Icon: BarChart2 },
  { kind: "link", href: "/alerts", label: "Alerts", Icon: Bell },
];

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
  const [chartLoading, setChartLoading] = useState(false);

  const hidden = mobileChartFullscreen || dashboardSheetOpen;
  const activeIdx = TABS.findIndex(t => t.href === location);
  const [visualIdx, setVisualIdx] = useState(activeIdx >= 0 ? activeIdx : 0);

  useEffect(() => {
    if (activeIdx >= 0 && !mobileChartFullscreen) setVisualIdx(activeIdx);
  }, [activeIdx, mobileChartFullscreen]);

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (href !== "/charts") return;
    e.preventDefault();
    if (chartLoading) return;
    setChartLoading(true);
    window.setTimeout(() => {
      if (location === "/charts") window.location.reload();
      else window.location.assign("/charts");
    }, 350);
  };

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const setImportant = (property: string, value: string) => host.style.setProperty(property, value, "important");
    setImportant("position", "fixed"); setImportant("left", "0"); setImportant("right", "0"); setImportant("bottom", "0");
    setImportant("width", "100%"); setImportant("height", `calc(${BAR_H}px + ${SAFE_BOTTOM})`); setImportant("box-sizing", "border-box");
    setImportant("padding", `0 0 ${SAFE_BOTTOM}`); setImportant("background", "transparent"); setImportant("background-color", "transparent");
    setImportant("background-image", "none"); setImportant("border", "0"); setImportant("border-radius", "0"); setImportant("box-shadow", "none");
    setImportant("filter", "none"); setImportant("-webkit-filter", "none"); setImportant("backdrop-filter", "none");
    setImportant("-webkit-backdrop-filter", "none"); setImportant("mix-blend-mode", "normal"); setImportant("opacity", hidden ? "0" : "1");
    setImportant("visibility", hidden ? "hidden" : "visible"); setImportant("pointer-events", hidden ? "none" : "auto");
    setImportant("isolation", "auto"); setImportant("contain", "none"); setImportant("clip-path", "none"); setImportant("-webkit-clip-path", "none");
    setImportant("transform", "none"); setImportant("will-change", "auto"); setImportant("z-index", NAV_Z); setImportant("overflow", "visible");

    const body = document.body;
    const html = document.documentElement;
    const pageBg = isLight ? "#f8fafc" : "#000000";
    body.style.setProperty("background", pageBg, "important"); body.style.setProperty("background-color", pageBg, "important");
    body.style.setProperty("background-image", "none", "important"); body.style.setProperty("box-shadow", "none", "important");
    body.style.setProperty("filter", "none", "important"); body.style.setProperty("backdrop-filter", "none", "important");
    html.style.setProperty("background", pageBg, "important"); html.style.setProperty("background-color", pageBg, "important"); html.style.setProperty("background-image", "none", "important");
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
    <>
      <div ref={hostRef} className="tj-mobile-nav-host" data-theme={isLight ? "light" : "dark"} aria-hidden={hidden} style={{ position: "fixed", left: 0, right: 0, bottom: 0, width: "100%", height: `calc(${BAR_H}px + ${SAFE_BOTTOM})`, boxSizing: "border-box", padding: `0 0 ${SAFE_BOTTOM}`, background: "transparent", opacity: hidden ? 0 : 1, visibility: hidden ? "hidden" : "visible", pointerEvents: hidden ? "none" : "auto", zIndex: 2147483646, overflow: "visible" }}>
        <div className="tj-mobile-nav-container" style={{ position: "absolute", left: 0, right: 0, bottom: SAFE_BOTTOM, width: "100%", height: BAR_H, boxSizing: "border-box", background: barBg, borderTop: barBorder }}>
          <div className="tj-mobile-nav-pill" style={{ height: BAR_H, width: "100%", background: barBg, display: "flex", overflow: "hidden" }}>
            {TABS.map((tab, idx) => {
              const active = idx === visualIdx;
              const isAlerts = tab.href === "/alerts";
              const badge = isAlerts && unreadCount > 0 ? unreadCount : 0;
              return (
                <Link key={tab.href} href={tab.href} onClick={(e) => handleNavClick(e, tab.href)} style={{ flex: 1, display: "flex", textDecoration: "none", WebkitTapHighlightColor: "transparent", outline: "none", position: "relative", zIndex: 10 }}>
                  <motion.div className="tj-mobile-nav-tab" whileTap={{ scale: 0.97 }} transition={TAP_TRANSITION} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", userSelect: "none" }}>
                    <motion.div animate={{ scale: active ? 1.08 : 1 }} transition={tweenFast} style={{ position: "relative" }}>
                      <tab.Icon style={{ width: 22, height: 22, flexShrink: 0, color: active ? activeIconColor : inactiveIconColor, transition: "color 0.22s ease", display: "block" }} />
                      {badge > 0 && <span style={{ position: "absolute", top: -5, right: -6, minWidth: 14, height: 14, borderRadius: 9999, background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", lineHeight: 1, padding: "0 3px", border: `1.5px solid ${badgeBorder}`, pointerEvents: "none" }}>{badge > 99 ? "99+" : badge}</span>}
                    </motion.div>
                    <span style={{ fontSize: 10, lineHeight: 1, fontWeight: active ? 600 : 400, color: active ? activeLabelColor : inactiveLabelColor, letterSpacing: active ? "0.04em" : "0.01em", transition: "color 0.22s ease", whiteSpace: "nowrap" }}>{tab.label}</span>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      {chartLoading && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: isLight ? "#f8fafc" : "#000000", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <Loader2 style={{ width: 34, height: 34, color: isLight ? "#111827" : "#ffffff", animation: "spin 0.8s linear infinite" }} />
          <span style={{ color: isLight ? "#111827" : "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: 600 }}>Loading Charts…</span>
        </div>
      )}
    </>,
    document.body,
  );
}
