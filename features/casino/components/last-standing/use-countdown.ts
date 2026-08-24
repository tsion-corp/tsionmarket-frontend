"use client";

import { useEffect, useState } from "react";

// Ticks a server-reported "seconds remaining" down locally between updates,
// resetting whenever a fresh value arrives from the socket or REST poll.
//
// `frozen` pauses the local tick: on a degraded connection, ticking on would
// count down a round the server may long since have extended or ended. The
// display holds, and a fresh server value still resets it the moment one
// arrives. Its own module so the freeze behaviour is unit-testable without
// mounting the whole game screen.
export function useCountdown(serverSeconds: number, active: boolean, frozen: boolean): number {
  const [lastServerSeconds, setLastServerSeconds] = useState(serverSeconds);
  const [seconds, setSeconds] = useState(serverSeconds);

  if (serverSeconds !== lastServerSeconds) {
    setLastServerSeconds(serverSeconds);
    setSeconds(serverSeconds);
  }

  useEffect(() => {
    if (!active || frozen) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active, frozen]);

  return seconds;
}
