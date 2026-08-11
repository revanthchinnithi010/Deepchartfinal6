// Installs a thin `window.fetch` interceptor that serves deterministic mock
// JSON for a known set of `/api/*` GET routes (see mockApi.ts), and passes
// everything else straight through to the real network.
//
// This is the single interception point for BOTH:
//  - react-query hooks generated from the OpenAPI spec (they all funnel
//    through `customFetch`, which itself calls the global `fetch`)
//  - direct `fetch()` calls made by pages/stores (alerts.tsx, brokerStore,
//    brokerWatchlistStore, marketStore, etc.)
//
// To remove: delete this file's call site in `main.tsx` (and this whole
// `src/mock/` folder). Nothing else in the app needs to change — mutation
// requests (POST/PATCH/DELETE) are left untouched and go to the real API.
import { DEV_MODE } from "./config";
import { matchMockRoute } from "./mockApi";

let installed = false;

function resolvePath(input: RequestInfo | URL): { path: string; search: URLSearchParams } | null {
  try {
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : input.url;
    const parsed = new URL(url, window.location.origin);
    return { path: parsed.pathname, search: parsed.searchParams };
  } catch {
    return null;
  }
}

export function installMockFetch(): void {
  if (installed || !DEV_MODE) return;
  installed = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET") return realFetch(input, init);

    const resolved = resolvePath(input);
    if (!resolved) return realFetch(input, init);

    const mockBody = matchMockRoute(method, resolved.path, resolved.search);
    if (mockBody === undefined) return realFetch(input, init);

    return Promise.resolve(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  // eslint-disable-next-line no-console
  console.info("[mock-data] DEV_MODE is on — serving deterministic mock data for known /api/* GET routes.");
}
