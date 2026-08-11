/**
 * Motion Tokens — single source of truth for every animation in the project.
 *
 * Import from here; never inline animation values.
 * Every animation in the app must trace back to a constant defined below.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Philosophy: professional · minimal · fast · almost invisible           │
 * │  • One primary easing (EASE) for enters, one exit easing (EASE_EXIT)    │
 * │  • Three duration tiers: Fast 150 ms / Standard 220 ms / Large 250 ms   │
 * │  • GPU-only: opacity + transform (x, y, scale). Never layout props.     │
 * │  • No bounce, no elastic springs, no decorative rotation.               │
 * │  • Maximum translate offset: 8 px                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type { Transition, Variants } from "motion/react";

// ─────────────────────────────────────────────────────────────────────────────
// § 1 · Duration tokens  (seconds — motion/react uses fractional seconds)
// ─────────────────────────────────────────────────────────────────────────────

/** 150 ms — tap feedback, icon state, quick exits */
export const DUR_FAST     = 0.15;
/** 220 ms — page enters, card reveals, panels, most UI transitions */
export const DUR_STANDARD = 0.22;
/** 250 ms — drawers, bottom sheets, large-surface reveals */
export const DUR_LARGE    = 0.25;

// ─────────────────────────────────────────────────────────────────────────────
// § 2 · Easing tokens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary easing — used for almost every enter / reveal animation.
 * Smooth, pronounced deceleration: content arrives quickly then settles softly.
 * Matches the CSS compositor value `cubic-bezier(0.22,1,0.36,1)`.
 */
export const EASE: readonly [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Exit easing — fast ease-in for leaving content.
 * Content disappears quickly so the arriving state can take focus.
 */
export const EASE_EXIT: readonly [number, number, number, number] = [0.4, 0, 1, 1];

/** Alias — kept for imports that reference the legacy name. */
export const EASE_PREMIUM = EASE;

// ─────────────────────────────────────────────────────────────────────────────
// § 3 · Shared tween transitions  (compose these into variant definitions)
// ─────────────────────────────────────────────────────────────────────────────

export const tweenFast: Transition = {
  type: "tween", duration: DUR_FAST, ease: EASE,
};
export const tweenStandard: Transition = {
  type: "tween", duration: DUR_STANDARD, ease: EASE,
};
export const tweenLarge: Transition = {
  type: "tween", duration: DUR_LARGE, ease: EASE,
};
export const tweenFastExit: Transition = {
  type: "tween", duration: DUR_FAST, ease: EASE_EXIT,
};
export const tweenStandardExit: Transition = {
  type: "tween", duration: DUR_STANDARD, ease: EASE_EXIT,
};

/** Short tween for whileTap — press feedback */
export const TAP_TRANSITION: Transition = {
  type: "tween", duration: 0.09, ease: EASE,
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4 · Spring presets  (backward-compat only — prefer tweens for new code)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Prefer tweenFast. */
export const SPRING_FAST: Transition = {
  type: "spring", stiffness: 480, damping: 36, mass: 0.8,
};
/** @deprecated Prefer tweenStandard. */
export const SPRING_SMOOTH: Transition = {
  type: "spring", stiffness: 240, damping: 30, mass: 0.9,
};
/** @deprecated Prefer tweenLarge. */
export const SPRING_PANEL: Transition = {
  type: "spring", stiffness: 200, damping: 32, mass: 1,
};
/** @deprecated Prefer tweenStandard. */
export const SPRING_MODAL: Transition = {
  type: "spring", stiffness: 320, damping: 32, mass: 0.9,
};
/** @deprecated Prefer tweenFast. */
export const SPRING_SNAPPY: Transition = {
  type: "spring", stiffness: 220, damping: 22,
};

// ─────────────────────────────────────────────────────────────────────────────
// § 5 · Page / route variants
// ─────────────────────────────────────────────────────────────────────────────
//
// GPU-safe: opacity + y only. Max offset 8 px.
// Enter at DUR_STANDARD (220 ms). Exit at DUR_FAST (150 ms) — fast exits
// keep the UI feeling snappy.
//
// Variant key names use "enter"/"exit" so PageTransition can target them
// with animate="enter" / exit="exit" without needing AnimatePresence custom.

/** Standard page — sidebar and utility pages (non-tab). */
export const pageVariants: Variants = {
  initial: { opacity: 0,    y: 8 },
  enter:   { opacity: 1,    y: 0, transition: tweenStandard },
  exit:    { opacity: 0,    y: 8, transition: tweenFastExit },
};

/**
 * Tab pages — pure opacity crossfade, no y translate.
 *
 * Tab pages live inside a Layout whose header height changes between routes.
 * Any y offset on enter/exit would couple to that height change and produce
 * a "header slides up before page arrives" artefact. Pure opacity is the
 * only safe choice.
 */
export const tabPageVariants: Variants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: tweenStandard },
  exit:    { opacity: 0, transition: tweenFastExit },
};

