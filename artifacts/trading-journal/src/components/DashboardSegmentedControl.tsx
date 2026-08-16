import { memo, useEffect } from "react";
import { useLocation } from "wouter";
import { COMPOSITOR_EASE } from "@/animations/motion";

const TABS = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "reports", label: "Reports", href: "/reports" },
] as const;

const DashboardSegmentedControl = memo(function DashboardSegmentedControl() {
  const [location, navigate] = useLocation();
  const pathname = location.split("?")[0];
  const activeKey = pathname === "/reports" ? "reports" : "dashboard";

  useEffect(() => {
    import("@/pages/dashboard").catch(() => {});
    import("@/pages/reports").catch(() => {});
  }, []);

  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className="dash-segment-bar relative w-full grid grid-cols-2"
      style={{
        height: 46,
        borderRadius: 12,
        padding: 4,
        contain: "layout paint",
        background: "#111214",
        backgroundImage: "none",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)",
        filter: "none",
        WebkitFilter: "none",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        className="absolute top-1 left-1"
        style={{
          width: "calc(50% - 4px)",
          height: "calc(100% - 8px)",
          borderRadius: 9,
          background: "#202124",
          backgroundImage: "none",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
          filter: "none",
          WebkitFilter: "none",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          transform: `translate3d(${activeKey === "reports" ? "100%" : "0%"}, 0, 0)`,
          transition: `transform 200ms ${COMPOSITOR_EASE}`,
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />

      {TABS.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onPointerDown={(e) => {
              e.preventDefault();
              if (tab.href !== pathname) navigate(tab.href);
            }}
            className={`relative z-10 flex items-center justify-center text-[14px] font-semibold transition-[color,background,transform] duration-150 ease-out active:scale-[0.96] rounded-[9px] w-full h-full ${selected ? "dash-segment-btn-active" : "dash-segment-btn-idle"}`}
            style={{
              color: selected ? "#F5F5F5" : "#8A8F98",
              willChange: "transform",
              touchAction: "manipulation",
              background: "transparent",
              boxShadow: "none",
              filter: "none",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});

export default DashboardSegmentedControl;
