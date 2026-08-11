/**
 * AnimatedList — container entrance animation via Motion.dev.
 * The list container fades + slides in as a unit; individual items are static.
 * Per-item presence animations (add/remove) are handled by AnimatedPresenceList.
 *
 * GPU-safe: opacity + transform only.
 */
import { motion, AnimatePresence } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { listContainerVariants, listItemVariants, TAP_TRANSITION } from "@/animations/motion";

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof HTMLElementTagNameMap;
}

/** Wrap your `<ul>` / `<div>` container in this to get stagger enter. */
export function AnimatedList({
  children,
  className,
  style,
  as = "div",
}: AnimatedListProps) {
  const reduced = useReducedMotion();
  const Tag = as as "div";

  if (reduced) {
    return <Tag className={className} style={style}>{children}</Tag>;
  }

  const MotionTag = motion[as as "div"] ?? motion.div;

  return (
    <MotionTag
      className={className}
      style={style}
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </MotionTag>
  );
}

interface AnimatedListItemProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof HTMLElementTagNameMap;
  onClick?: () => void;
  /** Show a tap-scale feedback */
  tappable?: boolean;
  /** Stagger index — purely a hint, list stagger is already handled by parent variants */
  index?: number;
}

/** Wrap each list item in this — works inside AnimatedList or standalone. */
export function AnimatedListItem({
  children,
  className,
  style,
  as = "div",
  onClick,
  tappable = false,
  index = 0,
}: AnimatedListItemProps) {
  const reduced = useReducedMotion();
  const Tag = as as "div";

  if (reduced) {
    return <Tag className={className} style={style} onClick={onClick}>{children}</Tag>;
  }

  const MotionTag = motion[as as "div"] ?? motion.div;

  return (
    <MotionTag
      className={className}
      style={{ ...style, willChange: "transform, opacity" }}
      onClick={onClick}
      variants={listItemVariants}
      custom={index}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileTap={tappable ? { scale: 0.97 } : undefined}
      transition={tappable ? TAP_TRANSITION : undefined}
    >
      {children}
    </MotionTag>
  );
}

// ── Presence-aware list (for add/remove animations) ───────────────────────
// Supports two usage styles:
//   1. Data-driven: <AnimatedPresenceList items={..} keyExtractor={..} renderItem={..} />
//   2. Children-driven: <AnimatedPresenceList as="tbody">{items.map(i => <AnimatedListItem key={i.id} .../>)}</AnimatedPresenceList>
interface PresenceListProps<T> {
  items?:        T[];
  keyExtractor?: (item: T) => string | number;
  renderItem?:   (item: T, index: number) => React.ReactNode;
  children?:     React.ReactNode;
  as?:           keyof HTMLElementTagNameMap;
  className?:    string;
  style?:        React.CSSProperties;
  emptyState?:   React.ReactNode;
}

/**
 * Renders a list with AnimatePresence so items animate in/out individually.
 * Each item must have a stable key via `keyExtractor` (data-driven mode) or
 * carry its own `key` prop (children-driven mode).
 */
export function AnimatedPresenceList<T>({
  items,
  keyExtractor,
  renderItem,
  children,
  as = "div",
  className,
  style,
}: PresenceListProps<T>) {
  const reduced = useReducedMotion();
  const Tag = as as "div";

  // Children-driven mode — used when the caller already builds keyed items.
  if (children !== undefined) {
    if (reduced) {
      return <Tag className={className} style={style}>{children}</Tag>;
    }
    return (
      <Tag className={className} style={style}>
        <AnimatePresence mode="popLayout" initial={false}>
          {children}
        </AnimatePresence>
      </Tag>
    );
  }

  // Data-driven mode.
  const list = items ?? [];

  if (reduced) {
    return (
      <Tag className={className} style={style}>
        {list.map((item, i) => renderItem?.(item, i))}
      </Tag>
    );
  }

  return (
    <Tag className={className} style={style}>
      <AnimatePresence mode="popLayout" initial={false}>
        {list.map((item, i) => (
          <motion.div
            key={keyExtractor ? keyExtractor(item) : i}
            variants={listItemVariants}
            custom={i}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
            style={{ willChange: "transform, opacity" }}
          >
            {renderItem?.(item, i)}
          </motion.div>
        ))}
      </AnimatePresence>
    </Tag>
  );
}
