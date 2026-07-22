"use client";

import { AnimatePresence, motion } from "motion/react";
import { CloseIcon } from "@/components/ui/icons";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ModalShell({ open, onClose, children }: ModalShellProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/62 p-0 backdrop-blur-[7px] sm:items-center sm:p-5"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-sheet relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-white/14 p-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_40px_90px_-30px_rgba(0,0,0,0.9)] sm:w-[min(440px,100%)] sm:rounded-[24px]"
          >
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
