"use client";

import { useEffect, useRef } from "react";
import {
  formatRemaining,
  secondsUntil,
  subscribeToClock,
} from "@/features/casino/lib/last-standing/clock";

interface CountdownProps {
  /** Unix seconds the timer ends. */
  endTime: number;
  /** Shown instead of the clock once it reaches zero. */
  expiredLabel?: string;
  className?: string;
  /** Called the first time this countdown reaches zero. */
  onExpire?: () => void;
}

/**
 * A ticking clock that never re-renders.
 *
 * The text is written straight into the span's own text node from a shared
 * one-second tick, so a lobby of twenty games costs twenty text writes a
 * second instead of twenty React renders a second. Nothing above it re-renders
 * either, which is what keeps the list smooth while the sockets are also
 * pushing pot updates into it.
 */
export function Countdown({ endTime, expiredLabel, className, onExpire }: CountdownProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Held in a ref so a caller passing an inline arrow does not re-subscribe on
  // every render of the parent.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let fired = false;

    const write = () => {
      const left = secondsUntil(endTime);
      el.textContent = left === 0 && expiredLabel ? expiredLabel : formatRemaining(left);
      if (left === 0 && !fired) {
        fired = true;
        onExpireRef.current?.();
      }
    };

    write();
    return subscribeToClock(write);
  }, [endTime, expiredLabel]);

  // Rendered empty and filled by the effect, so the first paint and every tick
  // after it come from the same code path.
  return <span ref={ref} className={className} suppressHydrationWarning />;
}
