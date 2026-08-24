"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useInvalidateOnBlock } from "@/hooks/use-base-block";
import { usePrices } from "@/hooks/use-prices";
import { useVaultSocket } from "@/features/casino/hooks/use-vault-socket";
import { readGame } from "@/features/casino/hooks/use-vault-actions";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { fetchGame, type VaultGame } from "@/features/casino/lib/vault-api";

const FALLBACK_POLL_MS = 5_000;

// The browser's own connectivity verdict, as an external store so a consumer
// re-renders the moment it flips rather than on the next poll.
function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const onlineNow = () => navigator.onLine;
const onlineOnServer = () => true;

// The contract deals in wei; the screen shows money. Converting here is not
// inventing a figure, it is the same conversion the indexed row does, at the
// same price the rest of the app uses. Leaving usdValue at zero was worse: a
// pot of 0.0002 ETH rendered as "$0.00", which reads as an empty game.
function money(ethAmount: string, ethPriceUsd: number) {
  const usd = Number(ethAmount) * ethPriceUsd;
  return {
    amount: ethAmount,
    tokenSymbol: "ETH",
    usdValue: Number.isFinite(usd) ? usd : 0,
    formattedUsd: Number.isFinite(usd) ? `$${usd.toFixed(2)}` : "",
  };
}

// The contract's record of a game, in the shape the screen reads.
function fromChain(
  gameId: number,
  chain: NonNullable<Awaited<ReturnType<typeof readGame>>>,
  previous?: VaultGame
): VaultGame {
  const now = Math.floor(Date.now() / 1000);
  return {
    gameId,
    starter: chain.starter,
    king: chain.king,
    // A price we already have beats a stale indexed figure, so the chain read
    // wins here rather than deferring to `previous`.
    // Amounts only; `withUsd` in the hook prices them.
    pot: previous?.pot ?? money(String(Number(chain.potWei) / 1e18), 0),
    minWager: previous?.minWager ?? money(String(Number(chain.minWagerWei) / 1e18), 0),
    endTime: chain.endTime,
    timeRemaining: Math.max(0, chain.endTime - now),
    settled: chain.settled,
    // Joinable only while the clock has time on it and nothing settled it. A
    // finished game keeps its page; it just cannot be joined.
    active: !chain.settled && chain.endTime > now,
  };
}

/**
 * One game, live.
 *
 * Reads come from the indexed REST endpoint, which trails the chain by the
 * keeper's confirmation depth. That is fine for watching, and wrong for the
 * seconds right after the user's own transaction: a game they just started is
 * not indexed yet and would 404. `confirmFromChain` covers that gap by reading
 * the contract directly and seeding the cache, so their own action lands
 * immediately instead of looking like it failed.
 */
export function useVaultGame(gameId: number | null) {
  const queryClient = useQueryClient();
  const connected = useVaultSocket();

  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;

  // The chain knows the wei, not the dollars, so a game read from it comes back
  // with no USD. Filling that in here rather than in the fetch keeps the price
  // out of the query key: it re-prices on the next render instead of refetching
  // every time the price ticks.
  const withUsd = useCallback(
    (game: VaultGame): VaultGame =>
      ethPrice > 0 && game.pot.usdValue === 0
        ? {
            ...game,
            pot: money(game.pot.amount, ethPrice),
            minWager: money(game.minWager.amount, ethPrice),
          }
        : game,
    [ethPrice]
  );

  useInvalidateOnBlock(gameId === null ? [] : [VAULT_KEYS.game(gameId)]);

  const game = useQuery<VaultGame>({
    queryKey: gameId === null ? VAULT_KEYS.game(-1) : VAULT_KEYS.game(gameId),
    // The index 404s for a game it has not caught up with, and drops games it
    // considers finished. Either way the chain still has the record, and a
    // game someone paid for should never show as missing.
    queryFn: async () => {
      const id = gameId as number;
      try {
        return await fetchGame(id);
      } catch (error) {
        const chain = await readGame(id);
        if (!chain?.exists) throw error;
        return fromChain(id, chain);
      }
    },
    enabled: gameId !== null,
    staleTime: FALLBACK_POLL_MS,
    refetchInterval: connected ? false : FALLBACK_POLL_MS,
    select: withUsd,
  });

  /**
   * Seeds this game's cache from the contract, for the window where the
   * indexer has not caught up. Returns false if the read failed, so the caller
   * can fall back to waiting rather than showing an empty game.
   */
  const confirmFromChain = useCallback(
    async (id: number): Promise<boolean> => {
      const chain = await readGame(id);
      if (!chain?.exists) return false;
      queryClient.setQueryData<VaultGame>(VAULT_KEYS.game(id), (prev) =>
        fromChain(id, chain, prev)
      );
      return true;
    },
    [queryClient]
  );

  const resync = useCallback(() => {
    if (gameId === null) return;
    void queryClient.invalidateQueries({ queryKey: VAULT_KEYS.game(gameId) });
    void queryClient.invalidateQueries({ queryKey: VAULT_KEYS.activities });
  }, [queryClient, gameId]);

  // A glitchy network must heal itself: the moment the browser reports the
  // network back, or the tab returns to the foreground, converge on fresh
  // server state instead of waiting on a poll that may itself be wedged.
  useEffect(() => {
    const onOnline = () => resync();
    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [resync]);

  const online = useSyncExternalStore(subscribeOnline, onlineNow, onlineOnServer);
  // Degraded: what the screen shows cannot be trusted as current. Either the
  // browser knows it is offline, or the socket is down AND the REST fallback
  // is failing too. A downed socket alone is not degraded: the 5s poll still
  // delivers the truth.
  const degraded = !online || (!connected && (game.isError || game.failureCount > 0));

  return {
    game: game.data ?? null,
    loading: game.isPending,
    error: game.isError,
    connected,
    degraded,
    confirmFromChain,
    resync,
  };
}
