"use client";

import { useEffect, useRef } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";

// Interaction that counts as "the user is here" and resets the idle timer.
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

// Logs the user out after `timeoutMs` of no interaction; any listed activity
// resets the countdown. This guards a funded session left open on an unattended
// or shared device: when the user comes back they must sign in again. `enabled`
// keeps it dormant until the session is actually authenticated. `onIdle` runs
// just before logout (e.g. to surface a "signed out for security" message).
export function useIdleLogout(timeoutMs: number, enabled: boolean, onIdle?: () => void): void {
  const { logout } = useAuthSession();

  // Keep the latest logout/onIdle in a ref, updated in an effect (not during
  // render), so the listener effect below doesn't re-bind every render.
  const fire = useRef<() => void>(() => {});
  useEffect(() => {
    fire.current = () => {
      onIdle?.();
      void logout();
    };
  });

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fire.current(), timeoutMs);
    };

    reset();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }
    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [enabled, timeoutMs]);
}
