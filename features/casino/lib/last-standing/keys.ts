// Query keys for the vault game, in one place so the socket and the hooks
// cannot drift apart. `all` is the prefix every other key sits under, which is
// what makes a reconnect resync one call instead of four.
export const VAULT_KEYS = {
  all: ["vault"] as const,
  games: ["vault", "games"] as const,
  game: (gameId: number) => ["vault", "game", gameId] as const,
  winners: ["vault", "winners"] as const,
  activities: ["vault", "activities"] as const,
  // The socket's contract-shaped lobby rows. Under the same prefix, so a
  // reconnect resync refreshes them with everything else, but not under
  // `games`, so an invalidation of the API list does not touch them.
  chainGames: ["vault", "chain", "games"] as const,
  // The contract's tunables (stake floor, payout split), one multicall.
  params: ["vault", "params"] as const,
  // This wallet's payout the contract could not push, read on events only.
  winnings: (address: string) => ["vault", "winnings", address.toLowerCase()] as const,
};
