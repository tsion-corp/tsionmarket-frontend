"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVaultSocket } from "@/features/casino/hooks/use-vault-socket";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";
import { usePrices } from "@/hooks/use-prices";
import { weiToTokenAmount } from "@/features/casino/lib/last-standing/stake";
import { fetchActiveGames, fetchChainGames, type VaultGame } from "@/features/casino/lib/vault-api";
import type { ChainGame } from "@/lib/vault/read";

// The socket carries the lobby while it is up; these poll only as a fallback
// while it is down, so a healthy connection costs no REST traffic at all.
const FALLBACK_POLL_MS = 5_000;
// The chain is the source of truth for which games exist. While the socket
// is up its activeGames frame every 10 s carries the contract's rows, so the
// chain is only reconciled once a minute; while it is down the chain is
// polled, through the server's shared read (ADR-2026-09-09-last-man-lobby-reads).
const CHAIN_POLL_MS = 8_000;
const CHAIN_RECONCILE_MS = 60_000;

const EMPTY_GAMES: VaultGame[] = [];
const EMPTY_CHAIN: ChainGame[] = [];

/**
 * The indexed lobby, backed by what the chain actually holds.
 *
 * The index trails the chain, so a game someone just paid to start is missing
 * from `GET /games` for a while — the screen said "no games running" straight
 * after a successful start. The chain decides which games exist; the indexed
 * row is preferred where it has one, because it carries USD figures the
 * contract cannot know.
 */
function mergeGames(indexed: VaultGame[], chain: ChainGame[], ethPrice: number): VaultGame[] {
  const byId = new Map(indexed.map((game) => [game.gameId, game]));
  const merged = chain.map(
    (game) =>
      byId.get(game.gameId) ?? {
        gameId: game.gameId,
        starter: game.starter,
        king: game.king,
        pot: weiToTokenAmount(game.potWei, ethPrice),
        minWager: weiToTokenAmount(game.minWagerWei, ethPrice),
        endTime: game.endTime,
        timeRemaining: Math.max(0, game.endTime - Math.floor(Date.now() / 1000)),
        settled: false,
        active: true,
      }
  );
  // A game the chain no longer reports as active has settled, whatever the
  // index still says, so it is not carried over.
  return merged.sort((a, b) => b.endTime - a.endTime);
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
    // Longest timer first: the games with room to join are the useful ones,
    // and a game about to expire is the one you cannot realistically enter.
  });

  // The contract's own list, so a brand-new game shows the moment it is
  // mined instead of waiting on the indexer. The socket writes its rows into
  // this same cache, which is why the poll can stand down while it is up.
  const chainCadence = connected ? CHAIN_RECONCILE_MS : CHAIN_POLL_MS;
  const chain = useQuery<ChainGame[]>({
    queryKey: VAULT_KEYS.chainGames,
    queryFn: fetchChainGames,
    staleTime: chainCadence,
    refetchInterval: chainCadence,
  });

  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;
  const indexed = games.data ?? EMPTY_GAMES;
  const onChain = chain.data ?? EMPTY_CHAIN;
  const merged = useMemo(
    () => mergeGames(indexed, onChain, ethPrice),
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
    // Only a cold start counts as loading: once either source has answered
    // there is something real to show.
    gamesLoading: games.isPending && chain.isPending,
    // The chain answering is enough to call the lobby healthy.
    gamesError: games.isError && chain.isError,
    refetchGames: games.refetch,
    ...feeds,
    connected,
    resync,
  };
}
