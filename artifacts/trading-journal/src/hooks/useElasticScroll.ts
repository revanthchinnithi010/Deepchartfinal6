import { useEffect, type RefObject } from "react";
import { COMPOSITOR_EASE } from "@/animations/motion";

/**
 * iOS-style rubber-band / elastic overscroll — optimised for 60 fps.
 *
 * Performance contract:
 *  • Event handlers do ZERO DOM reads/writes — pure JS variable mutations.
 *  • All DOM writes are batched into a single rAF per frame.
 *  • Boundary state (atTop / atBottom) is cached at gesture-start and
 *    refreshed only when the gesture ends — avoids forced-layout on every
 *    touchmove / wheel event.
 *  • The content layer is pre-promoted (will-change: transform) at mount
 *    so the browser never needs to promote it mid-gesture.
 *  • Only `transform` is mutated — no layout properties.
 */
export function useElasticScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const scrollEl  = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    const MAX_PULL     = 72;   // px — max visible stretch
    const SPRING_MS    = 480;  // release animation duration
    const SPRING_CB    = COMPOSITOR_EASE;
    const WHEEL_DAMPEN = 0.35;
    const WHEEL_SETTLE = 180;  // ms after last wheel event → spring back

    // ── pre-promote the compositing layer once ────────────────────────
    contentEl.style.willChange = "transform";

    // ── shared mutable state (touched only in event callbacks + rAF) ──
    let offset      = 0;   // current rendered offset
    let pending     = 0;   // desired offset for next rAF flush
    let rafId       = 0;
    let dragging    = false;
    let startY      = 0;
    let cachedTop   = false;   // boundary state cached at gesture start
    let cachedBot   = false;
    let wheelAccum  = 0;
    let wheelTimer  = 0;
    let springing   = false;   // spring-back in progress

    // ── helpers ───────────────────────────────────────────────────────

    /** iOS hyperbolic damping — asymptotically approaches MAX_PULL */
    const damp = (delta: number) =>
      Math.sign(delta) * MAX_PULL * (1 - MAX_PULL / (Math.abs(delta) + MAX_PULL));

    /** Read boundary state from DOM — call only at gesture boundaries */
    const readBounds = () => {
      cachedTop = scrollEl.scrollTop <= 0;
      cachedBot = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
    };

    // ── rAF write loop ────────────────────────────────────────────────

    const flush = () => {
      rafId = 0;
      if (pending === offset) return;
      offset = pending;
      contentEl.style.transform = offset === 0 ? "" : `translate3d(0,${offset}px,0)`;
    };

    const schedule = (px: number) => {
      pending = px;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    // ── spring back to zero ───────────────────────────────────────────

    const springBack = () => {
      if (offset === 0 && pending === 0) return;
      springing = true;
      // Cancel any in-flight rAF so we don't fight the transition
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      pending = 0;
      offset  = 0;
      contentEl.style.transition = `transform ${SPRING_MS}ms ${SPRING_CB}`;
      contentEl.style.transform  = "";
      // Clean up transition flag after spring completes
      setTimeout(() => {
        contentEl.style.transition = "";
        springing = false;
        // Re-read bounds now that scroll may have shifted
        readBounds();
      }, SPRING_MS);
    };

    // ── TOUCH ─────────────────────────────────────────────────────────

    const onTouchStart = (e: TouchEvent) => {
      startY   = e.touches[0].clientY;
      dragging = false;
      // Cancel any running spring so touch takes over immediately
      if (springing) {
        contentEl.style.transition = "";
        springing = false;
      }
      // One layout read at gesture start — cached for the whole gesture
      readBounds();
    };

    const onTouchMove = (e: TouchEvent) => {
      const dy       = e.touches[0].clientY - startY;
      const pullDown = dy > 0 && cachedTop;
      const pullUp   = dy < 0 && cachedBot;

      if (pullDown || pullUp) {
        dragging = true;
        if (Math.abs(dy) > 4) e.preventDefault(); // take over gesture
        schedule(damp(dy));                        // zero DOM reads/writes here
      } else if (dragging) {
        dragging = false;
        springBack();
      }
    };

    const onTouchEnd = () => {
      if (dragging) { dragging = false; springBack(); }
    };

    // ── WHEEL (trackpad momentum) ─────────────────────────────────────

    const onWheel = (e: WheelEvent) => {
      // Only read bounds at the very start of a wheel sequence
      if (wheelAccum === 0) readBounds();

      const pullDown = e.deltaY < 0 && cachedTop;
      const pullUp   = e.deltaY > 0 && cachedBot;

      if (!pullDown && !pullUp) {
        if (offset !== 0 || pending !== 0) { wheelAccum = 0; springBack(); }
        return;
      }

      wheelAccum -= e.deltaY * WHEEL_DAMPEN;
      // Prevent direction flip
      if (pullDown && wheelAccum < 0) wheelAccum = 0;
      if (pullUp   && wheelAccum > 0) wheelAccum = 0;

      schedule(damp(wheelAccum)); // zero DOM reads/writes here

      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelAccum = 0;
        springBack();
      }, WHEEL_SETTLE) as unknown as number;
    };

    // ── Register ──────────────────────────────────────────────────────

    scrollEl.addEventListener("touchstart",  onTouchStart,  { passive: true });
    scrollEl.addEventListener("touchmove",   onTouchMove,   { passive: false });
    scrollEl.addEventListener("touchend",    onTouchEnd,    { passive: true });
    scrollEl.addEventListener("touchcancel", onTouchEnd,    { passive: true });
    scrollEl.addEventListener("wheel",       onWheel,       { passive: true });

    return () => {
      scrollEl.removeEventListener("touchstart",  onTouchStart);
      scrollEl.removeEventListener("touchmove",   onTouchMove);
      scrollEl.removeEventListener("touchend",    onTouchEnd);
      scrollEl.removeEventListener("touchcancel", onTouchEnd);
      scrollEl.removeEventListener("wheel",       onWheel);
      if (rafId)      cancelAnimationFrame(rafId);
      if (wheelTimer) clearTimeout(wheelTimer);
      contentEl.style.transform  = "";
      contentEl.style.transition = "";
      contentEl.style.willChange = "auto";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // refs are stable — run once after mount
}
