/**
 * NotificationsSettingsPage — alert sound, ringtone, duration settings + Telegram Alerts.
 *
 * NAVIGATION: pure controlled component. No pushState, no popstate listeners.
 * ProfilePage owns the history stack. This component:
 *   - Renders when open=true
 *   - Calls onClose() for its Back button (= ProfilePage's popPage = history.back())
 *   - Calls onOpenPicker(name) to push a picker page onto the stack
 *   - Receives pickerPage ("picker_sound" | "picker_duration" | null) from ProfilePage
 *   - Calls onClosePicker() from picker's Back button (= ProfilePage's popPage)
 *
 * All preferences persisted to localStorage under "tj_notification_prefs".
 */

import React, { memo, useEffect, useRef, useState, useCallback } from "react";
import { COMPOSITOR_EASE } from "@/animations/motion";
import {
  ArrowLeft, Volume2, VolumeX, Music, Timer, ChevronRight, Check,
  Upload, Trash2, Play, FileAudio, AlertCircle,
  Send, Eye, EyeOff, Loader2, WifiOff, Bot, Lock,
  ChevronDown, ClipboardPaste, CheckCircle2, XCircle, Info, Zap,
} from "lucide-react";

import { COMPOSITOR_EASE as EASE_OPEN, COMPOSITOR_EASE_CLOSE as EASE_CLOSE } from "@/animations/motion";
import {
  saveCustomRingtone,
  clearCustomRingtone,
  getCustomRingtoneName,
  hasCustomRingtone,
  playNotificationSound,
} from "@/lib/notificationManager";

const DUR_OPEN  = 240;
const DUR_CLOSE = 210;

const LS_KEY = "tj_notification_prefs";

const SOUNDS    = ["Default", "Chime", "Ping", "Bell", "Ding", "Custom"] as const;
const DURATIONS = ["3 seconds", "5 seconds", "10 seconds", "30 seconds"] as const;
type SoundType    = typeof SOUNDS[number];
type DurationType = typeof DURATIONS[number];

interface NotifPrefs {
  soundEnabled: boolean;
  sound:        SoundType;
  duration:     DurationType;
}

function loadPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { soundEnabled: true, sound: "Default", duration: "5 seconds", ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { soundEnabled: true, sound: "Default", duration: "5 seconds" };
}

