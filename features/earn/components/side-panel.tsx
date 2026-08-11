"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  // Desktop width. Defaults to a narrow utility panel (notifications, filters);
  // "lg" gives content-heavy panels more room.
  width?: "sm" | "lg";
  panelClassName?: string;
}

const WIDTH: Record<"sm" | "lg", string> = {
  sm: "w-[min(400px,100vw)]",
  lg: "w-[min(560px,100vw)]",
};

// A full-height panel anchored to the right edge of the viewport, for content
// that belongs beside the page rather than interrupting it in a centered
// modal — notifications, filters, anything read alongside what's already on
// screen.
export function SidePanel({
  open,
  onClose,
  children,
  title,
  width = "sm",
  panelClassName,
}: SidePanelProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[300] bg-black/62 backdrop-blur-[7px]"
        >
          <motion.div
            initial={reduce ? { opacity: 0 } : { x: "100%" }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: "100%" }}
            transition={
              reduce
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
            }
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "bg-sheet absolute top-0 right-0 flex h-full flex-col overflow-y-auto border-l border-white/14 shadow-[inset_1px_0_0_rgba(255,255,255,0.15),-20px_0_90px_-30px_rgba(0,0,0,0.9)]",
              WIDTH[width],
              panelClassName
            )}
          >
            {title ? (
              <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
                <span className="ws-display text-[15px] text-white">{title}</span>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
                >
                  <CloseIcon />
                </button>
              </div>
            ) : (
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-[18px] right-[18px] z-[1] grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
              >
                <CloseIcon />
              </button>
            )}
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
