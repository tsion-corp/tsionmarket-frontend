import type { QueryClient } from "@tanstack/react-query";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import type { VaultGame } from "@/features/casino/lib/vault-api";

/**
 * Puts a game the service has not listed yet into the lobby and its own
 * cache, so a round the user just paid to open is on screen before the index
 * catches up. The next REST read or socket snapshot replaces it.
 */
export function seedGame(queryClient: QueryClient, game: VaultGame): void {
  queryClient.setQueryData<VaultGame>(VAULT_KEYS.game(game.gameId), game);
  queryClient.setQueryData<VaultGame[]>(VAULT_KEYS.games, (games = []) =>
    games.some((g) => g.gameId === game.gameId)
      ? games.map((g) => (g.gameId === game.gameId ? game : g))
      : [game, ...games]
  );
}
