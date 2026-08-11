---
name: Layout content wrapper stability
description: How to avoid mid-transition layout context changes that break page exit animations in the trading journal web app.
---

## Rule
The `Layout` component must use a **single, stable content wrapper div** for all non-chart routes. Never branch on `location` to switch between different overflow/flex wrappers.

## Why
`AnimatePresence mode="popLayout"` removes exiting page elements from the layout flow (sets `position: absolute`). If the wrapper div changes class/structure at the same moment `location` changes, the exiting animation plays inside the NEW layout context — causing visible zoom/resize artifacts. This was the root cause of the Dashboard → Portfolio layout shift bug.

## How to apply
- `layout.tsx` content wrapper: always `flex-1 flex flex-col overflow-hidden` for all non-chart pages
- Standard pages (need scroll + padding): use `<StandardPageWrapper>` in `App.tsx` (overflow-auto + p-5 max-w-[1400px]) wrapping page content inside PageTransition
- Full-height pages (Portfolio, Markets): manage their own `h-full flex flex-col` + scrolling internally; do NOT use StandardPageWrapper
- Header: keep always rendered on non-chart routes; animate opacity to 0 on /portfolio and /markets but **never remove from DOM** — that 60px is load-bearing for layout stability during transitions
