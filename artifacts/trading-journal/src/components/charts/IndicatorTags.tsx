import { memo, useState, useRef, useEffect } from "react";
import { Eye, EyeOff, Trash2, Settings, MoreHorizontal, Code2, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { createPortal } from "react-dom";
import { useIndicatorStore, type AppliedIndicator } from "@/store/indicatorStore";

const IndicatorTags = memo(function IndicatorTags({ topOffset = 8 }: { topOffset?: number }) {
  const { appliedIndicators, toggleVisible, removeIndicator } = useIndicatorStore();
  const [collapsed, setCollapsed] = useState(false);

  if (appliedIndicators.length === 0) return null;

  return (
    <div style={{
      position: "absolute", top: topOffset, left: 8, zIndex: 20,
      display: "flex", flexDirection: "column", gap: 2,
      pointerEvents: "all",
    }}>
      {/* Header row with collapse toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: collapsed ? 0 : 2 }}>
        <button
          title={collapsed ? "Show indicators" : "Hide indicators"}
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            height: 20, padding: "0 7px",
            background: "rgba(7,17,13,0.75)",
            border: "1px solid rgba(183,255,90,0.15)",
            borderRadius: 5,
            cursor: "pointer",
            color: "rgba(183,220,190,0.6)",
            fontSize: 10, fontWeight: 600,
            backdropFilter: "blur(8px)",
            transition: "border-color .15s, color .15s",
            userSelect: "none",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(183,255,90,0.35)";
            (e.currentTarget as HTMLButtonElement).style.color = "#B7FF5A";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(183,255,90,0.15)";
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(183,220,190,0.6)";
          }}
        >
          {collapsed
            ? <ChevronDown style={{ width: 10, height: 10 }} />
            : <ChevronUp style={{ width: 10, height: 10 }} />
          }
          <span>{appliedIndicators.length} indicator{appliedIndicators.length !== 1 ? "s" : ""}</span>
        </button>
      </div>

      {/* Indicator tags */}
      {!collapsed && appliedIndicators.map(ind => (
        <IndicatorTag
          key={ind.id}
          indicator={ind}
          onToggleVisible={() => toggleVisible(ind.id)}
          onDelete={() => removeIndicator(ind.id)}
        />
      ))}
    </div>
  );
});

interface PineModalProps {
  code: string;
  name: string;
  onClose: () => void;
}

function PineModal({ code, name, onClose }: PineModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999999,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: mounted ? 1 : 0, transition: "opacity 0.18s ease",
      }}
    >
      <div style={{
        background: "#131722", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14, width: 400, maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.7)", overflow: "hidden",
        transform: `scale(${mounted ? 1 : 0.95})`,
        transition: "transform 0.2s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Code2 style={{ width: 13, height: 13, color: "#22c55e" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#d1d4dc" }}>{name} — Pine Script</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
            ✕
          </button>
        </div>
        <div style={{ padding: 16 }}>
          <textarea readOnly value={code || "(no code)"} rows={10} style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "10px 12px",
            fontSize: 12, color: "#d1d4dc", outline: "none",
            fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
            lineHeight: 1.6, resize: "none",
          }} />
        </div>
      </div>
    </div>,
    document.body
  );
}

interface MoreMenuProps {
  indicator: AppliedIndicator;
  anchor: { top: number; left: number };
  onClose: () => void;
  onDelete: () => void;
  onShowPine: () => void;
  onDuplicate: () => void;
}