/** Detail pages — same feel as standard. */
export const pageDetailVariants: Variants = pageVariants;

/**
 * Cover-detail pages (Portfolio / Balances — position:fixed overlays).
 *
 * Starts fully opaque at y:0 so the overlay immediately occludes lower
 * z-index elements from the very first frame. A y offset on a fixed/inset:0
 * element exposes lower layers during the animation duration.
 */
export const pageDetailCoverVariants: Variants = {
  initial: { opacity: 0.96, y: 0 },
  enter:   { opacity: 1,    y: 0, transition: tweenStandard },
  exit:    { opacity: 0,    y: 0, transition: tweenFastExit },
};

/** Slide pages — unified with the standard system. */
export const pageSlideVariants: Variants = pageVariants;

/** Sidebar nav items — staggered reveal on drawer open. */
export const sidebarItemVariants: Variants = {
  closed: { x: -8, opacity: 0 },
  open:   (i: number) => ({
    x: 0, opacity: 1,
    transition: { ...tweenStandard, delay: i * 0.03 },
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6 · Modals / Sheets
// ─────────────────────────────────────────────────────────────────────────────

/** Backdrop / scrim — fade only. */
export const backdropVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: tweenStandard },
  exit:    { opacity: 0, transition: tweenFastExit },
};

/** Bottom sheet — slides up from below the viewport. */
export const sheetVariants: Variants = {
  hidden:  { y: "100%", opacity: 0.5 },
  visible: { y: "0%",   opacity: 1,   transition: tweenLarge },
  exit:    { y: "100%", opacity: 0,   transition: tweenFastExit },
};

/** Centered dialog. */
export const dialogVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.98, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0, transition: tweenStandard },
  exit:    { opacity: 0, scale: 0.98, y: 4, transition: tweenFastExit },
};

// ─────────────────────────────────────────────────────────────────────────────
// § 7 · Cards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Card entrance with optional stagger index.
 * Each +1 on `index` adds 25 ms delay (capped at 75 ms) so cards cascade
 * in without the total animation exceeding 295 ms on long grids.
 */
export const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 6, scale: 0.98 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0, scale: 1,
    transition: {
      type:     "tween",
      duration: DUR_STANDARD,
      ease:     EASE,
      delay:    Math.min(i * STAGGER_CHILD_DELAY, STAGGER_MAX_DELAY),
    },
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// § 8 · Lists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stagger delay per child item — 25 ms gap between successive list items.
 * Pass the item's index as `custom` on each motion element.
 */
export const STAGGER_CHILD_DELAY = 0.025; // 25 ms

/**
 * Maximum stagger delay — caps at the 3rd item (75 ms).
 * Ensures total animation time stays ≤ 75 + 220 = 295 ms even on long lists.
 */
export const STAGGER_MAX_DELAY = 0.075; // 75 ms

/** List container — fades in as a unit. */
export const listContainerVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: tweenFast },
  exit:    { opacity: 0, transition: tweenFastExit },
};

/**
 * Individual list item — subtle upward reveal with index-based stagger.
 * Use `custom={index}` on the motion element so each child cascades 25 ms
 * after the previous one (capped at 75 ms total delay).
 *
 * GPU-safe: opacity + transform only. No scale, no bounce.
 * Offset: 6 px (≤ spec maximum of 6 px).
 */
export const listItemVariants: Variants = {
  hidden:  { opacity: 0, y: 6 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      type:     "tween",
      duration: DUR_STANDARD,
      ease:     EASE,
      delay:    Math.min(i * STAGGER_CHILD_DELAY, STAGGER_MAX_DELAY),
    },
  }),
  exit:    { opacity: 0, y: 2, transition: tweenFastExit },
};

// ─────────────────────────────────────────────────────────────────────────────
// § 9 · Generic reveal variants  (used by FadeIn component)
// ─────────────────────────────────────────────────────────────────────────────

/** Pure opacity fade. */
export const fadeVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: tweenStandard },
  exit:    { opacity: 0, transition: tweenFastExit },
};

