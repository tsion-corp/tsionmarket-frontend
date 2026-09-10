"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * On a standalone desktop trade screen (/spot, /perps, /meme, /prediction),
 * hand back to the phone Market page's matching tab once the viewport is below
 * md. The mirror of the handoff MobileMarketView makes at md, so growing to the
 * desktop screen and shrinking back to /market are symmetric.
 *
 * Returns whether a handoff is in flight (the viewport is below md). While it
 * is, the caller MUST render nothing: painting the desktop UI at phone width for
 * the moment before the redirect lands is what made the surface flash back to
 * its phone size. Redirect and flag both read the one breakpoint hook, so they
 * never disagree.
 *
 * @param tab the Market tab this screen corresponds to, e.g. "spot", "leverage",
 *            "memecoins", "prediction". Opened via /market?tab=<tab>.
 */
export function useMarketHandoff(tab: string): boolean {
  const router = useRouter();
  const isMobile = useIsMobile();
  useEffect(() => {
    if (isMobile) router.replace(`/market?tab=${tab}`);
  }, [isMobile, router, tab]);
  return isMobile;
}
