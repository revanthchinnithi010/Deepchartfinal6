/**
 * SplashScreen — first-load intro.
 * Shows once per browser session and then dismisses automatically.
 */
import { useEffect, useRef, useState } from "react";
import { animateSplashReveal, animateSplashExit } from "@/animations/anime";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Zap } from "lucide-react";

const SESSION_KEY = "tj_splash_seen_v1";

interface SplashScreenProps {
  dismissAfter?: number;
  onDone?: () => void;
}

export function SplashScreen({ dismissAfter = 1650, onDone }: SplashScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    return !sessionStorage.getItem(SESSION_KEY);
  });

  useEffect(() => {
    if (!visible) return;
    const el = containerRef.current;
    if (!el) return;

    sessionStorage.setItem(SESSION_KEY, "1");

    if (reduced) {
      const t = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 600);
      return () => clearTimeout(t);
    }

    animateSplashReveal(el);

    const t = setTimeout(() => {
      animateSplashExit(el, () => {
        setVisible(false);
        onDone?.();
      });
    }, dismissAfter);

    return () => clearTimeout(t);
  }, [visible, reduced, dismissAfter, onDone]);

  if (!visible) return null;

  const TITLE = "Deep chart";
  const chars = TITLE.split("");

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 40%, rgba(30,31,44,1) 0%, rgba(7,8,11,1) 100%)",
        willChange: "transform, opacity",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div
        className="splash-glow"
        style={{
          position: "absolute",
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, rgba(6,182,212,0.10) 50%, transparent 80%)",
          filter: "blur(28px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="splash-ring"
        style={{
          width: 88,
          height: 88,
          borderRadius: 26,
          background: "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(5,7,10,0.90) 100%)",
          border: "1.5px solid rgba(165,180,252,0.30)",
          boxShadow: [
            "0 0 0 6px rgba(99,102,241,0.06)",
            "0 8px 40px rgba(0,0,0,0.55)",
            "inset 0 1px 0 rgba(255,255,255,0.10)",
          ].join(","),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
          position: "relative",
        }}
      >
        <div className="splash-logo">
          <Zap
            style={{ width: 40, height: 40, color: "rgba(230,235,255,0.92)" }}
            fill="currentColor"
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 0,
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        {chars.map((char, i) => (
          <span
            key={i}
            className="splash-char"
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "rgba(240,244,255,0.96)",
              lineHeight: 1,
              display: "inline-block",
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </div>

      <p
        className="splash-subtitle"
        style={{
          fontSize: 13,
          color: "rgba(148,163,184,0.65)",
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        Revanth
      </p>
    </div>
  );
}
