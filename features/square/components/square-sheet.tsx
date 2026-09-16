"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The Square's sheet, carried over (market-square-frontend/components/ui/
 * sheet.tsx): a glass panel that rises from the foot of a phone and sits
 * centred from `sm`, with the close disc and the title in its head. Escape
 * and the backdrop close it; the page behind it does not scroll.
 */
export function SquareSheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const panelOffset = reduceMotion ? 0 : 40;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={title}
            initial={{ y: panelOffset, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: panelOffset, opacity: 0 }}
            transition={
              reduceMotion ? { duration: 0.12 } : { type: "spring", damping: 28, stiffness: 340 }
            }
            className={cn(
              "relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[rgba(20,20,22,0.95)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[16px] sm:max-h-[88dvh] sm:max-w-md sm:rounded-3xl"
            )}
          >
            <div className="shrink-0 border-b border-white/[0.08]">
              <div className="flex items-center gap-4 px-4 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeLabel}
                  className="ws-pressable -ml-1.5 rounded-full p-1.5 text-[#d4d4d8] transition-colors hover:bg-white/10 hover:text-[#fafafa]"
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <h2 className="ws-display min-w-0 flex-1 truncate text-lg text-white">{title}</h2>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
