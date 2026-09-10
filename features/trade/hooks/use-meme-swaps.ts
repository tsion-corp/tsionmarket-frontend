"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSwapHistory, type SwapDetail } from "@/lib/meme/api";

// The wallet's swap history, for the transactions feed on the memecoin screens.
//
// The query lives here rather than in the board because a component that
// renders UI should not also own server state: the board reads this hook the
// same way it reads usePortfolio.
//
// Scope worth knowing before reading a row: the trade service publishes no
// market-wide trade tape, so /swaps is the only source there is and it is
// scoped to the signed-in wallet. These are the user's own trades, not the
// coin's.

// A page of the wallet's swap history is enough for a feed: the card shows what
// has just happened in this coin, not a ledger.
const SWAP_FEED_LIMIT = 20;
const SWAP_POLL_MS = 15_000;

export type MemeSwapsStatus = "loading" | "error" | "ready";

export interface MemeSwaps {
  /** Every landed and pending swap on the page, in every coin. */
  swaps: SwapDetail[];
  status: MemeSwapsStatus;
  /** Ask again, for the feed's retry button and after a trade settles. */
  refetch: () => void;
}

// One request for the whole history, filtered to a coin by the caller, so
// switching coin costs nothing and the poll stays single.
export function useMemeSwaps(): MemeSwaps {
  const query = useQuery({
    queryKey: ["meme", "swaps", SWAP_FEED_LIMIT],
    queryFn: () => fetchSwapHistory(1, SWAP_FEED_LIMIT),
    refetchInterval: SWAP_POLL_MS,
    staleTime: 10_000,
  });

  return {
    swaps: query.data?.items ?? [],
    status: query.isPending ? "loading" : query.error ? "error" : "ready",
    refetch: () => void query.refetch(),
  };
}
