"use client";

import { useEffect, useRef } from "react";
import { playLowTimeWarning } from "@/features/casino/lib/chess/sound";

const LOW_TIME_SECONDS = 10;

// Chess clients treat ten seconds as a clock event, not a board takeover. The
// cue fires once when the active player enters the danger window and rearms if
// an increment or extension takes the clock safely above it again.
export function LowTimeWarning({ secondsLeft, live }: { secondsLeft: number; live: boolean }) {
  const warned = useRef(false);

  useEffect(() => {
    if (!live || secondsLeft > LOW_TIME_SECONDS) {
      warned.current = false;
      return;
    }
    if (secondsLeft <= 0 || warned.current) return;
    warned.current = true;
    playLowTimeWarning();
  }, [live, secondsLeft]);

  return null;
}
