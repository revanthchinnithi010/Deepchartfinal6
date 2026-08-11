/**
 * AppHeader — shared navigation header used by Dashboard (Alerts overlay),
 * Markets, and Select Alert Type overlays.
 *
 * Spec (single source of truth):
 *   • Total height : calc(56px + safeTop)
 *   • Top padding  : safeTop  — places content below notch.
 *                    safeTop = env(safe-area-inset-top) normally.
 *                    safeTop = 0px inside the Expo tablet WebView: the native
 *                    layer already reserves insets.top as a spacer above the
 *                    WebView (index.tsx), so adding it again here double-counts.
 *                    Detected via window.__EXPO_TABLET__ set by
 *                    injectedJavaScriptBeforeContentLoaded.
 *   • Side padding : 16px each side
 *   • Gap          : 12px between back button and title
 *   • Back button  : 32 × 32 circle, transparent bg, no border
 *   • Back icon    : ArrowLeft 20 × 20, rgba(255,255,255,0.6)
 *   • Title        : 17px / 700 weight / #ffffff
 *   • Border       : 1px solid rgba(255,255,255,0.07) bottom
 *   • Background   : #000000 (override via `background` prop when needed)
 */

import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

interface AppHeaderProps {
  /** Page / screen title rendered next to the back button. */
  title: string;
  /** Called when the back button is pressed. */
  onBack: () => void;
  /** Override background colour — defaults to #000000. */
  background?: string;
  /** Optional content slotted after the title (e.g. action icons). */
  children?: ReactNode;
  /**
   * When provided, renders a ✕ Close button on the right side of the header.
   * Used in the Alerts flow to exit the entire flow and return to Dashboard.
   */
  onCloseAll?: () => void;
}

/**
 * Returns the CSS value to use for the top safe-area padding.
 * Called at render time so it picks up window.__EXPO_TABLET__ reliably
 * (the flag is set by injectedJavaScriptBeforeContentLoaded before any React
 * code runs, but reading it at module-load time would be fragile on Android
 * where injection timing relative to the JS bundle can vary).
 */
function getSafeTop(): string {
  if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__EXPO_TABLET__) {
    return "0px";
  }
  return "env(safe-area-inset-top)";
}

const HEADER_BASE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 16px",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  flexShrink: 0,
};

const BACK_BTN: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "rgba(255,255,255,0.6)",
  flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
};

/** Minimum 44×44 touch target wrapping the 32×32 visual circle. */
const CLOSE_BTN_WRAP: CSSProperties = {
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  marginRight: -6, // optical alignment with 16px side padding
};

const CLOSE_BTN: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "rgba(255,255,255,0.6)",
  WebkitTapHighlightColor: "transparent",
};

const TITLE: CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: "#ffffff",
  margin: 0,
  flex: 1,
  lineHeight: 1.2,
};

export function AppHeader({
  title,
  onBack,
  background = "#000000",
  children,
  onCloseAll,
}: AppHeaderProps) {
  const safeTop = getSafeTop();
  return (
    <div style={{
      ...HEADER_BASE,
      background,
      paddingTop: safeTop,
      height: `calc(56px + ${safeTop})`,
    }}>
      <button onClick={onBack} style={BACK_BTN}>
        <ArrowLeft style={{ width: 20, height: 20 }} />
      </button>
      <h1 style={TITLE}>{title}</h1>
      {children}
      {onCloseAll && (
        <div style={CLOSE_BTN_WRAP}>
          <button onClick={onCloseAll} style={CLOSE_BTN} aria-label="Close alerts flow">
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
      )}
    </div>
  );
}
