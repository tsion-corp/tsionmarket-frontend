"use client";

// REST client for the Last Man Standing vault game (world-street-vault v4).
//
// v4 runs many games at once, each with its own `gameId`, pot, timer and king.
// The reads here are the lobby (`/games`), one game (`/games/:id`) and the two
// cross-game feeds that stayed singular (winners, activities). The service
// is the source of truth for reading (ADR-2026-09-10-last-man-backend-reads);
// the contract is only read where the service cannot answer.

import { createServiceClient } from "@/lib/api/service";
import { errorStatus } from "@/lib/api/envelope";
import {
  isVaultGame,
  onlyVaultActivities,
  onlyVaultGames,
  onlyLeaderboardWinners,
  onlyVaultWinners,
} from "@/features/casino/lib/vault-game";
import { vaultLog } from "@/features/casino/lib/last-standing/log";

export interface TokenAmount {
  amount: string;
  tokenSymbol: string;
  usdValue: number;
  formattedUsd: string;
  /**
   * The asset and its own scale, added by v5 because decimals are PER GAME now:
   * one lobby holds 18-decimal native games beside 6-decimal USDC ones.
   *
   * `raw` is the amount in the asset's smallest unit and the ONLY field safe for
   * arithmetic. `amount` is already formatted at the game's own scale — prefer
   * it for display, and never re-format it against a constant 18.
   *
   * Optional because an older service omits them; absent means native at 18.
   */
  raw?: string;
  token?: string;
  decimals?: number;
}

// One running or settled game. `endTime` is unix seconds, which is what makes a
// countdown correct across a device that slept or a tab that was backgrounded:
// the clock is derived from it rather than counted down from a snapshot.
export interface VaultGame {
  gameId: number;
  /**
   * The starter's own name for the game, and an optional description. Both
   * cosmetic, both absent on every game started before naming shipped, and
   * both other people's text: rendered, never interpreted.
   */
  title?: string;
  description?: string;
  starter: string;
  king: string;
  pot: TokenAmount;
  minWager: TokenAmount;
  endTime: number;
  timeRemaining: number;
  settled: boolean;
  active: boolean;
}

// A settled game as the service records it. `toWinner` is the winner's share
// alone; `paidToWinner` is what settle() actually sent that wallet, the
// starter's share included when the same wallet opened the game. The three
// optional splits arrived with the 2026-09-10 service; older rows carry only
// `toWinner`.
// An amount without the service's own USD figures, which are native-only by
// its contract and so are recomputed here anyway (see lib/last-standing/pricing).
export type PaidAmount = Pick<TokenAmount, "amount" | "raw" | "tokenSymbol" | "token" | "decimals">;

// What the leaderboard route serves: a winner trimmed to what the board reads.
// Not a VaultWinner, which also carries the pot, the splits and the settlement
// transaction that no rank depends on.
export interface LeaderboardWinner {
  gameId: number;
  winner: string;
  // What settle() actually sent that wallet, the starter's share included.
  paid: PaidAmount;
  settledAt: string | number | null;
}

export interface VaultWinner {
  gameId: number;
  winner: string;
  starter: string;
  pot: TokenAmount;
  toWinner: TokenAmount;
  toStarter?: TokenAmount;
  toTreasury?: TokenAmount;
  paidToWinner?: TokenAmount;
  settlementTx: string;
  settledAt: string;
}

// "started" is new in v4: opening a game is now an action in its own right.
export type VaultActivityAction = "started" | "joined" | "won";

export interface VaultActivity {
  id: string;
  // Which game the action belongs to; every indexed row carries it.
  gameId: number;
  action: VaultActivityAction;
  address: string;
  amountWei: string;
  transactionHash: string;
  createdAt: string;
}

// Reads go through our own same-origin proxy (app/api/vault) rather than the
// vault gateway directly: the proxy caches briefly, so a thousand users
// polling the lobby cost the gateway one request per path per second rather
// than a thousand. Every read here is public, so none need the caller's
// session.
// A read that has not answered in fifteen seconds is not going to: on a bad
// connection the poll gives up, the screen shows its degraded state, and the
// next poll tries again, instead of a request hanging for minutes with the
// clock frozen and nothing said.
const vault = createServiceClient("/api/vault", "The vault is unavailable right now.", {
  timeoutMs: 15_000,
});

