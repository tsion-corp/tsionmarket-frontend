import type {
  LeaderboardWinner,
  PaidAmount,
  TokenAmount,
  VaultActivity,
  VaultGame,
  VaultWinner,
} from "@/features/casino/lib/vault-api";

// The shape the lobby renders: the vault API's view of a game, with USD
// figures. The socket hub has published the contract's own shape instead
// (potWei, minWagerWei), so a row is checked here before any component can
// read pot.usdValue from it. Two boundaries use this: the REST list and the
// socket snapshot.

function isTokenAmount(value: unknown): value is TokenAmount {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.amount === "string" &&
    typeof v.tokenSymbol === "string" &&
    typeof v.usdValue === "number" &&
    Number.isFinite(v.usdValue) &&
    typeof v.formattedUsd === "string"
  );
}

export function isVaultGame(value: unknown): value is VaultGame {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.gameId === "number" &&
    typeof v.starter === "string" &&
    typeof v.king === "string" &&
    isTokenAmount(v.pot) &&
    isTokenAmount(v.minWager) &&
    typeof v.endTime === "number" &&
    typeof v.timeRemaining === "number" &&
    typeof v.settled === "boolean" &&
    typeof v.active === "boolean"
  );
}

// The starter's name for a game, off the service's optional `metadata` object.
//
// A blank or non-string title is treated as absent rather than rendered: an
// empty heading is worse than the number it replaced. The description is
// dropped with it, because the title is the label and a description alone has
// nothing to hang on.
function readMetadata(value: unknown): { title?: string; description?: string } {
  if (!value || typeof value !== "object") return {};
  const meta = value as Record<string, unknown>;
  const title = typeof meta.title === "string" ? meta.title.trim() : "";
  if (title === "") return {};
  const description = typeof meta.description === "string" ? meta.description.trim() : "";
  return { title, ...(description === "" ? {} : { description }) };
}

// The well-formed rows of a list, whatever else it held. A malformed row is
// dropped rather than rendered half-empty, and the caller says so.
//
// Metadata is read here rather than checked in isVaultGame: a game with a
// broken name is still a game, and dropping the row would hide a live pot over
// a label.
export function onlyVaultGames(value: unknown): VaultGame[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isVaultGame).map((game) => ({
    ...game,
    ...readMetadata((game as unknown as Record<string, unknown>).metadata),
  }));
}

/** What to call a game: its name, or its number when it has none. */
export function gameTitle(
  game: { gameId: number; title?: string },
  fallback: (id: number) => string
): string {
  const title = game.title?.trim() ?? "";
  return title === "" ? fallback(game.gameId) : title;
}

// The service records a winner or a starter as null when a log did not carry
// it. A row like that has nothing to name and nothing to link, and rendered
// as-is it took the page down on `address.length`. Rows are checked here, at
// the boundary, and a malformed one is dropped rather than drawn half-empty.
function isVaultWinner(value: unknown): value is VaultWinner {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.gameId === "number" &&
    typeof v.winner === "string" &&
    typeof v.starter === "string" &&
    isTokenAmount(v.pot) &&
    isTokenAmount(v.toWinner) &&
    (v.paidToWinner === undefined || isTokenAmount(v.paidToWinner)) &&
    typeof v.settlementTx === "string" &&
    typeof v.settledAt === "string"
  );
}

// The board prices from the raw units itself, so it does not require the
// service's usdValue/formattedUsd the way isTokenAmount does.
function isPaidAmount(value: unknown): value is PaidAmount {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.amount === "string" && typeof v.raw === "string" && typeof v.decimals === "number"
  );
}

// The board's own row. It is deliberately not a VaultWinner: the leaderboard
// route trims each winner to the four fields the board reads, so validating it
// against the full record would reject every row.
function isLeaderboardWinner(value: unknown): value is LeaderboardWinner {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.gameId === "number" &&
    typeof v.winner === "string" &&
    v.winner.length > 0 &&
    isPaidAmount(v.paid)
  );
}

