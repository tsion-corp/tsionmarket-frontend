"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PREFILL_PARAMS, readTradePrefill } from "@/lib/voice/prefill";
import type { TradePrefill } from "@/lib/voice/intent";

// Reads a voice trade prefill from the URL, then strips the params so a reload
// or back-navigation doesn't re-open the trade. Returns the prefill or null. The
// section that consumes it resolves the symbol against its registry and opens
// the panel.
//
// Reads window.location directly rather than useSearchParams so the consuming
// section does not need a Suspense boundary for static prerender — the params
// only ever arrive client-side (a voice command in the browser).
//
// A voice buy/sell is dispatched with `router.push('/dashboard?trade=…')` from a
// page that is ALREADY on /dashboard, so the params arrive WITHOUT a remount and
// without changing `pathname`. A mount-only read would miss them (worked only
// after a refresh). We watch the live search string on a light interval and
// surface the prefill the moment it appears, then strip the params. All state
// changes happen inside effects (never during render), so this can't loop.
export function useTradePrefill(): TradePrefill | null {
  const router = useRouter();
  const pathname = usePathname();
  const [prefill, setPrefill] = useState<TradePrefill | null>(null);
  // The search string we last acted on — so we surface each new trade once and
  // don't re-fire on the render caused by stripping the params.
  const lastSearch = useRef<string | null>(null);

  useEffect(() => {
    const check = () => {
      const search = window.location.search;
      if (search === lastSearch.current) return;
      lastSearch.current = search;
      const next = readTradePrefill(new URLSearchParams(search));
      if (next) setPrefill(next);
    };
    check();
    const id = window.setInterval(check, 150);
    return () => window.clearInterval(id);
    // pathname is included so a real route change re-primes the check immediately.
  }, [pathname]);

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
    router.replace(`${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [prefill, router, pathname]);

  return prefill;
}
