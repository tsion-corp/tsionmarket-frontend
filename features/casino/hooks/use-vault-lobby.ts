"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useInvalidateOnBlock } from "@/hooks/use-base-block";
import { useVaultSocket } from "@/features/casino/hooks/use-vault-socket";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";
import { readActiveGames, type ChainGame } from "@/features/casino/hooks/use-vault-actions";
import { usePrices } from "@/hooks/use-prices";
import { weiToUsd } from "@/features/casino/lib/last-standing/stake";
import { fetchActiveGames, type VaultGame } from "@/features/casino/lib/vault-api";

// The socket carries the lobby while it is up; these poll only as a fallback
// while it is down, so a healthy connection costs no REST traffic at all.
const FALLBACK_POLL_MS = 5_000;
// The chain is the source of truth for which games exist, so it is read on the
// same cadence rather than only when the index looks empty.
const CHAIN_POLL_MS = 8_000;

const EMPTY_GAMES: VaultGame[] = [];
const EMPTY_CHAIN: ChainGame[] = [];

function money(wei: bigint, ethPrice: number) {
  const amount = Number(wei) / 1e18;
  const usd = weiToUsd(wei, ethPrice);
  return {
    amount: String(amount),
    tokenSymbol: "ETH",
    usdValue: usd,
    formattedUsd: `$${usd.toFixed(2)}`,
  };
}

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
        pot: money(game.potWei, ethPrice),
        minWager: money(game.minWagerWei, ethPrice),
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
export function useVaultLobby() {
  const queryClient = useQueryClient();
  const connected = useVaultSocket();

  // The lobby mirrors contract state on Base, so a new block is a good moment
  // to re-read it if the socket is down. The proxy's short cache caps the cost.
  useInvalidateOnBlock([VAULT_KEYS.games]);

  const games = useQuery<VaultGame[]>({
    queryKey: VAULT_KEYS.games,
    queryFn: fetchActiveGames,
    staleTime: FALLBACK_POLL_MS,
    refetchInterval: connected ? false : FALLBACK_POLL_MS,
    // Longest timer first: the games with room to join are the useful ones,
    // and a game about to expire is the one you cannot realistically enter.
  });

  // Read straight from the contract too, so a brand-new game shows the moment
  // it is mined instead of waiting on the indexer.
  const chain = useQuery<ChainGame[]>({
    queryKey: [...VAULT_KEYS.games, "chain"],
    queryFn: readActiveGames,
    staleTime: CHAIN_POLL_MS,
    refetchInterval: CHAIN_POLL_MS,
  });

  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;
  const indexed = games.data ?? EMPTY_GAMES;
  const onChain = chain.data ?? EMPTY_CHAIN;
  const merged = useMemo(
    () => mergeGames(indexed, onChain, ethPrice),
    [indexed, onChain, ethPrice]
  );

  const feeds = useVaultFeeds(connected);

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
