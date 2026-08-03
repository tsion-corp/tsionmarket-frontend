"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { MoneyTicker } from "@/components/ui/money-ticker";

const AUTO_CLOSE_MS = 3600;

interface PlayOverlayProps {
  open: boolean;
  // Numeric pot + a formatter so the amount can count up on entry.
  potValue: number;
  formatMoney: (n: number) => string;
  // Round length in seconds, shown as "survive the clock".
  secondsToSurvive: number;
  onClose: () => void;
}

function pad(total: number): string {
  const clamped = Math.max(0, Math.floor(total));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// The moment you join a round. A full-screen arcade takeover: a coin drops,
// the title slams in, and the pot you're chasing counts up, so clicking Play
// lands as a real event instead of a silent state change. No confetti here —
// that celebration belongs to winning, and entering is not winning. Auto
// dismisses back to the arena after a beat.
export function PlayOverlay({
  open,
  potValue,
  formatMoney,
  secondsToSurvive,
  onClose,
}: PlayOverlayProps) {
  const t = useTranslations("casino.lastStanding");
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const reduce = useReducedMotion();

  // Auto-dismiss back to the arena.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[398] bg-black/85 backdrop-blur-[8px]"
          />
          {/* Neon arena wash behind everything. */}
          <div
            aria-hidden
            className="bg-[radial-gradient(60%_50%_at_50%_45%,rgba(216, 216, 220, 0.22),transparent_70%)] pointer-events-none fixed inset-0 z-[398]"
          />
          <div className="pointer-events-none fixed inset-0 z-[400] grid place-items-center p-6">
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={
                reduce ? { duration: 0.2 } : { type: "spring", stiffness: 260, damping: 22 }
              }
              className="pointer-events-auto flex w-full max-w-[520px] flex-col items-center text-center"
            >
              {/* Coin drop. */}
              <motion.div
                initial={reduce ? {} : { y: -140, rotate: -220, opacity: 0 }}
                animate={reduce ? {} : { y: 0, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.05 }}
                className="shadow-[0_0_50px_-6px_rgba(216, 216, 220, 0.9),inset_0_2px_0_rgba(255,255,255,0.6)] grid h-24 w-24 place-items-center rounded-full bg-[linear-gradient(180deg,#f0f0f2,#d8d8dc,#a8a8ae)] text-[46px]"
              >
                🪙
              </motion.div>

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.4, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.28, type: "spring", stiffness: 420, damping: 18 }}
                className="ws-display drop-shadow-[0_4px_30px_rgba(216, 216, 220, 0.55)] mt-6 bg-[linear-gradient(180deg,#ffffff,#d8d8dc,#a8a8ae)] bg-clip-text text-[clamp(44px,11vw,76px)] leading-[0.95] tracking-[-0.02em] text-transparent"
              >
                {t("overlayYoureIn")}
              </motion.div>

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#d8d8dc]/40 bg-[#d8d8dc]/12 px-4 py-1.5 text-[13px] font-bold tracking-[0.18em] text-[#d8d8dc] uppercase"
              >
                <span className="bg-up h-1.5 w-1.5 animate-pulse rounded-full" />
                {t("overlayLastStanding")}
              </motion.div>

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62 }}
                className="mt-6 text-[13.5px] font-normal text-white/60"
              >
                {t("overlayChasing")}
              </motion.div>
              <div className="ws-display tnum drop-shadow-[0_0_28px_rgba(216, 216, 220, 0.4)] text-[clamp(40px,10vw,60px)] leading-none text-white">
                <MoneyTicker value={potValue} format={formatMoney} delay={0.62} />
              </div>

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="mt-5 text-[14px] font-semibold text-white/85"
              >
                {t("overlaySurvive")}
                <span className="tnum ml-2 rounded-md bg-white/10 px-2 py-0.5 text-white">
                  {pad(secondsToSurvive)}
                </span>
              </motion.div>

              <button
                onClick={onClose}
                className="shadow-[0_16px_42px_-12px_rgba(216, 216, 220, 0.95)] mt-8 cursor-pointer rounded-2xl bg-[linear-gradient(180deg,#f0f0f2,#d8d8dc,#b0b0b6)] px-10 py-3.5 font-sans text-[15px] font-bold text-[#1a1a1a] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                {t("overlayLetsGo")}
              </button>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
