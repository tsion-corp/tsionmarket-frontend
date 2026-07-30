"use client";

import { isCasinoUnconfigured } from "@/lib/casino/api/client";

// Shared async states for the casino screens. Real data means real failure
// modes, so every screen shows one of these rather than rendering an empty
// shell that looks like a working page with nothing in it.

export function CasinoLoading({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-white/6" />
      ))}
    </div>
  );
}

export function CasinoEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center px-4 py-14 text-center text-[13px] font-normal text-white/45">
      {children}
    </div>
  );
}

interface CasinoErrorProps {
  error: unknown;
  // What the user was trying to see, e.g. "the lobby".
  subject: string;
  onRetry?: () => void;
}

// One error surface for the whole casino. A gateway that isn't configured yet
// reads as "not available", not as a fault the player can retry away.
export function CasinoError({ error, subject, onRetry }: CasinoErrorProps) {
  const unconfigured = isCasinoUnconfigured(error);
  const message = unconfigured ? `${subject} isn't available yet.` : `Couldn't load ${subject}.`;
  const detail = unconfigured
    ? "This game goes live once the casino service is switched on."
    : ((error as Error | null)?.message ?? "Something went wrong on our side.");

  return (
    <div className="ws-inset grid place-items-center px-5 py-12 text-center">
      <div className="max-w-[42ch]">
        <div className="text-[14px] font-semibold text-white/85">{message}</div>
        <div className="mt-1.5 text-[12.5px] font-normal text-white/50">{detail}</div>
        {onRetry && !unconfigured ? (
          <button
            onClick={onRetry}
            className="mt-4 cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
