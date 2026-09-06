"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { RQ_PERSIST_KEY } from "@/lib/query-persist";

// Empties the query cache, in memory and in localStorage, whenever the session
// is known to be signed out.
//
// The persisted cache exists so a reload paints the last balance at once. The
// cost is that the balance, the token list and the deposit addresses sit in
// localStorage in plain text for up to a day, and signing out did nothing
// about that: Privy's logout only routes to /auth. On a shared device the next
// person could read the previous user's holdings from devtools, which is the
// exact scenario the idle logout exists to protect against.
//
// This watches the session rather than the sign-out button so it also covers
// the paths that never press it: the idle timer, a token that expired while
// the tab was closed, a logout in another tab. Each of those ends in the same
// state, ready and not authenticated, and that is the trigger.
//
// Clearing everything, not just the user-scoped keys, is deliberate. The
// public catalogs in the cache are cheap to fetch again, and a list of which
// keys are private would drift the first time someone adds a query.
//
// The in-memory client is cleared before the stored copy is removed: the
// persister writes on a throttle, and a flush that lands after the removal
// must find nothing to write back.
export function SessionCacheGuard() {
  const { ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ready || authenticated) return;
    queryClient.clear();
    try {
      window.localStorage.removeItem(RQ_PERSIST_KEY);
    } catch {
      // Storage can be unavailable (private mode, blocked site data). There is
      // nothing persisted in that case, so there is nothing to remove.
    }
  }, [ready, authenticated, queryClient]);

  return null;
}
