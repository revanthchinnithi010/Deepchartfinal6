import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, FileText, CheckCircle2, XCircle, ShieldCheck,
  ChevronRight, X, Loader2, AlertTriangle, Lock, Eye, EyeOff,
  Database, Wifi, RefreshCw, Key,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBrokerStore } from "@/store/brokerStore";

interface ParsedCredentials {
  BROKER_ENCRYPTION_KEY?: string;
  DELTA_API_KEY?: string;
  DELTA_API_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  SESSION_SECRET?: string;
  DATABASE_URL?: string;
}

interface CredStatus {
  BROKER_ENCRYPTION_KEY: boolean;
  DELTA_API_KEY: boolean;
  DELTA_API_SECRET: boolean;
  TELEGRAM_BOT_TOKEN: boolean;
  TELEGRAM_CHAT_ID: boolean;
  SESSION_SECRET: boolean;
  DATABASE_URL: boolean;
  [key: string]: boolean;
}

type Screen = "upload" | "review" | "confirm" | "done";

const CREDENTIAL_GROUPS = [
  {
    label: "Delta Exchange Credentials",
    keys: ["DELTA_API_KEY", "DELTA_API_SECRET"] as const,
    color: "#F97316",
    bg: "rgba(249,115,22,0.12)",
  },
  {
    label: "Telegram Credentials",
    keys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const,
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.12)",
  },
  {
    label: "Database URL",
    keys: ["DATABASE_URL"] as const,
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.12)",
  },
  {
    label: "Security Keys",
    keys: ["BROKER_ENCRYPTION_KEY", "SESSION_SECRET"] as const,
    color: "#00FFB4",
    bg: "rgba(0,255,180,0.10)",
  },
] as const;

function parseCredentialsFile(content: string): ParsedCredentials {
  const parsed: ParsedCredentials = {};
  const supported = [
    "BROKER_ENCRYPTION_KEY",
    "DELTA_API_KEY", "DELTA_API_SECRET", "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID", "SESSION_SECRET", "DATABASE_URL",
  ];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (supported.includes(key) && value) {
      (parsed as Record<string, string>)[key] = value;
    }
  }
  return parsed;
}

