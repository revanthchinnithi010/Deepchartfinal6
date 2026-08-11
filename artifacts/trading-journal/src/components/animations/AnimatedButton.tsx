/**
 * AnimatedButton — spring-physics tap + hover feedback via Motion.dev.
 *
 * Drop-in wrapper around any element. Supports:
 *   - press scale (whileTap)
 *   - hover lift (whileHover)
 *   - icon rotation variant
 *   - disabled → no animation
 *
 * GPU-safe: scale + transform only.
 * Respects prefers-reduced-motion.
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SPRING_FAST, TAP_TRANSITION } from "@/animations/motion";

// Omit motion-conflicting props (onDrag, onDragStart, etc.) to avoid
// type collisions between React.ButtonHTMLAttributes and HTMLMotionProps.
type SafeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
>;

interface AnimatedButtonProps extends SafeButtonProps {
  /** Scale on press. Default: 0.97 */
  tapScale?:   number;
  /** Scale on hover. Default: 1.04 */
  hoverScale?: number;
  /** Subtle y-lift on hover (px). Default: 0 */
  hoverLift?:  number;
  /** Disable all motion (e.g. when button is logically disabled) */
  noMotion?:   boolean;
  /** Cosmetic variant — purely a styling hint, consumers style via className */
  variant?:    "default" | "outline" | "ghost" | "destructive" | "secondary";
  /** Cosmetic size hint — purely a styling hint, consumers style via className */
  size?:       "default" | "sm" | "lg" | "icon";
}

export function AnimatedButton({
  children,
  tapScale   = 0.97,
  hoverScale = 1.04,
  hoverLift  = 0,
  noMotion   = false,
  disabled,
  style,
  variant: _variant,
  size: _size,
  ...rest
}: AnimatedButtonProps) {
  const reduced = useReducedMotion();
  const still   = reduced || noMotion || disabled;

  if (still) {
    return (
      <button disabled={disabled} style={style} {...rest}>
        {children}
      </button>
    );
  }

  return (
    <motion.button
      disabled={disabled}
      style={{ ...style, willChange: "transform" }}
      whileTap={{   scale: tapScale }}
      whileHover={{
        scale: hoverScale,
        y:     hoverLift ? -hoverLift : undefined,
      }}
      transition={{ ...SPRING_FAST, tap: TAP_TRANSITION }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

// ── Icon button variant ────────────────────────────────────────────────────
interface AnimatedIconButtonProps extends SafeButtonProps {
  rotateOnHover?: number;
  noMotion?:      boolean;
  /** Cosmetic variant — purely a styling hint, consumers style via className */
  variant?:       "default" | "outline" | "ghost" | "destructive" | "secondary";
  /** Cosmetic size hint — purely a styling hint, consumers style via className */
  size?:          "default" | "sm" | "lg" | "icon";
}

export function AnimatedIconButton({
  children,
  rotateOnHover = 0,
  noMotion      = false,
  disabled,
  style,
  variant: _variant,
  size: _size,
  ...rest
}: AnimatedIconButtonProps) {
  const reduced = useReducedMotion();
  const still   = reduced || noMotion || disabled;

  if (still) {
    return (
      <button disabled={disabled} style={style} {...rest}>
        {children}
      </button>
    );
  }

  return (
    <motion.button
      disabled={disabled}
      style={{ ...style, willChange: "transform" }}
      whileTap={{   scale: 0.97 }}
      whileHover={{ scale: 1.10, rotate: rotateOnHover }}
      transition={{ ...SPRING_FAST, tap: TAP_TRANSITION }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
