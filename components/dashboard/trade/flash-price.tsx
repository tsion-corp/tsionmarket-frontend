"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Blinks the wrapped price on change: up ticks flash green, down ticks flash
// red, then the colour fades back. The comparison lives in an effect (never
// in render) so the component stays pure for the React Compiler.

const FLASH_MS = 700;

interface FlashPriceProps {
  // The numeric price being displayed; 0 or NaN means "no price yet" and
  // never triggers a flash.
  value: number;
  className?: string;
  children: ReactNode;
}

export function FlashPrice({ value, className, children }: FlashPriceProps) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const last = prev.current;
    prev.current = value;
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(last) || last <= 0) return;
    if (value === last) return;
    setFlash(value > last ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <span
      className={`${className ?? ""} transition-colors duration-300 ${
        flash === "up" ? "text-up" : flash === "down" ? "text-down" : "text-white"
      }`}
    >
      {children}
    </span>
  );
}
