import { memo, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, X, ChevronUp, ChevronDown,
} from "lucide-react";
import type { OHLCBar } from "@/store/chartStore";

interface ReplayControlsProps {
  currentBar: OHLCBar | null;
  playing: boolean;
  speed: number;
  currentIdx: number;
  totalBars: number;
  interval: string;
  onPlay: () => void;
  onPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (s: number) => void;
  onExit: () => void;
}

const SPEEDS = [0.5, 1, 2, 5, 10, 20];

function fmtReplayDate(ts: number, interval: string): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  if (interval === "D" || interval === "W") return date;
  return `${date}  ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export const ReplayControls = memo(function ReplayControls({
  currentBar, playing, speed, currentIdx, totalBars, interval,
  onPlay, onPause, onStepBack, onStepForward, onSpeedChange, onExit,
}: ReplayControlsProps) {
  const [showSpeeds, setShowSpeeds] = useState(false);
  const atStart = currentIdx <= 0;
  const atEnd   = currentIdx >= totalBars - 1;
  const dateStr = currentBar ? fmtReplayDate(currentBar.time, interval) : "—";

  return (
    <div style={{
      position:          "absolute",
      bottom:            28,
      left:              "50%",
      transform:         "translateX(-50%)",
      zIndex:            50,
      display:           "flex",
      alignItems:        "center",
      gap:               2,
      background:        "rgba(7,17,13,0.97)",
      border:            "1px solid rgba(183,255,90,0.22)",
      borderRadius:      14,
      padding:           "5px 8px",
      boxShadow:         "0 8px 44px rgba(0,0,0,0.75), 0 0 0 1px rgba(183,255,90,0.07)",
      backdropFilter:    "blur(28px)",
      WebkitBackdropFilter: "blur(28px)",
      userSelect:        "none",
      pointerEvents:     "all",
      whiteSpace:        "nowrap",
    }}>

      {/* ── Date/time display ── */}
      <div style={{
        padding: "0 12px 0 6px", height: 32,
        display: "flex", alignItems: "center",
        borderRight: "1px solid rgba(183,255,90,0.1)", marginRight: 4,
        gap: 6,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: playing ? "#B7FF5A" : "rgba(183,255,90,0.35)",
          boxShadow: playing ? "0 0 6px #B7FF5A" : "none",
          transition: "all .3s",
        }} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#B7FF5A",
          fontFamily: "monospace", letterSpacing: "0.04em",
        }}>
          {dateStr}
        </span>
      </div>

      {/* ── Step back ── */}
      <RpBtn title="Step back (←)" onClick={onStepBack} disabled={atStart}>
        <SkipBack style={{ width: 13, height: 13 }} />
      </RpBtn>

      {/* ── Play / Pause ── */}
      <button
        title={playing ? "Pause" : "Play"}
        onClick={playing ? onPause : onPlay}
        disabled={atEnd && !playing}
        style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: playing ? "rgba(183,255,90,0.18)" : "rgba(183,255,90,0.1)",
          border: `1.5px solid ${playing ? "rgba(183,255,90,0.4)" : "rgba(183,255,90,0.22)"}`,
          cursor: (atEnd && !playing) ? "default" : "pointer",
          opacity: (atEnd && !playing) ? 0.4 : 1,
          color: "#B7FF5A", outline: "none",
          transition: "all .12s",
          boxShadow: playing ? "0 0 12px rgba(183,255,90,0.2)" : "none",
        }}
        onMouseEnter={e => { if (!atEnd || playing) (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.24)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = playing ? "rgba(183,255,90,0.18)" : "rgba(183,255,90,0.1)"; }}
      >
        {playing
          ? <Pause style={{ width: 15, height: 15 }} />
          : <Play  style={{ width: 15, height: 15, marginLeft: 1 }} />
        }
      </button>

      {/* ── Step forward ── */}
      <RpBtn title="Step forward (→)" onClick={onStepForward} disabled={atEnd}>
        <SkipForward style={{ width: 13, height: 13 }} />
      </RpBtn>

      {/* ── Divider ── */}
      <div style={{ width: 1, height: 22, background: "rgba(183,255,90,0.1)", margin: "0 4px" }} />

      {/* ── Speed selector ── */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setShowSpeeds(v => !v)}
          style={{
            height: 32, padding: "0 9px", borderRadius: 8,
            display: "flex", alignItems: "center", gap: 4,
            background: "rgba(183,255,90,0.06)",
            border: "1px solid rgba(183,255,90,0.14)",
            cursor: "pointer", outline: "none",
            color: "rgba(200,228,204,0.85)",
            fontSize: 11, fontWeight: 700,
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.12)"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.06)"}
        >
          <span style={{ minWidth: 22, textAlign: "center" }}>×{speed}</span>
          {showSpeeds
            ? <ChevronDown style={{ width: 9, height: 9 }} />
            : <ChevronUp   style={{ width: 9, height: 9 }} />}
        </button>

        {showSpeeds && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(7,17,13,0.97)",
            border: "1px solid rgba(183,255,90,0.15)",
            borderRadius: 9, overflow: "hidden", zIndex: 70,
            boxShadow: "0 8px 28px rgba(0,0,0,0.65)",
            minWidth: 64,
          }}>
            {SPEEDS.map(s => (
              <button key={s} onClick={() => { onSpeedChange(s); setShowSpeeds(false); }}
                style={{
                  width: "100%", padding: "7px 12px",
                  background: s === speed ? "rgba(183,255,90,0.1)" : "none",
                  border: "none", cursor: "pointer",
                  textAlign: "center", display: "block",
                  color: s === speed ? "#B7FF5A" : "rgba(200,228,204,0.8)",
                  fontSize: 11, fontWeight: s === speed ? 700 : 500,
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.08)"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = s === speed ? "rgba(183,255,90,0.1)" : "transparent"}
              >
                ×{s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Progress ── */}
      <div style={{ padding: "0 8px", display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "rgba(167,184,169,0.45)", fontFamily: "monospace" }}>
          {currentIdx + 1} / {totalBars}
        </span>
      </div>

      {/* ── Exit ── */}
      <div style={{ width: 1, height: 22, background: "rgba(183,255,90,0.1)", margin: "0 2px 0 4px" }} />
      <button
        title="Exit replay (Esc)"
        onClick={onExit}
        style={{
          width: 30, height: 30, borderRadius: 7,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent",
          border: "1px solid transparent",
          cursor: "pointer", outline: "none",
          color: "rgba(248,113,113,0.7)",
          transition: "all .1s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.1)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.25)";
          (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,113,113,0.7)";
        }}
      >
        <X style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
});

function RpBtn({ title, onClick, disabled, children }: {
  title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent", border: "1px solid transparent",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.3 : 1,
        transition: "all .1s", outline: "none",
        color: "rgba(183,220,190,0.8)",
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.08)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(183,255,90,0.15)";
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
      }}
    >
      {children}
    </button>
  );
}

export default ReplayControls;
