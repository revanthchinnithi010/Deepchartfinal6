/**
 * AppearanceSettingsPage — theme picker sub-page.
 *
 * NAVIGATION: pure controlled component. No pushState, no popstate listeners.
 * ProfilePage owns the history stack. This component just:
 *   - Renders when open=true
 *   - Calls onClose() when the Back button is pressed
 *     (onClose = ProfilePage's popPage = history.back() → ProfilePage handles)
 *
 * ANIMATION: GPU-only CSS translateX transition, same as sibling pages.
 */

import React, { memo, useEffect, useRef, useState } from "react";
import { ArrowLeft, Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeMode } from "@/contexts/ThemeContext";

import { COMPOSITOR_EASE as EASE_OPEN, COMPOSITOR_EASE_CLOSE as EASE_CLOSE } from "@/animations/motion";
const DUR_OPEN  = 240;
const DUR_CLOSE  = 210;

const OPTIONS: {
  mode: ThemeMode; label: string; sub: string;
  Icon: React.ElementType; iconColor: string; iconBg: string;
}[] = [
  { mode: "light",  label: "Light",          sub: "Always use light theme",   Icon: Sun,     iconColor: "#fbbf24", iconBg: "rgba(245,158,11,0.14)"  },
  { mode: "dark",   label: "Dark",           sub: "Always use dark theme",    Icon: Moon,    iconColor: "#a78bfa", iconBg: "rgba(139,92,246,0.14)"  },
  { mode: "system", label: "System Default", sub: "Follow device preference", Icon: Monitor, iconColor: "#60a5fa", iconBg: "rgba(59,130,246,0.14)"  },
];

export interface AppearanceSettingsPageProps {
  open:    boolean;
  onClose: () => void;
}

export const AppearanceSettingsPage = memo(function AppearanceSettingsPage({
  open, onClose,
}: AppearanceSettingsPageProps) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);
  const [pressedMode, setPressedMode] = useState<ThemeMode | null>(null);

  const { themeMode, setThemeMode } = useTheme();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* ── Lifecycle ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (open) {
      setRendered(true);
      let rafId: number;
      const id = setTimeout(() => { rafId = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(id); cancelAnimationFrame(rafId); };
    } else {
      setVisible(false);
      const id = setTimeout(() => setRendered(false), DUR_CLOSE + 40);
      return () => clearTimeout(id);
    }
  }, [open]);

  /* ── ESC → go back (calls onClose = ProfilePage's popPage) ─────────────── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!rendered) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 202,
      background: "#000000",
      transform:  visible ? "translateX(0)" : "translateX(100%)",
      transition: visible
        ? `transform ${DUR_OPEN}ms ${EASE_OPEN}`
        : `transform ${DUR_CLOSE}ms ${EASE_CLOSE}`,
      willChange: "transform",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      display: "flex", flexDirection: "column", overflow: "hidden",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        height: 60, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 12px",
        background: "#000000",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button
          onClick={onClose}
          aria-label="Back"
          style={{
            width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.72)",
            cursor: "pointer",
          }}
        >
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
          Appearance
        </span>
        <div style={{ width: 40 }} />
      </header>

      {/* ── Section label ───────────────────────────────────────────────────── */}
      <p style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
        textTransform: "uppercase",
        padding: "24px 24px 10px",
        color: "rgba(148,163,184,0.40)",
        lineHeight: 1,
      }}>
        Theme
      </p>

      {/* ── Options ─────────────────────────────────────────────────────────── */}
      {OPTIONS.map(({ mode, label, sub, Icon, iconColor, iconBg }, i) => {
        const active  = themeMode === mode;
        const pressed = pressedMode === mode;
        return (
          <React.Fragment key={mode}>
            <button
              onPointerDown={() => setPressedMode(mode)}
              onPointerUp={  () => setPressedMode(null)}
              onPointerLeave={() => setPressedMode(null)}
              onClick={() => setThemeMode(mode)}
              style={{
                display: "flex", alignItems: "center",
                padding: "0 24px",
                height: 68,
                width: "100%",
                background: pressed ? "rgba(255,255,255,0.04)" : "transparent",
                border: "none",
                cursor: "pointer",
                gap: 16,
                transition: "background 60ms",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: iconBg,
              }}>
                <Icon style={{ width: 18, height: 18, color: iconColor }} />
              </div>

              <div style={{ flex: 1, textAlign: "left" }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)", lineHeight: 1.3 }}>
                  {label}
                </p>
                <p style={{ fontSize: 12, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
                  {sub}
                </p>
              </div>

              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                border: active ? "none" : "2px solid rgba(255,255,255,0.20)",
                background: active ? "#a5b4fc" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "background 120ms, border-color 120ms",
              }}>
                {active && <Check style={{ width: 11, height: 11, color: "#1e1b4b", strokeWidth: 3 }} />}
              </div>
            </button>

            {i < OPTIONS.length - 1 && (
              <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 80 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
});
