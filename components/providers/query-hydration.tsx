"use client";

import { use } from "react";
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";

// Puts a server-prefetched query cache into the browser's, when it arrives.
//
// The page passes the prefetch as a promise it did not await, so the rest of
// the page streams and hydrates without waiting on it. This component reads
// the promise with `use`, which is why the page wraps it in a Suspense
// boundary of its own with no fallback: it renders nothing either way, and
// the data lands in the cache a moment after the page is on screen, or
// before if the server was quick.
//
// HydrationBoundary is careful about what it overwrites. A query the browser
// already has is only replaced when the server's copy is newer, so a fresher
// client value, from a refetch after a trade for instance, is never clobbered
// by a snapshot that started earlier.
export function QueryHydration({ snapshot }: { snapshot: Promise<DehydratedState | null> }) {
  const state = use(snapshot);
  return <HydrationBoundary state={state} />;
}
