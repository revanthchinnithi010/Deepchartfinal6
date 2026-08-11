/**
 * Barrel export — import all animation components and hooks from here.
 *
 * Motion.dev components (page transitions, cards, lists, modals, buttons):
 *   import { FadeIn, AnimatedCard, AnimatedList, ... } from "@/components/animations";
 *
 * Anime.js components (splash, counters, loaders):
 *   import { SplashScreen, NumberCounter, LoadingSpinner } from "@/components/animations";
 */

export { FadeIn }           from "./FadeIn";
export { AnimatedCard }     from "./AnimatedCard";
export {
  AnimatedList,
  AnimatedListItem,
  AnimatedPresenceList,
}                           from "./AnimatedList";
export { AnimatedModal }    from "./AnimatedModal";
export {
  AnimatedButton,
  AnimatedIconButton,
}                           from "./AnimatedButton";
export { PageTransition }   from "./PageTransition";
export { SplashScreen }     from "./SplashScreen";
export { NumberCounter }    from "./NumberCounter";
export {
  LoadingSpinner,
  DotLoader,
}                           from "./LoadingSpinner";

export type { FadeInVariant } from "./FadeIn";
