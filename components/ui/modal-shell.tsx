"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeftIcon, CloseIcon } from "@/components/ui/icons";
import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/utils";

/**
 * What the screen inside the shell needs from it.
 *
 * A flow like funding is several screens in one shell, and only the screen
 * knows whether it has a step to go back to, whether it wants the whole phone
 * or a sheet at the bottom of it, and whether its content fits without
 * scrolling. It says so with `useModalScreen` and the shell does the rest, so
 * every screen's Back sits in the same place as the close button rather than
 * wherever its own markup happens to start.
 */
export interface ModalScreen {
  /** Called by the shell's Back button. Omitted on a screen with nowhere to go. */
  back?: () => void;
  /** Take the whole viewport on a phone. Desktop is unaffected. */
  fullScreen?: boolean;
  /** The content fits: the shell must not scroll it. */
  fits?: boolean;
}

interface ScreenRegistry {
  register: (screen: ModalScreen) => void;
}

const ScreenContext = createContext<ScreenRegistry | null>(null);

const CLOSED = { hasBack: false, fullScreen: false, fits: false } as const;

/** Declares this screen's chrome to the shell around it. Safe outside one. */
export function useModalScreen({ back, fullScreen = false, fits = false }: ModalScreen): void {
  const registry = useContext(ScreenContext);
  // The handler is usually a fresh arrow on every render of the screen. Only
  // its presence is registered; the current one is read when the button is
  // actually pressed, so the shell never re-registers for a new arrow.
  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  });
  const invokeBack = useCallback(() => backRef.current?.(), []);
  const hasBack = Boolean(back);

  useEffect(() => {
    if (!registry) return;
    registry.register({ back: hasBack ? invokeBack : undefined, fullScreen, fits });
    return () => registry.register({});
  }, [registry, hasBack, invokeBack, fullScreen, fits]);
}

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  // Identity of the current content. When it changes while the shell stays open
  // (e.g. the detail modal opening the buy sheet), the new content slides in
  // instead of swapping instantly.
  contentKey?: string | number;
  // Desktop width. Defaults to the standard sheet; "lg" gives form-heavy modals
  // (e.g. the funding flow) more room.
  size?: "md" | "lg";
  panelClassName?: string;
  contentClassName?: string;
  closeButtonClassName?: string;
}

const SIZE_WIDTH: Record<"md" | "lg", string> = {
  md: "md:w-[min(440px,100%)]",
  lg: "md:w-[min(600px,100%)]",
};

export function ModalShell({
  open,
  onClose,
  children,
  contentKey,
  size = "md",
  panelClassName,
  contentClassName,
  closeButtonClassName,
}: ModalShellProps) {
  const reduce = useReducedMotion();
  const [screen, setScreen] = useState<Required<Omit<ModalScreen, "back">> & { hasBack: boolean }>({
    hasBack: false,
    fullScreen: false,
    fits: false,
  });
  const backRef = useRef<(() => void) | undefined>(undefined);
  const register = useCallback((next: ModalScreen) => {
    backRef.current = next.back;
    setScreen((current) => {
      const hasBack = Boolean(next.back);
      const fullScreen = next.fullScreen ?? false;
      const fits = next.fits ?? false;
      return current.hasBack === hasBack &&
        current.fullScreen === fullScreen &&
        current.fits === fits
        ? current
        : { hasBack, fullScreen, fits };
    });
  }, []);
  const registry = useMemo<ScreenRegistry>(() => ({ register }), [register]);
  const handleBack = useCallback(() => backRef.current?.(), []);
  // A closed shell has no screen in it: its content is unmounted, and the
  // chrome that content asked for goes with it.
  const chrome = open ? screen : CLOSED;

  return (
    // Portalled so a sheet is always measured against the viewport. Opened
    // from inside a transformed ancestor (the sidebar slides with translate-x)
    // a `fixed` overlay would otherwise be trapped inside it.
    <Portal>
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
              className={cn(
                "bg-sheet ws-no-scrollbar relative flex w-full flex-col border border-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_-20px_90px_-30px_rgba(0,0,0,0.9)]",
                // A sheet at the bottom of the phone by default; a screen that
                // asked for the whole phone gets all of it, edge to edge, and
                // the same dialog on a desktop either way.
                chrome.fullScreen
                  ? "h-[100dvh] max-h-[100dvh] rounded-none px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] md:h-auto md:max-h-[92vh] md:rounded-[24px] md:px-6 md:pt-5 md:pb-6"
                  : "max-h-[92vh] rounded-t-[24px] px-5 pt-4 pb-5 md:rounded-[24px] md:px-6 md:pt-6 md:pb-6",
                // The screen says its content fits, so nothing scrolls and
                // nothing is cut off; everything else scrolls as one piece.
                chrome.fits ? "overflow-hidden" : "overflow-y-auto",
                SIZE_WIDTH[size],
                panelClassName
              )}
            >
              {!chrome.fullScreen && (
                <span
                  aria-hidden
                  className="mx-auto mb-3 block h-1 w-9 shrink-0 rounded-full bg-white/20 md:hidden"
                />
              )}
              {/* Back and close on one row, so a step of a flow reads the same
                  way wherever it sits in that flow. */}
              <div
                className={cn(
                  "relative z-[1] flex shrink-0 items-center justify-between",
                  chrome.hasBack ? "mb-1" : "h-0"
                )}
              >
                {chrome.hasBack ? (
                  <button
                    onClick={handleBack}
                    aria-label="Back"
                    className="-ml-1 flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-1 text-[13px] font-normal text-white/60 transition-colors hover:text-white"
                  >
                    <ChevronLeftIcon size={14} />
                    Back
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className={cn(
                    "grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70",
                    chrome.hasBack ? "" : "absolute top-0 right-0",
                    closeButtonClassName
                  )}
                >
                  <CloseIcon />
                </button>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={contentKey}
                  className={cn(
                    "min-h-0 flex-1",
                    // A step that takes the whole phone is usually shorter than
                    // it, and read from the middle rather than the top. `safe`
                    // keeps a step that outgrows the screen scrollable from its
                    // first line instead of centring its overflow out of reach.
                    chrome.fullScreen && "flex flex-col [justify-content:safe_center]",
                    contentClassName
                  )}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  <ScreenContext.Provider value={registry}>
                    {children}
                  </ScreenContext.Provider>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Portal>
  );
}
