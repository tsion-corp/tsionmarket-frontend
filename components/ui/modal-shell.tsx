"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CloseIcon } from "@/components/ui/icons";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ModalShell({ open, onClose, children }: ModalShellProps) {
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
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/62 backdrop-blur-[7px] md:pb-6"
        >
          <motion.div
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={
              reduce
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
            }
            onClick={(e) => e.stopPropagation()}
            className="bg-sheet relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-white/14 px-[26px] pt-4 pb-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_-20px_90px_-30px_rgba(0,0,0,0.9)] md:w-[min(440px,100%)] md:rounded-[24px] md:pt-[26px]"
          >
            <span
              aria-hidden
              className="mx-auto mb-4 block h-1 w-9 rounded-full bg-white/20 md:hidden"
            />
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-[18px] right-[18px] grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
            >
              <CloseIcon />
            </button>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
