"use client";

import { useSyncExternalStore } from "react";

// Matches Tailwind's `md` breakpoint, so a component branching on this agrees
// with the `md:` classes around it.
const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(notify: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

// True on phone-width viewports.
//
// Use this only where the two layouts cannot both be mounted: a chart, a
// TradingView embed, or anything else that costs a request or a subscription.
// Plain markup should branch with `md:` classes instead, which needs no
// JavaScript and survives hydration untouched.
//
// The server has no viewport, so it renders the desktop branch and the client
// corrects on mount. That is the same trade-off the currency picker and the
// prediction views already make.
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );
}
