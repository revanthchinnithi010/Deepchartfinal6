/**
 * PageTransition — wraps page content with enter / exit animations.
 *
 * Place around route content. Use `key={route}` on each conditional so
 * AnimatePresence correctly tracks enter/exit per page.
 *
 * GPU-safe: opacity + transform (y) only — no scale, no x-slide.
 *
 * Animation system:
 *   Enter — opacity 0 → 1, translateY 8px → 0, 220ms easeOut
 *   Exit  — opacity 1 → 0, translateY 0 → 8px, 180ms easeIn
 *   Movement is kept under 10px so transitions feel nearly invisible.
 *
 * variant="page" | "tab" | "detail" | "slide"
 *   Standard premium enter/exit. `custom` is accepted but unused (kept for
 *   API compatibility with AnimatePresence).
 *
 * variant="tab"
 *   Pure opacity crossfade — no y translate. Tab pages sit inside a Layout
 *   whose header height can change between tabs; any y offset would interact
 *   with that height change and produce a visible positional artefact.
 *
 * variant="cover-detail"
 *   Starts fully opaque at y:0 so the overlay immediately occludes the Layout
 *   header and any keep-alive content below. A y offset on a position:fixed,
 *   inset:0 element creates a viewport gap for the animation duration, which
 *   exposes lower z-index elements and causes a header-collapse flash.
 *
 * By default (`fill=true`) the element uses position:absolute;inset:0 so the
 * page fills the absolute container in Layout. Pass `fill={false}` for
 * inner/nested usage inside a scrollable container to stay in normal flow.
 */
import type { Variants } from "motion/react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { tweenStandard, tweenFastExit } from "@/animations/motion";

// ─── Page variants ────────────────────────────────────────────────────────────

/** Standard pages — fade + 8px vertical slide. */
const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter:   { opacity: 1, y: 0, transition: tweenStandard },
  exit:    { opacity: 0, y: 8, transition: tweenFastExit },
};

/**
 * Tab pages — opacity crossfade only, no y translate.
 * Prevents positional artefacts caused by header height changes between tabs.
 */
const tabPageVariants: Variants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: tweenStandard },
  exit:    { opacity: 0, transition: tweenFastExit },
};

/**
 * Cover-detail pages (position:fixed overlays such as Portfolio / Balances).
 * Starts fully opaque at y:0 — no y offset on a viewport-filling fixed element.
 */
const pageDetailCoverVariants: Variants = {
  initial: { opacity: 0.96, y: 0 },
  enter:   { opacity: 1,    y: 0, transition: tweenStandard },
  exit:    { opacity: 0,    y: 0, transition: tweenFastExit },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface PageTransitionProps {
  children:   React.ReactNode;
  className?: string;
  style?:     React.CSSProperties;
  variant?:   "page" | "detail" | "cover-detail" | "tab" | "slide";
  /** Direction integer — forwarded from AnimatePresence custom prop. */
  custom?:    number;
  /**
   * Whether to absolutely-position and stretch to fill the parent (default).
   * Set to false for inner/nested usage inside a scrollable wrapper so the
   * element stays in normal flow and doesn't break the ancestor's scrollHeight.
   */
  fill?:      boolean;
}

/** Base style applied when fill=true: stretches to fill the absolute container in Layout. */
const BASE_STYLE: React.CSSProperties = {
  position:   "absolute",
  inset:       0,
  willChange: "transform, opacity",
};

const INLINE_STYLE: React.CSSProperties = {
  willChange: "transform, opacity",
};

export function PageTransition({
  children,
  className,
  style,
  variant = "page",
  custom,
  fill = true,
}: PageTransitionProps) {
  const reduced = useReducedMotion();

  const combinedStyle = fill
    ? { ...BASE_STYLE,   ...style }
    : { ...INLINE_STYLE, ...style };

  if (reduced) {
    return (
      <div className={className} style={combinedStyle}>
        {children}
      </div>
    );
  }

  const variants =
    variant === "tab"          ? tabPageVariants         :
    variant === "cover-detail" ? pageDetailCoverVariants :
                                 pageVariants;            // page | detail | slide

  return (
    <motion.div
      className={className}
      custom={custom}
      style={combinedStyle}
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
