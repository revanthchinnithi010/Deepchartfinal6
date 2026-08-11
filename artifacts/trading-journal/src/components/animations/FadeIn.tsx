/**
 * FadeIn — general-purpose reveal wrapper powered by Motion.dev.
 *
 * Supports fade, slide-up, slide-down, slide-left, slide-right, scale, spring.
 * Respects prefers-reduced-motion.
 * All animations use transform + opacity only (GPU-accelerated, no layout thrashing).
 */
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  fadeVariants,
  slideUpVariants,
  slideDownVariants,
  slideLeftVariants,
  slideRightVariants,
  scaleVariants,
  tweenStandard,
} from "@/animations/motion";

export type FadeInVariant =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "scale"
  | "spring";

const VARIANT_MAP: Record<FadeInVariant, Variants> = {
  "fade":        fadeVariants,
  "slide-up":    slideUpVariants,
  "slide-down":  slideDownVariants,
  "slide-left":  slideLeftVariants,
  "slide-right": slideRightVariants,
  "scale":       scaleVariants,
  "spring":      slideUpVariants,    // alias — spring physics come from the variant
};

interface FadeInProps {
  children: React.ReactNode;
  /** Animation style. Default: "slide-up" */
  variant?: FadeInVariant;
  /** Extra delay in seconds before the animation starts */
  delay?: number;
  /** Whether to only animate once (whileInView mode). Default: true */
  once?: boolean;
  /** Use whileInView trigger instead of immediate animate. Default: false */
  inView?: boolean;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof HTMLElementTagNameMap;
}

export function FadeIn({
  children,
  variant  = "slide-up",
  delay    = 0,
  once     = true,
  inView   = false,
  className,
  style,
  as       = "div",
}: FadeInProps) {
  const reduced = useReducedMotion();
  const variants = VARIANT_MAP[variant];

  if (reduced) {
    const Tag = as as "div";
    return <Tag className={className} style={style}>{children}</Tag>;
  }

  const withDelay: Variants = delay > 0
    ? {
        ...variants,
        visible: {
          ...(variants.visible as object),
          transition: {
            ...tweenStandard,
            ...((variants.visible as Record<string, unknown>).transition ?? {}),
            delay,
          },
        },
      }
    : variants;

  const MotionTag = motion[as as "div"] ?? motion.div;

  const sharedProps = {
    className,
    style,
    variants: withDelay,
  };

  if (inView) {
    return (
      <MotionTag
        {...sharedProps}
        initial="hidden"
        whileInView="visible"
        exit="exit"
        viewport={{ once, margin: "-40px" }}
      >
        {children}
      </MotionTag>
    );
  }

  return (
    <MotionTag {...sharedProps} initial="hidden" animate="visible" exit="exit">
      {children}
    </MotionTag>
  );
}
