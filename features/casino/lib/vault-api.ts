"use client";

// REST client for the Last Man Standing vault game (world-street-vault v4).
//
// v4 runs many games at once, each with its own `gameId`, pot, timer and king.
// The reads here are the lobby (`/games`), one game (`/games/:id`) and the two
// cross-game feeds that stayed singular (winners, activities).

import { createServiceClient } from "@/lib/api/service";

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

export interface VaultWinner {
  gameId: number;
  winner: string;
  starter: string;
  pot: TokenAmount;
  toWinner: TokenAmount;
  settlementTx: string;
  settledAt: string;
}

// "started" is new in v4: opening a game is now an action in its own right.
export type VaultActivityAction = "started" | "joined" | "won";

export interface VaultActivity {
  id: string;
  action: VaultActivityAction;
  address: string;
  amountWei: string;
  transactionHash: string;
  createdAt: string;
}

// Reads go through our own same-origin proxy (app/api/vault) rather than the
// vault gateway directly: the gateway sends no CORS headers, so a direct
// browser fetch is blocked. The proxy forwards server-side and caches briefly.
// Every read here is public, so none of them need the caller's session.
const vault = createServiceClient("/api/vault", "The vault is unavailable right now.");

// The lobby: games currently accepting joins, newest first.
export async function fetchActiveGames(): Promise<VaultGame[]> {
  const data = await vault.get<{ games: VaultGame[] }>("/games");
  return data.games;
}

export async function fetchGame(gameId: number): Promise<VaultGame> {
  const data = await vault.get<{ game: VaultGame }>(`/games/${gameId}`);
  return data.game;
}

export async function fetchVaultWinners(): Promise<VaultWinner[]> {
  const data = await vault.get<{ winners: VaultWinner[] }>("/game/winners");
  return data.winners;
}

export async function fetchVaultActivities(): Promise<VaultActivity[]> {
  const data = await vault.get<{ activities: VaultActivity[] }>("/game/activities");
  return data.activities;
}
