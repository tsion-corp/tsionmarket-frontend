"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import confetti from "canvas-confetti";
import { MoneyTicker } from "@/components/ui/money-ticker";

// Two confetti palettes: gold-forward when this wallet won, cooler house
// colours when we're celebrating someone else taking the pot.
const GOLD = ["#F6D365", "#e0a83a", "#ffffff", "#A78BFA", "#7CE7B0"];
const HOUSE = ["#A78BFA", "#8b6ef0", "#c3b0ff", "#7CE7B0", "#ffffff"];
const BURST_MS = 4200;
const WON_AUTO_CLOSE_MS = 7000;

export type RoundPhase = "calculating" | "won" | null;

interface RoundOverlayProps {
  phase: RoundPhase;
  // True when this wallet is the one that took the pot. Switches the reveal
  // from a personal jackpot to a "someone won" announcement.
  youWon?: boolean;
  // Truncated winner address (e.g. "0x12…34"). Only ever a shortened form —
  // never the full address — so the winner is named without exposing them.
  winnerLabel?: string | null;
  // Already-formatted money string (e.g. "$42.00") used as the static fallback.
  prizeLabel: string;
  // Numeric prize + a formatter so the reveal can count the amount up. Both
  // optional: without them the reveal shows the static prizeLabel.
  prizeValue?: number;
  formatMoney?: (n: number) => string;
  onClose: () => void;
}

