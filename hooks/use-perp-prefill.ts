"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PREFILL_PARAMS, readPerpPrefill } from "@/lib/voice/prefill";
import type { PerpPrefill } from "@/lib/voice/intent";

// Reads a voice PERPS prefill from the URL, then strips the params so a reload
// doesn't re-fire the trade. Returns the prefill or null. The perps section
// auto-executes the returned position (asset, side, collateral, leverage).
//
// Reads window.location directly rather than useSearchParams so the consuming
// section does not need a Suspense boundary for static prerender — the params
// only ever arrive client-side (a voice command in the browser).
//
// A spoken perp is dispatched with `router.push('/dashboard?perp=…#trade')` from
// a page already on /dashboard, so the params arrive WITHOUT a remount and
// without changing `pathname`. We watch the live search string on a light
// interval, surface the prefill once, then strip the params. All state changes
// happen inside effects (never during render), so this can't loop.
export function usePerpPrefill(): PerpPrefill | null {
  const router = useRouter();
  const pathname = usePathname();
  const [prefill, setPrefill] = useState<PerpPrefill | null>(null);
  // The search string we last acted on — so we surface each new command once and
  // don't re-fire on the render caused by stripping the params.
  const lastSearch = useRef<string | null>(null);

  useEffect(() => {
    const check = () => {
      const search = window.location.search;
      if (search === lastSearch.current) return;
      lastSearch.current = search;
      const next = readPerpPrefill(new URLSearchParams(search));
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
