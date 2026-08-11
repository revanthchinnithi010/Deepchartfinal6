/**
 * AnimatedModal — backdrop + dialog/sheet animations via Motion.dev.
 *
 * Two layout modes:
 *   - "dialog"  — centered overlay (scale-up from center)
 *   - "sheet"   — bottom sheet (slides up from bottom edge)
 *
 * GPU-safe: backdrop uses opacity, content uses transform + opacity.
 * Respects prefers-reduced-motion.
 */
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  backdropVariants,
  dialogVariants,
  sheetVariants,
} from "@/animations/motion";

interface AnimatedModalProps {
  open?:        boolean;
  /** Alias for `open`, for call sites that pass `isOpen` */
  isOpen?:      boolean;
  onClose:      () => void;
  children:     React.ReactNode;
  /** Optional title — rendered as a simple header when provided */
  title?:       string;
  /** "dialog" (centered) or "sheet" (bottom drawer). Default: "dialog" */
  mode?:        "dialog" | "sheet";
  /** Extra classes on the inner content panel */
  panelClassName?: string;
  panelStyle?:  React.CSSProperties;
  /** zIndex for the overlay. Default: 1000 */
  zIndex?:      number;
  /** Blur + dim backdrop. Default: true */
  backdrop?:    boolean;
}

export function AnimatedModal({
  open,
  isOpen,
  onClose,
  children,
  title,
  mode           = "dialog",
  panelClassName,
  panelStyle,
  zIndex         = 1000,
  backdrop       = true,
}: AnimatedModalProps) {
  const reduced = useReducedMotion();
  const isVisible = open ?? isOpen ?? false;

  const content = (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          {backdrop && (
            <motion.div
              key="modal-backdrop"
              variants={reduced ? undefined : backdropVariants}
              initial={reduced ? { opacity: 1 } : "hidden"}
              animate="visible"
              exit={reduced ? undefined : "exit"}
              onClick={onClose}
              style={{
                position:             "fixed",
                inset:                0,
                zIndex,
                background:           "rgba(0,0,0,0.58)",
                backdropFilter:       "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            />
          )}

          {/* Panel */}
          <motion.div
            key="modal-panel"
            variants={reduced ? undefined : (mode === "sheet" ? sheetVariants : dialogVariants)}
            initial={reduced ? undefined : "hidden"}
            animate="visible"
            exit={reduced ? undefined : "exit"}
            style={{
              position:    "fixed",
              zIndex:      zIndex + 1,
              willChange:  "transform, opacity",
              ...(mode === "sheet"
                ? { bottom: 0, left: 0, right: 0 }
                : {
                    top:       "50%",
                    left:      "50%",
                    transform: "translate(-50%, -50%)",
                  }),
              ...panelStyle,
            }}
            className={panelClassName}
          >
            {title && (
              <div style={{ padding: "14px 16px 0", fontSize: 14, fontWeight: 700, color: "white" }}>
                {title}
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
