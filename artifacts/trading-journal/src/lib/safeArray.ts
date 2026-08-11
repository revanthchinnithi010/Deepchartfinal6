/**
 * safeArray — defensive normalization for values that are *expected* to be
 * arrays (API responses, Firebase snapshots, localStorage blobs, zustand
 * store slices, etc.) but whose shape isn't guaranteed at runtime the way
 * TypeScript types promise at compile time.
 *
 * Background: `value ?? []` only protects against `null`/`undefined` — if a
 * backend contract changes (e.g. an array response gets wrapped in a
 * pagination envelope like `{ data: [...], total }`), the value is still
 * "truthy" and `?? []` does nothing, so `.map`/`.forEach`/`.filter` blow up
 * with `TypeError: x.map is not a function`. `Array.isArray` is the only
 * runtime-safe check.
 *
 * Usage:
 *   const items = toArray(apiResponse?.trades, "trades.tradesResponse");
 *   items.map(...)
 */

const isDev =
  typeof import.meta !== "undefined" &&
  Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

/**
 * Returns `value` unchanged when it's a real array; otherwise returns `[]`.
 * In development, logs a console warning (once per unique label) whenever a
 * *defined, non-null* value fails the array check, so the source of bad
 * data can be traced. Loading states (`undefined`) are treated as
 * expected/normal and never warn.
 */
const warnedLabels = new Set<string>();

export function toArray<T = unknown>(value: unknown, label?: string): T[] {
  if (Array.isArray(value)) return value as T[];

  if (isDev && value !== undefined && value !== null) {
    const key = label ?? "unknown source";
    if (!warnedLabels.has(key)) {
      warnedLabels.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `[safeArray] Expected an array but received ${typeof value === "object" ? JSON.stringify(value)?.slice(0, 200) : String(value)} ` +
          `(type: ${typeof value}) for "${key}". Falling back to an empty array. ` +
          `Check the upstream data source (API/Firebase/localStorage/state) for a shape mismatch.`,
      );
    }
  }

  return [];
}

/** Alias matching the common `safeX` naming used at call sites. */
export const safeArray = toArray;
