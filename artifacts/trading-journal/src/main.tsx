import { createRoot } from "react-dom/client";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PinGate } from "./components/PinGate";
import { installApiBaseUrl } from "./lib/installApiBaseUrl";
import { installMockFetch } from "./mock/installMockFetch";
import { installMockBrokerState } from "./mock/seedBrokerState";

// Must run before any fetch happens (including the mock interceptor below,
// which passes non-mocked requests through to whatever `window.fetch` is at
// that point) — see installApiBaseUrl.ts for why this is needed whenever the
// frontend and backend are on different origins (e.g. two Railway services).
installApiBaseUrl();

// ── On-device debug console ────────────────────────────────────────────────
// Loads Eruda (a floating dev-console for phones with no desktop/USB
// debugging available) whenever the page URL has `?debug=1`. Safe no-op
// otherwise — only pulls the script from jsDelivr when explicitly requested.
// Usage: open  https://<your-app>/?debug=1  on the phone, tap the floating
// circle it adds in the corner, then check its "Console" tab.
if (new URLSearchParams(window.location.search).get("debug") === "1") {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/eruda";
  document.body.appendChild(s);
  s.onload = () => {
    // @ts-expect-error — eruda attaches itself to window at runtime
    window.eruda?.init();
  };
}

// Dev-only deterministic mock data layer — see src/mock/config.ts (DEV_MODE).
// No-op (dead-code-eliminated) in production builds.
installMockFetch();
installMockBrokerState();

// ── Disable accidental pinch-zoom & double-tap zoom on mobile/tablet ──────────
document.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    // Only block multi-finger (pinch) gestures — single finger scroll is fine
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);
// ─────────────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById("root")!;

/**
 * Renders a plain-DOM error message. Deliberately does NOT use React — this
 * path only runs when something went wrong before/while React itself was
 * loading (e.g. an error thrown while evaluating App.tsx's import graph), so
 * we can't assume React is in a usable state.
 */
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
    // Dynamic import so an exception thrown anywhere in App's import graph
    // (module-level code, not just render) is caught here explicitly,
    // instead of silently failing during the static <script type="module">
    // evaluation before React ever gets a chance to run.
    const { default: App } = await import("./App");
    console.info("[boot] App module loaded, mounting React root…");

    const root = createRoot(rootEl, {
      onUncaughtError: (error, errorInfo) => {
        console.error(
          "[boot] onUncaughtError — a render error escaped every ErrorBoundary:",
          error,
          errorInfo.componentStack,
        );
      },
      onCaughtError: (error, errorInfo) => {
        console.error("[boot] onCaughtError — caught by ErrorBoundary:", error, errorInfo.componentStack);
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
