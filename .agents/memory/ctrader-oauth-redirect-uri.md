---
name: cTrader OAuth redirect URI must track live dev domain
description: Debugging OAuth popups landing on Replit's "Run this app" placeholder instead of the callback route
---

If an OAuth popup (cTrader or similar) lands on Replit's generic "Run this app to see the results here." page after authorizing, the redirect_uri sent to the provider is pointing at a domain that no longer routes to this workspace — almost always a stale `*_REDIRECT_URI` env var left over from before the Replit dev preview domain rotated (new workspace, repl reload/fork, etc.).

**Why:** Replit's dev preview domain (`REPLIT_DEV_DOMAIN`) can change between sessions. A redirect URI env var hardcoded to an old domain silently goes stale — the server keeps building valid-looking auth URLs, but they point nowhere.

**How to apply:** Prefer deriving the redirect URI from the current request's `x-forwarded-host`/`x-forwarded-proto` headers (reliable behind Replit's proxy with `trust proxy` enabled) rather than trusting a fixed env var. Use the env var only as a last-resort fallback for non-request contexts. Still, remember the exact URI must be manually kept in sync with what's registered in the provider's developer portal (e.g. cTrader Open API app config) — that side can't be automated. For a truly stable callback URL across domain rotations, register the deployed `.replit.app` (or custom) domain instead of the dev preview domain.
