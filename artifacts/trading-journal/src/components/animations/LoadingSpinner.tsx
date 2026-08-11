/**
 * LoadingSpinner — SVG ring spinner animated by Anime.js v4.
 * Lightweight: no layout thrashing, pure SVG transform.
 *
 * Also exports a simpler CSS-based `DotLoader` for inline use.
 */
import { useEffect, useRef } from "react";
import { animateSvgSpinner, animateLoadingDots } from "@/animations/anime";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface SpinnerProps {
  /** Ring diameter in px. Default: 40 */
  size?:      number;
  /** Stroke thickness. Default: 3 */
  stroke?:    number;
  /** Stroke colour. Default: current colour via CSS currentColor */
  color?:     string;
  /** Track colour. Default: rgba(255,255,255,0.10) */
  trackColor?: string;
  /** Full rotation duration in ms. Default: 900 */
  duration?:  number;
  className?: string;
  style?:     React.CSSProperties;
}

export function LoadingSpinner({
  size      = 40,
  stroke    = 3,
  color     = "currentColor",
  trackColor = "rgba(255,255,255,0.10)",
  duration  = 900,
  className,
  style,
}: SpinnerProps) {
  const svgRef    = useRef<SVGSVGElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const reduced   = useReducedMotion();

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle || reduced) return undefined;

    const ctrl = animateSvgSpinner(circle, { duration });
    return () => { ctrl.stop(); };
  }, [duration, reduced]);

  const r  = (size - stroke) / 2;
  const cx = size / 2;

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ display: "block", ...style }}
      aria-label="Loading"
      role="status"
    >
      {/* Track */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      {/* Animated arc */}
      <circle
        ref={circleRef}
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        style={{
          transformOrigin: "center",
          // initial state set by animateSvgSpinner
          ...(reduced ? { strokeDasharray: `${0.7 * 2 * Math.PI * r}`, strokeDashoffset: 0 } : {}),
        }}
      />
    </svg>
  );
}

// ── Dot loader ─────────────────────────────────────────────────────────────
interface DotLoaderProps {
  count?:  number;
  size?:   number;
  color?:  string;
  gap?:    number;
  className?: string;
  style?:  React.CSSProperties;
}

export function DotLoader({
  count = 3,
  size  = 6,
  color = "currentColor",
  gap   = 5,
  className,
  style,
}: DotLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced      = useReducedMotion();

  useEffect(() => {
    const el = containerRef.current;
    if (!el || reduced) return;
    const anim = animateLoadingDots(el, {});
    return () => { anim.pause(); };
  }, [reduced]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ display: "flex", alignItems: "center", gap, ...style }}
      aria-label="Loading"
      role="status"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="loading-dot"
          style={{
            width:        size,
            height:       size,
            borderRadius: "50%",
            background:   color,
            flexShrink:   0,
          }}
        />
      ))}
    </div>
  );
}
