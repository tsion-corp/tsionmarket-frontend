"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PREFILL_PARAMS, readDepositPrefill } from "@/lib/voice/prefill";
import type { DepositPrefill } from "@/lib/voice/intent";

// Reads a voice crypto-deposit prefill from the URL, then strips the params so a
// reload doesn't re-open the funds modal. Returns the prefill or null. The
// dashboard opens the funds modal on the crypto screen with this chain/token
// pre-selected.
//
// Reads window.location directly rather than useSearchParams so the consuming
// page does not need a Suspense boundary for static prerender — the params only
// ever arrive client-side (a voice command in the browser).
//
// A spoken deposit is dispatched with `router.push('/dashboard?…')` from a page
// that is ALREADY on /dashboard, so the params arrive WITHOUT a remount and
// without changing `pathname`. To catch that, we watch the search string with a
// short polling interval and surface the prefill the moment it appears, then
// strip the params. All state changes happen inside effects (never during
// render), so this can't loop.
export function useDepositPrefill(): DepositPrefill | null {
  const router = useRouter();
  const pathname = usePathname();
  const [prefill, setPrefill] = useState<DepositPrefill | null>(null);
  // The search string we last acted on — so we surface each new deposit once and
  // don't re-fire on the render caused by stripping the params.
  const lastSearch = useRef<string | null>(null);

  // Watch the URL's search string for a deposit prefill. A same-path push (the
  // voice command) doesn't remount us or change `pathname`, so we poll the live
  // value on a light interval and react when it changes.
  useEffect(() => {
    const check = () => {
      const search = window.location.search;
      if (search === lastSearch.current) return;
      lastSearch.current = search;
      const next = readDepositPrefill(new URLSearchParams(search));
      if (next) setPrefill(next);
    };
    check();
    const id = window.setInterval(check, 150);
    return () => window.clearInterval(id);
    // pathname is included so a real route change re-primes the check immediately.
  }, [pathname]);

  // Once a prefill is surfaced, strip the params so a reload/back doesn't re-open
  // the modal.
  useEffect(() => {
    if (!prefill) return;
    const next = new URLSearchParams(window.location.search);
    let changed = false;
    for (const key of PREFILL_PARAMS) {
      if (next.has(key)) {
        next.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const query = next.toString();
    // Keep the watcher's marker in sync with the stripped URL so it doesn't treat
    // the post-strip search as a new value to act on.
    lastSearch.current = query ? `?${query}` : "";
    router.replace(`${pathname}${query ? `?${query}` : ""}`);
  }, [prefill, router, pathname]);

  return prefill;
}
