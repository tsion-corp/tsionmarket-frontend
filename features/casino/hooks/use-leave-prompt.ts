"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setNavigationGuard } from "@/lib/navigation-guard";

/**
 * Catches a click that would take the player out of the arena, so they can be
 * offered the pop-out before they go.
 *
 * It has to be a click, not a route change: opening a picture-in-picture
 * window needs a user gesture, and by the time a route change is observable
 * the gesture is spent. Holding the navigation lets the answer ("yes, keep it
 * with me") BE the gesture that opens the window.
 *
 * Capture phase, because Next's Link handles the click itself and would have
 * navigated before a bubbling listener ran.
 */
export function useLeavePrompt(active: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  // Set while we replay a click we previously held, so the listener lets that
  // one through instead of catching it again.
  const releasing = useRef(false);

  // The phone's tab bar calls router.push rather than rendering links, so a
  // click listener never sees it. Registering here is what makes those tabs
  // ask too, and it is the same question with the same answer.
  useEffect(() => {
    if (!active) return;
    return setNavigationGuard((href) => {
      if (href === window.location.pathname) return false;
      setPending(href);
      return true;
    });
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const onClick = (event: MouseEvent) => {
      if (releasing.current) return;
      // Anything but a plain left click is the browser's to handle: a new tab
      // is not leaving this page.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      // Off-site, or a jump within this page, is not leaving the arena.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      setPending(`${url.pathname}${url.search}`);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  // Goes where they were going. `onBefore` runs first and still inside the
  // click that answered, which is what lets it open the pop-out.
  const leave = useCallback(
    (onBefore?: () => void) => {
      const href = pending;
      setPending(null);
      onBefore?.();
      if (!href) return;
      releasing.current = true;
      router.push(href);
      // The flag only needs to outlive this click.
      window.setTimeout(() => {
        releasing.current = false;
      }, 0);
    },
    [pending, router]
  );

  const stay = useCallback(() => setPending(null), []);

  return { pending, leave, stay };
}
