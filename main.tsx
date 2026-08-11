import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { installMockFetch } from "./mock/installMockFetch";
import { installMockBrokerState } from "./mock/seedBrokerState";

// When the frontend and api-server are deployed as separate Railway services,
// API calls need an absolute URL. Set VITE_API_BASE_URL to the api-server's
// Railway public URL (e.g. https://api-server-production.up.railway.app).
// Left unset, requests stay relative (/api/...) — same-origin setups are unaffected.
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBaseUrl) setBaseUrl(apiBaseUrl);

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

createRoot(document.getElementById("root")!).render(<App />);
