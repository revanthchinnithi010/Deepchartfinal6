---
name: Broker encryption key derivation & recovery
description: Key derivation changed from slice-to-32 to SHA-256; stored credentials become undecryptable if BROKER_ENCRYPTION_KEY is missing or changed; 401 recovery flow.
---

## Rule
`BROKER_ENCRYPTION_KEY` must be set in Replit Secrets for any broker account to work. If missing, all broker routes return **401** (not 500) with a "reconnect required" message.

## Key derivation history
- **Old (legacy):** `Buffer.from(raw.slice(0, 32), "utf8")` — only works for ASCII secrets ≥32 chars
- **New (current):** `createHash("sha256").update(raw).digest()` — always 32 bytes, any input length

The `decrypt()` function tries the SHA-256 key first, then falls back to the legacy slice key, so *if the same BROKER_ENCRYPTION_KEY is present*, old credentials continue to decrypt.

## What breaks
If `BROKER_ENCRYPTION_KEY` is absent OR was changed/deleted since credentials were encrypted, decryption fails. `getBrokerAdapter()` catches this and returns HTTP 401 (not 500) with message:
> "Cannot decrypt stored credentials — the encryption key changed or is missing. Set BROKER_ENCRYPTION_KEY in Replit Secrets, then reconnect your broker account."

## Recovery steps for user
1. Go to **Tools → Secrets** in Replit sidebar
2. Add secret: **Key** = `BROKER_ENCRYPTION_KEY`, **Value** = any strong string (e.g. output of `openssl rand -hex 32`)
3. The API server auto-restarts and picks up the new key
4. In the app: remove the broken broker account and reconnect it — credentials will be re-encrypted with the new key

**Why:** If the old key value is not known, existing DB credentials are unrecoverable — the user must reconnect to re-encrypt fresh.

## Dev fallback
When `BROKER_ENCRYPTION_KEY` is unset in development, `deriveDevKey()` hashes a fixed dev string with SHA-256. This only works if the credentials were also encrypted without the key (i.e., on first connect with no key set). Setting the key later will break dev credentials too — user must reconnect.