function MoreMenu({ indicator, anchor, onClose, onDelete, onShowPine, onDuplicate }: MoreMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => {
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const id = setTimeout(() => document.addEventListener("pointerdown", h, { capture: true }), 60);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", h, { capture: true }); };
  }, [onClose]);

  const items = [
    { icon: <Eye style={{ width: 12, height: 12 }} />, label: "Toggle visibility", action: () => { onClose(); } },
    { icon: <Copy style={{ width: 12, height: 12 }} />, label: "Duplicate", action: () => { onDuplicate(); onClose(); } },
    ...(indicator.type === "CUSTOM" ? [
      { icon: <Code2 style={{ width: 12, height: 12 }} />, label: "Show PineScript", action: () => { onShowPine(); onClose(); } },
    ] : []),
    { icon: <Trash2 style={{ width: 12, height: 12, color: "#f87171" }} />, label: "Remove", action: () => { onDelete(); onClose(); }, danger: true },
  ];

  return createPortal(
    <div ref={ref} style={{
      position: "fixed", top: anchor.top, left: anchor.left,
      background: "rgba(7,17,13,0.97)", border: "1px solid rgba(183,255,90,0.13)",
      borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
      zIndex: 9999999, minWidth: 168, overflow: "hidden",
      opacity: mounted ? 1 : 0, transform: `scale(${mounted ? 1 : 0.95})`,
      transition: "opacity 0.15s, transform 0.15s cubic-bezier(0.16,1,0.3,1)",
      backdropFilter: "blur(20px)",
      pointerEvents: "auto",
    }}>
      {items.map((item, i) => (
        <button key={i} onClick={item.action} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "9px 13px", background: "none", border: "none",
          cursor: "pointer", textAlign: "left",
          color: item.danger ? "#f87171" : "rgba(200,228,204,0.85)",
          fontSize: 12, fontWeight: 500,
        }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.07)"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

function IndicatorTag({ indicator, onToggleVisible, onDelete }: {
  indicator: AppliedIndicator;
  onToggleVisible: () => void;
  onDelete: () => void;
}) {
  const { duplicateIndicator } = useIndicatorStore();
  const [hovered, setHovered] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showPine, setShowPine] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);

  const handleMore = () => {
    const rect = moreRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuAnchor({ top: rect.bottom + 4, left: rect.left });
      setShowMore(true);
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 2,
          height: 28,
          background: hovered ? "rgba(7,17,13,0.92)" : "rgba(7,17,13,0.82)",
          border: `1px solid ${hovered ? "rgba(183,255,90,0.28)" : "rgba(183,255,90,0.1)"}`,
          borderRadius: 6,
          backdropFilter: "blur(10px)",
          transition: "border-color 0.15s, background 0.15s",
          paddingLeft: 8, paddingRight: 4,
          userSelect: "none",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: indicator.color, flexShrink: 0, marginRight: 6,
          opacity: indicator.visible ? 1 : 0.3,
          boxShadow: indicator.visible ? `0 0 4px ${indicator.color}88` : "none",
        }} />
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: indicator.visible ? "rgba(200,228,204,0.95)" : "rgba(183,220,190,0.3)",
          whiteSpace: "nowrap", lineHeight: 1,
        }}>
          {indicator.label}
        </span>
        {indicator.type === "CUSTOM" && (
          <span style={{ fontSize: 9, color: "#B7FF5A", marginLeft: 5, opacity: 0.65, fontWeight: 700, letterSpacing: "0.03em" }}>custom</span>
        )}
        {hovered && (
          <div style={{ display: "flex", alignItems: "center", marginLeft: 5 }}>
            <IconBtn title={indicator.visible ? "Hide" : "Show"} onClick={onToggleVisible}>
              {indicator.visible ? <Eye style={{ width: 12, height: 12 }} /> : <EyeOff style={{ width: 12, height: 12 }} />}
            </IconBtn>
            <IconBtn title="Settings" onClick={() => {}}>
              <Settings style={{ width: 12, height: 12 }} />
            </IconBtn>
            <IconBtn title="Remove" onClick={onDelete}>
              <Trash2 style={{ width: 12, height: 12 }} />
            </IconBtn>
            <IconBtn ref={moreRef} title="More" onClick={handleMore}>
              <MoreHorizontal style={{ width: 12, height: 12 }} />
            </IconBtn>
          </div>
        )}
      </div>

      {showMore && menuAnchor && (
        <MoreMenu
          indicator={indicator}
          anchor={menuAnchor}
          onClose={() => setShowMore(false)}
          onDelete={onDelete}
          onShowPine={() => setShowPine(true)}
          onDuplicate={() => duplicateIndicator(indicator.id)}
        />
      )}

      {showPine && (
        <PineModal
          code={(indicator.pineCode as string) ?? ""}
          name={indicator.label}
          onClose={() => setShowPine(false)}
        />
      )}
    </>
  );
}

function IconBtn({ title, onClick, children, ref }: {
  title: string; onClick: () => void; children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "3px 5px", borderRadius: 4, display: "flex", alignItems: "center",
        color: "rgba(183,220,190,0.55)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.color = "#B7FF5A";
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.1)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.color = "rgba(183,220,190,0.55)";
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

export default IndicatorTags;
