/**
 * ProfileSettingsPage — premium flat-list settings overlay.
 *
 * NAVIGATION: pure controlled component. No pushState, no popstate listeners.
 * ProfilePage (the parent) owns the entire navigation stack for the profile
 * session. This component just renders when open=true and calls:
 *   onClose()             → to go back to Profile (ProfilePage calls history.back())
 *   onOpenAppearance()    → to push Appearance onto the stack
 *   onOpenNotifications() → to push Notifications onto the stack
 *
 * ANIMATION ENGINE: pure CSS transitions on `transform: translateX` only.
 * GPU compositor thread — zero JS frame budget consumed during animation.
 *
 *   Enter: translateX(+100%) → translateX(0)   240ms cubic-bezier(0.22,1,0.36,1)
 *   Exit:  translateX(0)     → translateX(+100%) 210ms cubic-bezier(0.4,0,0.6,1)
 */

import React, { memo, useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  Palette, Bell, Database, Activity, Globe, Server,
  LogOut, ChevronRight, Copy, Check, RefreshCw,
  ShieldCheck, Info,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useBrokerStore } from "@/store/brokerStore";

/* ─── animation ────────────────────────────────────────────────────────────── */

import { COMPOSITOR_EASE as EASE_OPEN, COMPOSITOR_EASE_CLOSE as EASE_CLOSE } from "@/animations/motion";
const DUR_OPEN  = 240;
const DUR_CLOSE = 210;

const BASE = (import.meta as { env: { BASE_URL: string } }).env.BASE_URL.replace(/\/$/, "");

/* ─── live-data types ───────────────────────────────────────────────────────── */

type DbStatus    = "connected" | "error" | "loading";
type DeltaStatus = "connected" | "reconnecting" | "disconnected" | "loading";

interface LiveData {
  db:         DbStatus;
  dbLatency:  number | null;
  delta:      DeltaStatus;
  ip:         string | null;
  ipLoading:  boolean;
}

/* ─── StatusDot ─────────────────────────────────────────────────────────────── */

function StatusDot({ status }: { status: "ok" | "warn" | "error" | "loading" }) {
  const COLOR = {
    ok:      "#34d399",
    warn:    "#fbbf24",
    error:   "#f87171",
    loading: "#94a3b8",
  }[status];
  const pulse = status === "ok" || status === "warn";
  return (
    <span style={{
      display: "inline-block",
      width: 7, height: 7, borderRadius: "50%",
      background: COLOR,
      boxShadow: pulse ? `0 0 6px ${COLOR}` : "none",
      flexShrink: 0,
    }} />
  );
}

/* ─── SectionLabel ──────────────────────────────────────────────────────────── */

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

/* ─── Divider ───────────────────────────────────────────────────────────────── */

const ROW_HEIGHT  = 72;
const ICON_SIZE   = 40;
const ROW_GAP     = 16;
const ROW_PADDING = 24;
const DIVIDER_INSET = ROW_PADDING + ICON_SIZE + ROW_GAP; // aligns with title start

const Divider = () => (
  <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: DIVIDER_INSET }} />
);

/* ─── SignOutRow ────────────────────────────────────────────────────────────── */

function SignOutRow({ onClick }: { onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={  () => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center",
        padding: `0 ${ROW_PADDING}px`, height: ROW_HEIGHT, width: "100%",
        background: pressed ? "rgba(239,68,68,0.06)" : "transparent",
        border: "none", cursor: "pointer", gap: ROW_GAP,
        transition: "background 60ms",
      }}
    >
      <div style={{
        width: ICON_SIZE, height: ICON_SIZE, borderRadius: 16, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(239,68,68,0.10)",
      }}>
        <LogOut style={{ width: 20, height: 20, color: "#f87171" }} />
      </div>
      <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, color: "#f87171" }}>
        Sign Out
      </span>
    </button>
  );
}

/* ─── NavRow ────────────────────────────────────────────────────────────────── */

