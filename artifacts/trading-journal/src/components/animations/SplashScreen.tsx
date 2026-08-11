/**
 * SplashScreen — first-load intro.
 * Shows once per browser session and then dismisses automatically.
 *
 * The splash intentionally uses a pure black background and the same app icon
 * declared by the PWA manifest so the launch experience stays visually
 * consistent with the installed app icon.
 */
import { useEffect, useRef, useState } from "react";
import { animateSplashReveal, animateSplashExit } from "@/animations/anime";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const SESSION_KEY = "tj_splash_seen_v1";
const APP_ICON = "/icon-192.png";

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
        background: "#000000",
        willChange: "transform, opacity",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div
        className="splash-ring"
        style={{
          width: 88,
          height: 88,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
          position: "relative",
        }}
      >
        <img
          className="splash-logo"
          src={APP_ICON}
          alt="Deep Charts"
          width={88}
          height={88}
          draggable={false}
          style={{
            width: 88,
            height: 88,
            objectFit: "contain",
            display: "block",
          }}
        />
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
