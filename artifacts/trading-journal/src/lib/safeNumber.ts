/**
 * safeNumber — defensive coercion for values that are *expected* to be
 * finite numbers (API response fields, computed stats, store slices) but
 * whose presence isn't guaranteed at runtime the way TypeScript types
 * promise at compile time.
 *
 * Background: components across this app repeatedly do a *container*-level
 * guard (`stats ? ... : "—"`, `hasStats ? ... : ""`) and then call
 * `.toFixed()` directly on an individual field of that container. That
 * protects against `stats` itself being `undefined`, but not against a
 * single field being missing/null on an otherwise-present object — e.g. a
 * symbol with zero closed trades, a partial/optimistic cache entry, or a
 * backend contract change that drops one field. `undefined.toFixed()` /
 * `null.toFixed()` then throws and (via the nearest error boundary) takes
 * down the whole page. `Number.isFinite` is the only runtime-safe check.
 *
 * Usage:
 *   const winRate = n(stats?.winRate);       // -> 0 if missing/null/NaN
 *   winRate.toFixed(1);
 */

const isDev =
  typeof import.meta !== "undefined" &&
  Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

const warnedLabels = new Set<string>();

/**
 * Returns `value` unchanged when it's a finite number; otherwise returns
 * `fallback` (default `0`). In development, logs a console warning (once
 * per unique label) whenever a *defined, non-null* value fails the check,
 * so the source of bad data can be traced.
 */
export function n(value: unknown, fallback = 0, label?: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (isDev && value !== undefined && value !== null) {
    const key = label ?? "unknown source";
    if (!warnedLabels.has(key)) {
      warnedLabels.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `[safeNumber] Expected a finite number but received ${String(value)} (type: ${typeof value}) for "${key}". ` +
          `Falling back to ${fallback}. Check the upstream data source for a shape mismatch.`,
      );
    }
  }

  return fallback;
}

/** Alias matching the common `safeX` naming used at call sites. */
export const safeNumber = n;
