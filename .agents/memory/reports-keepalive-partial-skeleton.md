---
name: Reports keep-alive + partial skeleton
description: How the trading-journal Reports page avoids a blank/full-page flash on first open
---

Reports is mounted permanently (keep-alive), exactly like Dashboard/Charts — added a
`reportsNode` prop to `Layout` and a `REPORTS_NODE`/`ReportsPreload` wrapper in `App.tsx`
that delays mounting ~400ms past initial paint so it doesn't compete with Dashboard's
first-paint network work. It was removed from the `AnimatePresence` page-transition
switch entirely.

Inside `reports.tsx`, the page shell (header, segmented control, every card's header/icon)
always renders unconditionally. Only the specific value/chart region inside a card falls
back to a sized shimmer placeholder (`ChartSkeleton`, or `MetricCard`'s `loading` prop)
when its backing query is still pending — never a whole-page swap.

**Why:** the previous version did an early `return` of a bare skeleton grid whenever
`stats`/`symbolStats` were undefined, replacing the ENTIRE page (no header, no segmented
control). Combined with AnimatePresence mount/unmount on every nav, this reproduced as a
"blank/full-screen loader on first open." Dashboard's existing pattern (in `dashboard.tsx`)
still does an all-or-nothing full skeleton swap while loading — that was intentionally
*not* copied for Reports because the user explicitly required header/cards to stay visible
during loading, not just "loads fast because it's cached."

**How to apply:** when adding a new keep-alive page beyond Dashboard/Charts/Reports, prefer
per-section skeletons over Dashboard's all-or-nothing style if the requirement is "never
hide the page," and always prefetch any query keys unique to that page (ones Dashboard
doesn't already warm) via `queryClient.prefetchQuery` in `App.tsx`'s `Router` effect.
