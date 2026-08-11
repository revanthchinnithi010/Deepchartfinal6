import { useEffect, useRef, type RefObject } from "react";
import { popupManager } from "@/lib/popupManager";

export function usePopup(
  id: string,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean = true,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const stableClose = () => onCloseRef.current();
    popupManager.register(id, ref, stableClose);
    return () => { popupManager.unregister(id); };
  }, [id, ref, active]);
}
