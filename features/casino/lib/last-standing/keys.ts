// Query keys for the vault game, in one place so the socket and the hooks
// cannot drift apart. `all` is the prefix every other key sits under, which is
// what makes a reconnect resync one call instead of four.
export const VAULT_KEYS = {
  all: ["vault"] as const,
  games: ["vault", "games"] as const,
  game: (gameId: number) => ["vault", "game", gameId] as const,
  winners: ["vault", "winners"] as const,
  activities: ["vault", "activities"] as const,
};