function groupDetected(creds: ParsedCredentials) {
  return CREDENTIAL_GROUPS.map((g) => ({
    ...g,
    detected: g.keys.some((k) => !!(creds as Record<string, string | undefined>)[k]),
    count: g.keys.filter((k) => !!(creds as Record<string, string | undefined>)[k]).length,
  }));
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function CredentialImportModal({ onClose, onImported }: Props) {
  const isMobile = useIsMobile();
  const [screen, setScreen] = useState<Screen>("upload");
  const [parsed, setParsed] = useState<ParsedCredentials>({});
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showValues, setShowValues] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".env") && !file.name.endsWith(".txt")) {
      setFileError("Only .env and .txt files are supported.");
      return;
    }
    setFileError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = parseCredentialsFile(content);
      const hasAny = Object.keys(result).length > 0;
      if (!hasAny) {
        setFileError("No recognised credentials found in this file. Check the format.");
        return;
      }
      setParsed(result);
      setFileName(file.name);
      setScreen("review");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  async function handleConfirm() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/credentials/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credentials: parsed }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setSaveError(data.error ?? "Import failed");
        setSaving(false);
        return;
      }
      setScreen("done");
      onImported();
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const glassStyle: React.CSSProperties = {
    background: "rgba(13,17,23,0.97)",
    border: "1px solid rgba(255,255,255,0.09)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
  };

  const modalStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed", inset: 0, zIndex: 300,
        background: "#0B1017",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }
    : {
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      };

  const innerStyle: React.CSSProperties = isMobile
    ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }
    : {
        ...glassStyle,
        position: "relative",
        width: "100%", maxWidth: 460,
        borderRadius: 22, maxHeight: "92vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 0 60px rgba(0,255,180,0.06), 0 24px 48px rgba(0,0,0,0.7)",
      };

  return (
    <div style={modalStyle} onClick={(e) => { if (!isMobile && e.target === e.currentTarget) onClose(); }}>
      <div style={innerStyle}>
        {/* Top accent */}
        {!isMobile && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(0,255,180,0.4), transparent)",
          }} />
        )}

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: isMobile ? "0 16px" : "20px 24px 0",
          height: isMobile ? 56 : "auto",
          marginBottom: isMobile ? 0 : 4,
          flexShrink: 0,
          borderBottom: isMobile ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: "rgba(0,255,180,0.1)", border: "1px solid rgba(0,255,180,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ShieldCheck size={17} style={{ color: "#00FFB4" }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>Import Credentials</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
              Upload a .env or .txt file — secrets are encrypted before storage
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 9, border: "none", cursor: "pointer",
            background: "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.5)", flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: isMobile ? "16px 16px 32px" : "20px 24px 28px",
          overscrollBehavior: "contain",
        } as React.CSSProperties}>
          {screen === "upload" && (
            <UploadScreen
              isDragging={isDragging}
              fileError={fileError}
              fileInputRef={fileInputRef}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onFileInput={handleFileInput}
            />
          )}

          {screen === "review" && (
            <ReviewScreen
              parsed={parsed}
              fileName={fileName}
              showValues={showValues}
              onToggleValues={() => setShowValues(v => !v)}
              onBack={() => setScreen("upload")}
              onNext={() => setScreen("confirm")}
            />
          )}

          {screen === "confirm" && (
            <ConfirmScreen
              parsed={parsed}
              saving={saving}
              saveError={saveError}
              onBack={() => setScreen("review")}
              onConfirm={handleConfirm}
            />
          )}

          {screen === "done" && (
            <DoneScreen onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function UploadScreen({
  isDragging, fileError, fileInputRef, onDrop, onDragOver, onDragLeave, onFileInput,
}: {
  isDragging: boolean;
  fileError: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Security note */}
      <div style={{
        display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12,
        background: "rgba(0,255,180,0.05)", border: "1px solid rgba(0,255,180,0.12)",
      }}>
        <Lock size={14} style={{ color: "#00FFB4", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.6 }}>
          Credentials are encrypted with AES-256-CBC before storage. They are never displayed or logged after import.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, padding: "40px 24px", borderRadius: 16, cursor: "pointer",
          border: isDragging ? "2px dashed rgba(0,255,180,0.5)" : "2px dashed rgba(255,255,255,0.1)",
          background: isDragging ? "rgba(0,255,180,0.04)" : "rgba(255,255,255,0.02)",
          transition: "all 0.2s",
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "rgba(0,255,180,0.1)", border: "1px solid rgba(0,255,180,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Upload size={22} style={{ color: "#00FFB4" }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", margin: 0 }}>
            Drop your credentials file here
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "4px 0 0" }}>
            or <span style={{ color: "#00FFB4" }}>click to browse</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[".env", ".txt"].map(ext => (
            <span key={ext} style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 6,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.45)", fontFamily: "monospace",
            }}>{ext}</span>
          ))}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".env,.txt"
        style={{ display: "none" }}
        onChange={onFileInput}
      />

      {fileError && (
        <div style={{
          display: "flex", gap: 8, padding: "10px 14px", borderRadius: 10,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
        }}>
          <AlertTriangle size={14} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{fileError}</p>
        </div>
      )}

      {/* Expected format */}
      <div style={{
        padding: "14px 16px", borderRadius: 12,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Expected Format
        </p>
        <pre style={{
          fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0,
          fontFamily: "monospace", lineHeight: 1.7, overflowX: "auto",
        }}>{`BROKER_ENCRYPTION_KEY=your_key

DELTA_API_KEY=your_api_key
DELTA_API_SECRET=your_api_secret

TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

DATABASE_URL=postgresql://...`}</pre>
      </div>
    </div>
  );
}

