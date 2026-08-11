// ─────────────────────────────────────────────────────────────────────────────
// DEV MOCK DATA — single on/off switch
//
// Flip `DEV_MODE` to false (or delete this whole `src/mock/` folder + the two
// call sites in `main.tsx` / `NetPnLAnalytics.tsx`) to fully remove the mock
// data layer. It is NEVER active in a production build because it is gated
// on Vite's `import.meta.env.DEV`, which is statically false once built —
// dead-code-eliminated out of the production bundle entirely.
//
// Optional escape hatch for local testing against the real API/Supabase
// while still running `vite dev`: set VITE_DISABLE_MOCK_DATA=true.
// ─────────────────────────────────────────────────────────────────────────────
export const DEV_MODE: boolean =
  import.meta.env.DEV && import.meta.env.VITE_DISABLE_MOCK_DATA !== "true";
