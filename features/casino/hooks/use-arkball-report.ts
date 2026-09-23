"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics/mixpanel";
import type { LotteryDraw } from "@/lib/api/schemas/lottery";

// What ArkBall reports about the draw itself: that a player opened it, and that
// it settled.
//
// Both are reported from here rather than from the section, because the section
// returns early while the draw is loading and a hook cannot be called behind a
// branch. Each is reported once per draw: the draw is polled every five
// seconds, and reporting on every poll would turn one draw into hundreds.

/** A draw amount as the number an analytics property carries. */
function usd(value: string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

// The states in which a draw is finished and its figures are final. Anything
// earlier is still moving, and a settled event sent then would report a
// jackpot that has not stopped growing.
const SETTLED = new Set(["settled", "refunded"]);

export function useArkballReport(draw: LotteryDraw | null): void {
  // The draw each event has already been sent for, so a re-render or a poll
  // does not send it again.
  const opened = useRef<string | null>(null);
  const settled = useRef<string | null>(null);

  const id = draw?.id ?? null;
  const status = draw?.status ?? null;

  useEffect(() => {
    if (!draw || !id || opened.current === id) return;
    opened.current = id;
    track("arkball_opened", {
      draw_id: id,
      jackpot_usd: usd(draw.advertisedJackpotUsdc),
      tickets_sold: draw.totalTickets,
      player_count: draw.totalPlayers,
    });
  }, [draw, id]);

  useEffect(() => {
    if (!draw || !id || !status || !SETTLED.has(status) || settled.current === id) return;
    settled.current = id;
    track("arkball_draw_settled", {
      draw_id: id,
      jackpot_usd: usd(draw.advertisedJackpotUsdc),
      tickets_sold: draw.totalTickets,
      player_count: draw.totalPlayers,
      winner_count: draw.winningTicketCount,
      payout_usd: usd(draw.payoutUsdc),
      // Money carried into the next draw means nobody took the jackpot.
      rollover: usd(draw.rolloverUsdc) > 0,
    });
  }, [draw, id, status]);
}