function ReviewScreen({
  parsed, fileName, showValues, onToggleValues, onBack, onNext,
}: {
  parsed: ParsedCredentials;
  fileName: string;
  showValues: boolean;
  onToggleValues: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const groups = groupDetected(parsed);
  const totalDetected = Object.keys(parsed).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* File info */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <FileText size={15} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", flex: 1, fontFamily: "monospace" }}>{fileName}</span>
        <span style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 6,
          background: "rgba(0,255,180,0.1)", color: "#00FFB4", fontWeight: 600,
        }}>{totalDetected} keys</span>
      </div>

      {/* Detected groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Detected Credentials
        </p>
        {groups.map((g) => (
          <div key={g.label} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12,
            background: g.detected ? g.bg : "rgba(255,255,255,0.02)",
            border: `1px solid ${g.detected ? g.color + "30" : "rgba(255,255,255,0.06)"}`,
            opacity: g.detected ? 1 : 0.45,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              background: g.detected ? g.color + "20" : "rgba(255,255,255,0.05)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {g.detected
                ? <CheckCircle2 size={14} style={{ color: g.color }} />
                : <XCircle size={14} style={{ color: "rgba(255,255,255,0.2)" }} />}
            </div>
            <span style={{ fontSize: 13, fontWeight: g.detected ? 600 : 400, color: g.detected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)", flex: 1 }}>
              {g.label}
            </span>
            {g.detected && (
              <span style={{ fontSize: 10, color: g.color, fontWeight: 600 }}>
                {g.count}/{g.keys.length}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Show values toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 }}>Credential values (masked for security)</p>
        <button
          onClick={onToggleValues}
          style={{
            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer",
          }}
        >
          {showValues ? <EyeOff size={12} /> : <Eye size={12} />}
          {showValues ? "Hide" : "Show"}
        </button>
      </div>

      {showValues && (
        <div style={{
          padding: "12px 14px", borderRadius: 12,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {Object.entries(parsed).map(([key, val]) => (
            <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", flexShrink: 0, minWidth: 180 }}>{key}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.65)", wordBreak: "break-all" }}>
                {val ? val.slice(0, 6) + "••••••" + val.slice(-4) : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
        <button onClick={onBack} style={{
          padding: "10px 18px", borderRadius: 11, fontSize: 13, fontWeight: 600,
          background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
          border: "1px solid rgba(255,255,255,0.09)", cursor: "pointer",
        }}>
          Back
        </button>
        <button onClick={onNext} style={{
          flex: 1, padding: "12px 0", borderRadius: 11, fontSize: 14, fontWeight: 700,
          background: "linear-gradient(135deg, rgba(0,255,180,0.2) 0%, rgba(0,200,140,0.2) 100%)",
          color: "#00FFB4", border: "1px solid rgba(0,255,180,0.3)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          Review & Confirm <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function ConfirmScreen({
  parsed, saving, saveError, onBack, onConfirm,
}: {
  parsed: ParsedCredentials;
  saving: boolean;
  saveError: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const count = Object.keys(parsed).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Warning */}
      <div style={{
        display: "flex", gap: 10, padding: "14px 16px", borderRadius: 12,
        background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)",
      }}>
        <AlertTriangle size={15} style={{ color: "#F97316", flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#F97316", margin: 0 }}>Confirm Import</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "4px 0 0", lineHeight: 1.5 }}>
            You are about to save <strong style={{ color: "rgba(255,255,255,0.8)" }}>{count} credentials</strong> to encrypted storage.
            Existing values for matching keys will be overwritten.
          </p>
        </div>
      </div>

      {/* What happens next */}
      <div style={{
        padding: "14px 16px", borderRadius: 12,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          What happens after import
        </p>
        {[
          { icon: <Lock size={13} />, text: "All secrets encrypted with AES-256-CBC before storage" },
          { icon: <Database size={13} />, text: "Credentials never displayed again after this screen" },
          { icon: <Wifi size={13} />, text: "Delta Exchange: one-click connect using imported key" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < 3 ? 8 : 0 }}>
            <span style={{ color: "#00FFB4", flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{item.text}</span>
          </div>
        ))}
      </div>

      {saveError && (
        <div style={{
          display: "flex", gap: 8, padding: "10px 14px", borderRadius: 10,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
        }}>
          <XCircle size={14} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{saveError}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
        <button onClick={onBack} disabled={saving} style={{
          padding: "10px 18px", borderRadius: 11, fontSize: 13, fontWeight: 600,
          background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
          border: "1px solid rgba(255,255,255,0.09)", cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.5 : 1,
        }}>
          Back
        </button>
        <button onClick={onConfirm} disabled={saving} style={{
          flex: 1, padding: "12px 0", borderRadius: 11, fontSize: 14, fontWeight: 700,
          background: saving
            ? "rgba(0,255,180,0.1)"
            : "linear-gradient(135deg, #00FFB4 0%, #00CC96 100%)",
          color: saving ? "rgba(0,255,180,0.5)" : "#0B1017",
          border: "none", cursor: saving ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: saving ? "none" : "0 0 24px rgba(0,255,180,0.2)",
        }}>
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Encrypting & Saving…</>
            : <><ShieldCheck size={15} /> Encrypt & Save Credentials</>}
        </button>
      </div>
    </div>
  );
}

function DoneScreen({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "24px 0 8px", textAlign: "center" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        background: "rgba(0,255,180,0.1)", border: "1.5px solid rgba(0,255,180,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <CheckCircle2 size={32} style={{ color: "#00FFB4" }} />
      </div>
      <div>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#00FFB4", margin: 0 }}>Credentials Imported</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "8px 0 0", lineHeight: 1.6 }}>
          All secrets have been encrypted and saved.<br />
          You can now connect your brokers with one click.
        </p>
      </div>
      <div style={{
        width: "100%", padding: "14px 16px", borderRadius: 12,
        background: "rgba(0,255,180,0.05)", border: "1px solid rgba(0,255,180,0.12)",
      }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.6 }}>
          Use <strong style={{ color: "rgba(255,255,255,0.8)" }}>Connect Delta Exchange</strong> to activate your broker connections.
        </p>
      </div>
      <button onClick={onClose} style={{
        width: "100%", padding: "12px 0", borderRadius: 11, fontSize: 14, fontWeight: 700,
        background: "rgba(0,255,180,0.1)", color: "#00FFB4",
        border: "1px solid rgba(0,255,180,0.25)", cursor: "pointer",
      }}>
        Done
      </button>
    </div>
  );
}

/* ── Connection Status Panel ─────────────────────────────────────────────── */
interface ConnectionStatusPanelProps {
  onImport?: () => void;
}

interface StatusState {
  loaded: boolean;
  status: Partial<CredStatus>;
}

interface DeltaTestResult {
  ok: boolean;
  error?: string;
  envName?: string;
  usdtBalance?: string;
}

type CheckStatus = "idle" | "running" | "ok" | "fail";

function CheckChip({ label, status, icon }: { label: string; status: CheckStatus; icon: React.ReactNode }) {
  const color =
    status === "ok"      ? "#00FFB4" :
    status === "fail"    ? "#EF4444" :
    status === "running" ? "rgba(255,255,255,0.45)" :
                           "rgba(255,255,255,0.2)";
  const bg =
    status === "ok"      ? "rgba(0,255,180,0.08)" :
    status === "fail"    ? "rgba(239,68,68,0.08)" :
                           "rgba(255,255,255,0.04)";
  const border =
    status === "ok"      ? "1px solid rgba(0,255,180,0.2)" :
    status === "fail"    ? "1px solid rgba(239,68,68,0.2)" :
                           "1px solid rgba(255,255,255,0.07)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 6,
      background: bg, border, flexShrink: 0,
    }}>
      <span style={{ color, display: "flex", alignItems: "center" }}>
        {status === "running"
          ? <Loader2 size={9} className="animate-spin" />
          : status === "ok"
            ? <CheckCircle2 size={9} />
            : status === "fail"
              ? <XCircle size={9} />
              : icon}
      </span>
      <span style={{ fontSize: 9, fontWeight: 600, color, letterSpacing: "0.03em" }}>{label}</span>
    </div>
  );
}