/**
 * The lobby: games currently accepting joins, newest first.
 *
 * Reads /api/vault/lobby, which asks the SERVICE first and only reads the chain
 * when the service's index answers with nothing at all. The service is the
 * source of truth: it prices amounts, knows settled history and carries the
 * contract each row belongs to. The chain is the safety net for the window
 * where the index trails the head, and it is skipped entirely whenever the
 * service has rows. `source` says which answered.
 */
export async function fetchActiveGames(): Promise<VaultGame[]> {
  const data = await vault.get<{ games: unknown; source?: string }>("/lobby");
  const rows = onlyVaultGames(data.games);
  const total = Array.isArray(data.games) ? data.games.length : 0;
  if (rows.length !== total) {
    console.warn(`[vault] dropped ${total - rows.length} lobby row(s) not in the API shape`);
  }
  vaultLog("REST /lobby", { source: data.source, games: rows.map((g) => g.gameId) });
  return rows;
}

/**
 * One game. The service serves the indexed row and falls through to the
 * contract for an id the index has not caught up with, so a 404 means the id
 * was never used: see `isVaultNotFound`.
 */
export async function fetchGame(gameId: number): Promise<VaultGame> {
  const data = await vault.get<{ game: unknown }>(`/games/${gameId}`);
  if (!isVaultGame(data.game)) throw new Error("The vault returned a game in an unexpected shape.");
  vaultLog(`REST /games/${gameId}`, {
    active: data.game.active,
    settled: data.game.settled,
    king: data.game.king,
    pot: data.game.pot.amount,
  });
  return data.game;
}

/** True when the service answered that no such game exists. */
export function isVaultNotFound(error: unknown): boolean {
  return errorStatus(error) === 404;
}

// The owner-tunable contract parameters, read by the service from the chain
// and cached there. Every one of them has changed since deployment, so the
// screens read them rather than assume.
export interface VaultAsset {
  token: string;
  symbol: string;
  decimals: number;
  /** The floor to START a game in this asset, in its own smallest unit. */
  minStartStakeWei: string;
  /** False means no NEW games in it; games already running still settle. */
  enabled: boolean;
}

export interface VaultConfig {
  contract: string;
  /**
   * The native floor. v5 has a floor PER ASSET, in `assets`, and this field is
   * the native one kept for older clients — reading it for a USDC game quotes
   * a 0.0002 ETH stake against a 6-decimal token.
   */
  minStartStakeWei: string;
  /** The asset allowlist. Absent on an older service, which was native-only. */
  assets?: VaultAsset[];
  /** Round length in seconds; a wager resets the clock to this. */
  timerSeconds: number;
  winnerBps: number;
  starterBps: number;
  treasuryBps: number;
  paused: boolean;
}

export async function fetchVaultConfig(): Promise<VaultConfig> {
  const data = await vault.get<VaultConfig>("/config");
  vaultLog("REST /config", {
    minStartStakeWei: data.minStartStakeWei,
    assets: data.assets?.map((asset) => [asset.symbol, asset.minStartStakeWei, asset.enabled]),
    timerSeconds: data.timerSeconds,
    split: [data.winnerBps, data.starterBps, data.treasuryBps],
    paused: data.paused,
  });
  return data;
}

// One wallet's standing.
//
// What settle() could not push is money the player still has to collect, and
// from v5 on it is a LIST: a wallet can be owed in more than one asset at once,
// and claim() takes the asset. `pendingWei`/`pending` are the native entry,
// kept by the service for older clients — enough for a v4 client, not enough
// for a correct v5 one, because a USDC payout never appears in them.
//
// The service reads all of it from the contract on every call, so it is
// authoritative without the browser making the read itself.
export interface VaultPlayer {
  address: string;
  pendingWei: string;
  pending: TokenAmount;
  /** Absent on an older service; treat that as "only the native entry is known". */
  pendingByAsset?: TokenAmount[];
  gamesStarted: number;
  gamesWon: number;
  paidWei: string;
  paid: PaidAmount;
  lastGameId: number | null;
}

