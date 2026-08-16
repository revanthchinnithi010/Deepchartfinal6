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

const BAR_H = 62;
const NAV_H = 76;
// Keep the footer plane exactly as tall as the navigation shell. Previously this
// was 112px, which left an unnecessary blank 36px strip above the pill.
const FOOTER_PLANE_H = NAV_H;
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

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const setImportant = (property: string, value: string) => host.style.setProperty(property, value, "important");

    setImportant("position", "fixed");
    setImportant("left", "0");
    setImportant("right", "0");
    setImportant("bottom", "0");
    setImportant("width", "100%");
    setImportant("height", `calc(${FOOTER_PLANE_H}px + ${SAFE_BOTTOM})`);
    setImportant("box-sizing", "border-box");
    setImportant("padding", `0 0 ${SAFE_BOTTOM}`);
    setImportant("background", isLight ? "#f8fafc" : "#05070a");
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
    setImportant("isolation", "isolate");
    setImportant("contain", "none");
    setImportant("clip-path", "none");
    setImportant("-webkit-clip-path", "none");
    setImportant("transform", "none");
    setImportant("will-change", "auto");
    setImportant("z-index", NAV_Z);
    setImportant("overflow", "hidden");
  }, [isLight, hidden]);

  if (typeof document === "undefined") return null;

  const shellBg = isLight ? "#f8fafc" : "#05070a";
  const pillBg = isLight ? "#ffffff" : "rgba(5,5,8,0.82)";
  const pillBorder = isLight ? "1px solid #e2e8f0" : "none";
  const pillShadow = isLight ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.40)";
  const activeIconColor = isLight ? "#111827" : "#ffffff";
  const inactiveIconColor = isLight ? "#64748b" : "rgba(148,163,184,0.44)";
  const activeLabelColor = isLight ? "#111827" : "rgba(255,255,255,0.92)";
  const inactiveLabelColor = isLight ? "#64748b" : "rgba(148,163,184,0.40)";
  const badgeBorder = isLight ? "#ffffff" : "rgba(5,5,8,0.9)";

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
        height: `calc(${FOOTER_PLANE_H}px + ${SAFE_BOTTOM})`,
        boxSizing: "border-box",
        padding: `0 0 ${SAFE_BOTTOM}`,
        background: shellBg,
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
        isolation: "isolate",
        contain: "none",
        clipPath: "none",
        transform: "none",
        willChange: "auto",
        zIndex: 2147483647,
        overflow: "hidden",
      }}
    >
      <div className="tj-mobile-nav-shell" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: `calc(${NAV_H}px + ${SAFE_BOTTOM})`, minHeight: NAV_H, boxSizing: "border-box", padding: "2px 14px 10px", background: shellBg, boxShadow: "none", filter: "none", WebkitFilter: "none", backdropFilter: "none", WebkitBackdropFilter: "none", isolation: "isolate", contain: "none", transform: "none", overflow: "hidden" }}>
        <div className="tj-mobile-nav-pill" style={{ height: BAR_H, borderRadius: 9999, padding: 0, width: "100%", background: pillBg, border: pillBorder, boxShadow: pillShadow, position: "relative", overflow: "hidden", display: "flex", boxSizing: "border-box", filter: "none", WebkitFilter: "none", backdropFilter: "none", WebkitBackdropFilter: "none", isolation: "isolate" }}>
          {TABS.map((tab, idx) => {
            const active = idx === visualIdx;
            const isAlerts = tab.kind === "link" && tab.href === "/alerts";
            const badge = isAlerts && unreadCount > 0 ? unreadCount : 0;
            return (
              <Link key={tab.kind === "link" ? tab.href : `action-${idx}`} href={tab.kind === "link" ? tab.href : "/"} style={{ flex: 1, display: "flex", textDecoration: "none", WebkitTapHighlightColor: "transparent", outline: "none", position: "relative", zIndex: 10 } as React.CSSProperties}>
                <motion.div className="tj-mobile-nav-tab" whileTap={{ scale: 0.97 }} transition={TAP_TRANSITION} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", userSelect: "none", filter: "none", WebkitFilter: "none" }}>
                  <motion.div animate={{ scale: active ? 1.12 : 1 }} transition={tweenFast} style={{ position: "relative", filter: "none", WebkitFilter: "none" }}>
                    <tab.Icon style={{ width: 22, height: 22, flexShrink: 0, color: active ? activeIconColor : inactiveIconColor, transition: "color 0.22s ease", display: "block", filter: "none" }} />
                    {badge > 0 && <span style={{ position: "absolute", top: -5, right: -6, minWidth: 14, height: 14, borderRadius: 9999, background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", lineHeight: 1, padding: "0 3px", border: `1.5px solid ${badgeBorder}`, pointerEvents: "none" }}>{badge > 99 ? "99+" : badge}</span>}
                  </motion.div>
                  <span style={{ fontSize: 10, lineHeight: 1, fontWeight: active ? 600 : 400, color: active ? activeLabelColor : inactiveLabelColor, letterSpacing: active ? "0.04em" : "0.01em", transition: "color 0.22s ease", whiteSpace: "nowrap" }}>{tab.label}</span>
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
