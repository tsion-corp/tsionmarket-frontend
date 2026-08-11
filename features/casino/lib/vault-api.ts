"use client";

// REST client for the Last Man Standing vault game (world-street-vault service).

import { createServiceClient } from "@/lib/api/service";

export interface TokenAmount {
  amount: string;
  tokenSymbol: string;
  usdValue: number;
  formattedUsd: string;
}

export interface VaultGameStatus {
  timeRemaining: number;
  isGameStarted: boolean;
  lastPlayer: string | null;
  vaultBalance: TokenAmount;
  entryFee: TokenAmount;
  timerDuration: number;
  gameActive: boolean;
}

export interface VaultWinner {
  id: string;
  contractAddress: string;
  networkId: number;
  tokenName: string;
  winnerAddress: string;
  winnerPrizeWei: string;
  playerCount: number;
  endedAt: string;
}

export type VaultActivityAction = "joined" | "won";

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

export async function fetchVaultStatus(): Promise<VaultGameStatus> {
  return vault.get<VaultGameStatus>("/game/status");
}

export async function fetchPendingWinnings(address: string): Promise<TokenAmount> {
  const data = await vault.get<{ pendingWinnings: TokenAmount }>(
    `/game/pending-winnings/${encodeURIComponent(address)}`
  );
  return data.pendingWinnings;
}

export async function fetchVaultWinners(): Promise<VaultWinner[]> {
  const data = await vault.get<{ winners: VaultWinner[] }>("/game/winners");
  return data.winners;
}

export async function fetchVaultActivities(): Promise<VaultActivity[]> {
  const data = await vault.get<{ activities: VaultActivity[] }>("/game/activities");
  return data.activities;
}