/** Float up — the default reveal: fade + 8 px vertical slide. */
export const slideUpVariants: Variants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: tweenStandard },
  exit:    { opacity: 0, y: 6, transition: tweenFastExit },
};

/** Float down — fade + 8 px downward slide. */
export const slideDownVariants: Variants = {
  hidden:  { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0,  transition: tweenStandard },
  exit:    { opacity: 0, y: -6, transition: tweenFastExit },
};

/** Reveal from the right — content slides in from +8 px on x. */
export const slideLeftVariants: Variants = {
  hidden:  { opacity: 0, x: 8 },
  visible: { opacity: 1, x: 0, transition: tweenStandard },
  exit:    { opacity: 0, x: 6, transition: tweenFastExit },
};

/** Reveal from the left — content slides in from -8 px on x. */
export const slideRightVariants: Variants = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0,  transition: tweenStandard },
  exit:    { opacity: 0, x: -6, transition: tweenFastExit },
};

/** Scale reveal — subtle scale from 0.96 → 1. */
export const scaleVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1,    transition: tweenFast },
  exit:    { opacity: 0, scale: 0.98, transition: tweenFastExit },
};

// ─────────────────────────────────────────────────────────────────────────────
// § 10 · Button / interactive element configs
// ─────────────────────────────────────────────────────────────────────────────

/** Standard button — press + hover scale feedback. */
export const buttonConfig = {
  whileTap:   { scale: 0.97 },
  whileHover: { scale: 1.04 },
  transition:  tweenFast,
} as const;

/**
 * Icon button — slightly more lift on hover; no rotation (decorative rotation
 * is excluded from the motion philosophy).
 */
export const iconButtonConfig = {
  whileTap:   { scale: 0.97 },
  whileHover: { scale: 1.08 },
  transition:  tweenFast,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// § 11 · Compositor CSS-transition system  (GPU-thread only)
// ─────────────────────────────────────────────────────────────────────────────
//
// Chart tick engines and RAF loops run on the main JS thread. When these are
// active, JS-driven motion/react animations (which run via rAF callbacks) can
// drop frames. CSS transitions run entirely on the GPU compositor thread and
// are immune to JS-thread pressure.
//
// Rule: any overlay/panel whose open/close animation must be perfectly smooth
// regardless of chart activity uses CSS transitions, not motion/react.
// ProfileMenu, NavigationDrawer, NotificationPanel, ProfilePage sub-pages all
// follow this pattern.
//
// Import these values instead of re-deriving your own strings.

/** Enter/reveal easing for compositor CSS transitions. CSS string form of EASE. */
export const COMPOSITOR_EASE       = "cubic-bezier(0.22,1,0.36,1)";
/** Exit easing for compositor CSS transitions. CSS string form of EASE_EXIT. */
export const COMPOSITOR_EASE_CLOSE = "cubic-bezier(0.4,0,0.6,1)";

/** Small panels (dropdowns, drawers) — open duration. */
export const COMPOSITOR_PANEL_DURATION_OPEN  = "0.18s";
/** Small panels — close duration (exits are faster). */
export const COMPOSITOR_PANEL_DURATION_CLOSE = "0.12s";
/** Backdrops — open duration. */
export const COMPOSITOR_FADE_DURATION_OPEN   = "0.14s";
/** Backdrops — close duration. */
export const COMPOSITOR_FADE_DURATION_CLOSE  = "0.12s";

/** Full-screen overlay panels (PositionDetail, etc.) — open duration. */
export const COMPOSITOR_OVERLAY_DURATION_OPEN  = "0.22s";
/** Full-screen overlay panels — transform leg (slightly slower for drama). */
export const COMPOSITOR_OVERLAY_DURATION_ENTER_TRANSFORM = "0.28s";

/** `transition` string for an animated opacity + transform panel layer. */
export function compositorPanelTransition(open: boolean): string {
  const dur = open ? COMPOSITOR_PANEL_DURATION_OPEN : COMPOSITOR_PANEL_DURATION_CLOSE;
  const ease = open ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE;
  return `opacity ${dur} ${ease}, transform ${dur} ${ease}`;
}

/** `transition` string for an opacity-only backdrop / blur layer. */
export function compositorFadeTransition(open: boolean): string {
  const dur = open ? COMPOSITOR_FADE_DURATION_OPEN : COMPOSITOR_FADE_DURATION_CLOSE;
  const ease = open ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE;
  return `opacity ${dur} ${ease}`;
}
