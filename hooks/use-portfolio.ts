"use client";

import { useCallback, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useSessionWallet } from "@/components/providers/server-session";
import type { Portfolio } from "@/lib/server/alchemy";
import type { TokenBalance } from "@/lib/server/alchemy";
import { freshParam, type FreshScope } from "@/lib/portfolio/fresh-scope";
import { applyNativeDelta as moveNative, applyTransfers } from "@/lib/portfolio/apply-transfers";
import { visibleTotalUsd } from "@/lib/portfolio/dust";
import type { ReceiptLog } from "@/lib/meme/delivery";

export type { Portfolio, TokenBalance } from "@/lib/server/alchemy";

// The balance is cache-first and event-driven: a stored value (rehydrated from
// localStorage or the server prefetch) is painted at once, and the number is
// re-read when it can actually have changed — a completed in-app transaction
// (the ~30 refetchFresh / refetchUntilChanged call sites), a detected incoming
// deposit, or a manual refresh. There is still no steady background poll: a
// balance that is whole and recent costs nothing to show
// (supersedes ADR-2026-09-09-portfolio-polling-at-scale).
//
// What a cached value must never do is outlive its own truth. A snapshot taken
// while a chain was unreachable, or a read that failed outright, used to stay
// on screen until the user found the refresh icon, which is how people ended up
// with no balance at all. So three things re-read on their own: a value older
// than BALANCE_STALE_MS when a screen mounts, the tab is focused or the network
// returns; a failed read, at ERROR_RETRY_MS until it lands; and an incomplete
// snapshot, below.
//
// An INCOMPLETE snapshot means a network did not answer, leaving the total a
// floor. It heals at this cadence: anywhere if Base is what is missing, and on
// a page devoted to balances for any other chain, so one slow optional network
// cannot turn a chip on a game page into a cross-chain polling loop.
const INCOMPLETE_BALANCE_PAGE_POLL_MS = 30_000;

// How long a stored balance is shown without asking again. Long enough that
// moving around the app costs no reads, short enough that a figure taken while
// a chain was down cannot outlive the outage by more than one screen change.
const BALANCE_STALE_MS = 5 * 60_000;

// A failed read is retried at this cadence, paused in a hidden tab, until a
// balance lands. Without it the only way back from a failure was the refresh
// icon, which is how users ended up staring at no balance at all.
const ERROR_RETRY_MS = 20_000;

const BASE_NETWORK = "base-mainnet";

function watchesBalance(pathname: string | null): boolean {
  if (!pathname) return true;
  return ["/portfolio", "/dashboard"].some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );
}

// Stable identity for the empty/loading state. Consumers key memos and effects
// on `tokens` (trade balances, swap net-balances, global search, funding), so a
// fresh `[]` each render would invalidate all of them needlessly.
const EMPTY_TOKENS: TokenBalance[] = [];

// How long to keep asking after a trade before giving up and leaving it to the
// background poll. A freshly created Solana token account can take several
// seconds to appear in the balance index, well past the transaction's own
// confirmation.
const SETTLE_DEADLINE_MS = 40_000;
const SETTLE_BACKOFF_MS = [0, 2_500, 5_000, 8_000, 12_000];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A fingerprint of the exact balances, so a post-trade poll can tell "the index
// caught up" from "the same snapshot again". Uses the base-unit strings, since
// the float `balance` can round two different amounts to the same value.
function balancesSignature(p: Portfolio | undefined): string {
  if (!p) return "";
  return p.tokens
    .map((t) => `${t.network}:${t.address ?? t.symbol}:${t.rawBalance}`)
    .sort()
    .join("|");
}

function tokenRawBalance(
  portfolio: Portfolio | undefined,
  network: string,
  address: string
): bigint {
  const token = portfolio?.tokens.find(
    (item) => item.network === network && item.address?.toLowerCase() === address.toLowerCase()
  );
  return BigInt(token?.rawBalance ?? "0");
}

export type PortfolioScope = "all" | "base";

