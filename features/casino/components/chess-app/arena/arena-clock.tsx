"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function formatArenaDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"}`;
}

export function formatArenaClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function useArenaCountdown(target: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!target) return 0;
  return Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1_000));
}

export function ArenaClock({
  target,
  compact = false,
  className,
}: {
  target: string | null;
  compact?: boolean;
  className?: string;
}) {
  const seconds = useArenaCountdown(target);
  return (
    <span
      className={cn(
        "tnum font-semibold tracking-[-0.035em] text-white",
        compact ? "text-[13px]" : "text-[clamp(42px,7vw,76px)]",
        className
      )}
    >
      {formatArenaClock(seconds)}
    </span>
  );
}
