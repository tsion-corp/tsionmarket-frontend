"use client";

import { useTranslations } from "next-intl";
import { isCasinoUnconfigured } from "@/lib/casino/api/client";

// Shared async states for the casino screens. Real data means real failure
// modes, so every screen shows one of these rather than rendering an empty
// shell that looks like a working page with nothing in it.

export function CasinoLoading({ label, rows = 3 }: { label?: string; rows?: number }) {
  const t = useTranslations("casino.common");
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label ?? t("loading")}</span>
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
  // What the user was trying to see, already localized, e.g. t("subject").
  subject: string;
  onRetry?: () => void;
}

// One error surface for the whole casino. A gateway that isn't configured yet
// reads as "not available", not as a fault the player can retry away.
export function CasinoError({ error, subject, onRetry }: CasinoErrorProps) {
  const t = useTranslations("casino.common");
  const unconfigured = isCasinoUnconfigured(error);
  const message = unconfigured
    ? t("unavailableTitle", { subject })
    : t("loadFailedTitle", { subject });
  const detail = unconfigured
    ? t("unavailableDetail")
    : ((error as Error | null)?.message ?? t("loadFailedDetail"));

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
            {t("tryAgain")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
