/**
 * NumberCounter — animated number that counts from `from` to `to` using
 * Anime.js v4. Triggers when the element enters the viewport.
 *
 * Respects prefers-reduced-motion (instantly shows final value if reduced).
 */
import { useRef, useEffect } from "react";
import { animateCounter } from "@/animations/anime";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface NumberCounterProps {
  /** Target value to count to */
  to?: number;
  /** Alias for `to`, for call sites that pass `value` */
  value?: number;
  /** Start value. Default: 0 */
  from?: number;
  /** Decimal places. Default: 0 */
  decimals?: number;
  /** Text before the number (e.g. "$") */
  prefix?: string;
  /** Text after the number (e.g. "%") */
  suffix?: string;
  /** Animation duration in ms. Default: 1100 */
  duration?: number;
  /** Easing. Default: "outExpo" */
  ease?: string;
  /** Delay before animation starts (ms). Default: 0 */
  delay?: number;
  /** Animate only once when entering viewport. Default: true */
  once?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function NumberCounter({
  to,
  value,
  from     = 0,
  decimals = 0,
  prefix   = "",
  suffix   = "",
  duration = 1100,
  ease     = "outExpo",
  delay    = 0,
  once     = true,
  className,
  style,
}: NumberCounterProps) {
  const target  = to ?? value ?? 0;
  const ref     = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const played  = useRef(false);

  // Format the display value immediately (so reduced-motion / SSR shows correct value)
  const finalText = `${prefix}${
    decimals > 0 ? target.toFixed(decimals) : Math.round(target).toLocaleString()
  }${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (once && played.current) return;
        played.current = true;

        setTimeout(() => {
          animateCounter(el, from, target, { duration, decimals, prefix, suffix, ease });
        }, delay);
      },
      { threshold: 0.2 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, from, decimals, prefix, suffix, duration, ease, delay, once, reduced]);

  return (
    <span ref={ref} className={className} style={style}>
      {finalText}
    </span>
  );
}
