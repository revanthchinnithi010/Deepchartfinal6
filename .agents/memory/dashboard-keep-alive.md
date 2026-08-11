---
name: Dashboard keep-alive (trading journal web)
description: Dashboard ("/") is mounted permanently, same pattern as Charts — never remounted by route changes.
---

## Rule
Dashboard is rendered via a permanently-mounted keep-alive node (`DASHBOARD_NODE` in `App.tsx`, toggled by CSS `display` inside `Layout`), exactly mirroring how Charts was already handled. It is NOT part of the `AnimatePresence`/route-keyed mount-unmount tree that every other page uses.

**Why:** every other page fully unmounts and remounts on each navigation (`AnimatePresence mode="wait"`, keyed by pathname). For Dashboard specifically this caused a visible bug on every tab switch back to "/": react-query refetch cycle, loss of all `useMemo` caches, and a full internal subtree replacement (its own loading-skeleton → ready-content swap) replaying on every single visit — this read to users as a first-frame flash / layout jump. Keeping it mounted means that internal swap only ever happens once per app session (first load), and returning to "/" is just an instant `display:flex` toggle on an already-fully-rendered, live-updating tree.

**How to apply:**
- Any new page that needs the same "must never flash/jump on tab return" guarantee should follow the identical pattern: build a `<PageName>KeepAlive` wrapper (reading its own `isMobile`/etc. via hooks so the JSX element reference is 100% stable), wrap in `Suspense`, assign to a module-level `const X_NODE = (...)`, pass as a new prop into `Layout`, and add a sibling `display:none/flex` div in `layout.tsx` gated on `pathname === "/whatever"`. Remove that page's branch from the `AnimatePresence` list in `App.tsx` — it must not participate in mount/unmount routing anymore.
- When a keep-alive page has its own internal loading-skeleton phase, make sure the skeleton's section heights match the real content's fixed heights pixel-for-pixel, since that swap still happens once at cold start and any mismatch still causes a one-time layout jump.