// The end-of-round moment. First a short suspense ("calculating the winner")
// that locks everyone in, then a reveal for everyone: a big personal jackpot
// with confetti if this wallet won, otherwise a celebratory announcement of
// the winner by their truncated address. The full address is never shown.
export function RoundOverlay({
  phase,
  youWon = false,
  winnerLabel = null,
  prizeLabel,
  prizeValue,
  formatMoney,
  onClose,
}: RoundOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const reduce = useReducedMotion();

  // Confetti while the reveal card is up — gold for the winner, house colours
  // when we're marking someone else's win.
  useEffect(() => {
    if (phase !== "won" || reduce || !canvasRef.current) return;
    const colors = youWon ? GOLD : HOUSE;
    const fire = confetti.create(canvasRef.current, { resize: true, useWorker: false });
    const end = Date.now() + BURST_MS;
    // Everything emanates from the card's centre (it sits dead-centre of the
    // viewport) so the confetti frames the card instead of scattering off the
    // top of the screen.
    const center = { x: 0.5, y: 0.5 };

    // Opening explosion out of the card, in every direction.
    fire({
      particleCount: youWon ? 220 : 150,
      spread: 360,
      startVelocity: 45,
      gravity: 0.95,
      scalar: 1.05,
      origin: center,
      colors,
    });

    // Fountains up the two sides of the card.
    let raf = 0;
    const streams = () => {
      fire({
        particleCount: 6,
        angle: 65,
        spread: 55,
        startVelocity: 55,
        origin: { x: 0.08, y: 0.9 },
        colors,
      });
      fire({
        particleCount: 6,
        angle: 115,
        spread: 55,
        startVelocity: 55,
        origin: { x: 0.92, y: 0.9 },
        colors,
      });
      if (Date.now() < end) raf = requestAnimationFrame(streams);
    };
    streams();

    // Repeating centred bursts to keep the moment alive.
    const bursts = setInterval(() => {
      fire({
        particleCount: 90,
        spread: 360,
        startVelocity: 32,
        scalar: 1.1,
        origin: center,
        colors,
      });
    }, 620);
    const stopBursts = setTimeout(() => clearInterval(bursts), BURST_MS);

    return () => {
      clearTimeout(stopBursts);
      clearInterval(bursts);
      cancelAnimationFrame(raf);
      fire.reset();
    };
  }, [phase, reduce, youWon]);

  // Auto-dismiss the reveal after a beat.
  useEffect(() => {
    if (phase !== "won") return;
    const id = setTimeout(() => onCloseRef.current(), WON_AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const open = phase !== null;
  const won = phase === "won";
  const canTick = prizeValue != null && formatMoney != null;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={won ? onClose : undefined}
            className="fixed inset-0 z-[398] bg-black/75 backdrop-blur-[7px]"
          />
          {/* Confetti sits behind the card so the card stays cleanly on top. */}
          {won ? (
            <canvas
              ref={canvasRef}
              aria-hidden
              // A <canvas> is a replaced element: `fixed inset-0` alone leaves it
              // at its default 300x150 in the top-left, so confetti (with
              // resize:true reading that size) fires into a tiny box up there.
              // Sizing it to the viewport (w/h-screen) makes the burst fill the
              // screen and frame the card.
              className="pointer-events-none fixed inset-0 z-[399] h-screen w-screen"
            />
          ) : null}
          <div className="pointer-events-none fixed inset-0 z-[400] grid place-items-center p-6">
            <AnimatePresence mode="wait">
              {won && youWon ? (
                <motion.div
                  key="won-me"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 22 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={
                    reduce ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 20 }
                  }
                  className="ws-glass pointer-events-auto relative w-full max-w-[440px] overflow-hidden rounded-[28px] p-8 text-center shadow-[0_50px_140px_-30px_rgba(246,211,101,0.6)]"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-28 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-[#F6D365]/25 blur-[80px]"
                  />
                  <div className="relative">
                    {/* Trophy on a slowly rotating conic shine. */}
                    <div className="relative mx-auto h-24 w-24">
                      {reduce ? null : (
                        <motion.div
                          aria-hidden
                          animate={{ rotate: 360 }}
                          transition={{ duration: 5, ease: "linear", repeat: Infinity }}
                          className="absolute inset-0 rounded-full opacity-80"
                          style={{
                            background:
                              "conic-gradient(from 0deg, rgba(246,211,101,0) 0deg, #F6D365 70deg, #ffffff 150deg, rgba(246,211,101,0) 260deg)",
                            mask: "radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px))",
                            WebkitMask:
                              "radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px))",
                          }}
                        />
                      )}
                      <motion.div
                        initial={reduce ? {} : { scale: 0, rotate: -30 }}
                        animate={reduce ? {} : { scale: 1, rotate: 0 }}
                        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 13 }}
                        className="absolute inset-[10px] grid place-items-center rounded-full bg-[linear-gradient(180deg,#F6D365,#e0a83a)] text-[34px] shadow-[0_14px_36px_-8px_rgba(246,211,101,0.8)]"
                      >
                        🏆
                      </motion.div>
                    </div>
                    <div className="mt-5 text-[13px] font-bold tracking-[0.24em] text-[#F6D365] uppercase">
                      Jackpot
                    </div>
                    <div className="ws-serif mt-1 bg-[linear-gradient(180deg,#ffffff,#cbbcff)] bg-clip-text text-[40px] leading-none text-transparent">
                      You won!
                    </div>
                    <div className="ws-serif tnum mt-4 text-[clamp(48px,13vw,72px)] leading-none text-white drop-shadow-[0_0_32px_rgba(246,211,101,0.5)]">
                      {canTick ? (
                        <MoneyTicker value={prizeValue} format={formatMoney} delay={0.25} />
                      ) : (
                        prizeLabel
                      )}
                    </div>
                    {winnerLabel ? (
                      <div className="tnum mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#F6D365]/25 bg-[#F6D365]/10 px-3 py-1 text-[12px] font-semibold text-[#F6D365]">
                        <span aria-hidden>✦</span>
                        Credited to {winnerLabel}
                      </div>
                    ) : null}
                    <div className="mt-3 text-[13.5px] font-normal text-white/60">
                      The whole pot has been added to your balance.
                    </div>
                    <button
                      onClick={onClose}
                      className="mt-7 w-full cursor-pointer rounded-2xl bg-[linear-gradient(180deg,#c3b0ff,#8b6ef0)] p-4 font-sans text-[16px] font-bold text-white shadow-[0_16px_42px_-12px_rgba(167,139,250,0.9)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Nice!
                    </button>
                  </div>
                </motion.div>
              ) : won ? (
                <motion.div
                  key="won-them"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 22 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={
                    reduce ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 22 }
                  }
                  className="ws-glass pointer-events-auto relative w-full max-w-[440px] overflow-hidden rounded-[28px] p-8 text-center shadow-[0_50px_140px_-30px_rgba(167,139,250,0.7)]"
                >
                  <div
                    aria-hidden
                    className="bg-accent/30 pointer-events-none absolute -top-28 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full blur-[80px]"
                  />
                  <div className="relative">
                    <motion.div
                      initial={reduce ? {} : { scale: 0, rotate: -20 }}
                      animate={reduce ? {} : { scale: 1, rotate: 0 }}
                      transition={{ delay: 0.08, type: "spring", stiffness: 260, damping: 14 }}
                      className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[linear-gradient(180deg,#c3b0ff,#8b6ef0)] text-[36px] shadow-[0_14px_36px_-8px_rgba(167,139,250,0.8)]"
                    >
                      👑
                    </motion.div>
                    <div className="text-accent mt-5 text-[13px] font-bold tracking-[0.24em] uppercase">
                      We have a winner
                    </div>
                    <div className="ws-serif tnum mt-2 bg-[linear-gradient(180deg,#ffffff,#cbbcff)] bg-clip-text text-[clamp(34px,10vw,52px)] leading-none tracking-[0.02em] text-transparent">
                      {winnerLabel ?? "A player"}
                    </div>
                    <div className="mt-4 text-[14px] font-normal text-white/60">
                      took the whole pot of{" "}
                      <span className="tnum text-accent font-semibold">
                        {canTick ? (
                          <MoneyTicker value={prizeValue} format={formatMoney} delay={0.25} />
                        ) : (
                          prizeLabel
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[13px] font-normal text-white/45">
                      Better luck next round — a fresh pot is building now.
                    </div>
                    <button
                      onClick={onClose}
                      className="mt-7 w-full cursor-pointer rounded-2xl bg-white/10 p-4 font-sans text-[16px] font-bold text-white ring-1 ring-white/15 transition-transform hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Got it
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="calc"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 16 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="ws-glass pointer-events-auto relative w-full max-w-[420px] overflow-hidden rounded-[28px] p-8 text-center shadow-[0_50px_140px_-30px_rgba(167,139,250,0.6)]"
                >
                  <div
                    aria-hidden
                    className="bg-accent/25 pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 animate-pulse rounded-full blur-[80px]"
                  />
                  <div className="relative">
                    {/* Spinning fortune ring. */}
                    <div className="relative mx-auto h-24 w-24">
                      {reduce ? null : (
                        <motion.div
                          aria-hidden
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.4, ease: "linear", repeat: Infinity }}
                          className="absolute inset-0 rounded-full"
                          style={{
                            background:
                              "conic-gradient(from 0deg, rgba(167,139,250,0) 0deg, #A78BFA 90deg, #F6D365 200deg, rgba(167,139,250,0) 320deg)",
                            mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
                            WebkitMask:
                              "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
                          }}
                        />
                      )}
                      <div className="absolute inset-[10px] grid place-items-center rounded-full bg-black/40 text-[30px]">
                        <motion.span
                          animate={reduce ? {} : { scale: [1, 1.12, 1] }}
                          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                        >
                          🎰
                        </motion.span>
                      </div>
                    </div>

                    <div className="ws-serif mt-6 text-[26px] leading-tight text-white">
                      Calculating the winner…
                    </div>
                    <div className="mt-2 text-[13px] font-normal text-white/55">
                      Deciding who takes the pot. Hold tight.
                    </div>
                    <div className="tnum text-accent mt-4 text-[15px] font-semibold">
                      {prizeLabel} on the line
                    </div>

                    {/* Suspense progress that fills across the wait. */}
                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                      {reduce ? (
                        <div className="bg-accent h-full w-1/3 rounded-full" />
                      ) : (
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 5, ease: "linear" }}
                          className="bg-accent h-full rounded-full"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
