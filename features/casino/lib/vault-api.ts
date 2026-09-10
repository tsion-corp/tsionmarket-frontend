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
  onlyVaultWinners,
} from "@/features/casino/lib/vault-game";
import { vaultLog } from "@/features/casino/lib/last-standing/log";

export interface TokenAmount {
  amount: string;
  tokenSymbol: string;
  usdValue: number;
  formattedUsd: string;
}

// One running or settled game. `endTime` is unix seconds, which is what makes a
// countdown correct across a device that slept or a tab that was backgrounded:
// the clock is derived from it rather than counted down from a snapshot.
export interface VaultGame {
  gameId: number;
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

/** The lobby: games currently accepting joins, newest first. */
export async function fetchActiveGames(): Promise<VaultGame[]> {
  const data = await vault.get<{ games: unknown }>("/games");
  const rows = onlyVaultGames(data.games);
  const total = Array.isArray(data.games) ? data.games.length : 0;
  if (rows.length !== total) {
    console.warn(`[vault] dropped ${total - rows.length} /games row(s) not in the API shape`);
  }
  vaultLog("REST /games", { games: rows.map((g) => g.gameId) });
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
export interface VaultConfig {
  contract: string;
  minStartStakeWei: string;
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
    timerSeconds: data.timerSeconds,
    split: [data.winnerBps, data.starterBps, data.treasuryBps],
    paused: data.paused,
  });
  return data;
}

// One wallet's standing. `pendingWei` is what settle() could not push and
// claim() collects; the service reads it from the contract on every call, so
// it is authoritative without the browser making the read itself.
export interface VaultPlayer {
  address: string;
  pendingWei: string;
  pending: TokenAmount;
  gamesStarted: number;
  gamesWon: number;
  paidWei: string;
  paid: TokenAmount;
  lastGameId: number | null;
}

export async function fetchVaultPlayer(address: string): Promise<VaultPlayer> {
  const data = await vault.get<VaultPlayer>(`/players/${address}`);
  vaultLog("REST /players", { address, pendingWei: data.pendingWei, gamesWon: data.gamesWon });
  return data;
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
