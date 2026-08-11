import { useRef, useEffect, useCallback, type RefObject } from "react";
import type { JSAnimation } from "animejs";
import { animate } from "animejs";

// Anime.js v4 exposes JSAnimation, not Animation
type AnimeInstance = JSAnimation;

/**
 * Run Anime.js v4 animations with automatic cleanup on unmount.
 *
 * Usage:
 *   const { play, pause } = useAnime();
 *   play({ targets: el, opacity: [0, 1], duration: 400 });
 */
export function useAnime() {
  const instanceRef = useRef<AnimeInstance | null>(null);

  useEffect(() => {
    return () => {
      instanceRef.current?.pause();
      instanceRef.current = null;
    };
  }, []);

  const play = useCallback(
    (targets: Element | Element[] | NodeListOf<Element> | string, params: Record<string, unknown>) => {
      instanceRef.current?.pause();
      // animate(targets, params) — v4 signature
      instanceRef.current = animate(targets as Element, params as Parameters<typeof animate>[1]);
      return instanceRef.current;
    },
    [],
  );

  const pause = useCallback(() => {
    instanceRef.current?.pause();
  }, []);

  const restart = useCallback(() => {
    const inst = instanceRef.current;
    if (inst) {
      inst.seek(0);
      inst.play();
    }
  }, []);

  return { play, pause, restart, instanceRef };
}

/**
 * Run an Anime.js animation when the returned ref is attached to a DOM element.
 * Automatically cancels and replays when deps change; cleans up on unmount.
 *
 * Usage:
 *   const ref = useAnimeOnMount<HTMLDivElement>(el => ({
 *     opacity: [0, 1],
 *     duration: 500,
 *   }));
 *   return <div ref={ref} />;
 */
export function useAnimeOnMount<T extends HTMLElement>(
  factory: (el: T) => Record<string, unknown>,
  deps: unknown[] = [],
): RefObject<T | null> {
  const ref         = useRef<T>(null);
  const instanceRef = useRef<AnimeInstance | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    instanceRef.current?.pause();
    const params = factory(el);
    instanceRef.current = animate(el, params as Parameters<typeof animate>[1]);
    return () => {
      instanceRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