export function ConnectionStatusPanel({ onImport }: ConnectionStatusPanelProps) {
  const [st, setSt] = useState<StatusState>({ loaded: false, status: {} });

  // Delta 3-check state
  const [deltaApiStatus, setDeltaApiStatus] = useState<CheckStatus>("idle");
  const [deltaTestResult, setDeltaTestResult] = useState<DeltaTestResult | null>(null);

  // Telegram single-test state
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramResult, setTelegramResult] = useState<boolean | null>(null);

  // Live broker state for WS + account data checks
  const wsClientStates  = useBrokerStore(s => s.wsClientStates);
  const brokerBalances  = useBrokerStore(s => s.brokerBalances);
  const connectedAccounts = useBrokerStore(s => s.connectedAccounts);

  const deltaWsConnected  = wsClientStates.delta?.status === "connected";
  const deltaHasBalance   = !!(brokerBalances["delta"] || connectedAccounts["delta"]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/credentials/status", { credentials: "include" });
      const data = await res.json() as { ok: boolean; status: CredStatus };
      if (data.ok) setSt({ loaded: true, status: data.status });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runDeltaTest = useCallback(async () => {
    setDeltaApiStatus("running");
    setDeltaTestResult(null);
    try {
      const res = await fetch("/api/credentials/test/delta", {
        method: "POST", credentials: "include",
      });
      const data = await res.json() as DeltaTestResult;
      setDeltaTestResult(data);
      setDeltaApiStatus(data.ok ? "ok" : "fail");
    } catch {
      setDeltaTestResult({ ok: false, error: "Network error" });
      setDeltaApiStatus("fail");
    }
  }, []);

  // Auto-run Delta test once credentials are confirmed present
  const deltaConfigured = !!(st.status.DELTA_API_KEY && st.status.DELTA_API_SECRET);
  useEffect(() => {
    if (st.loaded && deltaConfigured) {
      void runDeltaTest();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.loaded, deltaConfigured]);

  async function testTelegram() {
    setTelegramTesting(true);
    setTelegramResult(null);
    try {
      const res = await fetch("/api/credentials/test/telegram", {
        method: "POST", credentials: "include",
      });
      const data = await res.json() as { ok: boolean };
      setTelegramResult(data.ok);
    } catch {
      setTelegramResult(false);
    } finally {
      setTelegramTesting(false);
    }
  }

  const services = [
    {
      key: "delta",
      label: "Delta Exchange",
      configured: deltaConfigured,
      color: "#F97316",
    },
    {
      key: "telegram",
      label: "Telegram",
      configured: !!(st.status.TELEGRAM_BOT_TOKEN && st.status.TELEGRAM_CHAT_ID),
      color: "#3B82F6",
    },
    {
      key: "database",
      label: "Database URL",
      configured: !!st.status.DATABASE_URL,
      color: "#8B5CF6",
    },
    {
      key: "encryption",
      label: "Encryption Key",
      configured: !!st.status.BROKER_ENCRYPTION_KEY,
      color: "#00FFB4",
    },
  ];

  const anyConfigured = services.some(s => s.configured);

  return (
    <div style={{
      borderRadius: 16, overflow: "hidden",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: "rgba(0,255,180,0.1)", border: "1px solid rgba(0,255,180,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ShieldCheck size={13} style={{ color: "#00FFB4" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Connection Status</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {services.map((svc, i) => (
          <div key={svc.key}>
            {/* Main service row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 16px",
              borderBottom: (i < services.length - 1 && svc.key !== "delta") || (svc.key === "delta" && svc.configured)
                ? "none"
                : i < services.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: svc.configured ? svc.color : "rgba(255,255,255,0.15)",
                boxShadow: svc.configured ? `0 0 6px ${svc.color}60` : "none",
              }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", flex: 1 }}>{svc.label}</span>

              {!st.loaded ? (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>…</span>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Telegram: single test button */}
                  {svc.key === "telegram" && svc.configured && (
                    <>
                      <button
                        onClick={testTelegram}
                        disabled={telegramTesting}
                        style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 5,
                          background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)",
                          border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {telegramTesting ? <Loader2 size={10} className="animate-spin" /> : <Wifi size={10} />}
                        Test
                      </button>
                      {telegramResult !== null && (
                        <span style={{ fontSize: 10, color: telegramResult ? "#00FFB4" : "#EF4444" }}>
                          {telegramResult ? "✓ OK" : "✗ Fail"}
                        </span>
                      )}
                    </>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: svc.configured ? svc.color : "rgba(255,255,255,0.25)",
                  }}>
                    {svc.configured ? "Configured" : "Not Configured"}
                  </span>
                </div>
              )}
            </div>

            {/* Delta 3-check sub-row */}
            {svc.key === "delta" && svc.configured && st.loaded && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 16px 10px 30px",
                borderBottom: i < services.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                flexWrap: "wrap",
              }}>
                <CheckChip
                  label="API Key"
                  status={deltaApiStatus}
                  icon={<Key size={9} />}
                />
                <CheckChip
                  label="WebSocket"
                  status={
                    deltaApiStatus === "idle" || deltaApiStatus === "running"
                      ? "idle"
                      : deltaWsConnected ? "ok" : "fail"
                  }
                  icon={<Wifi size={9} />}
                />
                <CheckChip
                  label="Account Data"
                  status={
                    deltaApiStatus === "idle" || deltaApiStatus === "running"
                      ? "idle"
                      : deltaHasBalance ? "ok" : "fail"
                  }
                  icon={<Database size={9} />}
                />
                {/* Retry button */}
                <button
                  onClick={runDeltaTest}
                  disabled={deltaApiStatus === "running"}
                  title="Re-test API key"
                  style={{
                    marginLeft: "auto",
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", borderRadius: 6,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 9,
                  }}
                >
                  <RefreshCw size={9} style={{ opacity: deltaApiStatus === "running" ? 0.4 : 1 }} />
                  Retry
                </button>
                {/* Error detail */}
                {deltaApiStatus === "fail" && deltaTestResult?.error && (
                  <p style={{
                    width: "100%", margin: "4px 0 0",
                    fontSize: 10, color: "rgba(239,68,68,0.7)", lineHeight: 1.4,
                  }}>
                    {deltaTestResult.error.length > 100
                      ? deltaTestResult.error.slice(0, 100) + "…"
                      : deltaTestResult.error}
                  </p>
                )}
                {/* Success detail */}
                {deltaApiStatus === "ok" && deltaTestResult?.usdtBalance && (
                  <p style={{
                    width: "100%", margin: "4px 0 0",
                    fontSize: 10, color: "rgba(0,255,180,0.55)", lineHeight: 1.4,
                  }}>
                    {deltaTestResult.envName === "india" ? "India" : "International"} · USDT balance: {deltaTestResult.usdtBalance}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {st.loaded && !anyConfigured && (
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={12} style={{ color: "rgba(249,115,22,0.7)", flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 }}>
            No credentials configured. Import a file to enable broker connections.
          </p>
        </div>
      )}
    </div>
  );
}
