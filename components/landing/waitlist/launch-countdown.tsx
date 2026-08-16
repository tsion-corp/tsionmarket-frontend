"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

interface LaunchCountdownProps {
  /** When the doors open, epoch milliseconds. */
  launchAt: number;
  /** The server's clock at render, so the first paint matches what it sent. */
  serverNow: number;
}

// One second at a time. The clock is an external store rather than state so
// the server snapshot and the first client render agree, and so a background
// tab that comes back shows the right number at once instead of resuming from
// where it stopped: the value is derived from the wall clock, never counted.
function subscribe(tick: () => void): () => void {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

const nowSeconds = () => Math.floor(Date.now() / 1000) * 1000;

// Reloads once the doors should be open, so the same visitor lands on the
// live site without touching anything. If the server's clock is behind this
// one it will still serve the countdown for a moment; the retry keeps the gap
// short without hammering.
const RELOAD_GRACE_MS = 1500;
const RETRY_MS = 8000;

function split(remainingMs: number) {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function LaunchCountdown({ launchAt, serverNow }: LaunchCountdownProps) {
  const t = useTranslations("waitlist");
  const now = useSyncExternalStore(subscribe, nowSeconds, () => serverNow);
  const remaining = launchAt - now;
  const open = remaining <= 0;
  const reloading = useRef(false);

  useEffect(() => {
    if (!open || reloading.current) return;
    reloading.current = true;
    const first = setTimeout(() => window.location.reload(), RELOAD_GRACE_MS);
    const retry = setInterval(() => window.location.reload(), RETRY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(retry);
    };
  }, [open]);

  const parts = split(remaining);
  const cells = [
    { key: "days", value: parts.days, show: parts.days > 0 },
    { key: "hours", value: parts.hours, show: true },
    { key: "minutes", value: parts.minutes, show: true },
    { key: "seconds", value: parts.seconds, show: true },
  ] as const;

  const opensAt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(launchAt);

  return (
    <div className="flex flex-col items-center" aria-live="polite">
      <div className="text-[11.5px] font-medium tracking-[0.18em] text-white/55 uppercase">
        {open ? t("opening") : t("opensIn")}
      </div>
      <div className="mt-4 flex items-start justify-center gap-3 sm:gap-5">
        {cells
          .filter((c) => c.show)
          .map((c) => (
            <div key={c.key} className="flex flex-col items-center">
              <div className="ws-display tnum min-w-[2ch] rounded-[16px] border border-white/12 bg-white/6 px-4 py-3 text-[clamp(34px,7vw,64px)] leading-none tracking-[-0.02em] text-white backdrop-blur-[30px] sm:px-6 sm:py-4">
                {String(c.value).padStart(2, "0")}
              </div>
              <div className="mt-2 text-[10.5px] font-medium tracking-[0.16em] text-white/45 uppercase">
                {t(`unit.${c.key}`)}
              </div>
            </div>
          ))}
      </div>
      <div className="tnum mt-5 text-[13px] font-normal text-white/50">
        {t("opensAt", { time: opensAt })}
      </div>
    </div>
  );
}
