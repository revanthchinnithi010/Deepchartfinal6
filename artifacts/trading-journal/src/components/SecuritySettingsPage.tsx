/**
 * SecuritySettingsPage — account security overview sub-page.
 *
 * NAVIGATION: pure controlled component, same convention as its siblings
 * (AppearanceSettingsPage, NotificationsSettingsPage). ProfilePage owns the
 * history stack; this component only renders when open=true and calls
 * onClose() for its Back button (= ProfilePage's popPage = history.back()).
 */

import React, { memo, useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock, KeyRound, ShieldCheck, Smartphone } from "lucide-react";

import { COMPOSITOR_EASE as EASE_OPEN, COMPOSITOR_EASE_CLOSE as EASE_CLOSE } from "@/animations/motion";
const DUR_OPEN  = 240;
const DUR_CLOSE = 210;

const ROW_HEIGHT  = 72;
const ICON_SIZE   = 52;
const ROW_GAP     = 16;
const ROW_PADDING = 24;
const DIVIDER_INSET = ROW_PADDING + ICON_SIZE + ROW_GAP;

function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
      textTransform: "uppercase",
      padding: first ? "24px 24px 10px" : "32px 24px 10px",
      color: "rgba(148,163,184,0.40)",
      lineHeight: 1,
    }}>
      {children}
    </p>
  );
}

const Divider = () => (
  <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: DIVIDER_INSET }} />
);

function Row({
  icon: Icon, iconBg, iconColor, label, rightContent, last,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  label: string; rightContent?: React.ReactNode; last?: boolean;
}) {
  return (
    <>
      <div style={{
        display: "flex", alignItems: "center",
        padding: `0 ${ROW_PADDING}px`, height: ROW_HEIGHT, width: "100%",
        gap: ROW_GAP,
      }}>
        <div style={{
          width: ICON_SIZE, height: ICON_SIZE, borderRadius: 16, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: iconBg,
        }}>
          <Icon style={{ width: 22, height: 22, color: iconColor }} />
        </div>
        <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)" }}>
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {rightContent}
        </div>
      </div>
      {!last && <Divider />}
    </>
  );
}

export interface SecuritySettingsPageProps {
  open:    boolean;
  onClose: () => void;
}

export const SecuritySettingsPage = memo(function SecuritySettingsPage({
  open, onClose,
}: SecuritySettingsPageProps) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

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
      <header style={{
        height: 60, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 12px",
        background: "#000000",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button onClick={onClose} aria-label="Back" style={{
          width: 40, height: 40, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.09)",
          color: "rgba(255,255,255,0.72)",
          cursor: "pointer",
        }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
          Security
        </span>
        <div style={{ width: 40 }} />
      </header>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
        <SectionLabel first>Account Protection</SectionLabel>

        <Row
          icon={Lock}
          iconBg="rgba(52,211,153,0.14)"
          iconColor="#34d399"
          label="Password"
          rightContent={<span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>Set</span>}
        />

        <Row
          icon={Smartphone}
          iconBg="rgba(139,92,246,0.14)"
          iconColor="#a78bfa"
          label="Two-Factor Authentication"
          rightContent={<span style={{ fontSize: 13, color: "rgba(148,163,184,0.40)" }}>Off</span>}
        />

        <Row
          icon={KeyRound}
          iconBg="rgba(234,179,8,0.14)"
          iconColor="#fde047"
          label="API Keys"
          rightContent={<span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>Managed in Connections</span>}
        />

        <Row
          icon={ShieldCheck}
          iconBg="rgba(96,165,250,0.14)"
          iconColor="#60a5fa"
          label="Active Sessions"
          rightContent={<span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>1 device</span>}
          last
        />

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
});
