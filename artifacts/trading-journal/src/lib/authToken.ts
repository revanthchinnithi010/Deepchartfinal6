// Storage for the bearer token issued by POST /api/auth/verify-pin (see
// api-server/src/routes/auth.ts). Kept in localStorage rather than a
// cookie deliberately: cookies are subject to SameSite/third-party
// blocking on cross-origin deployments, which was silently breaking auth
// on mobile Chrome. localStorage has no such cross-site policy.

const STORAGE_KEY = "pinAuthToken";

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can throw (e.g. private-browsing quota, disabled storage).
    // Fail open to "no token" — the PIN gate will simply re-prompt.
    return null;
  }
}

export function setStoredAuthToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Nothing we can do if storage is unavailable — the user will just be
    // asked for the PIN again next load.
  }
}

export function clearStoredAuthToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