export function onlyLeaderboardWinners(value: unknown): LeaderboardWinner[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isLeaderboardWinner);
}

export function onlyVaultWinners(value: unknown): VaultWinner[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isVaultWinner);
}

const ACTIONS = new Set(["started", "joined", "won"]);

function isVaultActivity(value: unknown): value is VaultActivity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.gameId === "number" &&
    typeof v.action === "string" &&
    ACTIONS.has(v.action) &&
    typeof v.address === "string" &&
    typeof v.amountWei === "string" &&
    typeof v.transactionHash === "string" &&
    typeof v.createdAt === "string"
  );
}

export function onlyVaultActivities(value: unknown): VaultActivity[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isVaultActivity);
}

// The contract's own view of a game, as the socket hub publishes it: amounts
// in wei, as strings on the wire. Priced by the lobby with the ETH price it
// holds, since the hub cannot know dollars.
export interface ChainGame {
  gameId: number;
  starter: string;
  king: string;
  potWei: bigint;
  minWagerWei: bigint;
  endTime: number;
  /**
   * The asset the game is played in. v5 lets its starter choose, so the scale
   * of the two amounts above is per game and NOT assumed to be 18: reading a
   * 6-decimal USDC pot at 18 decimals prices it to nothing, which is how a
   * live game showed a pot of $0.00 in the lobby on 2026-09-15. Absent on an
   * older frame, which was native-only.
   */
  token?: string;
}

const WEI = /^\d+$/;

export function toChainGame(value: unknown): ChainGame | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.gameId !== "number" ||
    typeof v.starter !== "string" ||
    typeof v.king !== "string" ||
    typeof v.endTime !== "number" ||
    typeof v.potWei !== "string" ||
    typeof v.minWagerWei !== "string" ||
    !WEI.test(v.potWei) ||
    !WEI.test(v.minWagerWei)
  ) {
    return null;
  }
  return {
    gameId: v.gameId,
    starter: v.starter,
    king: v.king,
    potWei: BigInt(v.potWei),
    minWagerWei: BigInt(v.minWagerWei),
    endTime: v.endTime,
    ...(typeof v.token === "string" ? { token: v.token } : {}),
  };
}

// A snapshot sorted by shape: API rows for the indexed list, contract rows
// for the chain list, and the count of rows that were neither.
export function sortGameRows(rows: unknown[]): {
  api: VaultGame[];
  chain: ChainGame[];
  dropped: number;
} {
  const api: VaultGame[] = [];
  const chain: ChainGame[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (isVaultGame(row)) {
      api.push(row);
      continue;
    }
    const contract = toChainGame(row);
    if (contract) chain.push(contract);
    else dropped += 1;
  }
  return { api, chain, dropped };
}

/**
 * Carries a name the client already knows onto rows that arrive without one.
 *
 * The keeper builds its lobby snapshot with `toGameDto(game, usd)` — two
 * arguments, where the third is the metadata — so a socket frame never carries
 * a title. The snapshot replaces the games cache wholesale, which is correct
 * for everything it DOES carry (a game missing from it has settled or gone
 * away) and wrong for the one thing it does not: absent here means "not sent",
 * not "cleared", and treating the two the same wiped a game's name a second
 * after REST had loaded it.
 *
 * The snapshot still decides which games exist, so nothing is resurrected: a
 * name is only ever carried onto a row the snapshot itself listed.
 */
export function keepKnownMetadata<
  T extends { gameId: number; title?: string; description?: string },
>(previous: readonly T[], incoming: readonly T[]): T[] {
  if (previous.length === 0) return [...incoming];
  const known = new Map(previous.map((game) => [game.gameId, game]));
  return incoming.map((game) => {
    if (game.title !== undefined) return game;
    const before = known.get(game.gameId);
    if (before?.title === undefined) return game;
    return {
      ...game,
      title: before.title,
      ...(before.description === undefined ? {} : { description: before.description }),
    };
  });
}
