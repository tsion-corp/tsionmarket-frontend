"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Milliseconds left until `target`, refreshed every second, clamped at zero.
 *
 * Lives here rather than in a feature because two of them need it: the
 * prediction desk already has its own CloseTimer, and the discovery shelves
 * cannot import that (features never import each other). A caller passing null
 * runs no timer at all, which is the case for a market with no deadline.
 *
 * A clock is an external system, so it is read through useSyncExternalStore
 * rather than an effect that writes state on a tick. That is not a stylistic
 * choice: setting state synchronously inside an effect cascades renders and the
 * lint rule rejects it, and the store API also gives the server a snapshot of
 * its own, so the first paint carries real digits instead of flashing "no
 * deadline" and then correcting itself.
 *
 * The value is quantised to whole seconds. getSnapshot is called during render
 * and compared by identity, so returning a raw `Date.now()` difference would
 * differ on every single read and spin.
 */
export function useCountdown(target: number | null): number | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (target === null) return () => {};
      const id = setInterval(() => {
        onStoreChange();
        // A deadline that has passed cannot change again, so the timer stops
        // rather than ticking on a value nobody will see move.
        if (target - Date.now() <= 0) clearInterval(id);
      }, 1000);
      return () => clearInterval(id);
    },
    [target]
  );

  const readClock = useCallback(() => {
    if (target === null) return null;
    return Math.floor(Math.max(0, target - Date.now()) / 1000) * 1000;
  }, [target]);

  return useSyncExternalStore(subscribe, readClock, readClock);
}

/**
 * A remaining duration as the design draws it: "01:46:55:22", days first, every
 * field padded to two digits.
 *
 * Past 99 days the day field is left as it falls rather than truncated, because
 * a wrong number is worse than a wide one. Null in, null out, so a market with
 * no deadline stays distinguishable from one with no time left.
 */
export function formatCountdown(remainingMs: number | null): string | null {
  if (remainingMs === null || !Number.isFinite(remainingMs)) return null;
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Parses a feed's ISO timestamp into epoch milliseconds, or null when it is
 * missing or unparseable.
 *
 * Anything that is not a real date returns null rather than NaN, so a malformed
 * value from upstream reads as "no deadline" instead of rendering NaN into the
 * chip.
 */
export function parseCloseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
