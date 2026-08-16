import { createRoot } from "react-dom/client";
import "./index.css";
import "./light-header-wordmark.css";
import "./lib/drawingFavoritesEnhancer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PinGate } from "./components/PinGate";
import { installApiBaseUrl } from "./lib/installApiBaseUrl";

installApiBaseUrl();

// ── On-device debug console ────────────────────────────────────────────────
// Loads Eruda only when explicitly requested with ?debug=1.
if (new URLSearchParams(window.location.search).get("debug") === "1") {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/eruda";
  document.body.appendChild(s);
  s.onload = () => {
    // @ts-expect-error — eruda attaches itself to window at runtime
    window.eruda?.init();
  };
}

// Mock fetch / mock broker state are intentionally NOT installed here.
// The production app must always use the real backend/database and must never
// display development/demo trades or seeded PNL values.

// ── Disable accidental pinch-zoom & double-tap zoom on mobile/tablet ───────
document.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

const rootEl = document.getElementById("root")!;

function renderFatalBootError(error: unknown) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("[boot] Failed to load the app:", error);
  rootEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:#0b0b0f;color:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;z-index:999999;";
  wrap.innerHTML = `
    <div style="font-size:18px;font-weight:600;">The app failed to start.</div>
    <div style="font-size:13px;color:#a1a1aa;max-width:560px;">An error occurred before the app could load. Reloading usually fixes this.</div>
    <pre style="max-width:640px;max-height:200px;overflow:auto;text-align:left;font-size:12px;background:#18181b;border:1px solid #27272a;border-radius:8px;padding:12px;color:#fca5a5;white-space:pre-wrap;word-break:break-word;"></pre>
    <button style="margin-top:4px;padding:8px 18px;border-radius:8px;border:1px solid #3f3f46;background:#27272a;color:#f4f4f5;font-size:13px;cursor:pointer;">Reload</button>
  `;
  wrap.querySelector("pre")!.textContent = message;
  wrap.querySelector("button")!.addEventListener("click", () => window.location.reload());
  rootEl.appendChild(wrap);
}

async function boot() {
  console.info("[boot] Starting app…");
  try {
    const { default: App } = await import("./App");
    console.info("[boot] App module loaded, mounting React root…");

    const root = createRoot(rootEl, {
      onUncaughtError: (error, errorInfo) => {
        console.error("[boot] onUncaughtError:", error, errorInfo.componentStack);
      },
      onCaughtError: (error, errorInfo) => {
        console.error("[boot] onCaughtError:", error, errorInfo.componentStack);
      },
      onRecoverableError: (error, errorInfo) => {
        console.warn("[boot] onRecoverableError:", error, errorInfo.componentStack);
      },
    });

    root.render(
      <ErrorBoundary>
        <PinGate>
          <App />
        </PinGate>
      </ErrorBoundary>,
    );
    console.info("[boot] Mounted.");
  } catch (error) {
    renderFatalBootError(error);
  }
}

void boot();
