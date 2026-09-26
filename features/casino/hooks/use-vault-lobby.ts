"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVaultSocket } from "@/features/casino/hooks/use-vault-socket";
import { useGamePrivacy } from "@/features/casino/hooks/use-game-privacy";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";
import { usePrices } from "@/hooks/use-prices";
import { priced, rawToTokenAmount } from "@/features/casino/lib/last-standing/pricing";
import { fetchActiveGames, type VaultGame } from "@/features/casino/lib/vault-api";
import type { ChainGame } from "@/features/casino/lib/vault-game";

// The socket carries the lobby while it is up; this polls fast as a fallback
// while it is down.
const FALLBACK_POLL_MS = 5_000;

// …but the socket is authoritative for LIVENESS, not for everything a row
// carries. The keeper builds its snapshot with toGameDto(game, usd) — two
// arguments, where the third is the metadata — so no socket frame has ever
// carried a game's name.
//
// That left a name unreachable rather than merely late. A game's name is bound
// when the reconciler indexes its GameStarted log, which is AFTER the row first
// appears; the client's one REST read had already happened, the socket then
// drove the lobby forever, and the name never arrived at all. Carrying a known
// name across snapshots (keepKnownMetadata) protects one you already have and
// cannot conjure one you never got.
//
// So a slow reconcile runs even on a healthy socket. It is the only path by
// which anything the snapshot does not carry can reach the lobby.
const RECONCILE_POLL_MS = 20_000;

const EMPTY_GAMES: VaultGame[] = [];
const EMPTY_CHAIN: ChainGame[] = [];

/**
 * The lobby as the screen renders it.
 *
 * The service's rows are the list. The socket's `activeGames` frame may
 * describe a game in the contract's shape, raw units and no dollars; a row the
 * service does not list yet is priced here, and the service's row takes over
 * the moment it has one. A game in neither list has settled or gone away.
 *
 * Both are priced BY ASSET (lib/last-standing/pricing): a game carries its own
 * token and scale, so nothing here multiplies by the ETH price on the
 * assumption that every game is native.
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
      pot: rawToTokenAmount(game.potWei, game.token, ethPrice),
      minWager: rawToTokenAmount(game.minWagerWei, game.token, ethPrice),
      endTime: game.endTime,
      timeRemaining: Math.max(0, game.endTime - now),
      settled: false,
      active: true,
      // A hub row the service has not indexed yet carries no privacy flag, so
      // it reads public here, as an absent flag does everywhere. The starter's
      // own local mark is what keeps THEIR private game out of the lobby in
      // the seconds before the service catches up.
      isPrivate: false,
    }));
  // Indexed rows are priced too. The service sets usdValue only for native
  // games — it is native-only by its own contract — so a USDC row arrives at
  // zero and would render as an empty game.
  const listed = indexed.map((game) => ({
    ...game,
    pot: priced(game.pot, ethPrice),
    minWager: priced(game.minWager, ethPrice),
  }));
  // Longest timer first: the games with room to join are the useful ones,
  // and a game about to expire is the one you cannot realistically enter.
  return [...listed, ...extra].sort((a, b) => b.endTime - a.endTime);
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
    refetchInterval: connected ? RECONCILE_POLL_MS : FALLBACK_POLL_MS,
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
  const priced = useMemo(
    () => priceChainRows(indexed, onChain, ethPrice),
    [indexed, onChain, ethPrice]
  );

  // The contract's own answer, because the keeper's snapshot may be reporting
  // every game public. Unknown ids keep whatever the row already said.
  const fromChain = useGamePrivacy(priced.map((game) => game.gameId));
  const merged = useMemo(
    () =>
      priced.map((game) => {
        const onChainFlag = fromChain[String(game.gameId)];
        return onChainFlag === undefined || onChainFlag === game.isPrivate
          ? game
          : { ...game, isPrivate: onChainFlag };
      }),
    [priced, fromChain]
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
