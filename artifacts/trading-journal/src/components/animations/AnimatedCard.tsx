/**
 * AnimatedCard — card entrance animation via Motion.dev.
 * Supports viewport-triggered stagger (pass `index` for delay offset).
 * GPU-safe: only animates opacity + transform.
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cardVariants, TAP_TRANSITION } from "@/animations/motion";

interface AnimatedCardProps {
  children: React.ReactNode;
  /** Stagger index — each +1 adds ~55 ms delay */
  index?: number;
  /** Trigger on scroll into view instead of immediately */
  inView?: boolean;
  /** Only animate once (relevant when inView=true) */
  once?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  /** Extra hover lift for interactive cards */
  hoverable?: boolean;
}

export function AnimatedCard({
  children,
  index    = 0,
  inView   = false,
  once     = true,
  className,
  style,
  onClick,
  hoverable = false,
}: AnimatedCardProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <div className={className} style={style} onClick={onClick}>
        {children}
      </div>
    );
  }

  const viewport = { once, margin: "-30px" } as const;

  return (
    <motion.div
      className={className}
      style={{ ...style, willChange: "transform, opacity" }}
      variants={cardVariants}
      custom={index}
      initial="hidden"
      animate={inView ? undefined : "visible"}
      whileInView={inView ? "visible" : undefined}
      viewport={inView ? viewport : undefined}
      whileHover={hoverable ? { y: -3, scale: 1.015 } : undefined}
      whileTap={hoverable ? { scale: 0.97 } : undefined}
      transition={{ tap: TAP_TRANSITION }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
