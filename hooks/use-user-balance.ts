"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";
import { BALANCE_ROUTES } from "@/lib/balance/routes";
import type { UserBalance } from "@/lib/balance/types";

// The parser is loaded when a response comes back, never on first paint. No
// screen reads this hook yet, so it is in nobody's first-load payload today —
// but a balance belongs in a header or a shell the moment one is wired up, and
// that is precisely how the notification bell put zod and every schema into the
// first-load payload of every route and failed CI's budget
// (hooks/notifications.first-load.test.ts). Paying the pattern now costs one
// dynamic import; paying it later costs a bundle regression nobody expects.
// hooks/balance.first-load.test.ts keeps it that way.
async function parsers(): Promise<typeof import("@/lib/balance/schema")> {
  return import("@/lib/balance/schema");
}

const BALANCE_KEY = "user-balance";

// The service tells us how fresh its own answer is: `generatedAt` and
// `staleAt` are fifteen seconds apart, which is the Redis window it serves
// from. Inside that window a refetch would be answered from the same cache
// entry with the same bytes, so this query holds its value for exactly as long
// as the service holds its own, and a remount or a second reader inside those
// fifteen seconds costs nothing.
//
// This is shorter than the app-wide sixty seconds (lib/query-client.ts),
// deliberately: a balance that moves is money that moved, and sixty seconds
// would keep showing the old figure across three upstream refreshes.
//
// It is NOT a poll interval. Nothing here refetches on a timer — see the query
// below.
const UPSTREAM_FRESHNESS_MS = 15_000;

/** The cache key for one account's balance. Exported so tests can address it. */
export function userBalanceKey(userId: string | null) {
  return [BALANCE_KEY, userId] as const;
}

async function fetchUserBalance(userId: string): Promise<UserBalance> {
  const res = await apiFetch(BALANCE_ROUTES.userBalance(userId), {}, { requireAuth: true });
  // Never `anonymous`: the gateway scopes this to the token's own `sub`, and a
  // request without one is not a public read, it is a 401.
  const body = await unwrap<unknown>(res, "Could not load your balances");
  // Parsed, not coerced. A body that does not match the contract belongs in
  // the query's error state, not on screen as a smaller balance.
  return (await parsers()).parseUserBalance(body);
}

export interface UserBalanceResult {
  /** Null until the first read lands, and null while it is failing. */
  balance: UserBalance | null;
  /** The first read, which is the one that needs a skeleton. */
  isLoading: boolean;
  /** A read behind an already-shown figure, which needs at most a hint. */
  isRefreshing: boolean;
  error: unknown;
  refetch(): void;
}

/**
 * Native and token balances across the signed-in user's linked wallets.
 *
 * Additive, not a replacement: this is a different wallet set from the
 * embedded wallets /api/portfolio reads, it covers Base alone where that
 * covers six chains, and it carries no USD figure at all
 * (ADR-2026-09-23-user-balance-endpoint). Nothing on screen has moved to it.
 */
export function useUserBalance(): UserBalanceResult {
  // Keyed on the account id and not on a wallet address, because the id is
  // what the endpoint is scoped by: the path segment must equal what the
  // gateway verifies from the access token, and the answer spans every
  // wallet linked to it.
  const { userId } = useAuthSession();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => userBalanceKey(userId), [userId]);

  const query = useQuery({
    queryKey,
    enabled: userId !== null,
    queryFn: () => {
      // Guarded rather than asserted: the query is disabled without an
      // account, and a run without one is a bug worth seeing.
      if (!userId) throw new Error("No signed-in account");
      return fetchUserBalance(userId);
    },
    staleTime: UPSTREAM_FRESHNESS_MS,
    // Opted in for this query alone. The app-wide default is false
    // (lib/query-client.ts), and the balance hooks that need it opt in one by
    // one, as use-global-balance.ts does: coming back to the tab is exactly
    // when someone wants to know what they hold now.
    refetchOnWindowFocus: true,
    // No refetchInterval, on purpose and not by omission. Nobody watches a
    // balance in a tab they are not looking at, and a backgrounded poll is the
    // single largest source of provider cost in this app — which is why
    // refetchIntervalInBackground is false app-wide. There is no interval here
    // for that setting to govern: focus and an explicit refetch() are the
    // whole cadence, and a screen that needs more can invalidate this key
    // after whatever moved the money.
  });

  // Another account's holdings have no business staying in this tab's cache.
  // The predicate drops every balance key whose DID is not the one signed in
  // now, which covers a switch between two accounts in one browser; signing
  // out leaves userId null, which it covers as well. SessionCacheGuard is not
  // this: it fires on a full sign-out only, and a switch never reaches it.
  // The same predicate, for the same reason, as hooks/use-notification-inbox.
  useEffect(() => {
    queryClient.removeQueries({
      predicate: (cached) => cached.queryKey[0] === BALANCE_KEY && cached.queryKey[1] !== userId,
    });
  }, [queryClient, userId]);

  const { refetch } = query;

  return {
    balance: query.data ?? null,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    error: query.error,
    refetch: () => {
      void refetch();
    },
  };
}
