---
name: Secrets added after process start are invisible until restart
description: Debugging "credentials missing" errors when Replit Secrets exist but the running server reports them as unset
---

Node (and most runtimes) snapshot `process.env` at process boot. If a Replit Secret is added or edited *after* a workflow's process already started, that process will keep reporting the var as unset even though the shell/new processes see it correctly.

**Why:** Replit Secrets are injected into the environment at process start, not live-reloaded into already-running processes.

**How to apply:** When a diagnostic endpoint or debug tool shows `hasX: false` for an env var that is confirmed present in Replit Secrets (e.g. via a fresh shell `env | grep`), the fix is almost always to restart the workflow/process — not to change the config-loading code. Check this before assuming the loader logic (env vs DB fallback, variable name typos, etc.) is broken.
