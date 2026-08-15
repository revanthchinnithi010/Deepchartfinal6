import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";

export function MobileBottomNav() {
  const [location] = useLocation();
  const { unreadCount } = useNotifications();
  const mobileChartFullscreen = useChartStore(s => s.mobileChartFullscreen);
  const { theme } = useTheme();
  const isLight = theme === "light";
  const shellRef = useRef<HTMLDivElement>(null);

  const activeIdx = TABS.findIndex(t => t.kind === "link" && t.href === location);
  const [visualIdx, setVisualIdx] = useState(activeIdx >= 0 ? activeIdx : 0);

  useEffect(() => {
    if (activeIdx >= 0 && !mobileChartFullscreen) setVisualIdx(activeIdx);
  }, [activeIdx, mobileChartFullscreen]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const host = shell?.parentElement;
    if (!host) return;

    const background = isLight ? "#f8fafc" : "#05070a";
    const important = (property: string, value: string) => host.style.setProperty(property, value, "important");

    /*
     * This is deliberately applied to Layout's OUTER fixed host, not the pill.
     * index.css contains legacy light-mode :has(...) rules with !important;
     * normal inline styles cannot beat those declarations. The host therefore
     * has to be explicitly owned at the same cascade level as those rules.
     */
    important("position", "fixed");
    important("left", "0");
    important("right", "0");
    important("bottom", "0");
    important("width", "100%");
    important("height", `calc(${NAV_H}px + ${SAFE_BOTTOM})`);
    important("box-sizing", "border-box");
    important("padding", `0 0 ${SAFE_BOTTOM}`);
    important("background", background);
    important("background-image", "none");
    important("border", "0");
    important("border-radius", "0");
    important("box-shadow", "none");
    important("filter", "none");
    important("-webkit-filter", "none");
    important("backdrop-filter", "none");
    important("-webkit-backdrop-filter", "none");
    important("mix-blend-mode", "normal");
    important("opacity", "1");
    important("isolation", "isolate");
    important("overflow", "hidden");
    important("transform", "none");
    important("contain", "paint");
    important("z-index", "45");
  }, [isLight]);

  const shellBg = isLight ? "#f8fafc" : "#05070a";
  const pillBg = isLight ? "#ffffff" : "rgba(5,5,8,0.82)";
  const pillBorder = isLight ? "1px solid #e2e8f0" : "none";
  const pillShadow = isLight ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.40)";
  const activeIconColor = isLight ? "#111827" : "#ffffff";
  const inactiveIconColor = isLight ? "#64748b" : "rgba(148,163,184,0.44)";
  const activeLabelColor = isLight ? "#111827" : "rgba(255,255,255,0.92)";
  const inactiveLabelColor = isLight ? "#64748b" : "rgba(148,163,184,0.40)";
  const badgeBorder = isLight ? "#ffffff" : "rgba(5,5,8,0.9)";

  return (
    <div
      ref={shellRef}
      className="tj-mobile-nav-shell"
      data-theme={isLight ? "light" : "dark"}
      style={{
        flexShrink: 0,
        width: "100%",
        height: NAV_H,
        minHeight: NAV_H,
        boxSizing: "border-box",
        padding: "2px 14px 10px",
        background: shellBg,
        position: "relative",
        boxShadow: "none",
        filter: "none",
        WebkitFilter: "none",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        isolation: "isolate",
        contain: "none",
        transform: "none",
        overflow: "hidden",
      }}
    >
      <div
        className="tj-mobile-nav-pill"
        style={{
          height: BAR_H,
          borderRadius: 9999,
          padding: 0,
          width: "100%",
          background: pillBg,
          border: pillBorder,
          boxShadow: pillShadow,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          boxSizing: "border-box",
          filter: "none",
          WebkitFilter: "none",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          isolation: "isolate",
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
              style={{ flex: 1, display: "flex", textDecoration: "none", WebkitTapHighlightColor: "transparent", outline: "none", position: "relative", zIndex: 10 } as React.CSSProperties}
            >
              <motion.div
                className="tj-mobile-nav-tab"
                whileTap={{ scale: 0.97 }}
                transition={TAP_TRANSITION}
                style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", userSelect: "none", filter: "none", WebkitFilter: "none" }}
              >
                <motion.div animate={{ scale: active ? 1.12 : 1 }} transition={tweenFast} style={{ position: "relative", filter: "none", WebkitFilter: "none" }}>
                  <tab.Icon style={{ width: 22, height: 22, flexShrink: 0, color: active ? activeIconColor : inactiveIconColor, transition: "color 0.22s ease", display: "block", filter: "none" }} />
                  {badge > 0 && (
                    <span style={{ position: "absolute", top: -5, right: -6, minWidth: 14, height: 14, borderRadius: 9999, background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", lineHeight: 1, padding: "0 3px", border: `1.5px solid ${badgeBorder}`, pointerEvents: "none" }}>
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
  );
}