function savePrefs(p: NotifPrefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/* ── PickerPage — pure controlled list picker ────────────────────────────────
   No history manipulation — open/close is driven entirely by ProfilePage's
   navStack via the pickerPage prop.                                           */

function PickerPage<T extends string>({
  open, onClose, title, options, selected, onSelect,
}: {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  options:  readonly T[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);
  const [pressed,  setPressed]  = useState<T | null>(null);
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

  /* ESC → go back */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!rendered) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 204,
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
          color: "rgba(255,255,255,0.72)", cursor: "pointer",
        }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
          {title}
        </span>
        <div style={{ width: 40 }} />
      </header>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
          textTransform: "uppercase",
          padding: "24px 24px 10px",
          color: "rgba(148,163,184,0.40)", lineHeight: 1,
        }}>
          Select {title}
        </p>

        {options.map((opt, i) => {
          const active    = selected === opt;
          const isPressed = pressed === opt;
          const isCustom  = opt === "Custom";
          return (
            <React.Fragment key={opt}>
              <button
                onPointerDown={() => setPressed(opt)}
                onPointerUp={  () => setPressed(null)}
                onPointerLeave={() => setPressed(null)}
                onClick={() => { onSelect(opt); onClose(); }}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "0 24px", height: 64, width: "100%",
                  background: isPressed ? "rgba(255,255,255,0.04)" : "transparent",
                  border: "none", cursor: "pointer", gap: 16,
                  transition: "background 60ms",
                }}
              >
                {isCustom && (
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(139,92,246,0.18)",
                    border: "1px solid rgba(139,92,246,0.30)",
                  }}>
                    <Upload style={{ width: 13, height: 13, color: "#a78bfa" }} />
                  </div>
                )}
                <div style={{ flex: 1, textAlign: "left" }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.88)", display: "block" }}>
                    {isCustom ? "Custom (MP3)" : opt}
                  </span>
                  {isCustom && (
                    <span style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", display: "block", marginTop: 2 }}>
                      Upload your own ringtone file
                    </span>
                  )}
                </div>
                {active && (
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "#a5b4fc",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Check style={{ width: 11, height: 11, color: "#1e1b4b", strokeWidth: 3 }} />
                  </div>
                )}
              </button>
              {i < options.length - 1 && (
                <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 24 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ── Toggle row ─────────────────────────────────────────────────────────── */
function ToggleRow({
  icon: Icon, iconColor, iconBg, label, sub, value, onChange, showDivider,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; sub?: string; value: boolean;
  onChange: (v: boolean) => void; showDivider: boolean;
}) {
  return (
    <>
      <button
        onClick={() => onChange(!value)}
        style={{
          display: "flex", alignItems: "center",
          padding: "0 24px", height: 68, width: "100%",
          background: "transparent", border: "none", cursor: "pointer", gap: 16,
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
          <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)", lineHeight: 1.3 }}>{label}</p>
          {sub && <p style={{ fontSize: 12, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>{sub}</p>}
        </div>
        <div style={{
          width: 46, height: 26, borderRadius: 13, flexShrink: 0,
          background: value ? "#a5b4fc" : "rgba(255,255,255,0.12)",
          position: "relative",
          transition: "background 200ms",
        }}>
          <div style={{
            position: "absolute",
            top: 3, left: value ? 23 : 3,
            width: 20, height: 20, borderRadius: "50%",
            background: value ? "#1e1b4b" : "rgba(255,255,255,0.70)",
            transition: `left 200ms ${COMPOSITOR_EASE}`,
          }} />
        </div>
      </button>
      {showDivider && <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 80 }} />}
    </>
  );
}

/* ── Nav row ────────────────────────────────────────────────────────────── */
function NavRow({
  icon: Icon, iconColor, iconBg, label, value, onClick, showDivider, disabled,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; value?: string; onClick: () => void;
  showDivider: boolean; disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <button
        onPointerDown={() => !disabled && setPressed(true)}
        onPointerUp={  () => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={onClick}
        disabled={disabled}
        style={{
          display: "flex", alignItems: "center",
          padding: "0 24px", height: 68, width: "100%",
          background: pressed ? "rgba(255,255,255,0.04)" : "transparent",
          border: "none", cursor: disabled ? "default" : "pointer", gap: 16,
          transition: "background 60ms",
          opacity: disabled ? 0.40 : 1,
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: iconBg,
        }}>
          <Icon style={{ width: 18, height: 18, color: iconColor }} />
        </div>
        <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)" }}>
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {value && <span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>{value}</span>}
          <ChevronRight style={{ width: 16, height: 16, color: "rgba(148,163,184,0.30)" }} />
        </div>
      </button>
      {showDivider && <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 80 }} />}
    </>
  );
}

/* ── Custom ringtone upload section ──────────────────────────────────────── */
interface CustomUploadSectionProps {
  disabled: boolean;
  onFileUploaded: () => void;
}

function CustomUploadSection({ disabled, onFileUploaded }: CustomUploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]   = useState<string | null>(() => getCustomRingtoneName());
  const [fileReady, setFileReady] = useState(() => hasCustomRingtone());
  const [error, setError]         = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [dropOver,  setDropOver]  = useState(false);

  const handleFile = useCallback((file: File) => {
    setError(null);

    if (!file.type.includes("mpeg") && !file.name.toLowerCase().endsWith(".mp3")) {
      setError("Only MP3 files are supported.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large. Maximum size is 5 MB (yours: ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      saveCustomRingtone(dataUrl, file.name);
      setFileName(file.name);
      setFileReady(true);
      setUploading(false);
      onFileUploaded();
    };
    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }, [onFileUploaded]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so same file can be re-selected
    e.target.value = "";
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleClear = useCallback(() => {
    clearCustomRingtone();
    setFileName(null);
    setFileReady(false);
    setError(null);
    onFileUploaded();
  }, [onFileUploaded]);

  const handlePreview = useCallback(() => {
    if (playing) return;
    setPlaying(true);
    playNotificationSound();
    // Reset playing state after a generous window
    setTimeout(() => setPlaying(false), 3000);
  }, [playing]);

  return (
    <div style={{
      margin: "0 16px 4px",
      borderRadius: 16,
      border: "1px solid rgba(139,92,246,0.22)",
      background: "rgba(139,92,246,0.06)",
      overflow: "hidden",
      opacity: disabled ? 0.4 : 1,
      pointerEvents: disabled ? "none" : "auto",
      transition: "opacity 200ms",
    }}>
      {/* Section label */}
      <div style={{
        padding: "14px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <FileAudio style={{ width: 14, height: 14, color: "#a78bfa", flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(148,163,184,0.55)" }}>
          Custom Ringtone
        </span>
      </div>

      {fileReady && fileName ? (
        /* ── Uploaded state ─────────────────────────────── */
        <div style={{ padding: "14px 16px" }}>
          {/* Filename row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.07)",
            marginBottom: 10,
          }}>
            <FileAudio style={{ width: 16, height: 16, color: "#a78bfa", flexShrink: 0 }} />
            <span style={{
              flex: 1, fontSize: 13, fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {fileName}
            </span>
            {/* Preview button */}
            <button
              onClick={handlePreview}
              title="Preview"
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: playing ? "rgba(165,180,252,0.20)" : "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.10)",
                cursor: "pointer", transition: "background 150ms",
              }}
            >
              <Play style={{ width: 12, height: 12, color: playing ? "#a5b4fc" : "rgba(255,255,255,0.65)" }} />
            </button>
            {/* Delete button */}
            <button
              onClick={handleClear}
              title="Remove"
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.18)",
                cursor: "pointer", transition: "background 150ms",
              }}
            >
              <Trash2 style={{ width: 12, height: 12, color: "#f87171" }} />
            </button>
          </div>

          {/* Replace link */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: "none", border: "none", padding: 0,
              fontSize: 12, color: "#a78bfa", cursor: "pointer",
              textDecoration: "underline", textDecorationColor: "rgba(167,139,250,0.4)",
              textUnderlineOffset: 3,
            }}
          >
            Replace with a different file
          </button>
        </div>
      ) : (
        /* ── Drop / upload state ────────────────────────── */
        <div
          onDragOver={e => { e.preventDefault(); setDropOver(true); }}
          onDragLeave={() => setDropOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            padding: "24px 16px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            cursor: uploading ? "wait" : "pointer",
            borderRadius: 12,
            border: `2px dashed ${dropOver ? "rgba(167,139,250,0.65)" : "rgba(139,92,246,0.25)"}`,
            margin: 12,
            background: dropOver ? "rgba(139,92,246,0.10)" : "transparent",
            transition: "border-color 150ms, background 150ms",
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(139,92,246,0.15)",
            border: "1px solid rgba(139,92,246,0.30)",
          }}>
            {uploading
              ? <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  border: "2px solid rgba(167,139,250,0.30)",
                  borderTopColor: "#a78bfa",
                  animation: "spin 0.7s linear infinite",
                }} />
              : <Upload style={{ width: 20, height: 20, color: "#a78bfa" }} />
            }
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.80)", margin: 0 }}>
            {uploading ? "Reading file…" : "Tap to upload MP3"}
          </p>
          <p style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", margin: 0, textAlign: "center" }}>
            {uploading ? "Please wait" : "MP3 format · max 5 MB"}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "10px 14px 14px",
        }}>
          <AlertCircle style={{ width: 14, height: 14, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        onChange={handleInputChange}
        style={{ display: "none" }}
        aria-hidden
      />

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Telegram section ────────────────────────────────────────────────────── */

const TG          = "#29b6f6";
const TG_BG       = "rgba(41,182,246,0.10)";
const TG_BORDER   = "rgba(41,182,246,0.22)";
const CARD_R      = 18;
const CARD_BG     = "rgba(255,255,255,0.04)";
const CARD_BORDER = "rgba(255,255,255,0.09)";

function TelegramLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#29b6f6" />
      <path
        d="M5.491 11.74 18.3 6.6c.613-.228 1.15.149.951.955L17.9 15.27c-.147.659-.538.818-1.09.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.234-4.732c.226-.2-.05-.312-.35-.112l-7.4 4.662-3.184-.994c-.692-.217-.707-.692.15-1.025z"
        fill="white"
      />
    </svg>
  );
}

