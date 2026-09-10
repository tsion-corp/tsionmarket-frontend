"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVaultSocket } from "@/features/casino/hooks/use-vault-socket";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";
import { usePrices } from "@/hooks/use-prices";
import { weiToTokenAmount } from "@/features/casino/lib/last-standing/stake";
import { fetchActiveGames, type VaultGame } from "@/features/casino/lib/vault-api";
import type { ChainGame } from "@/features/casino/lib/vault-game";

// The socket carries the lobby while it is up; this polls only as a fallback
// while it is down, so a healthy connection costs no REST traffic at all.
const FALLBACK_POLL_MS = 5_000;

const EMPTY_GAMES: VaultGame[] = [];
const EMPTY_CHAIN: ChainGame[] = [];

/**
 * The lobby as the screen renders it.
 *
 * The service's rows are the list. The socket's `activeGames` frame may
 * describe a game in the contract's shape, wei and no dollars; a row the
 * service does not list yet is priced here with the ETH price the lobby
 * holds, and the service's row takes over the moment it has one, because it
 * carries the figures priced at the time. A game in neither list has
 * settled or gone away.
 */
function priceChainRows(indexed: VaultGame[], chain: ChainGame[], ethPrice: number): VaultGame[] {
  const seen = new Set(indexed.map((game) => game.gameId));
  const now = Math.floor(Date.now() / 1000);
  const extra = chain
    .filter((game) => !seen.has(game.gameId) && game.endTime > now)
    .map((game) => ({
      gameId: game.gameId,
      starter: game.starter,
      king: game.king,
      pot: weiToTokenAmount(game.potWei, ethPrice),
      minWager: weiToTokenAmount(game.minWagerWei, ethPrice),
      endTime: game.endTime,
      timeRemaining: Math.max(0, game.endTime - now),
      settled: false,
      active: true,
    }));
  // Longest timer first: the games with room to join are the useful ones,
  // and a game about to expire is the one you cannot realistically enter.
  return [...indexed, ...extra].sort((a, b) => b.endTime - a.endTime);
}

/**
 * Every game currently accepting joins, plus the cross-game feeds.
 *
 * Sorting lives here rather than in the list component so the array identity
 * only changes when the data does, which is what stops the whole lobby
 * re-rendering on an unrelated tick.
 */
export function useVaultLobby(options: { history?: boolean } = {}) {
  const queryClient = useQueryClient();
  const connected = useVaultSocket();

  const games = useQuery<VaultGame[]>({
    queryKey: VAULT_KEYS.games,
    queryFn: fetchActiveGames,
    staleTime: FALLBACK_POLL_MS,
    refetchInterval: connected ? false : FALLBACK_POLL_MS,
  });

  // Written by the socket alone; nothing fetches it. Read here so a hub row
  // the service has not indexed yet still shows.
  const chain = useQuery<ChainGame[]>({
    queryKey: VAULT_KEYS.chainGames,
    queryFn: () => EMPTY_CHAIN,
    enabled: false,
  });

  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;
  const indexed = games.data ?? EMPTY_GAMES;
  const onChain = chain.data ?? EMPTY_CHAIN;
  const merged = useMemo(
    () => priceChainRows(indexed, onChain, ethPrice),
    [indexed, onChain, ethPrice]
  );

  // The lobby renders winners only inside the history modal and never the
  // activity strip, so neither is read until asked for.
  const feeds = useVaultFeeds(connected, undefined, {
    activity: false,
    winners: options.history ?? false,
  });

  // After starting or joining, the indexer trails the chain by a few blocks, so
  // the caller asks for a fresh read rather than waiting out the poll.
  const resync = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: VAULT_KEYS.all });
  }, [queryClient]);

  return {
    games: merged,
    gamesLoading: games.isPending,
    // Nothing to show at all. A failed refetch with a list already on screen
    // keeps the list and says it is stale instead of replacing it with an
    // error, which on a flaky connection would flicker on every poll.
    gamesError: games.isError && games.data === undefined,
    gamesStale: games.isError && games.data !== undefined,
    refetchGames: games.refetch,
    ...feeds,
    connected,
    resync,
  };
}