export async function fetchVaultPlayer(address: string): Promise<VaultPlayer> {
  const data = await vault.get<VaultPlayer>(`/players/${address}`);
  vaultLog("REST /players", { address, pendingWei: data.pendingWei, gamesWon: data.gamesWon });
  return data;
}

/**
 * Hands the service a hash the wallet just sent, so it can index the
 * transaction without waiting for its own poll to reach that block.
 *
 * This is what the contract offers in place of polling a receipt and decoding
 * GameStarted to learn our own gameId. We still read the receipt, because we
 * need to know the transaction confirmed at all, but telling the service
 * closes the window where a game someone has just paid for is not yet in
 * /games — which is the window the chain fallback exists for.
 *
 * Fire and forget: the game is on chain either way, and a service that cannot
 * take the hash must not fail the player's start.
 */
export async function registerVaultTransaction(hash: string): Promise<void> {
  try {
    await vault.publicPost("/transactions", { hash });
    vaultLog("REST POST /transactions", { hash });
  } catch (error) {
    vaultLog("REST POST /transactions failed", { hash, error: String(error) });
  }
}

/**
 * Names a game. Keyed on the transaction hash, because the contract assigns
 * the gameId only when the transaction mines.
 *
 * Cosmetic and non-fatal, like registerVaultTransaction above: the player has
 * already paid and the game is already open, so a refused name leaves a game
 * called "Game 246" rather than a game that failed. The failure is logged, not
 * silenced.
 */
export async function submitGameMetadata(input: {
  txHash: string;
  title: string;
  description?: string;
  signature: string;
  timestamp: number;
}): Promise<boolean> {
  try {
    await vault.publicPost("/games/metadata", {
      txHash: input.txHash,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      signature: input.signature,
      timestamp: input.timestamp,
    });
    vaultLog("REST POST /games/metadata", { txHash: input.txHash });
    return true;
  } catch (error) {
    vaultLog("REST POST /games/metadata failed", {
      txHash: input.txHash,
      error: String(error),
    });
    return false;
  }
}

export async function fetchVaultWinners(): Promise<VaultWinner[]> {
  const data = await vault.get<{ winners: unknown }>("/game/winners");
  const rows = onlyVaultWinners(data.winners);
  const total = Array.isArray(data.winners) ? data.winners.length : 0;
  if (rows.length !== total) {
    console.warn(`[vault] dropped ${total - rows.length} /game/winners row(s) not in shape`);
  }
  vaultLog("REST /game/winners", { rows: rows.length });
  return rows;
}

// Every winner the vault has recorded, for the all-time board. The service
// pages this feed; the walk happens in our own route (app/api/vault/leaderboard)
// so a reader makes one request rather than sequencing six.
export async function fetchAllVaultWinners(): Promise<LeaderboardWinner[]> {
  const res = await fetch("/api/vault/leaderboard", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("The vault is unavailable right now.");
  const body = (await res.json()) as { data?: { winners?: unknown } };
  const rows = onlyLeaderboardWinners(body.data?.winners);
  const total = Array.isArray(body.data?.winners) ? body.data.winners.length : 0;
  if (rows.length !== total) {
    console.warn(`[vault] dropped ${total - rows.length} leaderboard row(s) not in shape`);
  }
  vaultLog("REST /api/vault/leaderboard", { rows: rows.length });
  return rows;
}

export async function fetchVaultActivities(): Promise<VaultActivity[]> {
  const data = await vault.get<{ activities: unknown }>("/game/activities");
  const rows = onlyVaultActivities(data.activities);
  const total = Array.isArray(data.activities) ? data.activities.length : 0;
  if (rows.length !== total) {
    console.warn(`[vault] dropped ${total - rows.length} /game/activities row(s) not in shape`);
  }
  vaultLog("REST /game/activities", { rows: rows.length });
  return rows;
}
