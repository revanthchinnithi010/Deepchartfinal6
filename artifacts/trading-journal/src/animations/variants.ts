/**
 * Animation Variants — component-specific variant sets built on top of the
 * canonical motion tokens defined in @/animations/motion.
 *
 * Also re-exports the most commonly needed tokens so consumers can import
 * from either file without worrying about which one defines what.
 *
 * Do not hard-code durations, easings, or offset values here.
 * Every animation value must derive from an imported token.
 */
import type { Variants } from "motion/react";
import {
  tweenFast,
  tweenStandard,
  tweenLarge,
  tweenFastExit,
} from "@/animations/motion";

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports — common tokens available from either animation file
// ─────────────────────────────────────────────────────────────────────────────
export {
  EASE,
  EASE_EXIT,
  EASE_PREMIUM,
  DUR_FAST,
  DUR_STANDARD,
  DUR_LARGE,
  tweenFast,
  tweenStandard,
  tweenLarge,
  tweenFastExit,
  tweenStandardExit,
  TAP_TRANSITION,
  SPRING_FAST,
  SPRING_SMOOTH,
  SPRING_PANEL,
  SPRING_MODAL,
  SPRING_SNAPPY,
  STAGGER_CHILD_DELAY,
  STAGGER_MAX_DELAY,
} from "@/animations/motion";

// ─────────────────────────────────────────────────────────────────────────────
// Bottom navigation bar
// ─────────────────────────────────────────────────────────────────────────────

/** Bottom navigation bar — slides in from below on mount. */
export const bottomBarVariants: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...tweenLarge, staggerChildren: 0.04 },
  },
};

/** Individual tab item inside the bottom nav bar. */
export const barItemVariants: Variants = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: tweenStandard },
};

// ─────────────────────────────────────────────────────────────────────────────
// Layout panels
// ─────────────────────────────────────────────────────────────────────────────

/** Left panel / sidebar drawer — horizontal slide only. */
export const leftPanelVariants: Variants = {
  hidden:  { x: -80, opacity: 0 },
  visible: { x: 0,   opacity: 1, transition: tweenLarge    },
  exit:    { x: -80, opacity: 0, transition: tweenFastExit },
};

/** Floating mini toolbar — fade + subtle scale. */
export const miniToolbarVariants: Variants = {
  hidden:  { scale: 0.98, opacity: 0 },
  visible: { scale: 1,    opacity: 1, transition: tweenFast     },
  exit:    { scale: 0.98, opacity: 0, transition: tweenFastExit },
};

// ─────────────────────────────────────────────────────────────────────────────
// List / stagger patterns
// ─────────────────────────────────────────────────────────────────────────────

/** Stagger child items — fade + 6 px upward reveal. */
export const staggerItemVariants: Variants = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: tweenStandard },
};

// ─────────────────────────────────────────────────────────────────────────────
// Modals / overlays
// ─────────────────────────────────────────────────────────────────────────────

/** Modal / dialog — fade + scale 0.98 → 1. */
export const modalVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1,    transition: tweenStandard },
  exit:    { opacity: 0, scale: 0.98, transition: tweenFastExit },
};

/** Backdrop / overlay — fade only. */
export const overlayVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: tweenStandard },
  exit:    { opacity: 0, transition: tweenFastExit },
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic reveal
// ─────────────────────────────────────────────────────────────────────────────

/** Fade + 8 px upward slide — the default content reveal. */
export const floatUpVariants: Variants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: tweenStandard },
  exit:    { opacity: 0, y: 8, transition: tweenFastExit },
};
