// Installs a thin `window.fetch` interceptor for every relative `/api/*`
// request, handling two concerns:
//
// 1. Auth header injection (always on, regardless of deployment shape):
//    attaches `Authorization: Bearer <token>` from the token issued by
//    POST /api/auth/verify-pin. This replaced a cookie/session-based
//    approach — mobile Chrome blocks third-party/cross-site cookies
//    (SameSite=None) by default whenever the frontend and backend live on
//    two different Railway domains. A bearer token in a normal header has
//    no such cross-site cookie policy to run into.
//
// 2. Base URL rewriting (opt-in via `VITE_API_BASE_URL`): prepends the
//    backend's public origin to every relative `/api/*` request, when the
//    frontend and backend are deployed as two separate Railway services.

import { getStoredAuthToken } from "./authToken";

let installed = false;

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

export function installApiBaseUrl(): void {
  if (installed) return;
  installed = true;

  const rawBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  let base = rawBase?.trim().replace(/\/+$/, "");

  if (base) {
    // Guard against pasting just the Railway domain without a scheme.
    if (!/^https?:\/\//i.test(base)) {
      base = `https://${base}`;
    }
    // eslint-disable-next-line no-console
    console.info(`[api-base-url] Routing relative /api/* requests to ${base}`);
  }

  const resolvedBase = base;
  const realFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const path = resolvePath(input);
    if (!path || !path.startsWith("/api")) return realFetch(input, init);

    const mergedInit = withAuthHeader(input, init);

    if (!resolvedBase) {
      // Same-origin deployment: no URL rewriting needed, just the auth header.
      return realFetch(input, mergedInit);
    }

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
    // Request object: rebuild with the absolute URL, preserving its own
    // init, then layer the auth header on top the same way.
    return realFetch(new Request(absolute, input), mergedInit);
  };
}
