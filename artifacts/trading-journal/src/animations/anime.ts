/**
 * Anime.js v4 — utility wrappers for imperative animations.
 * Used for: splash screen, logo reveal, SVG drawing, number counters,
 * loading animations, and special visual effects.
 *
 * GPU rule: animate transform and opacity only — never layout props.
 * boxShadow is avoided; use filter/scale/opacity for glow effects.
 */
import { animate, createTimeline, utils, svg } from "animejs";

export { animate, createTimeline, utils, svg };

// ── Splash / Logo reveal ──────────────────────────────────────────────────
/**
 * Animate the splash screen logo reveal sequence.
 * Targets elements by class inside `container`.
 */
export function animateSplashReveal(container: HTMLElement) {
  const q = (sel: string): NodeListOf<Element> =>
    container.querySelectorAll(sel);

  // Set initial invisible state via utils.set (v4 API)
  utils.set(q(".splash-ring"),     { opacity: 0, scale: 0.4 });
  utils.set(q(".splash-logo"),     { opacity: 0, scale: 0.6 });
  utils.set(q(".splash-char"),     { opacity: 0, translateY: 24 });
  utils.set(q(".splash-subtitle"), { opacity: 0, translateY: 8 });
  utils.set(q(".splash-glow"),     { opacity: 0, scale: 0.5 });

  const tl = createTimeline({ autoplay: true });

  // 1. Glow halo expands first
  tl.add(q(".splash-glow"), {
    opacity:  [0, 0.6],
    scale:    [0.4, 1.2],
    duration: 700,
    ease:     "outExpo",
  }, 0);

  // 2. Ring snaps in with spring overshoot
  tl.add(q(".splash-ring"), {
    scale:    [0.4, 1],
    opacity:  [0, 1],
    duration: 550,
    ease:     "spring(1, 90, 12, 0)",
  }, 80);

  // 3. Logo icon scale-in
  tl.add(q(".splash-logo"), {
    scale:    [0.6, 1],
    opacity:  [0, 1],
    duration: 480,
    ease:     "spring(1, 100, 14, 0)",
  }, 260);

  // 4. Title characters fly up — staggered
  tl.add(q(".splash-char"), {
    translateY: [24, 0],
    opacity:    [0, 1],
    duration:   420,
    delay:      utils.stagger(38),
    ease:       "outExpo",
  }, 520);

  // 5. Subtitle fades in
  tl.add(q(".splash-subtitle"), {
    opacity:    [0, 1],
    translateY: [8, 0],
    duration:   360,
    ease:       "outExpo",
  }, 870);

  return tl;
}

// ── Splash exit ────────────────────────────────────────────────────────────
export function animateSplashExit(
  container: HTMLElement,
  onComplete?: () => void,
) {
  const params: Parameters<typeof animate>[1] = {
    opacity:  [1, 0],
    scale:    [1, 1.04],
    duration: 380,
    ease:     "inExpo",
  };
  if (onComplete) {
    // Only set onComplete when a callback is provided — avoids undefined-field TS error
    (params as Record<string, unknown>).onComplete = () => { onComplete(); };
  }
  return animate(container, params);
}

// ── Number counter ─────────────────────────────────────────────────────────
export function animateCounter(
  el: HTMLElement,
  from: number,
  to: number,
  options: {
    duration?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    ease?: string;
    onUpdate?: (value: number) => void;
  } = {},
) {
  const {
    duration = 1100,
    decimals = 0,
    prefix   = "",
    suffix   = "",
    ease     = "outExpo",
    onUpdate,
  } = options;

  const obj = { value: from };

  return animate(obj, {
    value:    to,
    duration,
    ease,
    onUpdate() {
      const v = decimals > 0
        ? obj.value.toFixed(decimals)
        : Math.round(obj.value).toLocaleString();
      el.textContent = `${prefix}${v}${suffix}`;
      onUpdate?.(obj.value);
    },
  });
}

// ── SVG path draw via createDrawable ─────────────────────────────────────
/**
 * Draw SVG paths from 0→1 using Anime.js v4 `createDrawable` API.
 * Each path gets an independent draw animation with stagger delay.
 */
export function animateSvgPaths(
  selector: string,
  duration = 900,
  staggerMs = 80,
) {
  // createDrawable registers the SVG geometry for draw-based animation
  svg.createDrawable(selector);

  return animate(selector, {
    draw:     "0 1",
    duration,
    ease:     "inOutSine",
    delay:    utils.stagger(staggerMs),
  });
}

// ── Loading dots ───────────────────────────────────────────────────────────
export function animateLoadingDots(
  container: HTMLElement,
  options: { loop?: boolean } = {},
) {
  const { loop = true } = options;
  const dots = container.querySelectorAll(".loading-dot");

  return animate(dots, {
    translateY: [-7, 0],
    opacity:    [0.25, 1],
    duration:   480,
    delay:      utils.stagger(110),
    loop,
    alternate:  true,
    ease:       "inOutSine",
  });
}

// ── SVG ring spinner ───────────────────────────────────────────────────────
/**
 * Animates an SVG circle element as a spinner using createDrawable for
 * the dash effect and a separate rotate on the parent SVG.
 * Returns a { stop() } handle for cleanup.
 */
export function animateSvgSpinner(
  circleEl: SVGCircleElement,
  options: { duration?: number } = {},
) {
  const { duration = 900 } = options;
  const svgEl = circleEl.closest("svg");

  // Register circle for drawable animation
  svg.createDrawable(circleEl as unknown as string);

  // Dash fill/unfill loop
  const dash = animate(circleEl as unknown as string, {
    draw:      ["0 0.25", "0.25 1", "0 0.25"],
    duration:  duration * 2,
    loop:      true,
    ease:      "inOutSine",
  });

  // CSS rotation via transform — GPU-composited
  const spin = svgEl
    ? animate(svgEl, {
        rotate:   [0, 360],
        duration,
        loop:     true,
        ease:     "linear",
      })
    : null;

  return {
    stop() {
      dash.pause();
      spin?.pause();
    },
  };
}

// ── Stagger in — generic list reveal ─────────────────────────────────────
export function animateStaggerIn(
  targets: NodeListOf<Element> | Element[],
  options: { delayMs?: number; fromY?: number; duration?: number } = {},
) {
  const { delayMs = 55, fromY = 16, duration = 480 } = options;

  return animate(targets as unknown as string, {
    translateY: [fromY, 0],
    opacity:    [0, 1],
    duration,
    delay:      utils.stagger(delayMs),
    ease:       "outExpo",
  });
}

// ── Pulse glow — GPU-safe: scale + opacity only (no boxShadow) ────────────
export function animatePulseGlow(target: HTMLElement) {
  return animate(target, {
    scale:    [1, 1.06, 1],
    opacity:  [1, 0.72, 1],
    duration: 1000,
    ease:     "inOutSine",
    loop:     true,
  });
}

// ── Number pop (small value highlight) ────────────────────────────────────
export function animateValuePop(el: HTMLElement) {
  return animate(el, {
    scale:    [1, 1.14, 1],
    duration: 360,
    ease:     "outBack",
  });
}
