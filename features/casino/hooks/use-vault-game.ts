"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrices } from "@/hooks/use-prices";
import { useVaultSocket } from "@/features/casino/hooks/use-vault-socket";
import { seedGame } from "@/features/casino/lib/last-standing/seed-game";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { vaultLog } from "@/features/casino/lib/last-standing/log";
import { priced } from "@/features/casino/lib/last-standing/pricing";
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A game the user just paid for, from the service.
 *
 * The service's 404 is final: the id was never used. Anything else is the
 * service being unreachable, and there is deliberately no contract read of our
 * own behind it. `GET /games/:id` already falls through to the chain
 * service-side when its index lags — verified on 2026-09-15, when it answered
 * for a game the index did not hold — so a second, browser-side decode would
 * add a way to be wrong without adding an answer. See
 * ADR-2026-09-15-last-man-v5-usdc, decision 7.
 */
/**
 * Whether a row is plausibly the game the caller has just paid for.
 *
 * Two rows are not, and both come back with a 200 rather than a 404, so the
 * retry loop below never saw either of them:
 *
 * - The ALL-ZERO row. The service answers for a game its index has not reached
 *   by reading the contract, and that read can land a block or two before the
 *   start transaction. The id is real, the round has not begun: no pot, no end
 *   time, not active.
 * - A SETTLED row. A game the caller created a moment ago cannot already be
 *   over. This is the legacy contract showing through: ids repeat across
 *   contract generations, v4 ran past 400 while v5 has only just passed 190,
 *   so an id in that window still answers with v4's long-settled ETH game
 *   until v5's own row is indexed (checked live on 2026-09-23: 194 served a
 *   settled v4 row, and 193 served the v5 row once it existed).
 */
function looksLikeAFreshGame(game: VaultGame): boolean {
  if (game.settled) return false;
  return game.active || game.endTime > 0;
}

async function loadFreshGame(gameId: number): Promise<VaultGame | null> {
  for (let attempt = 1; attempt <= CONFIRM_ATTEMPTS; attempt += 1) {
    try {
      const game = await fetchGame(gameId);
      if (looksLikeAFreshGame(game)) return game;
      // Seeding this would write it into the cache as FRESH, so the arena
      // would open on it and — with the socket up and the REST poll therefore
      // off — nothing would ever replace it. The same game opened from the
      // lobby was always fine, because nothing seeds it there.
      vaultLog(`confirm ${gameId}: row is not the game just created`, {
        attempt,
        settled: game.settled,
        endTime: game.endTime,
      });
      if (attempt < CONFIRM_ATTEMPTS) await wait(CONFIRM_RETRY_MS);
      continue;
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
  return null;
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

  // Every amount is priced here rather than in the fetch, which keeps the price
  // out of the query key: it re-prices on the next render instead of refetching
  // whenever the price ticks.
  //
  // Priced by ASSET, not by one price. A USDC amount is already a dollar
  // amount; only an ETH game needs the ETH price. This used to multiply every
  // amount by the ETH price on the sole condition that usdValue was 0 — and
  // usdValue is 0 for every token game by the service's own contract, so a 0.38
  // USDC pot rendered as $925.68 and the winner was congratulated with $555.41
  // for 23 cents (seen on 2026-09-15). See lib/last-standing/pricing.
  const withUsd = useCallback(
    (game: VaultGame): VaultGame => ({
      ...game,
      pot: priced(game.pot, ethPrice),
      minWager: priced(game.minWager, ethPrice),
    }),
    [ethPrice]
  );

  const game = useQuery<VaultGame>({
    queryKey: gameId === null ? VAULT_KEYS.game(-1) : VAULT_KEYS.game(gameId),
    queryFn: async () => {
      const id = gameId as number;
      try {
        return await fetchGame(id);
      } catch (error) {
        // A 404 is final; anything else is the service being unreachable, and
        // the retry below handles that. The service reads the chain itself
        // when its index lags, so there is nothing for us to add here.
        throw error;
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
