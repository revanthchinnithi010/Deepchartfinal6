/**
 * heroTransition — lightweight module-level store for shared element transitions.
 *
 * Stores the bounding rect of the tapped source element so the destination
 * component can read it once on mount and use it as the animation's starting
 * position.  A plain module variable (not Zustand/React state) because the
 * value only needs to be read once per navigation — not subscribed to reactively.
 */

let _rect: DOMRect | null = null;
let _key:  string | null  = null;

/** Record the source element's bounding rect immediately before navigating. */
export function setHeroRect(key: string, rect: DOMRect): void {
  _rect = rect;
  _key  = key;
}

/**
 * Read the stored rect for the given key and clear it.
 * Returns null when no rect is stored or the key does not match.
 * After reading, the value is cleared so it is consumed only once per
 * navigation.
 */
export function consumeHeroRect(key: string): DOMRect | null {
  if (_key !== key || !_rect) return null;
  const r = _rect;
  _rect = null;
  _key  = null;
  return r;
}
