"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";

interface MoneyTickerProps {
  value: number;
  // Formatter for the current animated amount (e.g. a currency formatter).
  format: (n: number) => string;
  // Beat before the count-up starts; handy for staged reveals.
  delay?: number;
  className?: string;
}

// Animates a money value toward `value` — counting up from zero on mount, then
// tweening between updates (e.g. a growing prize pool). The motion value drives
// the text node directly, so there's no React re-render per frame. Under reduced
// motion it snaps to the value with no animation.
export function MoneyTicker({ value, format, delay = 0, className }: MoneyTickerProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: 1.1,
      delay,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, delay]);

  return <motion.span className={className}>{text}</motion.span>;
}