export function usePortfolio({ scope = "all" }: { scope?: PortfolioScope } = {}) {
  const { ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  // From the server's view of the session while Privy is still starting,
  // then from Privy. Building the key from Privy alone meant that, before it
  // was ready, this asked for ["portfolio", null, null] and missed the
  // balance the server had already put in the cache under the real key.
  const evm = useSessionWallet("ethereum");
  const solana = useSessionWallet("solana");
  const enabled = ready && authenticated && Boolean(evm || (scope === "all" && solana));
  // Signed in, but no address to read a balance for yet.
  const awaitingWallet = ready && authenticated && !enabled;
  const queryKey = useMemo(
    () =>
      scope === "base"
        ? queryKeys.portfolio.baseByWallet(evm)
        : queryKeys.portfolio.byWallet(evm, solana),
    [scope, evm, solana]
  );
  const balancePage = watchesBalance(usePathname());
  const fullPortfolioKey = queryKeys.portfolio.byWallet(evm, solana);

  // Set while waiting for a just-made trade to show up, naming the networks
  // the trade touched so only those skip the server's caches. A ref because
  // the queryFn must see the current value without the query being re-created.
  const freshScopeRef = useRef<FreshScope | null>(null);

  const query = useQuery<Portfolio>({
    queryKey,
    enabled,
    initialData: () => {
      if (scope !== "base") return undefined;
      const cached = queryClient.getQueryState<Portfolio>(fullPortfolioKey);
      if (!cached?.data || cached.isInvalidated || cached.data.missing?.includes("base-mainnet")) {
        return undefined;
      }
      const tokens = cached.data.tokens.filter((token) => token.network === "base-mainnet");
      return {
        ...cached.data,
        tokens,
        totalUsd: tokens.reduce((total, token) => total + token.valueUsd, 0),
        missing: [],
      };
    },
    // Retain the source timestamp: copying a stale balance must not make it fresh.
    initialDataUpdatedAt: () => queryClient.getQueryState(fullPortfolioKey)?.dataUpdatedAt,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (evm) params.set("evm", evm);
      if (scope === "all" && solana) params.set("solana", solana);
      if (scope === "base") params.set("scope", "base");
      if (freshScopeRef.current) params.set("fresh", freshParam(freshScopeRef.current));
      // requireAuth: the query only runs when Privy is authenticated, so a
      // missing token means it isn't warm yet on a cold first load. apiFetch
      // then throws a retryable error instead of a token-less request that 401s.
      const res = await apiFetch(`/api/portfolio?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok) {
        // Message must say "too many requests" so the retry guard below
        // recognizes a 429 and stops retrying instead of piling more requests
        // onto an already-throttled key.
        throw new Error(res.status === 429 ? "Too many requests" : "Portfolio request failed");
      }
      return res.json();
    },
    // First load races the Privy token warm-up and a cold serverless start, so
    // retry longer than the global default (~13s across attempts) to outlast
    // both. Without this, the two quick default retries give up before the
    // token lands and the user has to refresh manually. A rate limit is never
    // retried, since a throttled key won't recover by retrying.
    retry: (failureCount, error) => {
      if (error.message.toLowerCase().includes("too many requests")) return false;
      return failureCount < 5;
    },
    retryDelay: (attempt) => Math.min(800 * 2 ** attempt, 4000),
    // Cache-first, but not cache-forever. A stored balance is shown at once and
    // is treated as fresh for this long, so moving between screens costs
    // nothing; past it, the next mount, focus or reconnect reads once. Cache
    // forever was how a wrong figure became permanent: a snapshot taken while
    // a chain was unreachable stayed on screen until the user found the refresh
    // icon. Base reads go to our own node, so the read is ours to make.
    staleTime: BALANCE_STALE_MS,
    refetchInterval: (query) => {
      // A read that failed leaves nothing on screen, so it is retried on its
      // own until it lands. This stops as soon as there is a balance.
      if (query.state.status === "error") return ERROR_RETRY_MS;
      // Heal a partial snapshot: anywhere when Base is the network that did not
      // answer, since that is where the balance people mean lives and its reads
      // go to our own node; elsewhere only on a page devoted to balances, so one
      // slow optional chain cannot turn a chip on a game page into a poll.
      const missing = query.state.data?.missing;
      if (!missing?.length) return false;
      return balancePage || missing.includes(BASE_NETWORK)
        ? INCOMPLETE_BALANCE_PAGE_POLL_MS
        : false;
    },
    // Both only act on a balance older than the stale window, or on one that
    // failed. Coming back to the tab or back onto the network is exactly when a
    // stale figure is worth one read.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { refetch } = query;
  // A just-completed wallet transaction must bypass the short server cache
  // on the networks it touched. This keeps the portfolio reactive during an
  // active settlement without shortening the background poll for everyone,
  // and without re-reading the networks the transaction never went near.
  const refetchFresh = useCallback(
    async (scope: FreshScope): Promise<Portfolio | undefined> => {
      freshScopeRef.current = scope;
      try {
        const result = await refetch();
        return result.data;
      } finally {
        freshScopeRef.current = null;
      }
    },
    [refetch]
  );

  // Refetch until the balances actually move. A single refetch after a trade
  // races two lags — the shared server cache and Alchemy's balance index — and
  // usually loses, leaving the pre-trade numbers on screen until the next
  // background poll. Resolves true when the change lands, false on timeout.
  //
  // The baseline is read from the cache rather than from `query`, which would
  // make the callback change identity on every refetch and restart the poll.
  const refetchUntilChanged = useCallback(
    async (scope: FreshScope): Promise<boolean> => {
      const before = balancesSignature(queryClient.getQueryData<Portfolio>(queryKey));
      const startedAt = Date.now();
      freshScopeRef.current = scope;
      try {
        for (let attempt = 0; Date.now() - startedAt < SETTLE_DEADLINE_MS; attempt++) {
          await delay(SETTLE_BACKOFF_MS[Math.min(attempt, SETTLE_BACKOFF_MS.length - 1)]);
          const { data } = await refetch();
          if (balancesSignature(data) !== before) return true;
        }
        return false;
      } finally {
        freshScopeRef.current = null;
      }
    },
    [refetch, queryClient, queryKey]
  );

  // Wait for a particular incoming token amount rather than any portfolio
  // change. A sell can change the RWA row before its USDC output is indexed;
  // routing then would otherwise try to spend funds that have not appeared yet.
  const waitForTokenBalance = useCallback(
    async (network: string, address: string, atLeast: bigint): Promise<boolean> => {
      const startedAt = Date.now();
      freshScopeRef.current = [network];
      try {
        for (let attempt = 0; Date.now() - startedAt < SETTLE_DEADLINE_MS; attempt++) {
          await delay(SETTLE_BACKOFF_MS[Math.min(attempt, SETTLE_BACKOFF_MS.length - 1)]);
          const { data } = await refetch();
          if (tokenRawBalance(data, network, address) >= atLeast) return true;
        }
        return false;
      } finally {
        freshScopeRef.current = null;
      }
    },
    [refetch]
  );

  // The receipt of a trade already says what left the wallet and what
  // arrived. Applied to the cached snapshot at once, the screen is right the
  // moment the receipt lands; the scoped read that follows confirms it.
  const applyReceipt = useCallback(
    (network: string, wallet: string, logs: readonly ReceiptLog[]) => {
      queryClient.setQueryData<Portfolio>(queryKey, (current) =>
        current ? applyTransfers(current, { network, wallet, logs }) : current
      );
    },
    [queryClient, queryKey]
  );

  // Native value has no log to apply from: a stake is the value the
  // transaction sent and a payout is what the settlement row says.
  const applyNativeDelta = useCallback(
    (network: string, deltaWei: bigint) => {
      queryClient.setQueryData<Portfolio>(queryKey, (current) =>
        current ? moveNative(current, network, deltaWei) : current
      );
    },
    [queryClient, queryKey]
  );

  return {
    // Dust is left out: anyone can send unsolicited tokens to any address, and
    // counting fractions of a cent made an untouched wallet read "<$0.01"
    // instead of "$0.00". See lib/portfolio/dust.
    totalUsd: query.data ? visibleTotalUsd(query.data.tokens) : 0,
    tokens: query.data?.tokens ?? EMPTY_TOKENS,
    // Also loading while Privy is still starting, and while a signed-in
    // session has no wallet address yet: the shell renders before Privy is
    // ready, Privy can still be creating the embedded wallet, and a balance
    // that is merely unknown must not read as $0.00.
    loading: query.isPending && (enabled || !ready || awaitingWallet),
    // True while a fresh fetch is in flight but a value (possibly a
    // rehydrated one from a previous session) is already on screen — lets
    // the UI show a subtle "refreshing" hint instead of silently swapping
    // numbers with no explanation.
    refreshing: enabled && query.isFetching && !query.isPending,
    error: query.isError,
    refetch: query.refetch,
    refetchFresh,
    refetchUntilChanged,
    waitForTokenBalance,
    applyReceipt,
    applyNativeDelta,
  };
}
