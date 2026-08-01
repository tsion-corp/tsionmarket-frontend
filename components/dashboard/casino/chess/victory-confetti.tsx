"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

const COLORS = ["#d8d8dc", "#ffffff", "#a8a8ae", "#7CE7B0"];

// A short silver burst over the board; mounted only for the round the player
// just won, unmounting cleans it up.
export function VictoryConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // No 2D context (jsdom, ancient browsers): skip rather than crash.
    if (!canvasRef.current?.getContext("2d")) return;
    const fire = confetti.create(canvasRef.current, { resize: true, useWorker: false });
    const burst = (x: number) =>
      fire({
        particleCount: 70,
        spread: 75,
        startVelocity: 42,
        origin: { x, y: 0.85 },
        colors: COLORS,
        disableForReducedMotion: true,
      });
    burst(0.15);
    burst(0.85);
    const mid = setTimeout(() => burst(0.5), 450);
    return () => {
      clearTimeout(mid);
      fire.reset();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[300] h-full w-full"
    />
  );
}
