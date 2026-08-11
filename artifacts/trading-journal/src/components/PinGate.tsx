import { useEffect, useRef, useState, type ReactNode } from "react";
import { getStoredAuthToken, setStoredAuthToken, clearStoredAuthToken } from "../lib/authToken";

/**
 * Gates the whole app behind a PIN screen when the backend has APP_PIN
 * configured. Token-based (not cookie/session-based): successful
 * verification returns a signed bearer token, stored in localStorage and
 * attached as Authorization: Bearer on every /api/* request via
 * installApiBaseUrl.ts — sidesteps mobile Chrome's third-party cookie
 * blocking on cross-origin (two-Railway-domain) deployments.
 */
export function PinGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getStoredAuthToken();
        const res = await fetch("/api/auth/status", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await res.json()) as { pinRequired: boolean; verified: boolean };
        if (cancelled) return;
        if (data.pinRequired && !data.verified) {
          // Stored token (if any) is missing/expired/invalid — clear it so
          // we don't keep sending a dead token on every request.
          clearStoredAuthToken();
        }
        setStatus(!data.pinRequired || data.verified ? "unlocked" : "locked");
      } catch {
        // If the status check itself fails (e.g. backend briefly
        // unreachable), fail open rather than locking someone out of an
        // app that never had a PIN configured in the first place.
        if (!cancelled) setStatus("unlocked");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (status === "locked") inputRef.current?.focus();
  }, [status]);

  async function submit() {
    if (!pin || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json().catch(() => null)) as { ok: boolean; token?: string } | null;
      if (res.ok && data?.ok) {
        if (data.token) setStoredAuthToken(data.token);
        setStatus("unlocked");
      } else {
        setError("Incorrect PIN");
        setPin("");
      }
    } catch {
      setError("Couldn't reach the server — try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    );
  }

  if (status === "unlocked") {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <div className="mb-2 text-sm tracking-[0.3em] text-white/40">REVANTH</div>
          <div className="text-base font-medium text-white/80">Enter PIN to continue</div>
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          placeholder="PIN"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-lg tracking-[0.3em] text-white placeholder:text-white/20 focus:border-white/30 focus:outline-none"
        />

        {error && (
          <div className="mt-3 text-center text-sm text-red-400">{error}</div>
        )}

        <button
          onClick={() => void submit()}
          disabled={!pin || submitting}
          className="mt-4 w-full rounded-xl bg-white/90 py-3 text-sm font-semibold text-black transition-opacity disabled:opacity-40"
        >
          {submitting ? "Checking…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}