function NavRow({
  icon: Icon, iconBg, iconColor,
  label, rightContent, onClick, last,
}: {
  icon: React.ElementType;
  iconBg: string; iconColor: string;
  label: string;
  rightContent?: React.ReactNode;
  onClick: () => void;
  last?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <button
        onPointerDown={() => setPressed(true)}
        onPointerUp={  () => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={onClick}
        style={{
          display: "flex", alignItems: "center",
          padding: `0 ${ROW_PADDING}px`, height: ROW_HEIGHT, width: "100%",
          background: pressed ? "rgba(255,255,255,0.04)" : "transparent",
          border: "none", cursor: "pointer", gap: ROW_GAP,
          transition: "background 60ms",
        }}
      >
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
          <ChevronRight style={{ width: 16, height: 16, color: "rgba(148,163,184,0.30)" }} />
        </div>
      </button>
      {!last && <Divider />}
    </>
  );
}

/* ─── InfoRow (no chevron, no navigation) ───────────────────────────────────── */

function InfoRow({
  icon: Icon, iconBg, iconColor,
  label, rightContent, onClick, last,
}: {
  icon: React.ElementType;
  iconBg: string; iconColor: string;
  label: string;
  rightContent?: React.ReactNode;
  onClick?: () => void;
  last?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <div
        onPointerDown={() => onClick && setPressed(true)}
        onPointerUp={  () => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={onClick}
        style={{
          display: "flex", alignItems: "center",
          padding: `0 ${ROW_PADDING}px`, height: ROW_HEIGHT, width: "100%",
          background: pressed ? "rgba(255,255,255,0.04)" : "transparent",
          cursor: onClick ? "pointer" : "default",
          gap: ROW_GAP,
          transition: "background 60ms",
        }}
      >
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

/* ─── props ─────────────────────────────────────────────────────────────────── */

export interface ProfileSettingsPageProps {
  open:                boolean;
  onClose:             () => void;
  onOpenAppearance:    () => void;
  onOpenNotifications: () => void;
  onOpenSecurity:      () => void;
  onOpenAbout:         () => void;
}

/* ─── main component ─────────────────────────────────────────────────────────── */

export const ProfileSettingsPage = memo(function ProfileSettingsPage({
  open, onClose, onOpenAppearance, onOpenNotifications, onOpenSecurity, onOpenAbout,
}: ProfileSettingsPageProps) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);

  const { themeMode } = useTheme();
  const ctraderStatus = useBrokerStore(s => s.brokerStatuses["ctrader"] ?? "disconnected");

  /* live data */
  const [live, setLive] = useState<LiveData>({
    db: "loading", dbLatency: null,
    delta: "loading",
    ip: null, ipLoading: true,
  });
  const [copied, setCopied] = useState(false);

  const mountedRef  = useRef(true);
  const onCloseRef  = useRef(onClose);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  /* ── fetch live status ──────────────────────────────────────────────────── */
  const fetchStatus = useCallback(async () => {
    try {
      const [health, delta] = await Promise.all([
        fetch(`${BASE}/api/health`).then(r => r.ok ? r.json() : null).catch(() => null) as Promise<{
          database?: { connected: boolean; latencyMs: number | null };
        } | null>,
        fetch(`${BASE}/api/delta/status`).then(r => r.ok ? r.json() : null).catch(() => null) as Promise<{
          connected?: boolean; status?: string;
        } | null>,
      ]);
      if (!mountedRef.current) return;
      setLive(p => ({
        ...p,
        db:        health?.database?.connected ? "connected" : "error",
        dbLatency: health?.database?.latencyMs ?? null,
        delta:     delta?.connected ? "connected"
                 : delta?.status === "reconnecting" ? "reconnecting"
                 : "disconnected",
      }));
    } catch { /* ignore */ }
  }, []);

  const fetchIp = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/my-ip`).then(r => r.ok ? r.json() : null).catch(() => null) as {
        ip?: string;
      } | null;
      if (!mountedRef.current) return;
      setLive(p => ({ ...p, ip: res?.ip ?? null, ipLoading: false }));
    } catch {
      if (mountedRef.current) setLive(p => ({ ...p, ipLoading: false }));
    }
  }, []);

  /* ── mount/unmount lifecycle ────────────────────────────────────────────── */
  useEffect(() => {
    if (open) {
      setRendered(true);
      let rafId: number;
      const id = setTimeout(() => { rafId = requestAnimationFrame(() => setVisible(true)); }, 0);
      fetchStatus();
      fetchIp();
      pollRef.current = setInterval(fetchStatus, 15_000);
      return () => {
        clearTimeout(id);
        cancelAnimationFrame(rafId);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };
    } else {
      setVisible(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      const id = setTimeout(() => setRendered(false), DUR_CLOSE + 40);
      return () => clearTimeout(id);
    }
  }, [open, fetchStatus, fetchIp]);

  /* ── ESC → go back (calls onClose which is ProfilePage's popPage) ───────── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  /* ── copy IP ────────────────────────────────────────────────────────────── */
  const copyIp = useCallback(async () => {
    if (!live.ip) return;
    try {
      await navigator.clipboard.writeText(live.ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [live.ip]);

  /* ── derived display values ─────────────────────────────────────────────── */
  const themeName = themeMode === "light" ? "Light" : themeMode === "system" ? "System" : "Dark";

  const dbDot: "ok" | "error" | "loading" =
    live.db === "connected" ? "ok" : live.db === "loading" ? "loading" : "error";
  const dbLabel =
    live.db === "connected" ? `Connected${live.dbLatency != null ? ` · ${live.dbLatency}ms` : ""}`
    : live.db === "loading"  ? "Checking…"
    : "Unavailable";

  const deltaDot: "ok" | "warn" | "error" | "loading" =
    live.delta === "connected"    ? "ok"
    : live.delta === "reconnecting" ? "warn"
    : live.delta === "loading"      ? "loading"
    : "error";
  const deltaLabel =
    live.delta === "connected"     ? "Live"
    : live.delta === "reconnecting" ? "Reconnecting…"
    : live.delta === "loading"      ? "Checking…"
    : "Offline";

  const ctraderDot: "ok" | "warn" | "error" =
    ctraderStatus === "connected"   ? "ok"
    : ctraderStatus === "connecting" ? "warn"
    : "error";
  const ctraderLabel =
    ctraderStatus === "connected"   ? "Connected"
    : ctraderStatus === "connecting" ? "Connecting…"
    : "Disconnected";

  if (!rendered) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 201,
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
      {/* ── Header ──────────────────────────────────────────────────────── */}
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
          Settings
        </span>
        <div style={{ width: 40 }} />
      </header>

      {/* ── Scrollable list ──────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}>

        {/* ── GENERAL ─────────────────────────────────────────────────────── */}
        <SectionLabel first>General</SectionLabel>

        <NavRow
          icon={Palette}
          iconBg="rgba(139,92,246,0.14)"
          iconColor="#a78bfa"
          label="Appearance"
          rightContent={
            <span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>{themeName}</span>
          }
          onClick={onOpenAppearance}
        />

        <NavRow
          icon={Bell}
          iconBg="rgba(245,158,11,0.14)"
          iconColor="#fbbf24"
          label="Notifications"
          onClick={onOpenNotifications}
          last
        />

        {/* ── CONNECTIONS ──────────────────────────────────────────────────── */}
        <SectionLabel>Connections</SectionLabel>

        {/* Database Status */}
        <InfoRow
          icon={Database}
          iconBg="rgba(59,130,246,0.14)"
          iconColor="#60a5fa"
          label="Database"
          rightContent={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot status={dbDot} />
              <span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>{dbLabel}</span>
              <button
                onClick={e => { e.stopPropagation(); fetchStatus(); }}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 2,
                  color: "rgba(148,163,184,0.35)", display: "flex", alignItems: "center",
                }}
                aria-label="Refresh"
              >
                <RefreshCw style={{ width: 12, height: 12 }} />
              </button>
            </div>
          }
        />

        {/* Delta Exchange Status */}
        <InfoRow
          icon={Activity}
          iconBg="rgba(16,185,129,0.14)"
          iconColor="#34d399"
          label="Delta Exchange"
          rightContent={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot status={deltaDot} />
              <span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>{deltaLabel}</span>
            </div>
          }
        />

        {/* cTrader Status */}
        <InfoRow
          icon={Server}
          iconBg="rgba(96,165,250,0.14)"
          iconColor="#60a5fa"
          label="cTrader"
          rightContent={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot status={ctraderDot} />
              <span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>{ctraderLabel}</span>
            </div>
          }
        />

        {/* Backend Server IP */}
        <InfoRow
          icon={Globe}
          iconBg="rgba(234,179,8,0.14)"
          iconColor="#fde047"
          label="Backend Server"
          onClick={live.ip ? copyIp : undefined}
          rightContent={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {live.ipLoading ? (
                <span style={{ fontSize: 13, color: "rgba(148,163,184,0.40)" }}>Loading…</span>
              ) : live.ip ? (
                <>
                  <span style={{ fontSize: 12, color: "rgba(148,163,184,0.65)", fontFamily: "monospace" }}>
                    {live.ip}
                  </span>
                  {copied
                    ? <Check style={{ width: 14, height: 14, color: "#34d399" }} />
                    : <Copy  style={{ width: 14, height: 14, color: "rgba(148,163,184,0.40)" }} />
                  }
                </>
              ) : (
                <span style={{ fontSize: 13, color: "rgba(148,163,184,0.40)" }}>Unavailable</span>
              )}
            </div>
          }
          last
        />

        {/* ── ACCOUNT ──────────────────────────────────────────────────────── */}
        <SectionLabel>Account</SectionLabel>

        <NavRow
          icon={ShieldCheck}
          iconBg="rgba(52,211,153,0.14)"
          iconColor="#34d399"
          label="Security"
          onClick={onOpenSecurity}
        />

        <NavRow
          icon={Info}
          iconBg="rgba(148,163,184,0.14)"
          iconColor="#cbd5e1"
          label="About"
          onClick={onOpenAbout}
          last
        />

        <div style={{ height: 8 }} />

        <SignOutRow onClick={onClose} />

        {/* Bottom breathing room */}
        <div style={{ height: 40 }} />
      </div>
    </div>
  );
});
