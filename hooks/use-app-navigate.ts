"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { scrollToSection } from "@/lib/scroll";
import { isNavTarget, type TradePrefill } from "@/lib/voice/intent";
import { prefillToQuery } from "@/lib/voice/prefill";

// The one place that knows how to move between app sections: "casino" is a real
// route, so it always navigates there; every other section is a scroll-spy
// anchor that only exists on /dashboard, so it scrolls in-page when already
// there and otherwise navigates to /dashboard#id first.
//
// A voice buy/sell passes an optional `prefill`, encoded as URL query params so
// the target section opens its trade form staged (the user then confirms). When
// a prefill is present we always push the URL (even if already on /dashboard) so
// the section can read the params; without one we keep the lighter in-page
// scroll.
//
// Extracted from DashboardShell so the shell's chrome and the voice command
// dispatcher share a single implementation instead of drifting apart. The id is
// typed string (the shell's nav callbacks pass a plain string) and validated
// here, so an unrecognized id is a safe no-op rather than a bad route push.
export function useAppNavigate(): (id: string, prefill?: TradePrefill) => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (id: string, prefill?: TradePrefill) => {
      if (!isNavTarget(id)) return;
      const query = prefill ? prefillToQuery(prefill) : "";
      if (id === "casino") {
        router.push(query ? `/casino?${query}` : "/casino");
        return;
      }
      if (pathname === "/dashboard" && !query) {
        scrollToSection(id);
      } else {
        router.push(query ? `/dashboard?${query}#${id}` : `/dashboard#${id}`);
      }
    },
    [router, pathname]
  );
}
