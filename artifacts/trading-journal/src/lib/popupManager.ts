import type { RefObject } from "react";

interface PopupEntry {
  ref: RefObject<HTMLElement | null>;
  onClose: () => void;
}

const registry = new Map<string, PopupEntry>();
let attached = false;

function handlePointerDown(e: PointerEvent) {
  const target = e.target as Node | null;
  if (!target) return;

  // If the click landed inside ANY popup element, skip ALL close logic.
  // This prevents ThicknessPopup/LineStylePopup from closing when the user
  // clicks inside a sibling popup (e.g. DrawingStylePanel).
  if ((target as Element).closest?.('[data-drawing-popup]')) return;

  for (const [, entry] of registry) {
    if (!entry.ref.current?.contains(target)) {
      entry.onClose();
    }
  }
}

export const popupManager = {
  init() {
    if (attached) return;
    attached = true;
    document.addEventListener("pointerdown", handlePointerDown, true);
  },

  register(id: string, ref: RefObject<HTMLElement | null>, onClose: () => void) {
    registry.set(id, { ref, onClose });
  },

  unregister(id: string) {
    registry.delete(id);
  },
};