function Spinner({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${color}33`,
      borderTopColor: color,
      animation: "tg-spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

function PasteBtn({ onPaste }: { onPaste: () => void }) {
  const [pasted, setPasted] = useState(false);
  const handleClick = () => {
    onPaste();
    setPasted(true);
    setTimeout(() => setPasted(false), 1800);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title="Paste from clipboard"
      style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: pasted ? "rgba(74,222,128,0.14)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${pasted ? "rgba(74,222,128,0.30)" : "rgba(255,255,255,0.10)"}`,
        cursor: "pointer",
        transition: "background 200ms, border-color 200ms",
      }}
    >
      {pasted
        ? <Check style={{ width: 13, height: 13, color: "#4ade80" }} />
        : <ClipboardPaste style={{ width: 13, height: 13, color: "rgba(148,163,184,0.60)" }} />
      }
    </button>
  );
}

type TgStatus = {
  configured:    boolean;
  chatId:        string | null;
  tokenMasked:   string | null;
  globalEnabled: boolean;
};

type TestResult = { kind: "success" | "error"; msg: string } | null;

function TelegramSection() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  const [tgStatus,    setTgStatus]    = useState<TgStatus | null>(null);
  const [botToken,    setBotToken]    = useState("");
  const [chatId,      setChatId]      = useState("");
  const [showToken,   setShowToken]   = useState(false);
  const [loading,     setLoading]     = useState<"save" | "test" | "disconnect" | "toggle" | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [testResult,  setTestResult]  = useState<TestResult>(null);
  const [infoOpen,    setInfoOpen]    = useState(false);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const d = await fetch(`${BASE}/api/telegram/status`).then(r => r.json()) as TgStatus;
      setTgStatus(d);
    } catch { /* ignore */ }
  }, [BASE]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const clearFeedback = () => { setError(null); setTestResult(null); };

  const handleSave = async () => {
    const trimToken  = botToken.trim();
    const trimChatId = chatId.trim();
    if (!trimToken)  { setError("Bot Token is required"); return; }
    if (!trimChatId) { setError("Chat ID is required"); return; }
    if (trimToken.length < 20) { setError("Bot token looks too short — copy it directly from @BotFather"); return; }

    clearFeedback();
    setLoading("save");
    try {
      const d = await fetch(`${BASE}/api/telegram/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimToken, chatId: trimChatId }),
      }).then(r => r.json()) as { success: boolean; error?: string };

      if (d.success) {
        setBotToken(""); setChatId("");
        setConnectedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        setTestResult({ kind: "success", msg: "Telegram Connected" });
        await fetchStatus();
      } else {
        setError(d.error ?? "Connection failed — please try again");
      }
    } catch {
      setError("Network error — please check your connection");
    } finally {
      setLoading(null);
    }
  };

  const handleTest = async () => {
    clearFeedback();
    setLoading("test");
    try {
      const d = await fetch(`${BASE}/api/telegram/test`, { method: "POST" }).then(r => r.json()) as {
        success: boolean; error?: string;
      };
      if (d.success) {
        setTestResult({ kind: "success", msg: "Telegram Connected" });
      } else {
        const msg = d.error ?? "Test failed";
        const lower = msg.toLowerCase();
        if (lower.includes("token") || lower.includes("bot")) {
          setTestResult({ kind: "error", msg: "Invalid Bot Token" });
        } else if (lower.includes("chat") || lower.includes("id")) {
          setTestResult({ kind: "error", msg: "Invalid Chat ID" });
        } else {
          setTestResult({ kind: "error", msg: msg });
        }
      }
    } catch {
      setTestResult({ kind: "error", msg: "Network error" });
    } finally {
      setLoading(null);
    }
  };

  const handleDisconnect = async () => {
    clearFeedback();
    setLoading("disconnect");
    try {
      await fetch(`${BASE}/api/telegram/config`, { method: "DELETE" });
      setConnectedAt(null);
      await fetchStatus();
    } catch {
      setError("Failed to disconnect — please try again");
    } finally {
      setLoading(null);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (loading) return;
    setLoading("toggle");
    try {
      await fetch(`${BASE}/api/telegram/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setTgStatus(prev => prev ? { ...prev, globalEnabled: enabled } : prev);
    } catch {
      setError("Failed to update — please try again");
    } finally {
      setLoading(null);
    }
  };

  const pasteToken = async () => {
    try { setBotToken(await navigator.clipboard.readText()); clearFeedback(); } catch { /* permissions denied */ }
  };
  const pasteChatId = async () => {
    try { setChatId(await navigator.clipboard.readText()); clearFeedback(); } catch { /* permissions denied */ }
  };

  const isConnected   = tgStatus?.configured ?? false;
  const globalEnabled = tgStatus?.globalEnabled ?? true;
  const isLoading     = loading !== null;
  const canConnect    = botToken.trim().length > 0 && chatId.trim().length > 0;

  return (
    <>
      {/* ── Section divider + label ────────────────────────────────────────── */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "8px 0 0" }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "22px 20px 10px",
      }}>
        <TelegramLogo size={18} />
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "rgba(148,163,184,0.40)", lineHeight: 1, margin: 0,
        }}>Telegram Alerts</p>
      </div>

      {/* ── 1. Enable toggle ──────────────────────────────────────────────── */}
      <div style={{
        margin: "0 16px 0",
        borderRadius: CARD_R,
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        overflow: "hidden",
      }}>
        <button
          onClick={() => { if (!isLoading) void handleToggle(!globalEnabled); }}
          style={{
            display: "flex", alignItems: "center",
            padding: "0 16px", height: 64, width: "100%",
            background: "transparent", border: "none", cursor: "pointer", gap: 14,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: globalEnabled ? TG_BG : "rgba(148,163,184,0.10)",
            border: `1px solid ${globalEnabled ? TG_BORDER : "rgba(148,163,184,0.12)"}`,
            transition: "background 250ms, border-color 250ms",
          }}>
            <TelegramLogo size={20} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)", lineHeight: 1.3, margin: 0 }}>
              Enable Telegram Alerts
            </p>
            <p style={{ fontSize: 12, color: "rgba(148,163,184,0.50)", marginTop: 2, margin: "2px 0 0" }}>
              {isConnected
                ? globalEnabled ? "Alerts forwarded to your Telegram" : "Paused — alerts won't be forwarded"
                : "Connect your bot below to enable"}
            </p>
          </div>
          {loading === "toggle"
            ? <Spinner color={TG} size={18} />
            : (
              <div style={{
                width: 46, height: 26, borderRadius: 13, flexShrink: 0,
                background: globalEnabled ? TG : "rgba(255,255,255,0.12)",
                position: "relative",
                transition: "background 220ms",
              }}>
                <div style={{
                  position: "absolute",
                  top: 3, left: globalEnabled ? 23 : 3,
                  width: 20, height: 20, borderRadius: "50%",
                  background: globalEnabled ? "#fff" : "rgba(255,255,255,0.70)",
                  transition: `left 220ms ${COMPOSITOR_EASE}`,
                  boxShadow: globalEnabled ? `0 1px 4px rgba(0,0,0,0.30)` : "none",
                }} />
              </div>
            )
          }
        </button>
      </div>

      {/* ── 2. Connection Status Card ─────────────────────────────────────── */}
      <div style={{
        margin: "10px 16px 0",
        borderRadius: CARD_R,
        background: isConnected ? "rgba(41,182,246,0.06)" : CARD_BG,
        border: `1px solid ${isConnected ? TG_BORDER : CARD_BORDER}`,
        overflow: "hidden",
        transition: "background 300ms, border-color 300ms",
      }}>
        <div style={{
          padding: "16px",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          {/* Large status chip */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 50,
            background: isConnected ? "rgba(74,222,128,0.12)" : "rgba(148,163,184,0.08)",
            border: `1px solid ${isConnected ? "rgba(74,222,128,0.28)" : "rgba(148,163,184,0.16)"}`,
            flexShrink: 0,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: isConnected ? "#4ade80" : "rgba(148,163,184,0.45)",
              boxShadow: isConnected ? "0 0 6px rgba(74,222,128,0.60)" : "none",
              display: "block",
            }} />
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: isConnected ? "#4ade80" : "rgba(148,163,184,0.65)",
              letterSpacing: "0.01em",
            }}>
              {isConnected ? "Connected" : "Not Connected"}
            </span>
          </div>

          {/* Bot info — right side */}
          {isConnected ? (
            <div style={{ flex: 1, textAlign: "right" }}>
              {tgStatus?.chatId && (
                <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.70)", margin: 0, fontFamily: "monospace" }}>
                  {tgStatus.chatId}
                </p>
              )}
              {connectedAt && (
                <p style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", margin: "2px 0 0" }}>
                  Last connected {connectedAt}
                </p>
              )}
              {tgStatus?.tokenMasked && (
                <p style={{ fontSize: 11, color: "rgba(148,163,184,0.40)", margin: "2px 0 0", fontFamily: "monospace" }}>
                  {tgStatus.tokenMasked}
                </p>
              )}
            </div>
          ) : (
            <p style={{ flex: 1, fontSize: 12, color: "rgba(148,163,184,0.40)", margin: 0, textAlign: "right" }}>
              Configure below
            </p>
          )}
        </div>
      </div>

      {/* ── 3. Bot Configuration ─────────────────────────────────────────── */}
      <div style={{
        margin: "10px 16px 0",
        borderRadius: CARD_R,
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        overflow: "hidden",
      }}>
        {/* Label row */}
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <Bot style={{ width: 13, height: 13, color: TG, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>
            Bot Configuration
          </span>
        </div>

        <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Bot Token */}
          <div>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              color: "rgba(148,163,184,0.50)", marginBottom: 7,
            }}>Bot Token</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type={showToken ? "text" : "password"}
                  placeholder="123456:ABC-DEF…"
                  value={botToken}
                  autoComplete="off"
                  onChange={e => { setBotToken(e.target.value); clearFeedback(); }}
                  onKeyDown={e => e.key === "Enter" && void handleSave()}
                  style={{
                    width: "100%", height: 44, borderRadius: 12,
                    padding: "0 42px 0 14px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.90)", fontSize: 13,
                    fontFamily: "monospace",
                    outline: "none", boxSizing: "border-box",
                    transition: "border-color 150ms",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: "rgba(148,163,184,0.50)", display: "flex", alignItems: "center",
                  }}
                >
                  {showToken
                    ? <EyeOff style={{ width: 15, height: 15 }} />
                    : <Eye style={{ width: 15, height: 15 }} />
                  }
                </button>
              </div>
              <PasteBtn onPaste={pasteToken} />
            </div>
          </div>

          {/* Chat ID */}
          <div>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              color: "rgba(148,163,184,0.50)", marginBottom: 7,
            }}>Chat ID</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="text"
                placeholder="-100123456789"
                value={chatId}
                autoComplete="off"
                onChange={e => { setChatId(e.target.value); clearFeedback(); }}
                onKeyDown={e => e.key === "Enter" && void handleSave()}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  padding: "0 14px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(255,255,255,0.90)", fontSize: 13,
                  fontFamily: "monospace",
                  outline: "none", boxSizing: "border-box",
                  transition: "border-color 150ms",
                }}
              />
              <PasteBtn onPaste={pasteChatId} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Action Buttons ─────────────────────────────────────────────── */}
      <div style={{ margin: "12px 16px 0", display: "flex", flexDirection: "column", gap: 9 }}>

        {/* Primary: Connect Bot — always visible */}
        <button
          onClick={handleSave}
          disabled={isLoading || !canConnect}
          style={{
            width: "100%", height: 52, borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
            background: canConnect && !isLoading
              ? `linear-gradient(135deg, ${TG} 0%, #0ea5e9 100%)`
              : "rgba(41,182,246,0.08)",
            border: `1px solid ${canConnect && !isLoading ? "rgba(41,182,246,0.50)" : "rgba(41,182,246,0.14)"}`,
            color: canConnect && !isLoading ? "#fff" : "rgba(41,182,246,0.35)",
            fontSize: 15, fontWeight: 700,
            cursor: !canConnect || isLoading ? "not-allowed" : "pointer",
            transition: "all 250ms",
            boxShadow: canConnect && !isLoading ? "0 4px 20px rgba(41,182,246,0.22)" : "none",
          }}
        >
          {loading === "save"
            ? <Spinner color="#fff" size={17} />
            : <Send style={{ width: 16, height: 16 }} />
          }
          {loading === "save" ? "Connecting…" : "Connect Bot"}
        </button>

        {/* Secondary + Danger row — only when connected */}
        {isConnected && (
          <div style={{ display: "flex", gap: 9 }}>
            {/* Test Message */}
            <button
              onClick={handleTest}
              disabled={isLoading}
              style={{
                flex: 1, height: 48, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.80)", fontSize: 14, fontWeight: 600,
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading && loading !== "test" ? 0.45 : 1,
                transition: "opacity 150ms, background 150ms",
              }}
            >
              {loading === "test"
                ? <Spinner color="rgba(255,255,255,0.70)" size={15} />
                : <Zap style={{ width: 15, height: 15 }} />
              }
              Test Message
            </button>

            {/* Disconnect */}
            <button
              onClick={handleDisconnect}
              disabled={isLoading}
              style={{
                flex: 1, height: 48, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "rgba(239,68,68,0.07)",
                border: "1px solid rgba(239,68,68,0.18)",
                color: "#f87171", fontSize: 14, fontWeight: 600,
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading && loading !== "disconnect" ? 0.45 : 1,
                transition: "opacity 150ms, background 150ms",
              }}
            >
              {loading === "disconnect"
                ? <Spinner color="#f87171" size={15} />
                : <WifiOff style={{ width: 15, height: 15 }} />
              }
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* ── 5. Collapsible Info Card ──────────────────────────────────────── */}
      <div style={{
        margin: "12px 16px 0",
        borderRadius: CARD_R,
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        overflow: "hidden",
      }}>
        <button
          onClick={() => setInfoOpen(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "14px 16px", width: "100%",
            background: "transparent", border: "none", cursor: "pointer",
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(165,180,252,0.12)",
            border: "1px solid rgba(165,180,252,0.20)",
          }}>
            <Info style={{ width: 13, height: 13, color: "#a5b4fc" }} />
          </div>
          <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>
            How to get Bot Token &amp; Chat ID
          </span>
          <ChevronDown style={{
            width: 15, height: 15, color: "rgba(148,163,184,0.45)", flexShrink: 0,
            transform: infoOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 220ms ease",
          }} />
        </button>

        {/* Expanded content */}
        <div style={{
          maxHeight: infoOpen ? 320 : 0,
          overflow: "hidden",
          transition: "max-height 280ms ease",
        }}>
          <div style={{
            padding: "14px 16px 16px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}>
            {([
              <>Open Telegram and search for <span style={{ color: TG, fontWeight: 600 }}>@BotFather</span>.</>,
              <>Send <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.70)" }}>/newbot</span> and follow the prompts to create your bot.</>,
              <>Copy the <span style={{ color: "rgba(255,255,255,0.78)", fontWeight: 600 }}>Bot Token</span> that BotFather sends you.</>,
              <>Send <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.70)" }}>/start</span> to your bot, then message <span style={{ color: TG, fontWeight: 600 }}>@userinfobot</span> to get your Chat ID.</>,
            ] as React.ReactNode[]).map((content, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 3 ? 10 : 0 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(41,182,246,0.14)",
                  fontSize: 10, fontWeight: 800, color: TG,
                  marginTop: 1,
                }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: 12, color: "rgba(148,163,184,0.65)", lineHeight: 1.55, margin: 0, flex: 1 }}>
                  {content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6. Test / Connect Result ──────────────────────────────────────── */}
      {testResult && (
        <div style={{
          margin: "10px 16px 0",
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 10,
          background: testResult.kind === "success"
            ? "rgba(74,222,128,0.08)"
            : "rgba(239,68,68,0.08)",
          border: `1px solid ${testResult.kind === "success" ? "rgba(74,222,128,0.22)" : "rgba(239,68,68,0.20)"}`,
          animation: "tg-fadein 220ms ease forwards",
        }}>
          {testResult.kind === "success"
            ? <CheckCircle2 style={{ width: 17, height: 17, color: "#4ade80", flexShrink: 0 }} />
            : <XCircle style={{ width: 17, height: 17, color: "#f87171", flexShrink: 0 }} />
          }
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: testResult.kind === "success" ? "#4ade80" : "#f87171",
          }}>
            {testResult.msg}
          </span>
          <button
            onClick={() => setTestResult(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(148,163,184,0.40)", display: "flex" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* General error banner */}
      {error && (
        <div style={{
          margin: "10px 16px 0",
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.20)",
          animation: "tg-fadein 220ms ease forwards",
        }}>
          <AlertCircle style={{ width: 15, height: 15, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "#f87171", lineHeight: 1.5, flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(248,113,113,0.50)", display: "flex", flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 7. Footer ─────────────────────────────────────────────────────── */}
      <div style={{
        margin: "14px 16px 0",
        padding: "12px 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "flex-start", gap: 8,
      }}>
        <Send style={{ width: 12, height: 12, color: "rgba(148,163,184,0.35)", flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 11, color: "rgba(148,163,184,0.40)", lineHeight: 1.6, margin: 0 }}>
          Telegram alerts are sent directly from the backend even if the app is closed.
        </p>
      </div>

      <style>{`
        @keyframes tg-spin { to { transform: rotate(360deg); } }
        @keyframes tg-fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

export interface NotificationsSettingsPageProps {
  open:          boolean;
  onClose:       () => void;
  /** The navStack entry for the active picker, e.g. "picker_sound" or null */
  pickerPage:    string | null;
  onOpenPicker:  (name: string) => void;
  onClosePicker: () => void;
}

export const NotificationsSettingsPage = memo(function NotificationsSettingsPage({
  open, onClose, pickerPage, onOpenPicker, onClosePicker,
}: NotificationsSettingsPageProps) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);
  const [prefs, setPrefs]       = useState<NotifPrefs>(loadPrefs);
  // Re-render when custom ringtone is uploaded/cleared so the nav row label updates
  const [customName, setCustomName] = useState<string | null>(() => getCustomRingtoneName());

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const updatePrefs = useCallback((patch: Partial<NotifPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const handleCustomFileChanged = useCallback(() => {
    setCustomName(getCustomRingtoneName());
  }, []);

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

  /* ── ESC → go back ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!rendered) return null;

  /* Label shown in the Alert Ringtone nav row */
  const ringtoneLabel =
    prefs.sound === "Custom" && customName
      ? customName.replace(/\.mp3$/i, "")
      : prefs.sound;

  return (
    <>
      <div style={{
        position: "fixed", inset: 0, zIndex: 203,
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
        {/* ── Header ────────────────────────────────────────────────────────── */}
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
            color: "rgba(255,255,255,0.72)", cursor: "pointer",
          }}>
            <ArrowLeft style={{ width: 18, height: 18 }} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
            Notifications
          </span>
          <div style={{ width: 40 }} />
        </header>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>

          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
            textTransform: "uppercase", padding: "24px 24px 10px",
            color: "rgba(148,163,184,0.40)", lineHeight: 1,
          }}>Alerts</p>

          <ToggleRow
            icon={prefs.soundEnabled ? Volume2 : VolumeX}
            iconColor={prefs.soundEnabled ? "#34d399" : "#94a3b8"}
            iconBg={prefs.soundEnabled ? "rgba(16,185,129,0.14)" : "rgba(148,163,184,0.10)"}
            label="Alert Sounds"
            sub="Play a sound when alerts trigger"
            value={prefs.soundEnabled}
            onChange={v => updatePrefs({ soundEnabled: v })}
            showDivider
          />

          <NavRow
            icon={Music}
            iconColor="#a78bfa"
            iconBg="rgba(139,92,246,0.14)"
            label="Alert Ringtone"
            value={ringtoneLabel}
            onClick={() => onOpenPicker("picker_sound")}
            showDivider={prefs.sound !== "Custom"}
            disabled={!prefs.soundEnabled}
          />

          {/* Custom MP3 upload section — visible only when Custom is selected */}
          {prefs.sound === "Custom" && (
            <>
              <CustomUploadSection
                disabled={!prefs.soundEnabled}
                onFileUploaded={handleCustomFileChanged}
              />
              <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 16, marginRight: 16, marginBottom: 4 }} />
            </>
          )}

          <NavRow
            icon={Timer}
            iconColor="#fbbf24"
            iconBg="rgba(245,158,11,0.14)"
            label="Alert Duration"
            value={prefs.duration}
            onClick={() => onOpenPicker("picker_duration")}
            showDivider={false}
          />

          {/* ── Telegram Alerts section ──────────────────────────────────── */}
          <TelegramSection />

          {/* Bottom padding */}
          <div style={{ height: 32 }} />
        </div>
      </div>

      {/* ── Picker sub-pages ─────────────────────────────────────────────────
          Controlled by ProfilePage's navStack via pickerPage prop.
          Back button calls onClosePicker = ProfilePage's popPage = history.back(). */}

      <PickerPage
        open={pickerPage === "picker_sound"}
        onClose={onClosePicker}
        title="Alert Ringtone"
        options={SOUNDS}
        selected={prefs.sound}
        onSelect={v => updatePrefs({ sound: v as SoundType })}
      />

      <PickerPage
        open={pickerPage === "picker_duration"}
        onClose={onClosePicker}
        title="Alert Duration"
        options={DURATIONS}
        selected={prefs.duration}
        onSelect={v => updatePrefs({ duration: v as DurationType })}
      />
    </>
  );
});
