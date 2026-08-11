"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Nudges a player who has stopped playing, and eventually resigns for them.
//
// "Stopped playing" is measured against their own clock: once they have used a
// tenth of their starting time on a single move they are asked whether they
// mean to carry on, asked again at a fifth, and resigned at three tenths. The
// point is to release the opponent from a game nobody is playing, rather than
// leaving them watching a clock tick down alone.
//
// Every threshold is a fraction of the starting clock, so it scales with the
// time control instead of hard-coding seconds: 30s / 60s / 90s in a 5+3, but
// 90s / 180s / 270s in a 15+10.

export const NUDGE_FRACTIONS = [0.1, 0.2] as const;
export const AUTO_RESIGN_FRACTION = 0.3;

const TICK_MS = 1_000;

export interface UseChessIdleOptions {
  // Only counts while it is this player's move in a running game.
  active: boolean;
  // The starting clock for one side, which every threshold is a fraction of.
  initialSeconds: number;
  // When the current move began, as an ISO timestamp.
  since: string;
  // Changes every move, which clears the thresholds already crossed.
  turnKey: number;
  onAutoResign: () => void;
}

export function useChessIdle({
  active,
  initialSeconds,
  since,
  turnKey,
  onAutoResign,
}: UseChessIdleOptions) {
  // Tagged with the move it belongs to, so a prompt raised on the previous move
  // is ignored rather than needing an effect to clear it.
  const [pending, setPending] = useState<{ turn: number; fraction: number } | null>(null);
  // Held in a ref so a new callback identity each render does not restart the
  // timer and lose the thresholds already crossed with it.
  const autoResignRef = useRef(onAutoResign);
  useEffect(() => {
    autoResignRef.current = onAutoResign;
  }, [onAutoResign]);

  useEffect(() => {
    if (!active || initialSeconds <= 0) return;
    const startedAt = Date.parse(since);
    if (!Number.isFinite(startedAt)) return;

    // Scoped to this move: the effect is torn down and rebuilt on the next one,
    // which is what gives each move its own full allowance.
    const crossed = new Set<number>();
    let resigned = false;

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const fraction = elapsed / initialSeconds;

      if (fraction >= AUTO_RESIGN_FRACTION) {
        if (resigned) return;
        resigned = true;
        setPending(null);
        autoResignRef.current();
        return;
      }

      for (const threshold of NUDGE_FRACTIONS) {
        if (fraction >= threshold && !crossed.has(threshold)) {
          crossed.add(threshold);
          setPending({ turn: turnKey, fraction: threshold });
        }
      }
    };

    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [active, initialSeconds, since, turnKey]);

  const dismiss = useCallback(() => setPending(null), []);

  return { pending: pending?.turn === turnKey ? pending.fraction : null, dismiss };
}
