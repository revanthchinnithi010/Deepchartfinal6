// Installs a thin `window.fetch` interceptor for every relative `/api/*`
// request, handling two concerns:
//
// 1. Auth header injection: attaches the PIN bearer token to REST requests.
// 2. Base URL rewriting: prepends the configured Railway API URL to relative
//    `/api/*` requests when frontend and backend are separate services.
//
// It also wraps the browser WebSocket constructor once so the same signed PIN
// token is attached to `/api/ws` upgrades. Browsers do not allow arbitrary
// Authorization headers in `new WebSocket()`, so the backend validates the
// token from the handshake query string.

import { getStoredAuthToken } from "./authToken";

let installed = false;
let websocketPatched = false;

// Production fallback for the current Railway API service. VITE_API_BASE_URL
// can override this per deployment, but the production build must not silently
// fall back to the frontend origin and produce misleading "API offline" errors.
const PRODUCTION_API_BASE_URL = "https://workspaceapi-server-production-8b38.up.railway.app";

function resolvePath(input: RequestInfo | URL): string | null {
  try {
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : input.url;
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

function withAuthHeader(input: RequestInfo | URL, init: RequestInit | undefined): RequestInit | undefined {
  const token = getStoredAuthToken();
  if (!token) return init;

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

function installWebSocketAuth(base: string): void {
  if (websocketPatched || typeof window === "undefined" || typeof window.WebSocket === "undefined") return;
  websocketPatched = true;

  const NativeWebSocket = window.WebSocket;

  class AuthenticatedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      let nextUrl = url;
      const token = getStoredAuthToken();

      try {
        const parsed = new URL(String(url), window.location.href);
        const isApiSocket = parsed.pathname === "/api/ws" || parsed.pathname === "/ws";

        if (isApiSocket) {
          // IMPORTANT: WebSockets must be routed to the Railway backend too.
          // A relative `/api/ws` URL otherwise resolves against the frontend
          // origin, causing the live feed to connect to the wrong service.
          const backend = new URL(base);
          backend.protocol = backend.protocol === "https:" ? "wss:" : "ws:";
          backend.pathname = parsed.pathname;
          backend.search = parsed.search;

          if (token) {
            backend.searchParams.set("token", token);
          }

          nextUrl = backend.toString();
        }
      } catch {
        // Fall back to the original URL; the normal reconnect flow handles it.
      }

      super(nextUrl, protocols);
    }
  }

  window.WebSocket = AuthenticatedWebSocket as typeof WebSocket;
}

export function installApiBaseUrl(): void {
  if (installed) return;
  installed = true;

  const rawBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  let base = (rawBase?.trim() || PRODUCTION_API_BASE_URL).replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }

  console.info(`[api-base-url] Routing relative /api/* requests to ${base}`);

  const resolvedBase = base;
  const realFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const path = resolvePath(input);
    if (!path || !path.startsWith("/api")) return realFetch(input, init);

    const mergedInit = withAuthHeader(input, init);

    const search = (() => {
      try {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
          window.location.origin,
        );
        return url.search;
      } catch {
        return "";
      }
    })();
    const absolute = `${resolvedBase}${path}${search}`;

    if (typeof input === "string" || input instanceof URL) {
      return realFetch(absolute, mergedInit);
    }
    return realFetch(new Request(absolute, input), mergedInit);
  };

  installWebSocketAuth(resolvedBase);
}
