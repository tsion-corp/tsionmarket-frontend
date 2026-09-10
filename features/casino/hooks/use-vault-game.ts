"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrices } from "@/hooks/use-prices";
import { useVaultSocket } from "@/features/casino/hooks/use-vault-socket";
import { seedGame } from "@/features/casino/lib/last-standing/seed-game";
import { readGame } from "@/features/casino/hooks/use-vault-actions";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { vaultLog } from "@/features/casino/lib/last-standing/log";
import {
  followedGameSnapshot,
  unfollowGame,
} from "@/features/casino/lib/last-standing/followed-game";
import { fetchGame, isVaultNotFound, type VaultGame } from "@/features/casino/lib/vault-api";

const FALLBACK_POLL_MS = 5_000;
// The service falls through to the contract for a game its index has not
// reached, but that read is a block or two behind the receipt the client
// holds, so a fresh game is asked for a few times a second apart.
const CONFIRM_ATTEMPTS = 3;
const CONFIRM_RETRY_MS = 1_000;

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A game the user just paid for, from the service, with the contract as the
 * last resort. The service's 404 is final (the id was never used); any
 * other failure means the service could not be reached, and then the
 * contract is asked once so a game someone paid for is never shown missing.
 */
async function loadFreshGame(gameId: number): Promise<VaultGame | null> {
  for (let attempt = 1; attempt <= CONFIRM_ATTEMPTS; attempt += 1) {
    try {
      return await fetchGame(gameId);
    } catch (error) {
      if (isVaultNotFound(error)) {
        vaultLog(`confirm ${gameId}: service has no row yet`, { attempt });
        if (attempt < CONFIRM_ATTEMPTS) await wait(CONFIRM_RETRY_MS);
        continue;
      }
      vaultLog(`confirm ${gameId}: service unreachable, reading the contract`, {
        error: String(error),
      });
      break;
    }
  }
  const chain = await readGame(gameId);
  return chain?.exists ? fromChain(gameId, chain) : null;
}

/**
 * One game, live.
 *
 * Reads come from the vault service, which serves the indexed row and falls
 * through to the contract for an id its index has not reached. The socket
 * writes frames into the same cache while it is up; the REST poll runs only
 * while it is down. The contract is read directly only when the service
 * cannot be reached at all.
 */
export function useVaultGame(gameId: number | null) {
  const queryClient = useQueryClient();
  const connected = useVaultSocket();

  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;

  // A game read from the contract comes back with no USD. Filling that in
  // here rather than in the fetch keeps the price out of the query key: it
  // re-prices on the next render instead of refetching every time the price
  // ticks.
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

  const game = useQuery<VaultGame>({
    queryKey: gameId === null ? VAULT_KEYS.game(-1) : VAULT_KEYS.game(gameId),
    queryFn: async () => {
      const id = gameId as number;
      try {
        return await fetchGame(id);
      } catch (error) {
        // Never used: nothing anywhere has this game. Any other failure is
        // the service being unreachable, and the contract still has the row.
        if (isVaultNotFound(error)) throw error;
        const chain = await readGame(id);
        if (!chain?.exists) throw error;
        return fromChain(id, chain, queryClient.getQueryData<VaultGame>(VAULT_KEYS.game(id)));
      }
    },
    enabled: gameId !== null,
    staleTime: FALLBACK_POLL_MS,
    refetchInterval: connected ? false : FALLBACK_POLL_MS,
    // A game that was never started stays that way; polling will not change it.
    retry: (count, error) => !isVaultNotFound(error) && count < 3,
    select: withUsd,
  });

  /**
   * Seeds this game's caches for the window between the receipt and the
   * index. Returns false if neither the service nor the contract knows the
   * game, so the caller can fall back to waiting rather than showing an
   * empty game.
   */
  const confirmGame = useCallback(
    async (id: number): Promise<boolean> => {
      const fresh = await loadFreshGame(id);
      if (!fresh) return false;
      seedGame(queryClient, fresh);
      vaultLog(`confirm ${id}: seeded`, { active: fresh.active, endTime: fresh.endTime });
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

  // The floating timer follows the last game the user put money into. Once
  // that game is over, or never existed, following it only keeps a dead
  // clock polling on every page.
  const settled = game.data?.settled === true;
  const missing = game.isError && isVaultNotFound(game.error);
  useEffect(() => {
    if (gameId === null || (!settled && !missing)) return;
    if (followedGameSnapshot() !== gameId) return;
    vaultLog(`unfollow ${gameId}`, { settled, missing });
    unfollowGame();
  }, [gameId, settled, missing]);

  const online = useSyncExternalStore(subscribeOnline, onlineNow, onlineOnServer);
  // Degraded: what the screen shows cannot be trusted as current. Either the
  // browser knows it is offline, or the socket is down AND the REST fallback
  // is failing too. A downed socket alone is not degraded: the 5s poll still
  // delivers the truth.
  const degraded = !online || (!connected && (game.isError || game.failureCount > 0));

  return {
    game: game.data ?? null,
    loading: game.isPending,
    // Nothing to show at all. A failed refetch with a game already on screen
    // is not an error state; it is the degraded state below, and the last
    // good game stays up.
    error: game.isError && game.data === undefined,
    // The service is sure: no game has ever had this id.
    notFound: missing,
    connected,
    degraded,
    confirmGame,
    resync,
  };
}
