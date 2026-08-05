"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { COUNTDOWN_SECONDS_THRESHOLD, closeUrgency, timeUntil } from "@/lib/prediction/format";

interface CloseTimerProps {
  // Market/event close time, unix SECONDS (0/null → nothing to show).
  closeTime: number | null;
  // The market/event's actual lifecycle status. When it is anything other than
  // "Open" (Closed, Resolved, …), the countdown is irrelevant — we show the
  // status label directly and never tick. Optional: when omitted, the timer
  // falls back to purely time-based (counts down, then "Closed" once the clock
  // passes closeTime), which is the right behavior for surfaces that don't carry
  // a status.
  status?: string;
  // Optional extra classes so a card can size/space the label to its layout.
  className?: string;
}

// Live "Closes in 2d 4h" countdown for a market or event card, driven off the
// shared `timeUntil` formatter. Ticks itself so the label stays current without
// the parent re-rendering: once under a minute it updates every second (so the
// final seconds actually count down), otherwise once a minute (a multi-day
// market has no reason to re-render every second). Once the close time passes it
// shows the "Closed" status label instead of a stale/negative countdown.
export function CloseTimer({ closeTime, status, className }: CloseTimerProps) {
  const t = useTranslations("prediction");
  // The clock this render reads from. Held in state (seeded once on mount, then
  // advanced by the interval) rather than calling Date.now() during render, which
  // would be an impure read that can produce an unstable result mid-render.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Once the market/event is no longer Open (Closed, Resolved, Invalid), the
  // countdown is meaningless — the status IS the state. Don't tick, just label.
  const settled = status !== undefined && status !== "Open";
  const remaining = !settled && closeTime ? timeUntil(closeTime, nowMs) : null;
  // How close the deadline is, surfaced as a data attribute so the call site
  // decides what pressure looks like. A card can stay quiet while the detail
  // page's badge escalates, off one shared set of thresholds.
  const urgency = settled ? "none" : closeUrgency(closeTime, nowMs);

  useEffect(() => {
    if (settled || !closeTime) return;
    const secondsLeft = closeTime - nowMs / 1000;
    if (secondsLeft <= 0) return; // already past close — nothing to tick
    // Tick in step with the finest unit on screen: every second while the label
    // carries seconds, otherwise every 30s. A slower tick than the display
    // means a countdown that visibly sticks.
    const intervalMs = secondsLeft < COUNTDOWN_SECONDS_THRESHOLD ? 1_000 : 30_000;
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
    // `remaining`/`settled` in the deps: when the countdown flips (crosses the
    // one-minute boundary, hits closed) or the status settles, re-run and
    // re-pick the right cadence / stop ticking.
  }, [closeTime, nowMs, remaining, settled]);

  // A settled market shows its status label (Closed/Resolved/…). An Open one
  // shows a live countdown, falling back to "Closed" once the clock passes the
  // close time even if the backend hasn't flipped the status yet.
  if (settled) {
    return (
      <span data-urgency="none" className={className}>
        {t(`status_${status}`)}
      </span>
    );
  }
  if (!closeTime) return null;
  return (
    <span data-urgency={urgency} className={className}>
      {remaining ? `${t("closesIn")} ${remaining}` : t("status_Closed")}
    </span>
  );
}
