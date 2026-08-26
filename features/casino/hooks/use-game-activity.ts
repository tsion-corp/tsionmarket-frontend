"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { getWalletAddress } from "@/lib/user";
import { fetchPlayerMatches as fetchChessMatches } from "@/features/casino/lib/api/chess";
import { fetchPlayerMatches as fetchDraughtsMatches } from "@/features/casino/lib/api/draughts";
import { fetchLotteryTickets } from "@/features/casino/lib/api/lottery";
import {
  chessMatchesToEntries,
  draughtsMatchesToEntries,
  lotteryTicketsToEntries,
} from "@/features/casino/lib/game-activity";
import type { ActivityEntry } from "@/lib/activity/entries";

// The off-chain arcade games (chess, checkers, ArkBall) for the activity feed.
// Their plays settle in the cashier ledger, not on-chain, so the on-chain feed
// cannot see them; the route merges these entries with the on-chain ones.
const POLL_MS = 60_000;
const EMPTY: ActivityEntry[] = [];

export function useGameActivity() {
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");
  const enabled = ready && authenticated && Boolean(wallet);

  const query = useQuery<ActivityEntry[]>({
    queryKey: ["game-activity", wallet],
    enabled,
    queryFn: async () => {
      if (!wallet) return EMPTY;
      // Each game's history is independent: one source failing must not drop the
      // others, so a rejected fetch simply contributes nothing this round.
      const [chess, draughts, lottery] = await Promise.allSettled([
        fetchChessMatches(wallet),
        fetchDraughtsMatches(wallet),
        fetchLotteryTickets(wallet),
      ]);
      const entries: ActivityEntry[] = [];
      if (chess.status === "fulfilled") {
        entries.push(...chessMatchesToEntries(chess.value, wallet));
      }
      if (draughts.status === "fulfilled") {
        entries.push(...draughtsMatchesToEntries(draughts.value, wallet));
      }
      if (lottery.status === "fulfilled") {
        entries.push(...lotteryTicketsToEntries(lottery.value));
      }
      return entries;
    },
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
    // Keep the last list on the screen while a poll refetches, so the feed never
    // flashes empty or re-renders back to a loading state.
    placeholderData: keepPreviousData,
  });

  return { items: query.data ?? EMPTY, loading: query.isLoading, error: query.isError };
}
